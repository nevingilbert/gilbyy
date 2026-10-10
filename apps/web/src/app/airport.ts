import { makeNoise2D, makeRandom, smoothstep } from "./noise";
import { CELL, FAR, HALF, ROW, WORLD, gridX, gridZ, sampleGrid, type Terrain } from "./terrain";

/**
 * An airstrip: a short runway with an apron behind its threshold. The plane stands on the
 * threshold, nose down the runway and tail to the apron, which is where a truck boards.
 * It leaves over the runway's far end and comes back in over it, so only that end has to
 * be open. Every world has one (ADR 0014).
 *
 * Field space: the origin is the threshold on the centreline, +z runs down the runway and
 * +x is to the left, the same way a model turned to `heading` lies.
 *
 * Pure data, no three.js.
 */
export type Airport = {
  x: number;
  z: number;
  /** The way the plane takes off. 0 faces +z, as for a truck. */
  heading: number;
  /** The whole field is level, at this height. */
  y: number;
};

export const RUNWAY = { length: 260, half: 13 } as const;
/** The apron: how far it runs behind the threshold and ahead of it, and to either side of the centreline. */
export const APRON = { back: 64, front: 24, half: 44 } as const;
/**
 * How far the ground is flat beyond the paving, and how far the cut or fill takes to fade
 * out. Flat for more than a grid cell's diagonal, so no sloping triangle reaches the paving.
 */
export const FIELD_FLAT = 15;
export const FIELD_BLEND = 38;
/** Trees, rocks and bushes keep this far off the paving. */
export const FIELD_CLEAR = 15;
/** The way in and out beyond the runway's far end: this long, and kept clear of trees. */
export const APPROACH = 600;
const FUNNEL = 300;

/**
 * The bank round a hidden field: its crest this far from the paving and about this far
 * above it, its inner slope this wide and its outer one this wide.
 */
const BANK = { crest: 40, inner: 27, outer: 46, height: 9 } as const;
/** The trees that screen a hidden field stand between these distances from the paving. */
const SCREEN = { near: 17, far: 84 } as const;
/** As far from the paving as building a field moves the ground. */
export const FIELD_REACH = Math.max(FIELD_FLAT + FIELD_BLEND, BANK.crest + BANK.outer);

export function fromField(a: Airport, lx: number, lz: number) {
  const cos = Math.cos(a.heading);
  const sin = Math.sin(a.heading);
  return { x: a.x + lx * cos + lz * sin, z: a.z - lx * sin + lz * cos };
}

export function toField(a: Airport, x: number, z: number) {
  const cos = Math.cos(a.heading);
  const sin = Math.sin(a.heading);
  const dx = x - a.x;
  const dz = z - a.z;
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

const toRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/** Distance from a point to the paving (the runway and the apron); 0 on it. */
export function fieldDist(a: Airport, x: number, z: number) {
  const p = toField(a, x, z);
  return Math.min(
    toRect(p.x, p.z, -RUNWAY.half, RUNWAY.half, 0, RUNWAY.length),
    toRect(p.x, p.z, -APRON.half, APRON.half, -APRON.back, APRON.front),
  );
}

/** Whether a point is under the way in and out: a funnel widening from the runway's far end. */
export function inFunnel(a: Airport, x: number, z: number) {
  const p = toField(a, x, z);
  const d = p.z - RUNWAY.length;
  return d > -50 && d < FUNNEL && Math.abs(p.x) < RUNWAY.half + 12 + Math.max(0, d) * 0.22;
}

/** Calls `fn` for every grid vertex within `reach` of the field's bounding box. */
function eachNear(a: Airport, reach: number, fn: (k: number, x: number, z: number) => void) {
  const corners = [
    fromField(a, -APRON.half, -APRON.back), fromField(a, APRON.half, -APRON.back),
    fromField(a, -APRON.half, RUNWAY.length), fromField(a, APRON.half, RUNWAY.length),
  ];
  const cell = (v: number) => (v + HALF) / CELL;
  const i0 = Math.max(0, Math.floor(cell(Math.min(...corners.map((c) => c.x)) - reach)));
  const i1 = Math.min(WORLD.segments, Math.ceil(cell(Math.max(...corners.map((c) => c.x)) + reach)));
  const j0 = Math.max(0, Math.floor(cell(Math.min(...corners.map((c) => c.z)) - reach)));
  const j1 = Math.min(WORLD.segments, Math.ceil(cell(Math.max(...corners.map((c) => c.z)) + reach)));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * ROW + i, gridX(i), gridZ(j));
}

/**
 * Levels the ground under the field and a little way round it, then lets it run back to
 * the lie of the land. `out` is given each vertex's distance to the paving, as garage
 * yards do with `siteDist`: it is what keeps the grass off the runway.
 */
export function levelField(heights: Float32Array, a: Airport, out?: Float32Array) {
  eachNear(a, FIELD_FLAT + FIELD_BLEND, (k, x, z) => {
    const d = fieldDist(a, x, z);
    if (out) out[k] = Math.min(out[k], d);
    heights[k] = a.y + (heights[k] - a.y) * smoothstep(FIELD_FLAT, FIELD_FLAT + FIELD_BLEND, d);
  });
}

/**
 * A bank of earth round the field's sides and its closed end, dying away toward the open
 * one. Its crest stands above the field whatever the ground outside is doing, so where
 * the land falls away it is a tall dike, and where a hill already stands it adds nothing.
 * With the trees on it (`screenTrees`) it is what hides the field: from outside there is
 * a wooded rise, and nothing shows over it but the tip of a tail.
 */
export function raiseBank(heights: Float32Array, a: Airport, seed: number) {
  const lumps = makeNoise2D(seed);
  eachNear(a, BANK.crest + BANK.outer, (k, x, z) => {
    const d = fieldDist(a, x, z) - BANK.crest;
    const u = d / (d < 0 ? BANK.inner : BANK.outer);
    if (Math.abs(u) >= 1) return;
    const open = 1 - smoothstep(RUNWAY.length - 100, RUNWAY.length - 20, toField(a, x, z).z);
    const crest = a.y + BANK.height * (0.85 + 0.25 * lumps(x / 80, z / 80)) * open;
    heights[k] += Math.max(0, crest - heights[k]) * Math.cos((u * Math.PI) / 2) ** 2;
  });
}

/** Where the screen of trees stands: thick on the bank, none under the way in. */
export function screenTrees(a: Airport, seed: number) {
  const rand = makeRandom(seed);
  const out: { x: number; z: number; scale: number; rot: number; tone: number }[] = [];
  const step = 6.5;
  const reach = SCREEN.far + step;
  for (let lz = -APRON.back - reach; lz <= RUNWAY.length + reach; lz += step) {
    for (let lx = -APRON.half - reach; lx <= APRON.half + reach; lx += step) {
      // Drawn in the same order every time, whatever is kept.
      const [jx, jz, pick, scale, rot, tone] = [rand(), rand(), rand(), rand(), rand(), rand()];
      const p = fromField(a, lx + (jx - 0.5) * step, lz + (jz - 0.5) * step);
      const d = fieldDist(a, p.x, p.z);
      if (d < SCREEN.near || d > SCREEN.far || inFunnel(a, p.x, p.z)) continue;
      if (pick > 0.85 * (1 - smoothstep(SCREEN.far - 26, SCREEN.far, d) * 0.7)) continue;
      out.push({ x: p.x, z: p.z, scale: 0.95 + scale * 0.55, rot: rot * Math.PI * 2, tone });
    }
  }
  return out;
}

/** Points over the paving, in field space, for judging a site. */
const SAMPLES: [number, number][] = [];
for (let z = 0; z <= RUNWAY.length; z += 13) for (const x of [-RUNWAY.half, 0, RUNWAY.half]) SAMPLES.push([x, z]);
for (let z = -APRON.back; z <= APRON.front; z += 11) for (let x = -APRON.half; x <= APRON.half; x += 11) SAMPLES.push([x, z]);

export type FieldSearch = {
  /** Thresholds to try, and the headings to try at each. */
  spots: { x: number; z: number }[];
  headings(x: number, z: number): number[];
  /** Whether the paving may lie over this point. */
  allow(x: number, z: number): boolean;
  height(x: number, z: number): number;
  /** The most the ground may vary under the paving before it is levelled. */
  rough: number;
  /** How fast the ground may rise under the way in, metres per metre. */
  rise: number;
  /** Added to a site's score, which is otherwise how level it is. Higher is better. */
  bonus(a: Airport): number;
};

/** The best site the search allows, or null if nothing fits. The same every time. */
export function findField(s: FieldSearch): Airport | null {
  let best: Airport | null = null;
  let bestScore = -Infinity;
  for (const spot of s.spots) {
    for (const heading of s.headings(spot.x, spot.z)) {
      const a: Airport = { x: spot.x, z: spot.z, heading, y: 0 };
      let lo = Infinity;
      let hi = -Infinity;
      let sum = 0;
      let ok = true;
      for (const [lx, lz] of SAMPLES) {
        const p = fromField(a, lx, lz);
        if (!s.allow(p.x, p.z)) {
          ok = false;
          break;
        }
        const h = s.height(p.x, p.z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        sum += h;
        if (hi - lo > s.rough) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      a.y = sum / SAMPLES.length;
      // The way in, beyond the far end: the ground mustn't rise into it.
      for (let d = 0; d <= APPROACH && ok; d += 20) {
        const p = fromField(a, 0, RUNWAY.length + d);
        ok = s.height(p.x, p.z) < a.y + 1 + d * s.rise;
      }
      if (!ok) continue;
      const score = -(hi - lo) + s.bonus(a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
  }
  return best;
}

/** How far the ground stands above the field just outside its sides and its closed end, on average. */
function enclosure(a: Airport, height: (x: number, z: number) => number) {
  const out = APRON.half + 70;
  let sum = 0;
  let n = 0;
  for (let lz = -APRON.back; lz <= RUNWAY.length - 80; lz += 40) {
    for (const lx of [-out, out]) {
      const p = fromField(a, lx, lz);
      sum += height(p.x, p.z) - a.y;
      n++;
    }
  }
  for (let lx = -out; lx <= out; lx += 40) {
    const p = fromField(a, lx, -APRON.back - 70);
    sum += height(p.x, p.z) - a.y;
    n++;
  }
  return sum / n;
}

/**
 * The valley's airstrip, hidden over the river where only the snorkel gets you: in a
 * hollow if there is one, well away from the two garages over there, its open end turned
 * toward the mountains rather than the lake. Chosen from the ground as it already lies,
 * after the garages, the easter eggs and the valley's first thirteen courses, so none of
 * those move; the courses added since are laid out round it (`planMore` in missions.ts).
 */
export function valleyAirfield(t: Terrain, courseDist: Float32Array, avoid: { x: number; z: number }[]): Airport | null {
  const height = (x: number, z: number) => sampleGrid(t.heights, x, z);
  const f = (field: Float32Array, x: number, z: number) => sampleGrid(field, x, z);
  const zone = (x: number, z: number) => t.zone[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];
  const spots: { x: number; z: number }[] = [];
  for (let z = -2200; z <= 2200; z += 40) for (let x = -2200; x <= 2200; x += 40) if (zone(x, z) === 2) spots.push({ x, z });
  const all = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
  return findField({
    spots,
    headings: () => all,
    height,
    rough: 15,
    rise: 0.07,
    allow: (x, z) =>
      zone(x, z) === 2 &&
      Math.hypot(x, z) < WORLD.wallStart - 150 &&
      height(x, z) > f(t.water, x, z) + 1.5 &&
      f(t.trackDist, x, z) > 80 &&
      f(t.riverDist, x, z) >= FAR &&
      f(t.roadDist, x, z) > 40 &&
      f(courseDist, x, z) > 80 &&
      f(t.snow, x, z) < 0.2 &&
      avoid.every((p) => Math.hypot(p.x - x, p.z - z) > 420),
    bonus: (a) => {
      const r = Math.hypot(a.x, a.z) || 1;
      const outward = (Math.sin(a.heading) * a.x + Math.cos(a.heading) * a.z) / r;
      return Math.max(-6, Math.min(12, enclosure(a, height))) * 0.4 + outward * 3;
    },
  });
}

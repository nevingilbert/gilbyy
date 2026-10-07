import { fbm, makeNoise2D, smoothstep } from "./noise";

/**
 * The valley's shape: heights, water, the railway's earthworks and the rivers' beds.
 *
 * Pure data, no three.js. Everything is a field on one grid of vertices, so the
 * renderer, the physics and the scatter all read the same ground. Units are metres.
 */
export const WORLD = {
  size: 4000,
  segments: 400,
  /** Lake surface height. Rivers have their own, higher surfaces. */
  water: 0,
  /** Where the valley wall starts to rise. */
  wallStart: 1450,
  /** Past this radius you stop, whatever the ground is doing. */
  limit: 1880,
} as const;

export const CELL = WORLD.size / WORLD.segments;
export const HALF = WORLD.size / 2;
export const ROW = WORLD.segments + 1;

/** The big lake in the middle takes both rivers; the second sits off to the west. */
export const LAKES = [
  { x: 250, z: -100, r: 300, depth: 42 },
  { x: -650, z: 550, r: 220, depth: 34 },
];

/** Spawn on a gentle rise west of the big lake, looking across it toward the far side. */
export const START = { x: -300, z: 150, heading: Math.atan2(550, -250) };

/** How deep the stock truck will wade, and how deep it will with a snorkel. */
export const STOCK_WADE = 1.3;
export const SNORKEL_WADE = 2.6;
const RIVER_DEPTH = 2.2;

export const gridX = (i: number) => -HALF + i * CELL;
export const gridZ = (j: number) => -HALF + j * CELL;

/** Value of a grid field at (x, z), triangulated the same way as the terrain mesh. */
export function sampleGrid(field: ArrayLike<number>, x: number, z: number) {
  const fx = Math.max(0, Math.min(WORLD.segments - 1e-6, (x + HALF) / CELL));
  const fz = Math.max(0, Math.min(WORLD.segments - 1e-6, (z + HALF) / CELL));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const h00 = field[j * ROW + i];
  const h10 = field[j * ROW + i + 1];
  const h01 = field[(j + 1) * ROW + i];
  const h11 = field[(j + 1) * ROW + i + 1];
  // Each cell is split along its 10–01 diagonal, the same as the terrain mesh in scene.ts.
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The untouched landscape, before the railway and rivers cut into it. */
export function makeBase(seed: number) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 1);
  const n3 = makeNoise2D(seed + 2);
  const n4 = makeNoise2D(seed + 3);

  const raw = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    let h = 16 + fbm(n1, x / 620, z / 620, 4) * 34;
    const hills = smoothstep(-0.1, 0.6, n2(x / 900, z / 900));
    h += Math.pow(Math.max(0, n3(x / 260, z / 260)), 2) * 48 * hills;

    // Rocky outcrops: sharp, ridged, and only in patches.
    const outcrop = smoothstep(0.3, 0.65, n4(x / 210 + 31, z / 210 - 17));
    if (outcrop > 0) h += outcrop * (1 - Math.abs(fbm(n4, x / 40, z / 40, 3))) * 13;

    // Lakes: a guaranteed deep bowl, then a shore shelving up at about 7 degrees.
    for (const lake of LAKES) {
      const d = Math.hypot(x - lake.x, z - lake.z);
      const bed = d < lake.r ? -1.5 - (lake.depth - 1.5) * (1 - (d / lake.r) ** 2) : -1.5 + (d - lake.r) * 0.12;
      h = Math.min(h, bed);
    }

    // The valley wall: the horizon in every direction, and the edge of the world.
    const wall = smoothstep(WORLD.wallStart, HALF - 20, r);
    return h + wall * wall * (330 + 150 * fbm(n2, x / 300, z / 300, 3));
  };

  // Keep the spawn point level and dry: blend toward a flat shelf around it.
  const shelf = Math.max(6, raw(START.x, START.z));
  return (x: number, z: number) => {
    const calm = 1 - smoothstep(30, 150, Math.hypot(x - START.x, z - START.z));
    return lerp(raw(x, z), shelf, calm * 0.9);
  };
}

export type Path = { xs: number[]; zs: number[] };

/** Closed Catmull-Rom through control points, resampled every `spacing` metres. */
function loop(cx: number[], cz: number[], spacing: number): Path {
  const n = cx.length;
  const dense: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const [p0, p1, p2, p3] = [k - 1, k, k + 1, k + 2].map((i) => (i + n) % n);
    for (let t = 0; t < 1; t += 1 / 60) {
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([cr(cx[p0], cx[p1], cx[p2], cx[p3]), cr(cz[p0], cz[p1], cz[p2], cz[p3])]);
    }
  }
  dense.push(dense[0]);
  const xs: number[] = [];
  const zs: number[] = [];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, az] = dense[i - 1];
    const [bx, bz] = dense[i];
    const len = Math.hypot(bx - ax, bz - az);
    let at = carry;
    while (at < len) {
      xs.push(ax + ((bx - ax) * at) / len);
      zs.push(az + ((bz - az) * at) / len);
      at += spacing;
    }
    carry = at - len;
  }
  return { xs, zs };
}

/** Distance fields are capped here, so they interpolate cleanly far from anything. */
export const FAR = 1000;

/**
 * For every grid vertex within `reach` of a path, the distance to it and which point
 * along it is nearest (segment index plus fraction). Untouched vertices stay at FAR.
 */
function nearest(path: Path, closed: boolean, reach: number) {
  const dist = new Float32Array(ROW * ROW).fill(FAR);
  const at = new Float32Array(ROW * ROW);
  const n = path.xs.length;
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const ax = path.xs[s];
    const az = path.zs[s];
    const bx = path.xs[(s + 1) % n];
    const bz = path.zs[(s + 1) % n];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + HALF) / CELL));
    const i1 = Math.min(WORLD.segments, Math.ceil((Math.max(ax, bx) + reach + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + HALF) / CELL));
    const j1 = Math.min(WORLD.segments, Math.ceil((Math.max(az, bz) + reach + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = gridX(i) - ax;
        const pz = gridZ(j) - az;
        const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2));
        const d = Math.hypot(px - t * dx, pz - t * dz);
        const k = j * ROW + i;
        if (d < dist[k] && d < reach) {
          dist[k] = d;
          at[k] = s + t;
        }
      }
    }
  }
  return { dist, at };
}

/** Linear lookup into per-point values at a fractional index along a path. */
const along = (values: ArrayLike<number>, at: number, closed: boolean) => {
  const n = values.length;
  const i = Math.floor(at);
  const t = at - i;
  const a = values[closed ? i % n : Math.min(n - 1, i)];
  const b = values[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
  return a + (b - a) * t;
};

export type Track = Path & {
  /** Rail-top height at each point. */
  ys: number[];
  /** Distance along the track at each point; the loop closes at `length`. */
  s: number[];
  length: number;
  /** Stretches carried on a bridge, as [start, end] distances along the track. */
  bridges: [number, number][];
  /** Level crossings, as distances along the track. */
  crossings: number[];
};

const TRACK_SPACING = 5;
const TRACK_RADIUS = 1300;
const TRACK_BED = 0.4;

/** The railway: a loop around the foot of the mountains, graded gently. */
function layTrack(base: (x: number, z: number) => number, seed: number): Track {
  const wobble = makeNoise2D(seed + 50);
  const cx: number[] = [];
  const cz: number[] = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const r = TRACK_RADIUS + wobble(k * 0.37, 0.5) * 90;
    cx.push(Math.cos(a) * r);
    cz.push(Math.sin(a) * r);
  }
  const path = loop(cx, cz, TRACK_SPACING);
  const n = path.xs.length;

  // Heavily smoothed ground height, then a grade limit, so the train never climbs hard.
  let ys = path.xs.map((x, i) => base(x, path.zs[i]));
  for (let pass = 0; pass < 3; pass++) {
    const W = 50;
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -W; k <= W; k++) sum += ys[(i + k + n) % n];
      next.push(sum / (2 * W + 1));
    }
    ys = next;
  }
  const maxRise = 0.02 * TRACK_SPACING;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < 2 * n; i++) {
      const a = i % n;
      const b = (i + 1) % n;
      ys[b] = Math.max(ys[a] - maxRise, Math.min(ys[a] + maxRise, ys[b]));
    }
  }
  ys = ys.map((y) => Math.max(y, WORLD.water + 3));
  const s = path.xs.map((_, i) => i * TRACK_SPACING);
  return { ...path, ys, s, length: n * TRACK_SPACING, bridges: [], crossings: [] };
}

export type River = Path & {
  /** Water surface height at each point, falling all the way to the lake. */
  surface: number[];
};

/** A river from beyond the valley wall down into the big lake, following the ground. */
function runRiver(base: (x: number, z: number) => number, angle: number, seed: number): River {
  const lake = LAKES[0];
  const meander = makeNoise2D(seed);
  let x = Math.cos(angle) * (WORLD.limit + 60);
  let z = Math.sin(angle) * (WORLD.limit + 60);
  const xs = [x];
  const zs = [z];
  for (let step = 0; step < 600; step++) {
    const gx = base(x + 5, z) - base(x - 5, z);
    const gz = base(x, z + 5) - base(x, z - 5);
    const g = Math.hypot(gx, gz) || 1;
    const tx = lake.x - x;
    const tz = lake.z - z;
    const t = Math.hypot(tx, tz);
    if (t < lake.r * 0.8) break;
    // Mostly toward the lake, partly downhill, with a slow meander.
    let dx = (-gx / g) * 0.4 + (tx / t) * 0.6;
    let dz = (-gz / g) * 0.4 + (tz / t) * 0.6;
    const wiggle = meander(step / 30, 0) * 0.5;
    [dx, dz] = [dx * Math.cos(wiggle) - dz * Math.sin(wiggle), dx * Math.sin(wiggle) + dz * Math.cos(wiggle)];
    const d = Math.hypot(dx, dz) || 1;
    x += (dx / d) * 10;
    z += (dz / d) * 10;
    xs.push(x);
    zs.push(z);
  }

  // Water only runs downhill: each point no higher than the last, and below its banks.
  let surface = xs.map((px, i) => base(px, zs[i]) - 1.6);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < surface.length; i++) surface[i] = Math.min(surface[i], surface[i - 1] - 0.02);
    surface = surface.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j >= 0 && j < surface.length) {
          sum += surface[j];
          count++;
        }
      }
      return sum / count;
    });
  }
  for (let i = 1; i < surface.length; i++) surface[i] = Math.min(surface[i], surface[i - 1] - 0.02);
  surface = surface.map((y) => Math.max(WORLD.water, y));
  return { xs, zs, surface };
}

export type SiteStyle = "workshop" | "barn" | "bunker" | "quonset" | "cabin" | "container";
export type Site = { x: number; z: number; rot: number; style: SiteStyle; y: number };

export type Terrain = {
  heights: Float32Array;
  /** Water surface height per vertex: the lake level, or a river's surface near one. */
  water: Float32Array;
  forest: Float32Array;
  /** Distance to the railway, rivers, dirt roads and building sites (capped). */
  trackDist: Float32Array;
  riverDist: Float32Array;
  roadDist: Float32Array;
  siteDist: Float32Array;
  /** 1 = reachable on stock tyres, 2 = needs the snorkel, 0 = out of reach. */
  zone: Uint8Array;
  track: Track;
  rivers: River[];
  sites: Site[];
};

const SITE_FLAT = 22;
const SITE_BLEND = 26;

/** Garages: one near the start, the rest spread out, two of them over the river. */
function chooseSites(t: Omit<Terrain, "sites">, rand: () => number): Site[] {
  const { heights, zone, trackDist, riverDist, water } = t;
  const candidates: { k: number; x: number; z: number; rough: number }[] = [];
  for (let j = 4; j < ROW - 4; j += 3) {
    for (let i = 4; i < ROW - 4; i += 3) {
      const k = j * ROW + i;
      const x = gridX(i);
      const z = gridZ(j);
      const r = Math.hypot(x, z);
      if (r < 180 || r > WORLD.wallStart - 60 || !zone[k]) continue;
      if (trackDist[k] < 60 || riverDist[k] < 70) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let wet = false;
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const kk = (j + dj) * ROW + i + di;
          lo = Math.min(lo, heights[kk]);
          hi = Math.max(hi, heights[kk]);
          wet ||= heights[kk] < water[kk] + 1;
        }
      }
      // Rough ground is fine within reason; each site gets levelled into a yard.
      if (wet || hi - lo > 9) continue;
      candidates.push({ k, x, z, rough: hi - lo });
    }
  }
  // Shuffle deterministically, then take greedily with spacing.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const styles: SiteStyle[] = ["workshop", "barn", "quonset", "container", "bunker", "cabin"];
  const picked: Site[] = [];
  const take = (want: number, accept: (c: (typeof candidates)[number]) => boolean, spacing: number) => {
    for (const c of candidates) {
      if (picked.length >= want) return;
      if (!accept(c)) continue;
      if (picked.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < spacing)) continue;
      picked.push({ x: c.x, z: c.z, rot: rand() * Math.PI * 2, style: styles[picked.length], y: heights[c.k] });
    }
  };
  const fromStart = (c: { x: number; z: number }) => Math.hypot(c.x - START.x, c.z - START.z);
  take(1, (c) => zone[c.k] === 1 && c.rough < 4 && fromStart(c) > 120 && fromStart(c) < 320, 0);
  take(4, (c) => zone[c.k] === 1 && c.rough < 4, 550);
  take(6, (c) => zone[c.k] === 2, 450);
  // The first garage faces the spawn, so it's the first thing you find.
  if (picked[0]) picked[0].rot = Math.atan2(START.x - picked[0].x, START.z - picked[0].z);
  return picked;
}

/** Which vertices a truck can reach from the start without wading deeper than `wade`. */
function flood(heights: Float32Array, water: Float32Array, wade: number, into: Uint8Array, mark: number) {
  const startK = Math.round((START.z + HALF) / CELL) * ROW + Math.round((START.x + HALF) / CELL);
  const ok = (k: number) => {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    return Math.hypot(x, z) < WORLD.limit && water[k] - heights[k] < wade;
  };
  const queue = [startK];
  const seen = new Uint8Array(ROW * ROW);
  seen[startK] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    if (!into[k]) into[k] = mark;
    const i = k % ROW;
    for (const nk of [k - 1, k + 1, k - ROW, k + ROW]) {
      if (nk < 0 || nk >= ROW * ROW || seen[nk]) continue;
      if ((nk === k - 1 && i === 0) || (nk === k + 1 && i === ROW - 1)) continue;
      // About 30 degrees: steeper than the truck can climb.
      if (Math.abs(heights[nk] - heights[k]) > CELL * 0.58 || !ok(nk)) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
}

export function buildTerrain(seed: number, rand: () => number): Terrain {
  const base = makeBase(seed);
  const forestNoise = makeNoise2D(seed + 10);
  const heights = new Float32Array(ROW * ROW);
  const forest = new Float32Array(ROW * ROW);
  for (let j = 0; j < ROW; j++) {
    for (let i = 0; i < ROW; i++) {
      const x = gridX(i);
      const z = gridZ(j);
      heights[j * ROW + i] = base(x, z);
      forest[j * ROW + i] = smoothstep(0.05, 0.5, fbm(forestNoise, x / 380, z / 380, 3));
    }
  }

  // Railway earthworks: a level bed, with cuttings and embankments gentle enough to drive over.
  const track = layTrack(base, seed);
  const near = nearest(track, true, 90);
  const trackDist = near.dist;
  for (let k = 0; k < heights.length; k++) {
    const d = trackDist[k];
    if (d >= FAR) continue;
    const bed = along(track.ys, near.at[k], true) - TRACK_BED;
    if (d < 4.5) heights[k] = bed;
    else {
      const reach = (d - 4.5) * 0.4;
      heights[k] = Math.max(bed - reach, Math.min(bed + reach, heights[k]));
    }
  }

  // Rivers: a deep channel with shelving banks, cutting through whatever is in the way.
  const water = new Float32Array(ROW * ROW).fill(WORLD.water);
  const riverDist = new Float32Array(ROW * ROW).fill(FAR);
  const rivers = [runRiver(base, -0.72, seed + 60), runRiver(base, 0.72, seed + 61)];
  for (const river of rivers) {
    const r = nearest(river, false, 110);
    for (let k = 0; k < heights.length; k++) {
      const d = r.dist[k];
      if (d >= FAR) continue;
      riverDist[k] = Math.min(riverDist[k], d);
      const surface = along(river.surface, r.at[k], false);
      water[k] = Math.max(water[k], surface);
      let h = heights[k];
      if (d < 16) h = Math.min(h, surface - RIVER_DEPTH);
      else if (d < 30) h = Math.min(h, surface - RIVER_DEPTH + ((d - 16) / 14) * (RIVER_DEPTH + 1));
      else {
        // Valley sides no steeper than ~22 degrees near the water, fading out further away.
        const capped = Math.min(h, surface + 1 + (d - 30) * 0.4);
        h = lerp(capped, h, smoothstep(70, 110, d));
      }
      // Keep the water in its bed: banks at least a metre above it, except at the lake.
      if (d >= 24 && surface > WORLD.water + 1.5) h = Math.max(h, surface + Math.min(1, (d - 24) / 6));
      heights[k] = h;
    }
  }

  // Where the ground now falls well below the rails, the track is on a bridge.
  let open = -1;
  const bridges: [number, number][] = [];
  for (let i = 0; i <= track.xs.length; i++) {
    const k = i % track.xs.length;
    const low = i < track.xs.length && sampleGrid(heights, track.xs[k], track.zs[k]) < track.ys[k] - 2.2;
    if (low && open < 0) open = i;
    if (!low && open >= 0) {
      bridges.push([(open - 1) * TRACK_SPACING, (i + 1) * TRACK_SPACING]);
      open = -1;
    }
  }
  track.bridges = bridges;

  // Level crossings: four, spread around the loop, where the rails sit at ground level.
  const roadDist = new Float32Array(ROW * ROW).fill(FAR);
  const n = track.xs.length;
  for (let q = 0; q < 4; q++) {
    let best = -1;
    let bestScore = Infinity;
    for (let off = -80; off <= 80; off++) {
      const i = (Math.round(((q + 0.12) / 4) * n) + off + n) % n;
      const onBridge = bridges.some(([a, b]) => i * TRACK_SPACING > a - 60 && i * TRACK_SPACING < b + 60);
      const wet = sampleGrid(riverDist, track.xs[i], track.zs[i]) < 150;
      if (onBridge || wet) continue;
      const score = Math.abs(base(track.xs[i], track.zs[i]) - track.ys[i]) + Math.abs(off) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) continue;
    track.crossings.push(best * TRACK_SPACING);
    // A dirt road across the rails, at right angles to them.
    const a = best;
    const b = (best + 1) % n;
    const tx = track.xs[b] - track.xs[a];
    const tz = track.zs[b] - track.zs[a];
    const tl = Math.hypot(tx, tz) || 1;
    const road: Path = {
      xs: [track.xs[a] - (tz / tl) * 45, track.xs[a] + (tz / tl) * 45],
      zs: [track.zs[a] + (tx / tl) * 45, track.zs[a] - (tx / tl) * 45],
    };
    const rd = nearest(road, false, 20).dist;
    for (let k = 0; k < rd.length; k++) roadDist[k] = Math.min(roadDist[k], rd[k]);
  }

  const zone = new Uint8Array(ROW * ROW);
  flood(heights, water, STOCK_WADE, zone, 1);
  flood(heights, water, SNORKEL_WADE, zone, 2);

  const partial = { heights, water, forest, trackDist, riverDist, roadDist, siteDist: new Float32Array(0), zone, track, rivers };
  const sites = chooseSites(partial, rand);

  // Level each site into a yard.
  const siteDist = new Float32Array(ROW * ROW).fill(FAR);
  for (const site of sites) {
    const reach = SITE_FLAT + SITE_BLEND;
    const i0 = Math.max(0, Math.floor((site.x - reach + HALF) / CELL));
    const i1 = Math.min(WORLD.segments, Math.ceil((site.x + reach + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((site.z - reach + HALF) / CELL));
    const j1 = Math.min(WORLD.segments, Math.ceil((site.z + reach + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * ROW + i;
        const d = Math.hypot(gridX(i) - site.x, gridZ(j) - site.z);
        siteDist[k] = Math.min(siteDist[k], d);
        heights[k] = lerp(site.y, heights[k], smoothstep(SITE_FLAT, reach, d));
      }
    }
  }

  return { ...partial, siteDist, sites };
}

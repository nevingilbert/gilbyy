/**
 * The Golden Gate Bridge and the Bay Bridge: decks you can drive along, high over the
 * water, with the ground and the streets still there underneath. Each deck is a ribbon
 * along a line, its height given point by point. The physics reads the deck or the ground
 * by how high the truck already is (`surface`), so a truck on the Embarcadero drives under
 * the Bay Bridge and one on the bridge drives over it. See ADR 0022.
 *
 * The line and the heights were taken from the Census's own line for each bridge and the
 * USGS ground at each end, at the city's scale: 1:2.5 across, 1:1.7 up. Pure, no three.js.
 */
import type { Obstacle } from "./world";

type P = { x: number; z: number };

export type Tower = { s: number; height: number; legs: number; base: number };
export type Deck = {
  name: string;
  xs: number[];
  zs: number[];
  /** The road's surface at each point. */
  ys: number[];
  /** Distance along it at each point. */
  s: number[];
  length: number;
  /** Half the road's width. */
  half: number;
  /** Where along it there are railings: wherever it stands clear of the ground. */
  rails: [number, number][];
  towers: Tower[];
  /** Where it goes through a hill. */
  tunnel: [number, number] | null;
  /** Main cables, for drawing: from one anchorage over each tower to the next, as distances along. */
  cables: { from: number; over: number[]; to: number; sag: number }[];
};

/**
 * Control points, x, z, deck height, resampled every few metres into a deck. `tunnel` is
 * the two control points, by index, between which the deck is inside a hill.
 */
type Plan = { name: string; half: number; points: [number, number, number][]; towers: { at: [number, number]; height: number }[]; tunnel?: [number, number] };

/**
 * The Golden Gate: up off the bluff at the old toll plaza, over Fort Point, between its two
 * towers and across onto the Marin side, where it comes down at Vista Point.
 */
const GOLDEN_GATE: Plan = {
  name: "golden-gate", half: 8,
  points: [
    [-1436, -1636, 33.4], [-1451, -1680, 33.6], [-1467, -1733, 34.0], [-1472, -1787, 34.5],
    [-1482.3, -1905, 36.5], [-1504.6, -2160, 39.4], [-1527, -2415, 36.5],
    [-1538.9, -2551.5, 37.5], [-1560, -2650, 39.5], [-1591, -2742, 41.5],
  ],
  towers: [{ at: [-1482.3, -1905], height: 133 }, { at: [-1527, -2415], height: 133 }],
};

/**
 * The Bay Bridge: up from Rincon Hill and over the Embarcadero, two suspension spans to
 * Yerba Buena Island, through its tunnel, and out along the eastern span toward Oakland,
 * past the edge of the map.
 */
const BAY_BRIDGE: Plan = {
  name: "bay", half: 8,
  points: [
    [1560, -690, 13], [1620, -735, 17], [1687, -802, 21], [1780, -909, 33.5], [1872, -1015, 35],
    [1965, -1122, 33.5], [2058, -1229, 33], [2151, -1337, 33.5], [2243, -1443, 35], [2335, -1549, 33.5],
    [2428, -1657, 31.5], [2445, -1690, 30.8], [2525, -1785, 30.6], [2560, -1840, 30.2], [2620, -1900, 29],
    [2714, -1965, 27.5], [2836, -2051, 26], [2923, -2104, 25], [3009, -2131, 24.5], [3400, -2280, 22], [3900, -2470, 18],
  ],
  towers: [
    { at: [1780, -909], height: 88 }, { at: [1965, -1122], height: 88 }, { at: [2151, -1337], height: 88 }, { at: [2335, -1549], height: 88 },
    // The eastern span's single white tower.
    { at: [2640, -1915], height: 94 },
  ],
  tunnel: [11, 12],
};

const STEP = 2.5;

function make(plan: Plan, ground: (x: number, z: number) => number): Deck {
  // A smooth line through the control points (Catmull–Rom), heights along with it.
  const pts = plan.points;
  const dense: [number, number, number][] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, k - 1)], pts[k], pts[k + 1], pts[Math.min(pts.length - 1, k + 2)]];
    for (let t = 0; t < 1; t += 1 / 40) {
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      dense.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const xs: number[] = [];
  const zs: number[] = [];
  const ys: number[] = [];
  const s: number[] = [];
  let along = 0;
  let carry = 0;
  for (let i = 0; i < dense.length; i++) {
    if (i === 0) {
      xs.push(dense[0][0]);
      zs.push(dense[0][1]);
      ys.push(dense[0][2]);
      s.push(0);
      continue;
    }
    const [ax, az, ay] = dense[i - 1];
    const [bx, bz, by] = dense[i];
    const len = Math.hypot(bx - ax, bz - az);
    let at = STEP - carry;
    while (at <= len) {
      const f = at / len;
      xs.push(ax + (bx - ax) * f);
      zs.push(az + (bz - az) * f);
      ys.push(ay + (by - ay) * f);
      s.push(along + at);
      at += STEP;
    }
    carry = len - (at - STEP);
    along += len;
  }
  const length = s[s.length - 1];
  // Railings wherever the deck is a metre or more above the ground, in stretches.
  const rails: [number, number][] = [];
  let open = -1;
  for (let i = 0; i <= xs.length; i++) {
    const clear = i < xs.length && ys[i] - ground(xs[i], zs[i]) > 1;
    if (clear && open < 0) open = s[i];
    if (!clear && open >= 0) {
      rails.push([open, s[i - 1]]);
      open = -1;
    }
  }
  const nearestS = (x: number, z: number) => {
    let best = 0;
    let far = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.hypot(xs[i] - x, zs[i] - z);
      if (d < far) {
        far = d;
        best = s[i];
      }
    }
    return best;
  };
  const towers = plan.towers.map((t) => ({ s: nearestS(t.at[0], t.at[1]), height: t.height, legs: plan.half + 2.2, base: Math.min(0, ground(t.at[0], t.at[1])) }));
  const tunnel = plan.tunnel ? (plan.tunnel.map((i) => nearestS(pts[i][0], pts[i][1])) as [number, number]) : null;
  // Cables: the Golden Gate's from anchorage to anchorage over both towers; the Bay
  // Bridge's two western spans each their own, and the eastern span's round its one tower.
  const cables =
    plan.name === "golden-gate"
      ? [{ from: nearestS(-1472, -1787), over: towers.map((t) => t.s), to: nearestS(-1538.9, -2551.5), sag: 0.8 }]
      : [
          { from: nearestS(1687, -802), over: [towers[0].s, towers[1].s], to: nearestS(2058, -1229), sag: 0.8 },
          { from: nearestS(2058, -1229), over: [towers[2].s, towers[3].s], to: nearestS(2428, -1657), sag: 0.8 },
          { from: nearestS(2560, -1840), over: [towers[4].s], to: nearestS(2836, -2051), sag: 0.6 },
        ];
  return { name: plan.name, xs, zs, ys, s, length, half: plan.half, rails, towers, tunnel, cables };
}

export function buildDecks(ground: (x: number, z: number) => number): Deck[] {
  return [make(GOLDEN_GATE, ground), make(BAY_BRIDGE, ground)];
}

/** A point along a deck: where it is, how high the road is, and which way it runs. */
export function deckPoint(d: Deck, s: number) {
  const f = Math.max(0, Math.min(d.xs.length - 1.001, s / STEP));
  const i = Math.floor(f);
  const t = f - i;
  const x = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * t;
  const z = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * t;
  const y = d.ys[i] + (d.ys[i + 1] - d.ys[i]) * t;
  const dx = d.xs[i + 1] - d.xs[i];
  const dz = d.zs[i + 1] - d.zs[i];
  const l = Math.hypot(dx, dz) || 1;
  return { x, y, z, fx: dx / l, fz: dz / l };
}

/**
 * Finds the decks quickly: which stretch of which deck is near a spot. Built once per
 * city, then asked thousands of times a second by the physics and the grass.
 */
export function deckIndex(decks: Deck[]) {
  const BUCKET = 20;
  const buckets = new Map<number, [Deck, number][]>();
  const key = (bx: number, bz: number) => bx * 8192 + bz;
  for (const d of decks) {
    for (let i = 0; i + 1 < d.xs.length; i++) {
      const pad = d.half + 6;
      const x0 = Math.floor((Math.min(d.xs[i], d.xs[i + 1]) - pad) / BUCKET);
      const x1 = Math.floor((Math.max(d.xs[i], d.xs[i + 1]) + pad) / BUCKET);
      const z0 = Math.floor((Math.min(d.zs[i], d.zs[i + 1]) - pad) / BUCKET);
      const z1 = Math.floor((Math.max(d.zs[i], d.zs[i + 1]) + pad) / BUCKET);
      for (let bx = x0; bx <= x1; bx++) {
        for (let bz = z0; bz <= z1; bz++) {
          const k = key(bx, bz);
          (buckets.get(k) ?? buckets.set(k, []).get(k)!).push([d, i]);
        }
      }
    }
  }
  /** The nearest deck stretch to a spot: its deck, how far along, how far off its middle, and the road's height there. */
  const nearest = (x: number, z: number) => {
    const list = buckets.get(key(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
    if (!list) return null;
    let best: { deck: Deck; s: number; off: number; y: number } | null = null;
    for (const [d, i] of list) {
      const ax = d.xs[i];
      const az = d.zs[i];
      const dx = d.xs[i + 1] - ax;
      const dz = d.zs[i + 1] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const off = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || off < best.off) best = { deck: d, s: d.s[i] + t * STEP, off, y: d.ys[i] + (d.ys[i + 1] - d.ys[i]) * t };
    }
    return best;
  };
  /** The road's height if a spot is on a deck, or null. */
  const roadAt = (x: number, z: number) => {
    const n = nearest(x, z);
    return n && n.off <= n.deck.half ? n.y : null;
  };
  /**
   * The railings near a spot, as the physics sees obstacles: flat circles touching each
   * railing, which a truck under the deck passes beneath (`bottom`).
   */
  const railings = (x: number, z: number): Obstacle[] => {
    const n = nearest(x, z);
    if (!n || n.off > n.deck.half + 3 || !n.deck.rails.some(([a, b]) => n.s >= a && n.s <= b)) return [];
    const p = deckPoint(n.deck, n.s);
    // Which side of the middle the spot is, and the way out across the deck to that side's railing.
    const side = (x - p.x) * p.fz - (z - p.z) * p.fx >= 0 ? 1 : -1;
    const ox = p.fz * side;
    const oz = -p.fx * side;
    const R = 60;
    const edge = n.deck.half;
    // On the deck, a circle beyond the railing, so its near edge is the railing. Beside a
    // ramp that isn't yet high enough to drive under, one over the deck: its side is a wall.
    const at = n.off <= edge ? edge + R : edge - R;
    return [{ x: p.x + ox * at, z: p.z + oz * at, r: R, h: Infinity, bottom: p.y - 1.5 }];
  };
  return { nearest, roadAt, railings };
}

export type DeckIndex = ReturnType<typeof deckIndex>;

/** A spot's distance from a deck's middle line, for keeping things off it. */
export const offDeck = (index: DeckIndex, x: number, z: number) => index.nearest(x, z)?.off ?? Infinity;

export type { P as DeckPoint };

import { FROZEN, LAKES, ROW, START, WORLD, nearest, sampleGrid, type Path, type Terrain } from "./terrain";

/**
 * Optional driving challenges, laid out on the real terrain at load. Drive to a start
 * arch, press E, and go through the gates in order. Finishing earns miles; there is
 * no failing, only giving up. Pure data, no three.js.
 */
export type Gate = { x: number; z: number; heading: number; width: number };
export type Mission = {
  id: string;
  name: string;
  blurb: string;
  start: { x: number; z: number; heading: number };
  /** In order; the last is the finish. */
  gates: Gate[];
  /** Miles for the first finish, and for each finish after that (no sooner than `cooldown` seconds apart). */
  reward: number;
  repeatReward: number;
  cooldown: number;
  /** Faster than this is not believable; the server refuses the claim. */
  minSeconds: number;
};

type Pt = { x: number; z: number };

function helpers(t: Terrain) {
  const h = (x: number, z: number) => sampleGrid(t.heights, x, z);
  const f = (field: Float32Array, x: number, z: number) => sampleGrid(field, x, z);
  const slope = (x: number, z: number) => Math.hypot(h(x + 2, z) - h(x - 2, z), h(x, z + 2) - h(x, z - 2)) / 4;
  const zone = (x: number, z: number) =>
    t.zone[Math.round((z + WORLD.size / 2) / (WORLD.size / WORLD.segments)) * ROW + Math.round((x + WORLD.size / 2) / (WORLD.size / WORLD.segments))];
  /** A spot a course can pass through: dry, drivable, clear of the railway, rivers, buildings and camp. */
  const clearAt = (x: number, z: number, maxSlope: number) =>
    Math.hypot(x, z) < WORLD.wallStart - 120 &&
    zone(x, z) > 0 &&
    h(x, z) > f(t.water, x, z) + 0.4 &&
    slope(x, z) <= maxSlope &&
    f(t.trackDist, x, z) > 14 &&
    f(t.riverDist, x, z) > 40 &&
    f(t.siteDist, x, z) > 35 &&
    f(t.campDist, x, z) > 60 &&
    f(t.roadDist, x, z) > 8;
  /** Checks every few metres along a polyline. */
  const lineOk = (pts: Pt[], maxSlope: number) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
      for (let k = 0; k <= n; k++) if (!clearAt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, maxSlope)) return false;
    }
    return true;
  };
  return { h, f, slope, zone, clearAt, lineOk };
}

/** Each gate faces along the path: from the point before it toward the point after it. */
function gatesAlong(start: Pt, pts: Pt[], width: number): Gate[] {
  return pts.map((p, i) => {
    const prev = i === 0 ? start : pts[i - 1];
    const next = pts[i + 1] ?? p;
    const dx = (next === p ? p.x - prev.x : next.x - prev.x);
    const dz = (next === p ? p.z - prev.z : next.z - prev.z);
    return { x: p.x, z: p.z, heading: Math.atan2(dx, dz), width };
  });
}

const length = (start: Pt, pts: Pt[]) =>
  pts.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? pts[i - 1] : start).x, p.z - (i ? pts[i - 1] : start).z), 0);

/** Weaving between flags through the thickest forest within reach of camp. */
function forestSlalom(t: Terrain): Mission | null {
  const { f, clearAt, lineOk } = helpers(t);
  let best: { start: Pt; heading: number; pts: Pt[]; score: number } | null = null;
  for (let z = -1800; z <= 1800; z += 60) {
    for (let x = -1800; x <= 1800; x += 60) {
      const fromStart = Math.hypot(x - START.x, z - START.z);
      if (fromStart < 300 || fromStart > 1800 || f(t.snow, x, z) > 0.05 || !clearAt(x, z, 0.3)) continue;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * Math.PI * 2;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const pts: Pt[] = [];
        let forest = 0;
        for (let g = 1; g <= 10; g++) {
          const side = g % 2 ? 7 : -7;
          const p = { x: x + dx * g * 40 + dz * side, z: z + dz * g * 40 - dx * side };
          pts.push(p);
          forest += f(t.forest, p.x, p.z);
        }
        const score = forest / 10;
        if (score < 0.55 || (best && score <= best.score)) continue;
        if (!lineOk([{ x, z }, ...pts], 0.32)) continue;
        best = { start: { x, z }, heading: a, pts, score };
      }
    }
  }
  if (!best) return null;
  return {
    id: "forest-slalom", name: "Forest Slalom", blurb: "Ten flags through the pines. Mind the trunks.",
    start: { ...best.start, heading: best.heading }, gates: gatesAlong(best.start, best.pts, 9),
    reward: 1.5, repeatReward: 0.5, cooldown: 600, minSeconds: Math.floor(length(best.start, best.pts) / 23),
  };
}

/** Straight up the biggest climbable hill on the near side, flag by flag to the summit. */
function ridgeRun(t: Terrain): Mission | null {
  const { h, f, zone, clearAt, lineOk } = helpers(t);
  let best: { start: Pt; heading: number; pts: Pt[]; climb: number } | null = null;
  for (let z = -2000; z <= 2000; z += 50) {
    for (let x = -2000; x <= 2000; x += 50) {
      if (zone(x, z) !== 1 || f(t.snow, x, z) > 0.2) continue;
      const top = h(x, z);
      let peak = true;
      for (let k = 0; k < 8 && peak; k++) peak = h(x + Math.sin(k) * 120, z + Math.cos(k) * 120) < top - 8;
      if (!peak) continue;
      for (let d = 0; d < 16; d++) {
        const a = (d / 16) * Math.PI * 2;
        const start = { x: x - Math.sin(a) * 360, z: z - Math.cos(a) * 360 };
        const climb = top - h(start.x, start.z);
        if (climb < 30 || (best && climb <= best.climb)) continue;
        if (!clearAt(start.x, start.z, 0.25) || !lineOk([start, { x, z }], 0.42)) continue;
        const pts = [1, 2, 3, 4, 5, 6, 7].map((g) => {
          const along = g / 7;
          const side = g === 7 ? 0 : g % 2 ? 4 : -4;
          return { x: start.x + (x - start.x) * along + Math.cos(a) * side, z: start.z + (z - start.z) * along - Math.sin(a) * side };
        });
        best = { start, heading: a, pts, climb };
      }
    }
  }
  if (!best) return null;
  return {
    id: "ridge-run", name: "Ridge Run", blurb: `Seven flags, ${Math.round(best.climb)} metres of climb. Keep it steady.`,
    start: { ...best.start, heading: best.heading }, gates: gatesAlong(best.start, best.pts, 9),
    reward: 2, repeatReward: 0.6, cooldown: 600, minSeconds: Math.floor(length(best.start, best.pts) / 23),
  };
}

/** Round the west lake's shore, anticlockwise, back to where you started. */
function lakeshoreLoop(t: Terrain): Mission | null {
  const { clearAt } = helpers(t);
  const lake = LAKES[1];
  const pts: Pt[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let push = 0; push <= 60; push += 10) {
      const r = lake.r + 45 + push;
      const p = { x: lake.x + Math.cos(a) * r, z: lake.z + Math.sin(a) * r };
      if (clearAt(p.x, p.z, 0.4)) {
        pts.push(p);
        break;
      }
    }
  }
  if (pts.length < 9) return null;
  // Start a little before the first flag, and finish back at it.
  const tangent = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  const start = { x: pts[0].x - Math.sin(tangent) * 30, z: pts[0].z - Math.cos(tangent) * 30 };
  const loop = [...pts, pts[0]];
  return {
    id: "lakeshore-loop", name: "Lakeshore Loop", blurb: "Once round the west lake. Wet feet optional.",
    start: { ...start, heading: tangent }, gates: gatesAlong(start, loop, 10),
    reward: 2.5, repeatReward: 0.8, cooldown: 600, minSeconds: Math.floor(length(start, loop) / 23),
  };
}

/** Zigzag across the frozen lake. On road tyres, this is mostly sliding. */
function iceDrift(t: Terrain): Mission | null {
  const { clearAt } = helpers(t);
  const lake = FROZEN[0];
  const start = { x: lake.x - lake.r - 45, z: lake.z };
  if (!clearAt(start.x, start.z, 0.3)) return null;
  const pts: Pt[] = [];
  for (let x = lake.x - lake.r + 30, k = 0; x <= lake.x + lake.r - 30; x += 45, k++) pts.push({ x, z: lake.z + (k % 2 ? 28 : -28) });
  pts.push({ x: lake.x + lake.r + 40, z: lake.z });
  return {
    id: "ice-drift", name: "Ice Drift", blurb: "Flags across the frozen lake. Snow tyres help. A lot.",
    start: { ...start, heading: Math.PI / 2 }, gates: gatesAlong(start, pts, 12),
    reward: 3, repeatReward: 1, cooldown: 600, minSeconds: Math.floor(length(start, pts) / 23),
  };
}

export function planMissions(t: Terrain) {
  const missions = [forestSlalom(t), ridgeRun(t), lakeshoreLoop(t), iceDrift(t)].filter((m): m is Mission => !!m);
  // Keep every course clear of trees and rocks along its driving line.
  const courseDist = new Float32Array(ROW * ROW).fill(1000);
  for (const m of missions) {
    const path: Path = { xs: [m.start.x, ...m.gates.map((g) => g.x)], zs: [m.start.z, ...m.gates.map((g) => g.z)] };
    const d = nearest(path, false, 20).dist;
    for (let k = 0; k < d.length; k++) courseDist[k] = Math.min(courseDist[k], d[k]);
  }
  return { missions, courseDist };
}

/**
 * Railway lines that go somewhere and stop, rather than round: the valley's branch out to
 * the tunnel, and San Francisco's line in to Fourth and King (ADR 0022). Where a train is
 * on one, car by car, whichever way it faces. Pure, no three.js.
 */
import { CELL, HALF, ROW, WORLD, sampleGrid } from "./terrain";
import { BOGIE, CONSIST, GAP, type Pose, type TrainCar } from "./track";

/**
 * A line's bed in the ground grid: level out to `half` either side, `under` the rails'
 * tops. It's wider than the ballast so the ground between grid points, ten metres apart,
 * can't come up over the sleepers.
 */
export const BED = { half: 7.5, under: 0.55 } as const;

/**
 * The ground `d` metres from a line whose bed is at `bed`: the bed itself, then a bank down
 * to lower ground or a steep side up to higher, as a cutting's retaining walls are.
 */
export const besideBed = (ground: number, bed: number, d: number) =>
  d < BED.half ? bed : Math.max(bed - (d - BED.half) * 0.45, Math.min(bed + (d - BED.half) * 1.4, ground));

/**
 * Brings the ground down to a line's bed wherever it still comes up over it, from `from` to
 * `to` along it. On a grid ten metres square a cutting's steep sides reach in over the
 * floor between grid points: under each metre of the line, across the ballast's width,
 * whichever corner of the ground's triangle there stands highest is let down until the
 * ground is down to the bed.
 */
export function clearBed(heights: Float32Array, line: RailLine, from: number, to: number) {
  const corners = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(WORLD.segments - 1e-6, (x + HALF) / CELL));
    const fz = Math.max(0, Math.min(WORLD.segments - 1e-6, (z + HALF) / CELL));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    // The same split as sampleGrid: each corner of the triangle with its weight at (x, z).
    return u + v <= 1
      ? [[j * ROW + i, 1 - u - v], [j * ROW + i + 1, u], [(j + 1) * ROW + i, v]]
      : [[(j + 1) * ROW + i + 1, u + v - 1], [(j + 1) * ROW + i, 1 - u], [j * ROW + i + 1, 1 - v]];
  };
  for (let s = Math.max(0, from); s <= Math.min(line.length, to); s += 1) {
    const f = lineFrame(line, s);
    const bed = f.y - BED.under;
    for (const off of [0, 1.8, -1.8]) {
      const x = f.x + f.lx * off;
      const z = f.z + f.lz * off;
      for (let tries = 0; tries < 3; tries++) {
        const over = sampleGrid(heights, x, z) - bed;
        if (over <= 0.05) break;
        let k = -1;
        let w = 0;
        for (const [c, cw] of corners(x, z)) if (cw > 0.02 && (k < 0 || (heights[c] - bed) * cw > (heights[k] - bed) * w)) [k, w] = [c, cw];
        if (k < 0) break;
        heights[k] = Math.max(bed, heights[k] - over / w - 0.02);
      }
    }
  }
}

/**
 * Where a line goes in under the hill, once its cutting is dug: a little short of the
 * first point from `from` on where the ground has come up over its bed. Dug on a grid ten
 * metres square, the floor starts to rise toward the hill a cell short of where the cut
 * ends, and a tunnel's face has to stand on the level.
 */
export function mouthAt(line: RailLine, from: number, ground: (x: number, z: number) => number) {
  for (let s = Math.max(0, from); s < line.length; s += 0.5) {
    const p = linePoint(line, s);
    if (ground(p.x, p.z) > p.y - BED.under + 0.15) return s - 1.5;
  }
  return line.length;
}

/** Whether (x, z) is beyond the last of a line of points, on the way it was going. */
export function pastEnd(path: { xs: readonly number[]; zs: readonly number[] }, x: number, z: number) {
  const n = path.xs.length - 1;
  return (x - path.xs[n]) * (path.xs[n] - path.xs[n - 1]) + (z - path.zs[n]) * (path.zs[n] - path.zs[n - 1]) > 0;
}

/** A line of rail: points, the rail-top height at each, and the distance along it at each. */
export type RailLine = { xs: number[]; zs: number[]; ys: number[]; s: number[]; length: number };

/** A line through points with heights, measured. */
export function lineThrough(pts: readonly { x: number; z: number; y: number }[]): RailLine {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { xs: pts.map((p) => p.x), zs: pts.map((p) => p.z), ys: pts.map((p) => p.y), s, length: s[s.length - 1] };
}

/** The segment `s` falls in: its first point, and how far along it. */
function segment(line: RailLine, s: number) {
  let lo = 0;
  let hi = line.s.length - 2;
  if (s <= line.s[0]) return { i: 0, t: (s - line.s[0]) / (line.s[1] - line.s[0]) };
  if (s >= line.s[hi + 1]) return { i: hi, t: (s - line.s[hi]) / (line.s[hi + 1] - line.s[hi]) };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (line.s[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return { i: lo, t: (s - line.s[lo]) / (line.s[lo + 1] - line.s[lo]) };
}

/** Rail-top position at `s`. Past either end it carries straight on, level: a train running into the tunnel. */
export function linePoint(line: RailLine, s: number): Pose {
  const { i, t } = segment(line, s);
  const level = t < 0 || t > 1;
  const y = level ? (t < 0 ? line.ys[i] : line.ys[i + 1]) : line.ys[i] + (line.ys[i + 1] - line.ys[i]) * t;
  return { x: line.xs[i] + (line.xs[i + 1] - line.xs[i]) * t, y, z: line.zs[i] + (line.zs[i + 1] - line.zs[i]) * t };
}

/** Position at `s`, with unit vectors along the line (toward larger `s`) and to its left. */
export function lineFrame(line: RailLine, s: number) {
  const p = linePoint(line, s);
  const a = linePoint(line, s - 2);
  const b = linePoint(line, s + 2);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const fx = (b.x - a.x) / l;
  const fz = (b.z - a.z) / l;
  // Left of travel, matching the truck's convention: (cos h, −sin h) for heading h.
  return { ...p, fx, fz, lx: fz, lz: -fx };
}

/**
 * Every car of a train on a line, its front at `head`. Facing +1, the train points toward
 * larger distances and its cars trail behind toward smaller; facing −1, the other way.
 */
export function carsOn(line: RailLine, head: number, facing: 1 | -1, consist = CONSIST): TrainCar[] {
  let s0 = head;
  return consist.map(({ kind, length }) => {
    const front = linePoint(line, s0 - facing * BOGIE);
    const back = linePoint(line, s0 - facing * (length - BOGIE));
    s0 -= facing * (length + GAP);
    const dx = front.x - back.x;
    const dz = front.z - back.z;
    return {
      kind, length,
      x: (front.x + back.x) / 2,
      y: (front.y + back.y) / 2,
      z: (front.z + back.z) / 2,
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(front.y - back.y, Math.hypot(dx, dz)),
    };
  });
}

/** How far the flat wagon's middle is from the train's front, along the line. It's the last car. */
export const FLAT_FROM_HEAD = CONSIST.slice(0, -1).reduce((sum, c) => sum + c.length + GAP, 0) + CONSIST[CONSIST.length - 1].length / 2;

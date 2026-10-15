/**
 * San Francisco's cable cars, on the Powell–Hyde line (ADR 0022): up Powell Street from the
 * turntable at Market, along Jackson, and over Russian Hill on Hyde to the turnaround by
 * Aquatic Park, and back down. Each car runs up the line and back on a timetable that is
 * a function of the time alone, so every browser has them in the same places. They keep
 * to the right-hand side of the street and are swung round on the turntable at each end,
 * in the street's middle.
 *
 * They're solid: a truck in their way stops against them, as against the train. Pure, no
 * three.js.
 */
import type { Pt } from "./city-streets";
import type { Obstacle } from "./world";

export type CableLine = { xs: number[]; zs: number[]; s: number[]; length: number };

/** How fast the cable runs (it's 9.5 mph), how hard a car takes up and lets go of it, and how long it's on each turntable. */
export const CABLE_SPEED = 4.2;
const GRIP = 1;
export const TURN_TIME = 25;
/** How many cars run on the line. */
export const CABLE_CARS = 4;
/**
 * A car's length and width, and how far right of the street's middle its track is. Over
 * the last stretch into each end the track comes in to the middle, onto the turntable.
 */
export const CABLE_CAR = { length: 8.4, width: 2.5, lane: 2.4, toMiddle: 14 } as const;

/** The line through the route's points, measured. */
export function cableLine(pts: readonly Pt[]): CableLine {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { xs: pts.map((p) => p.x), zs: pts.map((p) => p.z), s, length: s[s.length - 1] };
}

/** The point at `s` along the line, and the way it runs there. */
export function cablePoint(line: CableLine, s: number) {
  const t = Math.max(0, Math.min(line.length, s));
  let i = 0;
  while (i < line.s.length - 2 && line.s[i + 1] < t) i++;
  const seg = line.s[i + 1] - line.s[i] || 1;
  const u = (t - line.s[i]) / seg;
  const fx = (line.xs[i + 1] - line.xs[i]) / seg;
  const fz = (line.zs[i + 1] - line.zs[i]) / seg;
  return { x: line.xs[i] + (line.xs[i + 1] - line.xs[i]) * u, z: line.zs[i] + (line.zs[i + 1] - line.zs[i]) * u, fx, fz };
}

/** How far right of the line's middle a track is at `s`: the lane, coming in to the middle at each end. */
export function laneAt(line: CableLine, s: number) {
  const end = Math.min(s, line.length - s);
  const k = Math.max(0, Math.min(1, end / CABLE_CAR.toMiddle));
  return CABLE_CAR.lane * k * k * (3 - 2 * k);
}

/** How long one run, end to end, takes: at speed between taking up the cable and letting it go. */
const runTime = (line: CableLine) => line.length / CABLE_SPEED + CABLE_SPEED / GRIP;
/** One car's whole round: up, turned, down, turned. */
export const cableCycle = (line: CableLine) => 2 * runTime(line) + 2 * TURN_TIME;

/** How far along a run of length L a car is `t` seconds after setting off. */
function runAt(L: number, t: number) {
  const ramp = CABLE_SPEED / GRIP;
  const T = L / CABLE_SPEED + ramp;
  if (t <= ramp) return 0.5 * GRIP * t * t;
  if (t >= T - ramp) return L - 0.5 * GRIP * (T - t) ** 2;
  return 0.5 * GRIP * ramp * ramp + CABLE_SPEED * (t - ramp);
}

/**
 * Where car `k` is at `time`: how far along the line, which way it faces (+1 up the line,
 * −1 back down it), and how far round the turntable it's been swung, 0 to 1, or null if
 * it's out on the line. Cars are spaced evenly round the cycle.
 */
export function cableRun(line: CableLine, k: number, time: number) {
  const P = cableCycle(line);
  const T = runTime(line);
  const t = (((time + (k * P) / CABLE_CARS) % P) + P) % P;
  if (t < TURN_TIME) return { s: 0, dir: 1 as const, turn: t / TURN_TIME };
  if (t < TURN_TIME + T) return { s: runAt(line.length, t - TURN_TIME), dir: 1 as const, turn: null };
  if (t < 2 * TURN_TIME + T) return { s: line.length, dir: -1 as const, turn: (t - TURN_TIME - T) / TURN_TIME };
  return { s: line.length - runAt(line.length, t - 2 * TURN_TIME - T), dir: -1 as const, turn: null };
}

export type CableCar = { x: number; y: number; z: number; yaw: number; pitch: number };

/**
 * Every car at `time`, on the street: on the right of the way it's going, or on a
 * turntable being swung from facing one way to the other.
 */
export function cableCars(line: CableLine, ground: (x: number, z: number) => number, time: number): CableCar[] {
  const out: CableCar[] = [];
  for (let k = 0; k < CABLE_CARS; k++) {
    const run = cableRun(line, k, time);
    const p = cablePoint(line, run.s);
    // Right of the way it's going: going up the line that's to the line's right, coming back to its left.
    const off = laneAt(line, run.s) * run.dir;
    const x = p.x - p.fz * off;
    const z = p.z + p.fx * off;
    // On a turntable it's swung half round, from facing in to facing out; on the line, the way it's going.
    const facing = Math.atan2(p.fx * run.dir, p.fz * run.dir);
    const yaw = run.turn === null ? facing : facing + Math.PI * (1 - run.turn * run.turn * (3 - 2 * run.turn));
    const [hx, hz] = [Math.sin(yaw) * CABLE_CAR.length * 0.4, Math.cos(yaw) * CABLE_CAR.length * 0.4];
    const pitch = Math.atan2(ground(x + hx, z + hz) - ground(x - hx, z - hz), CABLE_CAR.length * 0.8);
    out.push({ x, y: ground(x, z), z, yaw, pitch });
  }
  return out;
}

/** What a truck runs into: each car as circles down its length. */
export function cableObstacles(cars: readonly CableCar[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const c of cars) {
    const [fx, fz] = [Math.sin(c.yaw), Math.cos(c.yaw)];
    for (let d = -CABLE_CAR.length / 2 + 1.25; d <= CABLE_CAR.length / 2 - 1.25 + 1e-6; d += 1.6) {
      out.push({ x: c.x + fx * d, z: c.z + fz * d, r: CABLE_CAR.width / 2, h: Infinity });
    }
  }
  return out;
}

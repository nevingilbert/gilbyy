import type { Track } from "./terrain";
import type { Obstacle } from "./world";

/**
 * The train: where each car is along the loop at a given moment, and when the level
 * crossings close. Pure functions of time, so the train never drifts out of step.
 */
export const TRAIN_SPEED = 15;
export type TrainCarKind = "loco" | "boxcar" | "logs" | "tanker";
/** Front to back. Lengths match the models in train-model.ts. */
export const CONSIST: { kind: TrainCarKind; length: number }[] = [
  { kind: "loco", length: 14 },
  { kind: "boxcar", length: 12 },
  { kind: "logs", length: 12 },
  { kind: "tanker", length: 11 },
  { kind: "logs", length: 12 },
  { kind: "boxcar", length: 12 },
];
const GAP = 1.2;
const BOGIE = 1.8;
export const TRAIN_LENGTH = CONSIST.reduce((sum, c) => sum + c.length + GAP, -GAP);

/** Barriers close this far ahead of the train, and open once its tail is this far past. */
const WARN_AHEAD = 260;
const CLEAR_BEHIND = 25;

const wrap = (s: number, length: number) => ((s % length) + length) % length;

export type Pose = { x: number; y: number; z: number };

/** Rail-top position at distance `s` along the loop. */
export function trackPoint(track: Track, s: number): Pose {
  const n = track.xs.length;
  const f = wrap(s, track.length) / (track.length / n);
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  return {
    x: track.xs[i] + (track.xs[j] - track.xs[i]) * t,
    y: track.ys[i] + (track.ys[j] - track.ys[i]) * t,
    z: track.zs[i] + (track.zs[j] - track.zs[i]) * t,
  };
}

/** Distance along the track of the front of the train. It starts across the lake from you. */
export const trainHead = (track: Track, time: number) => wrap(time * TRAIN_SPEED + track.length * 0.08, track.length);

export type TrainCar = Pose & { kind: TrainCarKind; yaw: number; pitch: number; length: number };

/** Every car's centre and heading, posed between its two bogies so it follows the curve. */
export function trainCars(track: Track, time: number): TrainCar[] {
  let s = trainHead(track, time);
  return CONSIST.map(({ kind, length }) => {
    const front = trackPoint(track, s - BOGIE);
    const back = trackPoint(track, s - length + BOGIE);
    s -= length + GAP;
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

/** The train as circles down each car, so it shoves the truck aside rather than ghosting through. */
export function trainObstacles(cars: TrainCar[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const c of cars) {
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    for (let d = -c.length / 2 + 1.6; d <= c.length / 2 - 1.6 + 1e-6; d += 2.4) {
      out.push({ x: c.x + fx * d, z: c.z + fz * d, r: 1.65, h: Infinity });
    }
  }
  return out;
}

/** Whether the barriers at a crossing should be down: the train is approaching or passing. */
export function crossingClosed(track: Track, crossing: number, time: number) {
  const head = trainHead(track, time);
  const ahead = wrap(crossing - head, track.length);
  const behind = wrap(head - crossing, track.length);
  return ahead < WARN_AHEAD || behind < TRAIN_LENGTH + CLEAR_BEHIND;
}

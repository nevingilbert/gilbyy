import type { Track } from "./terrain";
import type { Obstacle } from "./world";

/**
 * The train: where each car is along the loop at a given moment, and when the level
 * crossings close. Pure functions of time, so the train never drifts out of step.
 * Also the bridges' solid parts, which keep trucks off them and out from under their ends.
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

/**
 * The train as circles down each car, so it shoves the truck aside rather than ghosting through.
 * Given the ground, it leaves out what's high on a bridge, so a truck can drive underneath.
 */
export function trainObstacles(cars: TrainCar[], height?: (x: number, z: number) => number): Obstacle[] {
  const out: Obstacle[] = [];
  for (const c of cars) {
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    for (let d = -c.length / 2 + 1.6; d <= c.length / 2 - 1.6 + 1e-6; d += 2.4) {
      const x = c.x + fx * d;
      const z = c.z + fz * d;
      if (height && c.y - height(x, z) > HEADROOM) continue;
      out.push({ x, z, r: 1.65, h: Infinity });
    }
  }
  return out;
}

/** Rail top down to the underside of a bridge deck; railway.ts draws the deck to here. */
export const DECK_UNDERSIDE = 0.7;
/** Room a truck needs under a deck, roof bars and bounce included. */
export const HEADROOM = 4.5;
/** Half the width of the abutments and the guards: wider than the deck (2.1) and the train (1.6). */
export const ABUTMENT_HALF = 2.6;
/** The guard on each approach is this long, and ends where the bridge leaves the bank. */
export const GUARD_LENGTH = 2.5;
/** A post at the head of each abutment, either side, in line with the deck's edges and just past the guard. */
export const POST_SIDE = 2.35;
export const POST_SET = 0.3;
/** Trestle legs stand this far either side of the rails, a pair every ten metres. */
export const LEG_OFFSET = 1.7;
const LEG_SPACING = 10;

type Height = (x: number, z: number) => number;

/** Rail-top position at `s`, with unit vectors along the track (toward larger `s`) and to its left. */
export function trackFrame(track: Track, s: number) {
  const p = trackPoint(track, s);
  const a = trackPoint(track, s - 2.5);
  const b = trackPoint(track, s + 2.5);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const fx = (b.x - a.x) / l;
  const fz = (b.z - a.z) / l;
  // Left of travel, matching the truck's convention: (cos h, −sin h) for heading h.
  return { ...p, fx, fz, lx: fz, lz: -fx };
}

export type BridgeEnd = {
  /** Where the bridge leaves the bank, as a distance along the track. */
  bank: number;
  /** Where its abutment ends, out over the valley. Past here the deck clears a truck. */
  deep: number;
  /** Which way the bridge runs from the bank: +1 toward larger distances. */
  dir: 1 | -1;
};

/** Clear height under the deck at `s`, down to the highest ground across the abutment's width. */
function clearance(track: Track, height: Height, s: number) {
  const f = trackFrame(track, s);
  let ground = -Infinity;
  for (const side of [-1, 0, 1]) ground = Math.max(ground, height(f.x + f.lx * side * ABUTMENT_HALF, f.z + f.lz * side * ABUTMENT_HALF));
  return f.y - DECK_UNDERSIDE - ground;
}

/**
 * Both ends of every bridge. The valley falls away gently under each end, so a truck could
 * drive in under a deck too low for it; a concrete abutment fills that space, out to where
 * the deck stands a truck's height clear.
 */
export function bridgeEnds(track: Track, height: Height): BridgeEnd[] {
  const out: BridgeEnd[] = [];
  for (const [a, b] of track.bridges) {
    const mid = (a + b) / 2;
    for (const [bank, dir] of [[a, 1], [b, -1]] as const) {
      let deep = bank;
      while ((mid - deep) * dir > 0 && clearance(track, height, deep) < HEADROOM) deep += dir * 0.5;
      out.push({ bank, deep, dir });
    }
  }
  return out;
}

export type Leg = { x: number; z: number; yaw: number; top: number; ground: number };

/** A pair of timber legs every ten metres under each bridge, between its abutments. */
export function trestleLegs(track: Track, height: Height, ends = bridgeEnds(track, height)): Leg[] {
  const legs: Leg[] = [];
  for (let e = 0; e + 1 < ends.length; e += 2) {
    const from = Math.min(ends[e].deep, ends[e + 1].deep);
    const to = Math.max(ends[e].deep, ends[e + 1].deep);
    for (let s = Math.ceil(from / LEG_SPACING) * LEG_SPACING; s < to; s += LEG_SPACING) {
      const f = trackFrame(track, s);
      for (const side of [1, -1]) {
        const x = f.x + f.lx * side * LEG_OFFSET;
        const z = f.z + f.lz * side * LEG_OFFSET;
        const ground = height(x, z);
        const top = f.y - DECK_UNDERSIDE;
        if (top - ground > 0.5) legs.push({ x, z, yaw: Math.atan2(f.fx, f.fz), top, ground });
      }
    }
  }
  return legs;
}

/**
 * What a truck runs into at the bridges: the guard across each approach, the abutments
 * and their posts, and the trestle legs. The train runs on rails and needs no deck, so
 * the guard is low enough for it to pass over; to a truck it's a wall, whatever its tyres.
 * A gate that opened for the train couldn't do this: anything the train fits through, a
 * truck fits through too, and could follow it onto the bridge.
 */
export function bridgeObstacles(track: Track, height: Height): Obstacle[] {
  const out: Obstacle[] = [];
  const at = (s: number, side: number, r: number) => {
    const f = trackFrame(track, s);
    out.push({ x: f.x + f.lx * side, z: f.z + f.lz * side, r, h: Infinity });
  };
  const ends = bridgeEnds(track, height);
  for (const { bank, deep, dir } of ends) {
    // A row of circles whose near edge is the guard's near edge.
    for (let side = -2; side <= 2; side++) at(bank - dir * (GUARD_LENGTH - 0.6), side * 1.04, 0.6);
    for (const side of [-1, 1]) at(bank + dir * POST_SET, side * POST_SIDE, 0.35);
    // Two rows filling the abutment, from the bank out to its face.
    const r = ABUTMENT_HALF / 2;
    const span = Math.max(0, Math.abs(deep - bank) - 2 * r);
    const count = Math.ceil(span) + 1;
    for (let k = 0; k < count; k++) {
      const s = bank + dir * (r + (count > 1 ? (span * k) / (count - 1) : 0));
      for (const side of [-r, r]) at(s, side, r);
    }
  }
  for (const leg of trestleLegs(track, height, ends)) out.push({ x: leg.x, z: leg.z, r: 0.3, h: Infinity });
  return out;
}

/** Whether the barriers at a crossing should be down: the train is approaching or passing. */
export function crossingClosed(track: Track, crossing: number, time: number) {
  const head = trainHead(track, time);
  const ahead = wrap(crossing - head, track.length);
  const behind = wrap(head - crossing, track.length);
  return ahead < WARN_AHEAD || behind < TRAIN_LENGTH + CLEAR_BEHIND;
}

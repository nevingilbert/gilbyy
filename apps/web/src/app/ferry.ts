import { PIER, dockLeave, fromDock, toDock, type Dock } from "./dock";
import type { Obstacle } from "./world";

/**
 * The car ferry between the island and Las Vegas, as a film (ADR 0023): the truck drives
 * out along the causeway and over the ferry's ramp onto its deck, the ramp comes up, and
 * the ferry pulls away into the haze; on the other side it comes in out of the haze to the
 * other causeway, puts its ramp down, and the truck drives off. Like the flight and the
 * train (flight.ts, rail-trip.ts), every frame is a pure function of the dock, the water
 * and the time.
 *
 * The ferry is double-ended, as small car ferries are: a ramp at each end and the
 * wheelhouse in the middle, so it never turns round. A truck goes aboard over the end at
 * the causeway, facing the other end, and off at the far side over that one.
 *
 * Ferry space: the origin on the waterline under the middle of the hull, +z toward the
 * end that's at the causeway when it's tied up, +x to the left of that.
 */
export const FERRY = {
  length: 36,
  beam: 11,
  /** The car deck over the waterline, and how deep the hull goes under it. */
  deck: 1.3,
  draught: 2.2,
  /** Half the lane down the middle of the deck; the cabins are along the left of it. */
  lane: 3.5,
  /** Each ramp's length, hinged at an end of the deck. */
  ramp: 7,
  /** The gap between the near end and the causeway's quay wall when it's tied up. */
  gap: 3,
  /** How far in from each end the hull's bottom is level; past that it rakes up to the end. */
  body: 14,
} as const;

export type Vec = { x: number; y: number; z: number };
export type FerryPose = Vec & { heading: number; pitch: number; roll: number };
export type TruckPose = { x: number; z: number; heading: number; base: number; pitch: number };
export type FerryFrame = {
  ferry: FerryPose;
  /** The ramp at the near end (+z) and at the far end: 0 up, 1 down. */
  ramps: [number, number];
  truck: TruckPose | null;
  camera: { from: Vec; to: Vec; shot: number; ease: number; wide: boolean };
  /** How much of the picture is lost in the haze over the water, 0–1. */
  haze: number;
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
/** A camera position kept a little clear of the ground under it, wherever the shore rises. */
const clear = (p: Vec, ground: (x: number, z: number) => number): Vec => ({ ...p, y: Math.max(p.y, ground(p.x, p.z) + 1.8) });

/** The ferry tied up at a dock: its near end at the causeway's end, floating on `water`. */
export function mooredPose(d: Dock, water: number): FerryPose {
  const c = fromDock(d, 0, PIER.length + FERRY.gap + FERRY.length / 2);
  return { x: c.x, y: water, z: c.z, heading: d.heading + Math.PI, pitch: 0, roll: 0 };
}

/** A point in ferry space, `up` metres over the waterline, as a world position. */
function onFerry(f: FerryPose, lx: number, up: number, lz: number): Vec {
  const fx = Math.sin(f.heading);
  const fz = Math.cos(f.heading);
  return { x: f.x + fx * lz + fz * lx, y: f.y + up, z: f.z + fz * lz - fx * lx };
}

/** A world (x, z) in the ferry's space. */
function toFerry(f: FerryPose, x: number, z: number) {
  const fx = Math.sin(f.heading);
  const fz = Math.cos(f.heading);
  const [dx, dz] = [x - f.x, z - f.z];
  return { x: dx * fz - dz * fx, z: dx * fx + dz * fz };
}

/**
 * The height of what's under a wheel at (x, z) while the ferry is tied up at `d`: its
 * deck, a lowered ramp sloping up from the deck to the causeway, or `ground` anywhere else.
 */
export function ferryBase(d: Dock, f: FerryPose, ramps: [number, number], ground: (x: number, z: number) => number, x: number, z: number) {
  const p = toFerry(f, x, z);
  const deck = f.y + FERRY.deck;
  if (Math.abs(p.x) > FERRY.lane + 0.3) return ground(x, z);
  const half = FERRY.length / 2;
  if (Math.abs(p.z) <= half) return deck;
  // A ramp down at the end it's past reaches from the deck to wherever its foot rests.
  const end = p.z > 0 ? 0 : 1;
  const out = Math.abs(p.z) - half;
  if (ramps[end] > 0.5 && out <= FERRY.ramp) {
    const foot = fromDock(d, 0, PIER.length + FERRY.gap - FERRY.ramp);
    const top = Math.max(deck, ground(foot.x, foot.z));
    return deck + ((top - deck) * out) / FERRY.ramp;
  }
  return ground(x, z);
}

/** A truck's pose standing at (x, z) facing `heading`, its base under its middle and its pitch from its axles. */
function stand(base: (x: number, z: number) => number, x: number, z: number, heading: number): TruckPose {
  const [fx, fz] = [Math.sin(heading) * 1.35, Math.cos(heading) * 1.35];
  const front = base(x + fx, z + fz);
  const back = base(x - fx, z - fz);
  return { x, z, heading, base: (front + back) / 2, pitch: Math.atan2(front - back, 2.7) };
}

/** The tied-up ferry as circles, so nothing drives into it from the causeway's end with its ramp up. */
export function ferryObstacles(d: Dock, water: number): Obstacle[] {
  const f = mooredPose(d, water);
  const out: Obstacle[] = [];
  for (let z = -FERRY.length / 2 + 3; z <= FERRY.length / 2 - 2; z += 3.5) {
    for (const x of [-3.5, 0, 3.5]) out.push({ ...onFerry(f, x, 0, z), r: 2.4, h: Infinity });
  }
  return out;
}

/** The moments of the way out, in seconds from boarding. */
export const SAIL = { rampDown: [0.3, 1.7], load: [1.2, 6.2], rampUp: [6.4, 7.6], castOff: 8, haze: [17, 19], end: 20 } as const;
/** And of the way in, from the moment the picture starts to come back. */
export const LAND = { haze: [0, 1.4], berth: 17, rampDown: [17.2, 18.6], unload: [18.7, 28.2], end: 29 } as const;

/** How far from its berth, out along the causeway's line, the ferry is `u` seconds after casting off. */
const awayAt = (u: number) => {
  // Easing off gently, then away at nine metres a second.
  const ramp = 8;
  const top = 9;
  return u <= ramp ? (0.5 * top * u * u) / ramp : 0.5 * top * ramp + top * (u - ramp);
};
/** And how far it still has to come, `t` seconds into the way in: at speed from out in the haze, then slowing to a stop. */
const toGoAt = (t: number) => {
  const slow = 9.5;
  const top = 7;
  const left = LAND.berth - t;
  if (left <= 0) return 0;
  return left <= slow ? (0.5 * top * left * left) / slow : 0.5 * top * slow + top * (left - slow);
};

/** The ferry somewhere out along its way, `along` metres past its berth: drifting a little to one side, rolling a little. */
function sailing(d: Dock, water: number, along: number, time: number): FerryPose {
  const moored = mooredPose(d, water);
  const drift = 0.0009 * along * along;
  const c = fromDock(d, drift, PIER.length + FERRY.gap + FERRY.length / 2 + along);
  const turn = Math.atan2(0.0018 * along, 1);
  const swell = Math.min(1, along / 40);
  return {
    x: c.x, y: water + Math.sin(time * 1.3) * 0.08 * swell, z: c.z,
    heading: moored.heading - turn, pitch: Math.sin(time * 0.9) * 0.012 * swell, roll: Math.sin(time * 0.7 + 1) * 0.02 * swell,
  };
}

/**
 * The way out, `t` seconds after boarding, the truck having stopped at `from`. The ferry
 * lies tied up on `water` until it casts off, then backs straight out and away.
 */
export function sailOut(d: Dock, from: { x: number; z: number; heading: number }, ground: (x: number, z: number) => number, water: number, t: number): FerryFrame {
  const cast = t - SAIL.castOff;
  const ferry = cast > 0 ? sailing(d, water, awayAt(cast), t) : mooredPose(d, water);
  const near = smooth(SAIL.rampDown[0], SAIL.rampDown[1], t) * (1 - smooth(SAIL.rampUp[0], SAIL.rampUp[1], t));
  const ramps: [number, number] = [near, 0];
  const base = (x: number, z: number) => ferryBase(d, ferry, ramps, ground, x, z);

  // The truck: from where it stopped, onto the causeway's middle and out along it, over the
  // ramp, and up the deck to the middle, facing the far end.
  const park = onFerry(ferry, 0, FERRY.deck, -2);
  let truck: TruckPose;
  if (t < SAIL.load[1]) {
    const u = smooth(SAIL.load[0], SAIL.load[1], t);
    const start = { x: from.x, z: from.z };
    const line = toDock(d, start.x, start.z);
    const onto = fromDock(d, 0, Math.min(line.z + 4, PIER.length - 4));
    // Two legs: onto the middle of the road, then straight out along it to the deck.
    const legA = Math.hypot(onto.x - start.x, onto.z - start.z);
    const legB = Math.hypot(park.x - onto.x, park.z - onto.z);
    const s = u * (legA + legB);
    const p = s < legA
      ? { x: start.x + ((onto.x - start.x) * s) / Math.max(legA, 1e-6), z: start.z + ((onto.z - start.z) * s) / Math.max(legA, 1e-6) }
      : { x: onto.x + ((park.x - onto.x) * (s - legA)) / Math.max(legB, 1e-6), z: onto.z + ((park.z - onto.z) * (s - legA)) / Math.max(legB, 1e-6) };
    const heading = turnToward(from.heading, d.heading, smooth(0, 0.25, u));
    truck = stand(base, p.x, p.z, heading);
  } else {
    truck = { x: park.x, z: park.z, heading: ferry.heading + Math.PI, base: ferry.y + FERRY.deck, pitch: -ferry.pitch };
  }

  let camera: FerryFrame["camera"];
  if (t < SAIL.castOff + 2) {
    // On the stones beside the causeway's end, watching the truck go aboard and the ramp come up.
    const from_ = fromDock(d, -16, PIER.length - 22);
    camera = {
      from: { x: from_.x, y: d.y + 4.5, z: from_.z },
      to: { ...onFerry(mooredPose(d, water), 0, 2.5, 4) },
      shot: 0, ease: 2.2, wide: true,
    };
  } else {
    // Up on the lamp's gantry at the end of the causeway, high enough to see the truck on the
    // deck over the raised ramp, as the ferry pulls away into the haze.
    const from_ = fromDock(d, 6, PIER.length - 4);
    camera = { from: { x: from_.x, y: d.y + 9, z: from_.z }, to: onFerry(ferry, 0, 1.5, 0), shot: 1, ease: 0, wide: true };
  }
  camera.from = clear(camera.from, ground);
  return { ferry, ramps, truck: t >= SAIL.end ? null : truck, camera, haze: smooth(SAIL.haze[0], SAIL.haze[1], t) };
}

/**
 * The way in to a dock, `t` seconds after the picture starts to come back: the ferry comes
 * in out of the haze along the causeway's line, ties up, puts its ramp down, and the truck
 * drives off it and back along the causeway to where it's left.
 */
export function sailIn(d: Dock, ground: (x: number, z: number) => number, water: number, t: number): FerryFrame {
  const toGo = toGoAt(t);
  const ferry = toGo > 0 ? sailing(d, water, toGo, t) : mooredPose(d, water);
  const near = smooth(LAND.rampDown[0], LAND.rampDown[1], t);
  const ramps: [number, number] = [near, 0];
  const base = (x: number, z: number) => ferryBase(d, ferry, ramps, ground, x, z);
  const park = onFerry(ferry, 0, FERRY.deck, 2);
  const leave = dockLeave(d);

  let truck: TruckPose;
  if (t < LAND.unload[0]) truck = { x: park.x, z: park.z, heading: ferry.heading, base: ferry.y + FERRY.deck, pitch: ferry.pitch };
  else {
    // Off over the ramp and straight back along the causeway to its root.
    const u = smooth(LAND.unload[0], LAND.unload[1], t);
    const p = { x: park.x + (leave.x - park.x) * u, z: park.z + (leave.z - park.z) * u };
    truck = stand(base, p.x, p.z, ferry.heading);
  }

  let camera: FerryFrame["camera"];
  if (t < 9) {
    // Low on the causeway's end, looking out to the ferry coming in out of the haze.
    const from_ = fromDock(d, -5, PIER.length - 3);
    camera = { from: { x: from_.x, y: d.y + 2.6, z: from_.z }, to: onFerry(ferry, 0, 3, 0), shot: 10, ease: 0, wide: true };
  } else if (t < LAND.rampDown[1]) {
    // On the shore beside the causeway, as it comes alongside the end and ties up.
    const from_ = fromDock(d, 26, 12);
    camera = { from: { x: from_.x, y: d.y + 6, z: from_.z }, to: onFerry(ferry, 0, 2, 8), shot: 11, ease: 0, wide: true };
  } else {
    // Beside the causeway, following the truck back along it.
    const from_ = fromDock(d, 18, PIER.length * 0.45);
    camera = { from: { x: from_.x, y: d.y + 5, z: from_.z }, to: { x: truck.x, y: truck.base + 1.2, z: truck.z }, shot: 12, ease: 2.6, wide: true };
  }
  camera.from = clear(camera.from, ground);
  return { ferry, ramps, truck, camera, haze: 1 - smooth(LAND.haze[0], LAND.haze[1], t) };
}

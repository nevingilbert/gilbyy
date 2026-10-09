import { RUNWAY, fromField, toField, type Airport } from "./airport";
import type { Obstacle } from "./world";

/**
 * The flight between two worlds, as a film: the truck drives up the ramp, the plane takes
 * off into cloud, and on the other side it comes down out of cloud, lands, and the truck
 * drives out. Nothing here is flown; every frame is a pure function of the airstrip and
 * the time, so the picture is the same on every screen and can be tested without one.
 * See docs/decisions/0014-airports-and-the-island.md.
 *
 * The plane's own measurements are here too, because the film and the model
 * (plane-model.ts) have to agree on where the ramp is. Plane space: the origin is on the
 * ground under the middle of the fuselage, +z is the nose, +x the left wing.
 */
export const PLANE = {
  length: 27,
  span: 27,
  /** The fuselage's radius, and its centre's height when the plane stands on its wheels. */
  radius: 2.55,
  centre: 3,
  /** The hold: its floor's height, half its width, and its ends (the ramp's hinge, and the bulkhead). */
  floor: 1.35,
  holdHalf: 1.75,
  hinge: -5.5,
  bulkhead: 5.2,
  /** The ramp's length. Shut, it is the underside of the tail; down, its foot is on the ground behind it. */
  ramp: 7.4,
  /** Where a truck sits in the hold. */
  park: -0.3,
  /** Where the plane stands: this far down the runway from the threshold. */
  stand: 15,
} as const;

/** How far behind the hinge the lowered ramp's foot is, and where that puts it. */
const RAMP_RUN = Math.sqrt(PLANE.ramp ** 2 - PLANE.floor ** 2);
export const RAMP_FOOT = PLANE.hinge - RAMP_RUN;
/** How far the shut ramp tilts up from the hold's floor, and how far down from it when lowered. Radians. */
export const RAMP_SHUT = 0.33;
export const RAMP_DOWN = Math.asin(PLANE.floor / PLANE.ramp);

/** Field z of where a truck waits to board, and of where it's left after a flight, further out on the apron. */
export const BOARD_Z = PLANE.stand + RAMP_FOOT - 9;
const LEAVE_Z = BOARD_Z - 9;
/** How near the waiting spot a truck has to be for the plane to be on offer. */
export const BOARD_REACH = 8;

export type Vec = { x: number; y: number; z: number };
export type PlanePose = Vec & { heading: number; pitch: number };
/** One moment of the film. */
export type Frame = {
  plane: PlanePose;
  /** The ramp: 0 shut, 1 down. */
  ramp: number;
  /** The wheels: 1 down, 0 folded away. */
  gear: number;
  /** Where the truck is, or null while it's shut in the hold. */
  truck: { x: number; z: number; heading: number } | null;
  /**
   * Where the camera is and what it looks at. A new `shot` is a cut; within one, `ease` is
   * how fast it settles (0 is at once). `wide` shots have open ground or open air behind
   * the camera, so on a tall, narrow screen it can stand further back to fit the plane in.
   */
  camera: { from: Vec; to: Vec; shot: number; ease: number; wide: boolean };
  /** How much of the picture is lost in cloud, 0–1. */
  cloud: number;
  /** True while the plane is up among the clouds, for the scene to draw some. */
  cruising: boolean;
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/** A point in field space, `up` metres above the field, as a world position. */
const at = (a: Airport, lx: number, up: number, lz: number): Vec => {
  const p = fromField(a, lx, lz);
  return { x: p.x, y: a.y + up, z: p.z };
};

/** The plane on its stand: on the threshold, nose down the runway. */
export const standPose = (a: Airport): PlanePose => ({ ...at(a, 0, 0, PLANE.stand), heading: a.heading, pitch: 0 });

/** Where a truck waits to board: on the apron behind the tail, facing the ramp. */
export function boardSpot(a: Airport) {
  return { ...fromField(a, 0, BOARD_Z), heading: a.heading };
}

/** Where a truck is left after a flight: further out on the apron, facing away from the plane. */
export function leaveSpot(a: Airport) {
  return { ...fromField(a, 0, LEAVE_Z), heading: a.heading + Math.PI };
}

/**
 * How far above the field a wheel stands at a point by the parked plane with its ramp
 * down: on the ramp, on the hold's floor, or 0 on the apron.
 */
export function deckAt(a: Airport, x: number, z: number) {
  const p = toField(a, x, z);
  const lz = p.z - PLANE.stand;
  if (Math.abs(p.x) > PLANE.holdHalf || lz > PLANE.bulkhead || lz <= RAMP_FOOT) return 0;
  return lz >= PLANE.hinge ? PLANE.floor : (PLANE.floor * (lz - RAMP_FOOT)) / RAMP_RUN;
}

/**
 * A truck's height and pitch at a spot by the parked plane, standing on whatever its
 * axles are over: the apron, the ramp or the hold's floor.
 */
export function rideOnDeck(a: Airport, t: { x: number; z: number; heading: number }, wheelbase: number, ride: number) {
  const fx = (Math.sin(t.heading) * wheelbase) / 2;
  const fz = (Math.cos(t.heading) * wheelbase) / 2;
  const front = deckAt(a, t.x + fx, t.z + fz);
  const rear = deckAt(a, t.x - fx, t.z - fz);
  return { y: a.y + (front + rear) / 2 + ride, pitch: Math.atan2(front - rear, wheelbase) };
}

/**
 * The parked plane as circles: the fuselage, the low wings, and the shut ramp back to
 * where it is too low to drive under. The apron behind the tail is left open.
 */
export function planeObstacles(a: Airport): Obstacle[] {
  const out: Obstacle[] = [];
  const add = (lx: number, lz: number, r: number) => out.push({ ...fromField(a, lx, PLANE.stand + lz), r, h: Infinity });
  for (let z = -9.5; z <= 11.5; z += 3) add(0, z, 2.3);
  for (const s of [1, -1]) for (let i = 1; i <= 5; i++) add(s * (1.6 + i * 2.3), 1.2 - i * 1.25, 1.7);
  return out;
}

/** The moments of the way out, in seconds from boarding. */
export const DEPART = {
  rampDown: [0.3, 1.9],
  load: [1.2, 5.2],
  rampUp: [5.3, 6.7],
  /** The brakes come off. */
  roll: 7,
  /** The camera leaves the runway's edge for the middle of it, to watch the climb. */
  behind: 10.25,
  cloud: [15.4, 16.8],
  end: 16.8,
} as const;

/** How hard it accelerates down the runway, the speed it leaves the ground at, and how fast it then climbs. m/s. */
const PUSH = 8;
const LIFT_SPEED = 46;
const CLIMB = 12;
const LIFT_AFTER = LIFT_SPEED / PUSH;
/** The climb comes on over about this long, rather than all at once. */
const EASE_UP = 1.2;

/** The plane `since` seconds after its brakes come off: how far down the runway, how high, and its pitch. */
function takeoff(since: number) {
  const s = Math.max(0, since);
  const pitch = 0.21 * smooth(LIFT_AFTER - 0.9, LIFT_AFTER + 0.5, s);
  const up = s - LIFT_AFTER;
  if (up <= 0) return { run: (PUSH * s * s) / 2, up: 0, pitch };
  // Airborne, and still gathering speed.
  return {
    run: (PUSH * LIFT_AFTER * LIFT_AFTER) / 2 + LIFT_SPEED * up + 2.5 * up * up,
    up: CLIMB * (up - EASE_UP * (1 - Math.exp(-up / EASE_UP))),
    pitch: pitch + 0.04 * smooth(0, 1.5, up),
  };
}

/**
 * The way out: the ramp comes down, the truck drives from wherever it stopped (`from`)
 * up into the hold, the ramp shuts, and the plane takes off into cloud.
 */
export function departure(a: Airport, from: { x: number; z: number; heading: number }, t: number): Frame {
  const fly = takeoff(t - DEPART.roll);
  const plane: PlanePose = { ...at(a, 0, fly.up, PLANE.stand + fly.run), heading: a.heading, pitch: fly.pitch };
  const ramp = smooth(DEPART.rampDown[0], DEPART.rampDown[1], t) * (1 - smooth(DEPART.rampUp[0], DEPART.rampUp[1], t));

  // The truck: a curve from where it stopped, through the waiting spot, to its place in the hold.
  let truck: Frame["truck"] = null;
  if (t < DEPART.rampUp[1]) {
    const u = smooth(DEPART.load[0], DEPART.load[1], t);
    const wait = fromField(a, 0, BOARD_Z);
    const park = fromField(a, 0, PLANE.stand + PLANE.park);
    truck = {
      x: (1 - u) ** 2 * from.x + 2 * u * (1 - u) * wait.x + u * u * park.x,
      z: (1 - u) ** 2 * from.z + 2 * u * (1 - u) * wait.z + u * u * park.z,
      heading: turnToward(from.heading, a.heading, Math.min(1, u * 2.4)),
    };
  }

  const eye = { ...plane, y: plane.y + 3 };
  const camera: Frame["camera"] =
    t < DEPART.roll - 0.1 ? { from: at(a, 9, 3.8, -24), to: at(a, 0, 2.3, 0), shot: 0, ease: 2.2, wide: true }
    // Low at the runway's edge as it comes past.
    : t < DEPART.behind ? { from: at(a, 17, 1.6, 62), to: eye, shot: 1, ease: 0, wide: false }
    // Then from where it stood, watching it go.
    : { from: at(a, -4, 4.5, 30), to: eye, shot: 2, ease: 0, wide: false };

  return { plane, ramp, gear: 1 - smooth(LIFT_AFTER + 0.6, LIFT_AFTER + 2.4, t - DEPART.roll), truck, camera, cloud: smooth(DEPART.cloud[0], DEPART.cloud[1], t), cruising: false };
}

/** The moments of the way in, in seconds from coming out of the cloud. */
export const ARRIVE = {
  clear: [0, 1.4],
  /** Down from the clouds onto the way in. */
  final: 4.4,
  touchdown: 10.6,
  /** A cut, and the plane is on its stand. */
  parked: 14.5,
  rampDown: [14.8, 16.4],
  unload: [15.8, 19.4],
  end: 19.6,
} as const;

/** How fast it comes in, how steeply, how far out it rounds off, where on the runway it touches, and how hard it brakes. */
const APPROACH_SPEED = 58;
const GLIDE = 0.12;
const FLARE = 70;
const TOUCH_Z = RUNWAY.length - 45;
const BRAKE = 14;
/** How high it cruises, how fast, and how far out. */
const CRUISE = { up: 700, speed: 75, out: 2600 } as const;

/**
 * The way in: the plane level among the clouds, then down the way in over the runway's
 * far end, touching down and rolling out toward its stand. Then a cut: it's on the stand,
 * the ramp comes down and the truck drives out onto the apron.
 */
export function arrival(a: Airport, t: number): Frame {
  const back = a.heading + Math.PI;
  const cloud = 1 - smooth(ARRIVE.clear[0], ARRIVE.clear[1], t);

  if (t < ARRIVE.final) {
    const lz = RUNWAY.length + CRUISE.out - CRUISE.speed * t;
    const plane: PlanePose = { ...at(a, 0, CRUISE.up, lz), heading: back, pitch: 0.02 };
    // Off its left shoulder, a little ahead and above, drifting forward. It flies toward −z here, so ahead is less z.
    return {
      plane, ramp: 0, gear: 0, truck: null, cloud, cruising: true,
      camera: { from: at(a, -24, CRUISE.up + 5.5, lz - 12 - t * 2.5), to: { ...plane, y: plane.y + 1.5 }, shot: 10, ease: 0, wide: true },
    };
  }

  if (t < ARRIVE.parked) {
    const since = t - ARRIVE.touchdown;
    let lz: number;
    let up: number;
    let pitch: number;
    if (since < 0) {
      const d = -since * APPROACH_SPEED;
      lz = TOUCH_Z + d;
      up = d >= FLARE ? GLIDE * (d - FLARE / 2) : (GLIDE * d * d) / (2 * FLARE);
      pitch = -0.04 + 0.11 * (1 - smooth(0, FLARE * 1.5, d));
    } else {
      const s = Math.min(since, APPROACH_SPEED / BRAKE);
      lz = TOUCH_Z - (APPROACH_SPEED * s - (BRAKE * s * s) / 2);
      up = 0;
      pitch = 0.07 * (1 - smooth(0, 0.9, since));
    }
    const plane: PlanePose = { ...at(a, 0, up, lz), heading: back, pitch };
    // Behind and above, looking past it at the runway: this is the first sight of the place.
    return {
      plane, ramp: 0, gear: smooth(ARRIVE.final - 0.5, ARRIVE.final + 1.2, t), truck: null, cloud, cruising: false,
      camera: { from: at(a, 6, up + 9, lz + 36), to: at(a, 0, up * 0.6 + 2, lz - 26), shot: 11, ease: 0, wide: true },
    };
  }

  // On the stand, turned round: the taxi back happens in the cut.
  const u = smooth(ARRIVE.unload[0], ARRIVE.unload[1], t);
  const park = fromField(a, 0, PLANE.stand + PLANE.park);
  const leave = fromField(a, 0, LEAVE_Z);
  return {
    plane: standPose(a), ramp: smooth(ARRIVE.rampDown[0], ARRIVE.rampDown[1], t), gear: 1, cloud: 0, cruising: false,
    truck: { x: park.x + (leave.x - park.x) * u, z: park.z + (leave.z - park.z) * u, heading: back },
    camera: { from: at(a, 10, 4, -30), to: at(a, 0, 2, -4), shot: 12, ease: 0, wide: true },
  };
}

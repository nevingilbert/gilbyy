import type { Obstacle } from "./world";

/**
 * The helicopter between Las Vegas and Japan (ADR 0024): a heavy-lift crane helicopter that
 * carries the truck slung under it on a cable. A pad is where the truck waits and is set
 * down, a painted circle on level ground; the helicopter stands on its own spot beside it.
 * The trip is a film, like the flight, the train's and the ferry's: every frame a pure
 * function of the pad, the ground and the time.
 *
 * Pad space: the origin in the middle of the circle, +z the way the helicopter leaves and
 * comes in along, +x to the left of that. Pure, no three.js.
 */
export type Pad = { x: number; z: number; y: number; heading: number };

/** The pad's circle, how far to its left the helicopter stands, and how far round both is levelled. */
export const PAD = { radius: 14, stand: 34, flat: 46 } as const;
/** How near the middle of the pad a truck has to be for the helicopter to be on offer. */
export const PAD_REACH = 8;

/**
 * The helicopter's measurements: its length, its main rotor's radius, the height of its
 * belly over the ground when it stands on its wheels, and how far under the belly the
 * cable's hook hangs with the cable wound in.
 */
export const HELI = { length: 21, rotor: 11, belly: 2.6, hook: 1.2 } as const;
/**
 * How far below the hook a truck's wheels hang, clear over the tallest roof for the slings
 * to come down to its corners; and the cable's length while carrying it.
 */
export const SLUNG = 4.6;
const CARRY = 11;

/** A point in pad space as a world (x, z). */
export function fromPad(p: Pad, lx: number, lz: number) {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  return { x: p.x + fx * lz + fz * lx, z: p.z + fz * lz - fx * lx };
}

/** A world (x, z) in pad space. */
export function toPad(p: Pad, x: number, z: number) {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const [dx, dz] = [x - p.x, z - p.z];
  return { x: dx * fz - dz * fx, z: dx * fx + dz * fz };
}

/** Where a truck waits to be lifted: the middle of the pad, facing out along it. */
export const padBoard = (p: Pad) => ({ x: p.x, z: p.z, heading: p.heading });

/** Where a truck is set down: on the pad, but far enough forward that the helicopter isn't offered again straight away. */
export const padLeave = (p: Pad) => ({ ...fromPad(p, 0, PAD_REACH + 3), heading: p.heading });

/** Where the helicopter stands when it's not flying, beside the pad, facing the same way. */
export const standAt = (p: Pad) => ({ ...fromPad(p, PAD.stand, 0), heading: p.heading });

/** The parked helicopter as circles: its cabin, its tail boom and its wheels. */
export function heliObstacles(p: Pad): Obstacle[] {
  const s = standAt(p);
  const out: Obstacle[] = [];
  for (const lz of [6, 2, -2, -6, -10, -14]) {
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    out.push({ x: s.x + fx * lz, z: s.z + fz * lz, r: lz > -4 ? 2.2 : 1.2, h: Infinity });
  }
  return out;
}

export type Vec = { x: number; y: number; z: number };
/** Where the helicopter is: `y` is its belly's height. */
export type HeliPose = Vec & { heading: number; pitch: number; roll: number };
export type TruckPose = { x: number; z: number; heading: number; base: number; pitch: number; roll: number; hung: boolean };
export type HeliFrame = {
  heli: HeliPose;
  /** How fast the rotors turn, 0 stopped to 1 flying. */
  rotor: number;
  /** How far below the hook's rest the hook is: the cable paid out. */
  cable: number;
  truck: TruckPose | null;
  /** Whether the slings are on the truck: from the hook coming down onto it until it's let go. */
  slung: boolean;
  camera: { from: Vec; to: Vec; shot: number; ease: number; wide: boolean };
  /** How much of the picture is lost in the haze, 0–1. */
  haze: number;
};

/** The moments of the way out, in seconds from the truck stopping on the pad. */
export const LIFT = { spin: [0, 3], rise: [2.6, 5.4], over: [5.4, 9], lower: [9, 11], hook: 11.2, climb: [11.5, 15], away: 15, haze: [23, 25.5], end: 26 } as const;
/** And of the way in, from the moment the picture starts to come back. */
export const SET = { haze: [0, 1.5], arrive: 14, down: [14, 18], release: 18.6, winch: [18.6, 20.4], stand: [20.6, 25], spin: [24.5, 28], end: 28 } as const;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** From heading a toward heading b, the short way round. */
const turn = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
/** A camera position kept a little clear of the ground under it. */
const clear = (p: Vec, ground: (x: number, z: number) => number): Vec => ({ ...p, y: Math.max(p.y, ground(p.x, p.z) + 1.8) });

/** The hook's point, `cable` metres paid out, under a helicopter at `h`. */
export function hookOf(h: HeliPose, cable: number): Vec {
  return { x: h.x, y: h.y - HELI.hook - cable, z: h.z };
}

/** A truck hanging from the hook: its middle under it, swinging a little as it goes. */
function hanging(hook: Vec, heading: number, time: number, swing: number): TruckPose {
  const sway = Math.sin(time * 1.9) * swing;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return {
    x: hook.x - fx * sway * 1.2, z: hook.z - fz * sway * 1.2, heading: heading + Math.sin(time * 0.7) * swing * 0.4,
    base: hook.y - SLUNG, pitch: sway * 0.15, roll: Math.sin(time * 1.3 + 1) * swing * 0.08, hung: true,
  };
}

/**
 * The way out, `t` seconds after the truck stopped at `from` on the pad: the helicopter
 * spins up on its stand, lifts and slides across over the truck, lets its hook down, takes
 * the truck up on the cable, and flies away along the pad's heading, climbing into the haze.
 */
export function liftOff(p: Pad, from: { x: number; z: number; heading: number }, ground: (x: number, z: number) => number, t: number): HeliFrame {
  const stand = standAt(p);
  const standY = ground(stand.x, stand.z) + HELI.belly;
  const truckY = ground(from.x, from.z);
  const hover = truckY + 20;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  let heli: HeliPose;
  let cable = 0;
  if (t < LIFT.over[0]) {
    // Up off its wheels, straight up.
    heli = { ...stand, y: mix(standY, hover, smooth(LIFT.rise[0], LIFT.rise[1], t)), pitch: 0, roll: 0 };
  } else if (t < LIFT.climb[0]) {
    // Sideways across to over the truck, leaning into it a little, and the hook let down.
    const u = smooth(LIFT.over[0], LIFT.over[1], t);
    heli = { x: mix(stand.x, from.x, u), z: mix(stand.z, from.z, u), y: hover, heading: p.heading, pitch: 0, roll: Math.sin(u * Math.PI) * 0.08 };
    cable = (hover - HELI.hook - truckY - SLUNG) * smooth(LIFT.lower[0], LIFT.lower[1], t);
  } else if (t < LIFT.away) {
    // Up, the cable winding in to its carrying length, the truck coming off the ground.
    const u = smooth(LIFT.climb[0], LIFT.climb[1], t);
    const y = mix(hover, truckY + 34, u);
    heli = { x: from.x, z: from.z, y, heading: p.heading, pitch: 0, roll: 0 };
    const down = hover - HELI.hook - truckY - SLUNG;
    cable = mix(down, CARRY, u);
  } else {
    // Away along the pad's heading, nose down, gathering speed and height.
    const u = t - LIFT.away;
    const along = 0.5 * 3.2 * u * u;
    const y = truckY + 34 + 9 * u;
    heli = { x: from.x + fx * along, z: from.z + fz * along, y, heading: p.heading, pitch: -Math.min(0.18, u * 0.05), roll: 0 };
    cable = CARRY;
  }
  const rotor = smooth(LIFT.spin[0], LIFT.spin[1], t);

  // The truck: on the pad until the cable takes it, then hanging, swinging a little.
  const hook = hookOf(heli, cable);
  let truck: TruckPose;
  const resting = { x: from.x, z: from.z, heading: from.heading, base: truckY, pitch: 0, roll: 0, hung: false };
  if (t < LIFT.climb[0]) truck = resting;
  else {
    const hangsAt = hook.y - SLUNG;
    truck = hangsAt <= truckY ? resting : hanging(hook, turn(from.heading, p.heading, smooth(LIFT.climb[0], LIFT.away + 3, t)), t, smooth(LIFT.climb[1], LIFT.away + 2, t) * 0.6);
  }

  let camera: HeliFrame["camera"];
  if (t < LIFT.climb[0]) {
    // On the far side of the pad, low, watching it come over and the hook come down.
    const c = fromPad(p, -24, -18);
    camera = { from: { x: c.x, y: truckY + 3, z: c.z }, to: { x: mix(stand.x, from.x, smooth(0, LIFT.over[1], t)), y: mix(standY, truckY + 6, smooth(0, LIFT.over[1], t)), z: mix(stand.z, from.z, smooth(0, LIFT.over[1], t)) }, shot: 0, ease: 2, wide: true };
  } else if (t < LIFT.away) {
    // Beside the truck, wherever on the pad it stopped, looking up the cable as it comes off the ground.
    const at = toPad(p, from.x, from.z);
    const c = fromPad(p, at.x - 10, at.z + 6);
    camera = { from: { x: c.x, y: truckY + 2.2, z: c.z }, to: { x: truck.x, y: truck.base + 4, z: truck.z }, shot: 1, ease: 3, wide: true };
  } else {
    // From well back behind the pad, watching it climb away over the land, the truck under it.
    const c = fromPad(p, -30, -60);
    camera = { from: { x: c.x, y: truckY + 12, z: c.z }, to: { x: heli.x, y: heli.y - 6, z: heli.z }, shot: 2, ease: 0, wide: true };
  }
  camera.from = clear(camera.from, ground);
  return { heli, rotor, cable, truck: t >= LIFT.end ? null : truck, slung: t >= LIFT.hook, camera, haze: smooth(LIFT.haze[0], LIFT.haze[1], t) };
}

/**
 * The way in to a pad, `t` seconds after the picture starts to come back: the helicopter
 * comes in out of the haze along the pad's heading with the truck slung under it, slows to
 * a hover, lets it down onto the pad (at `padLeave`), lets go, winds its hook in and goes to
 * land on its stand.
 */
export function setDown(p: Pad, ground: (x: number, z: number) => number, t: number): HeliFrame {
  const stand = standAt(p);
  const standY = ground(stand.x, stand.z) + HELI.belly;
  const drop = padLeave(p);
  const padY = ground(drop.x, drop.z);
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  // The helicopter's height over the pad when the truck just touches it.
  const touch = padY + SLUNG + CARRY + HELI.hook;
  let heli: HeliPose;
  let cable = CARRY;
  if (t < SET.arrive) {
    // In from behind, slowing and coming down as it comes.
    const left = SET.arrive - t;
    const behind = 0.5 * 2.6 * left * left;
    heli = { x: drop.x - fx * behind, z: drop.z - fz * behind, y: touch + 4 + left * 6, heading: p.heading, pitch: Math.min(0.15, left * 0.03), roll: 0 };
  } else if (t < SET.release) {
    // Down over the pad until the truck's wheels are on it.
    heli = { x: drop.x, z: drop.z, y: mix(touch + 4, touch - 0.2, smooth(SET.down[0], SET.down[1], t)), heading: p.heading, pitch: 0, roll: 0 };
  } else if (t < SET.stand[0]) {
    // Let go: the hook wound in, up a little off the truck.
    const u = smooth(SET.winch[0], SET.winch[1], t);
    heli = { x: drop.x, z: drop.z, y: touch - 0.2 + u * 6, heading: p.heading, pitch: 0, roll: 0 };
    cable = mix(CARRY, 0, u);
  } else {
    // Across to its stand and down onto its wheels.
    const u = smooth(SET.stand[0], SET.stand[1], t);
    const y = mix(touch + 5.8, standY, smooth(SET.stand[0] + 1.5, SET.stand[1], t));
    heli = { x: mix(drop.x, stand.x, u), z: mix(drop.z, stand.z, u), y, heading: p.heading, pitch: 0, roll: -Math.sin(u * Math.PI) * 0.08 };
    cable = 0;
  }
  const rotor = 1 - smooth(SET.spin[0], SET.spin[1], t);
  const hook = hookOf(heli, cable);
  const onPad = { x: drop.x, z: drop.z, heading: p.heading, base: padY, pitch: 0, roll: 0, hung: false };
  const truck: TruckPose = t >= SET.release || hook.y - SLUNG <= padY ? onPad : hanging(hook, p.heading, t, (1 - smooth(SET.arrive - 2, SET.down[1], t)) * 0.6);

  let camera: HeliFrame["camera"];
  if (t < 9) {
    // Out ahead of the pad, looking back the way it comes, the land behind it.
    const c = fromPad(p, 30, 45);
    camera = { from: { x: c.x, y: padY + 10, z: c.z }, to: { x: heli.x, y: heli.y - 6, z: heli.z }, shot: 10, ease: 0, wide: true };
  } else if (t < SET.release + 1) {
    // Close beside the pad as the truck comes down onto it.
    const c = fromPad(p, -18, 12);
    camera = { from: { x: c.x, y: padY + 4, z: c.z }, to: { x: truck.x, y: truck.base + 3, z: truck.z }, shot: 11, ease: 2.5, wide: true };
  } else {
    // Back from the pad, the truck on it and the helicopter going to its stand.
    const c = fromPad(p, -26, -20);
    const mid = fromPad(p, PAD.stand * 0.4, 5);
    camera = { from: { x: c.x, y: padY + 7, z: c.z }, to: { x: mid.x, y: padY + 3, z: mid.z }, shot: 12, ease: 1.5, wide: true };
  }
  camera.from = clear(camera.from, ground);
  return { heli, rotor, cable, truck, slung: t < SET.release, camera, haze: 1 - smooth(SET.haze[0], SET.haze[1], t) };
}

/** The helicopter standing on its stand, rotors still. */
export function parked(p: Pad, ground: (x: number, z: number) => number): HeliPose {
  const s = standAt(p);
  return { x: s.x, y: ground(s.x, s.z) + HELI.belly, z: s.z, heading: s.heading, pitch: 0, roll: 0 };
}

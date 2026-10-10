import { wheelGround, type Car } from "./physics";
import { STOCK_LOADOUT, specFor, type Loadout } from "./shop";
import type { VehicleId } from "./vehicles";
import type { Ground } from "./world";

/**
 * BBB, the tow truck a stuck driver can ring (ADR 0021). It costs miles, and it comes
 * whoever else is or isn't about: out of the nearest garage, across country as nothing
 * more than a distance closing, then into sight for the last stretch, where it pulls up,
 * winches the truck off its rock and backs away again.
 *
 * Pure. The truck isn't driven by the physics, only placed: where it is at each moment
 * is a function of where it started and how long ago. That is what lets every player
 * near a rescue draw the same one from a single message.
 */

/** Miles a call costs. Must match `call_tow()` in the migrations (stuck.test.ts checks). */
export const TOW_FEE = 5;

/** What BBB drives: the little pickup in white, with a winch on the front. */
export const TOW_RIG: VehicleId = "mule";
export const TOW_LOADOUT: Loadout = { ...STOCK_LOADOUT, paint: "pearlWhite", tyres: "allTerrain", lights: "halogen", winch: "winch" };
export const TOW_SPEC = specFor(TOW_RIG, TOW_LOADOUT);

/** How fast the distance closes while it's on its way, m/s, and the least and most that wait can be, seconds. */
export const TOW_SPEED = 22;
export const TOW_WAIT = { min: 8, max: 75 } as const;
/** How near the stuck truck it pulls up, and the longest run-in it's seen driving, metres. */
export const TOW_STOP = 11;
export const TOW_RUN = 60;
/** The speed it comes into sight at, m/s. It brakes evenly from there to a stop. */
export const TOW_APPROACH = 14;
/** Seconds of film as it leaves the garage, and seconds it takes to back away and be gone afterwards. */
export const TOW_LEAVE = 4.4;
export const TOW_GONE = 5;

type Spot = { x: number; z: number };
const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** Seconds from leaving a garage `distance` metres off to pulling up. */
export const towWait = (distance: number) => Math.max(TOW_WAIT.min, Math.min(TOW_WAIT.max, distance / TOW_SPEED));

/**
 * The last stretch: (x, z) is where it pulls up, facing `heading` toward the stuck truck,
 * having come into sight `length` metres back along that line.
 */
export type TowLine = { x: number; z: number; heading: number; length: number };

/**
 * Metres still to come `t` seconds after it left the garage: from the whole distance
 * down to where it comes into sight, which is when the waiting is over.
 */
export function towAway(distance: number, line: TowLine, t: number) {
  const sight = line.length + TOW_STOP;
  const from = Math.max(distance, sight);
  return from - (from - sight) * Math.max(0, Math.min(1, t / towWait(distance)));
}

/** Whether a truck could be driven straight down a line: dry, not too steep, in bounds, and nothing standing in it. */
function clear(ground: Ground, line: TowLine) {
  const [dx, dz] = [Math.sin(line.heading), Math.cos(line.heading)];
  let before = NaN;
  for (let back = line.length; back > -1.5; back -= 1.5) {
    const d = Math.max(0, back);
    const [x, z] = [line.x - dx * d, line.z - dz * d];
    const y = ground.height(x, z);
    if (Math.hypot(x, z) > ground.limit - 2 || ground.waterAt(x, z) - y > 0.3) return false;
    if (Math.abs(y - before) > 0.9) return false;
    before = y;
    for (const o of ground.obstaclesNear(x, z)) {
      // Rocks its tyres clear it rolls over, as any truck would.
      if (o.h > TOW_SPEC.clearance && Math.hypot(o.x - x, o.z - z) < o.r + TOW_SPEC.radius + 0.3) return false;
    }
  }
  return true;
}

/**
 * Picks the way in to a truck stuck at `at`, for a tow truck coming from `from`: the
 * longest clear run that ends `TOW_STOP` short of it, from as near the garage's side as
 * there is one. Hemmed in on every side, it turns up where it would pull up, with no run.
 */
export function approachLine(ground: Ground, at: Spot, from: Spot): TowLine {
  const bearing = Math.atan2(from.x - at.x, from.z - at.z);
  const far = Math.max(0, Math.hypot(from.x - at.x, from.z - at.z) - TOW_STOP - 4);
  // The way it would come first, then further and further round to either side.
  const turns = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8].map((k) => (k * Math.PI) / 8);
  const along = (turn: number, length: number): TowLine => {
    const a = bearing + turn;
    return { x: at.x + Math.sin(a) * TOW_STOP, z: at.z + Math.cos(a) * TOW_STOP, heading: a + Math.PI, length };
  };
  for (const run of [TOW_RUN, 36, 20, 8, 0]) {
    for (const turn of turns) {
      const line = along(turn, Math.min(run, far));
      if (clear(ground, line)) return line;
    }
  }
  return along(0, 0);
}

/** Seconds its run-in takes, and how far along it is `t` seconds after coming into sight: in at speed, braking evenly to a stop. */
export const towDriveTime = (length: number) => (2 * length) / TOW_APPROACH;
export function towDrive(length: number, t: number) {
  const whole = towDriveTime(length);
  const left = 1 - Math.max(0, Math.min(1, whole ? t / whole : 1));
  return length * (1 - left * left);
}

/** Metres it has backed away `t` seconds after letting go: gently off, then at a steady crawl. */
export function towBack(t: number) {
  const [a, v] = [2.4, 7];
  const ta = v / a;
  return t <= ta ? 0.5 * a * t * t : 0.5 * a * ta * ta + v * (t - ta);
}

/** Stands the tow truck on the ground at a spot: its height and tilt are whatever its four wheels find there. */
export function standTow(car: Car, ground: Ground, x: number, z: number, heading: number, speed: number) {
  Object.assign(car, { x, z, heading, speed, side: 0, steer: 0, vy: 0, pitchV: 0, rollV: 0, grounded: true, stuck: null });
  const [fl, fr, rl, rr] = wheelGround(car, ground, TOW_SPEC);
  car.groundY = (fl + fr + rl + rr) / 4;
  car.y = car.groundY + TOW_SPEC.ride;
  car.pitch = Math.atan2((fl + fr - rl - rr) / 2, TOW_SPEC.wheelbase);
  car.roll = Math.atan2((fl + rl - fr - rr) / 2, TOW_SPEC.track);
  return car;
}

/** Stands it `s` metres along its run-in (`line.length` is pulled up; less than 0 is backed away past where it came into sight). */
export function towOnLine(car: Car, ground: Ground, line: TowLine, s: number, speed: number) {
  const back = line.length - s;
  return standTow(car, ground, line.x - Math.sin(line.heading) * back, line.z - Math.cos(line.heading) * back, line.heading, speed);
}

/** A tow truck on site: `t` seconds since it came into sight, and `gone` seconds since it let go, or -1 while it's still wanted. */
export type TowVisit = { line: TowLine; car: Car; t: number; gone: number };

/**
 * Runs a visit on by `dt`: in along its line, standing by while the truck is `stuck`,
 * then backing away. Returns how solid to draw it (it fades in and out at the far end),
 * or 0 once it has gone.
 */
export function towVisit(v: TowVisit, ground: Ground, dt: number, stuck: boolean) {
  v.t += dt;
  if (v.gone >= 0) v.gone += dt;
  // It doesn't leave before it has arrived: a truck freed some other way sees it pull up, and go.
  else if (!stuck && towArrived(v)) v.gone = 0;
  const s = v.gone < 0 ? towDrive(v.line.length, v.t) : v.line.length - towBack(v.gone);
  const speed = v.gone < 0 ? TOW_APPROACH * (1 - Math.min(1, v.t / (towDriveTime(v.line.length) || 1))) : -Math.min(7, 2.4 * v.gone);
  towOnLine(v.car, ground, v.line, s, speed);
  return v.gone < 0 ? smooth(0, 0.7, v.t) : v.gone >= TOW_GONE ? 0 : 1 - smooth(TOW_GONE - 1.2, TOW_GONE, v.gone);
}

/** Pulled up and ready to hook on. */
export const towArrived = (v: TowVisit) => v.t >= towDriveTime(v.line.length);

/** What the film of it leaving needs to know about a garage: scene.ts's `Garage` has all of it. */
export type TowDoor = { inside: Spot; approach: Spot; heading: number; sink: number };

/**
 * The film of it leaving the garage, `t` seconds in: the door opens, the truck pulls out
 * and away, the door comes down behind it. `rolled` is metres from where it was parked,
 * `sink` how far below the yard a sunken floor still has its wheels, and `out` whether
 * it's through the door and on open ground.
 */
export function towLeaving(g: TowDoor, t: number) {
  const door = Math.hypot(g.approach.x - g.inside.x, g.approach.z - g.inside.z);
  const going = Math.max(0, t - 0.7);
  const rolled = 0.5 * 3.4 * going * going;
  return {
    x: g.inside.x + Math.sin(g.heading) * rolled,
    z: g.inside.z + Math.cos(g.heading) * rolled,
    heading: g.heading,
    speed: 3.4 * going,
    rolled,
    out: rolled >= door,
    sink: g.sink * (1 - smooth(0, 0.6, rolled / (door || 1))),
    open: Math.min(smooth(0, 0.9, t), 1 - smooth(2.8, 3.8, t)),
    /** Where to watch from: out in front of the door and off to one side, about head height. */
    camera: { x: g.approach.x + Math.sin(g.heading) * 21 + Math.cos(g.heading) * 11, z: g.approach.z + Math.cos(g.heading) * 21 - Math.sin(g.heading) * 11, up: 3.4 },
    /** How dark the picture is: it goes to black as the truck drives off. */
    dark: smooth(TOW_LEAVE - 0.6, TOW_LEAVE, t),
  };
}

/** A distance for the driver waiting on it, in the miles the odometer counts in. */
export const fmtAway = (metres: number) => `${(metres / 1609.344).toFixed(2)} mi`;

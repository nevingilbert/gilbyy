/**
 * The train between the valley and San Francisco, as a film (ADR 0022). Like the plane's
 * (flight.ts), every frame is a pure function of the station and the time.
 *
 * The way out: the truck drives up the ramp onto the flat wagon at the back, the ramp folds
 * up, and the train pulls out. In the valley the points throw ahead of it and it swings
 * off the loop onto the branch, out to the mountains and into the tunnel; from Fourth and
 * King it backs out, as Caltrain's trains do, over Sixteenth Street and into the tunnel
 * under Potrero Hill. The picture goes black in the tunnel and the other place is put up.
 * The way in: out of the other tunnel, in to the platform, and the truck backs down the
 * ramp and turns away from the track.
 */
import { FLAT_FROM_HEAD, carsOn, lineFrame } from "./rail";
import type { Station } from "./station";
import type { TrainCar } from "./track";

export type Vec = { x: number; y: number; z: number };
/** Where the truck is in a frame: its spot, its heading, and the height of what its wheels are on. */
export type TruckPose = { x: number; z: number; heading: number; base: number; pitch: number };
export type TrainFrame = {
  cars: TrainCar[];
  /** The flat wagon's ramp: 0 folded up, 1 down on the ground behind it. */
  ramp: number;
  /** The valley's points: 0 set for the loop, 1 for the branch. */
  points: number;
  truck: TruckPose | null;
  camera: { from: Vec; to: Vec; shot: number; ease: number; wide: boolean };
  /** How much of the picture is lost in the tunnel's dark, 0–1. */
  dark: number;
};

/** The flat wagon: half its length, its deck's height over the rails, and its ramp's run along the ground. */
export const WAGON = { half: 6, deck: 1.3, width: 2.9, rampRun: 4.2 } as const;

type Ground = (x: number, z: number) => number;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/** The flat wagon of a train: always its last car. */
const wagonOf = (cars: TrainCar[]) => cars[cars.length - 1];

/**
 * The height of what's under a wheel at (x, z): the wagon's deck, its ramp if it's down, or
 * the ground. The ramp hangs off the wagon's back, the end away from the train's front.
 */
export function wagonBase(w: TrainCar, ramp: number, ground: Ground, x: number, z: number) {
  const fx = Math.sin(w.yaw);
  const fz = Math.cos(w.yaw);
  const along = (x - w.x) * fx + (z - w.z) * fz;
  const across = Math.abs((x - w.x) * fz - (z - w.z) * fx);
  const deck = w.y + WAGON.deck;
  if (across > WAGON.width / 2 + 0.2) return ground(x, z);
  if (along >= -WAGON.half && along <= WAGON.half) return deck;
  const foot = -WAGON.half - WAGON.rampRun * ramp;
  if (ramp > 0.05 && along < -WAGON.half && along >= foot) {
    const g = ground(x, z);
    return g + (deck - g) * ((along - foot) / (-WAGON.half - foot));
  }
  return ground(x, z);
}

/** A truck's pose on whatever it's over: the base under its middle, and its pitch from the bases under its axles. */
function stand(w: TrainCar, ramp: number, ground: Ground, x: number, z: number, heading: number): TruckPose {
  const fx = Math.sin(heading) * 1.35;
  const fz = Math.cos(heading) * 1.35;
  const front = wagonBase(w, ramp, ground, x + fx, z + fz);
  const back = wagonBase(w, ramp, ground, x - fx, z - fz);
  return { x, z, heading, base: (front + back) / 2, pitch: Math.atan2(front - back, 2.7) };
}

/** Along a polyline of control points, a smooth path (Catmull–Rom), at 0–1 of the way from point to point. */
function curve(pts: { x: number; z: number }[], u: number) {
  const n = pts.length - 1;
  const f = clamp01(u) * n;
  const k = Math.min(n - 1, Math.floor(f));
  const t = f - k;
  const [p0, p1, p2, p3] = [pts[Math.max(0, k - 1)], pts[k], pts[k + 1], pts[Math.min(n, k + 2)]];
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return { x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) };
}

/** The same path, at 0–1 of the way by distance: a truck on it goes at one speed, however long each leg is. */
function along(pts: { x: number; z: number }[], u: number) {
  const N = 64;
  const at = Array.from({ length: N + 1 }, (_, i) => curve(pts, i / N));
  const run = [0];
  for (let i = 1; i <= N; i++) run.push(run[i - 1] + Math.hypot(at[i].x - at[i - 1].x, at[i].z - at[i - 1].z));
  const want = clamp01(u) * run[N];
  let i = 1;
  while (i < N && run[i] < want) i++;
  const k = (want - run[i - 1]) / (run[i] - run[i - 1] || 1);
  return curve(pts, (i - 1 + k) / N);
}

/** A shot's camera, lifted clear of the ground wherever a bank or a cutting's side comes up under it. */
const clear = (camera: TrainFrame["camera"], ground: Ground): TrainFrame["camera"] => {
  const floor = ground(camera.from.x, camera.from.z) + 1.5;
  return camera.from.y >= floor ? camera : { ...camera, from: { ...camera.from, y: floor } };
};

/** Where the train's front is along its station's line, and its frame there. */
const frameAt = (st: Station, s: number) => lineFrame(st.line, s);
const up = (p: { x: number; y: number; z: number }, dy: number): Vec => ({ x: p.x, y: p.y + dy, z: p.z });
const side = (st: Station, s: number, off: number, rise: number, ahead = 0): Vec => {
  const f = frameAt(st, s + ahead);
  return { x: f.x + f.lx * st.side * off, y: f.y + rise, z: f.z + f.lz * st.side * off };
};

/** The moments of the way out, from boarding. The rest depend on the station: `outEnd`. */
export const OUT = { load: [0.3, 5.6], rampUp: [5.7, 6.6], roll: 7 } as const;
const PULL = 1.1;

/** How long a station's way out lasts. The valley's has the points to see. */
export const outEnd = (st: Station) => (st.points === null ? 22 : 28.5);

/**
 * The way out of a station, `t` seconds after boarding, the truck having stopped at `from`.
 * The train leaves toward the tunnel: forward from the valley's platform, backing out of
 * Fourth and King.
 */
export function departure(st: Station, from: { x: number; z: number; heading: number }, ground: Ground, t: number): TrainFrame {
  const valley = st.points !== null;
  // Where the train's front is: standing, pulling away, then, after a cut, nearing the
  // points, and after another, going into the tunnel.
  let head = st.head;
  let shot = 0;
  let dark = 0;
  let points = 0;
  const rolling = t - OUT.roll;
  // When the flat wagon, at the back, has gone into the tunnel: the end of the way out.
  const wagonLag = st.facing > 0 ? FLAT_FROM_HEAD : -FLAT_FROM_HEAD;
  if (rolling > 0 && rolling <= 4.5) {
    head = st.head + 0.5 * PULL * rolling * rolling;
    shot = 1;
  } else if (rolling > 4.5) {
    if (valley && rolling <= 12.5) {
      const u = rolling - 4.5;
      head = st.points! - 70 + 11 * u + 0.4 * u * u;
      points = smooth(0.4, 1.6, u);
      shot = 2;
    } else {
      // Into the tunnel: the wagon goes in at a steady speed, and the picture goes dark as it does.
      const u = rolling - (valley ? 12.5 : 4.5);
      const speed = valley ? 17 : 14;
      const wagonAt = st.portal - (valley ? 80 : 60) + speed * u;
      head = wagonAt + wagonLag;
      points = valley ? 1 : 0;
      const inAt = (valley ? 80 : 60) / speed;
      dark = smooth(inAt - 0.6, inAt + 0.7, u);
      shot = 3;
    }
  }
  const cars = carsOn(st.line, head, st.facing);
  const w = wagonOf(cars);
  const ramp = smooth(0.2, 1.2, t) * (1 - smooth(OUT.rampUp[0], OUT.rampUp[1], t));

  // The truck: from where it stopped, round behind the wagon, up the ramp to the middle of the deck.
  let truck: TruckPose;
  const wfx = Math.sin(w.yaw);
  const wfz = Math.cos(w.yaw);
  if (t < OUT.load[1]) {
    const foot = { x: w.x - wfx * (WAGON.half + WAGON.rampRun + 1), z: w.z - wfz * (WAGON.half + WAGON.rampRun + 1) };
    const behind = { x: foot.x - wfx * 4, z: foot.z - wfz * 4 };
    const path = [{ x: from.x, z: from.z }, st.board, behind, foot, { x: w.x, z: w.z }];
    const u = smooth(OUT.load[0], OUT.load[1], t);
    const p = along(path, u);
    const q = along(path, Math.min(1, u + 0.01));
    const moving = Math.hypot(q.x - p.x, q.z - p.z) > 1e-4 ? Math.atan2(q.x - p.x, q.z - p.z) : w.yaw;
    const heading = u < 0.02 ? turnToward(from.heading, moving, u / 0.02) : u > 0.97 ? w.yaw : moving;
    truck = stand(w, ramp, ground, p.x, p.z, heading);
  } else truck = { x: w.x, z: w.z, heading: w.yaw, base: w.y + WAGON.deck, pitch: w.pitch };

  let camera: TrainFrame["camera"];
  const wagonPos: Vec = { x: w.x, y: w.y + 2.4, z: w.z };
  if (shot === 0) {
    // On the platform, a little back from the wagon, watching the truck go aboard.
    const at = head - st.facing * FLAT_FROM_HEAD;
    camera = { from: side(st, at, 15, 5.5, -st.facing * 12), to: wagonPos, shot: 0, ease: 2.4, wide: true };
  } else if (shot === 1) {
    camera = { from: side(st, st.head - st.facing * FLAT_FROM_HEAD, 13, 4.5, -st.facing * 6), to: wagonPos, shot: 1, ease: 0, wide: true };
  } else if (shot === 2) {
    // Low beside the points, on the platform's side, away from the branch: first the blades
    // sliding over, then the train swinging across them.
    const p = frameAt(st, st.points!);
    const loco = cars[0];
    const look = smooth(st.points! - 45, st.points! - 5, head);
    camera = {
      from: { x: p.x + p.lx * st.side * 11 - p.fx * 14, y: p.y + 3.2, z: p.z + p.lz * st.side * 11 - p.fz * 14 },
      to: { x: p.x + (loco.x - p.x) * look, y: p.y + 0.4 + (loco.y + 1.6 - p.y) * look, z: p.z + (loco.z - p.z) * look },
      shot: 2, ease: 0, wide: false,
    };
  } else {
    // Behind the wagon, riding along into the tunnel; from Fourth and King, beside the tunnel's mouth.
    if (valley) {
      // High enough to see the truck over the folded ramp, and within the cutting's floor.
      const back = side(st, head - FLAT_FROM_HEAD - 18, 3.5, 9.5);
      camera = { from: back, to: up(frameAt(st, head - FLAT_FROM_HEAD + 30), 2), shot: 3, ease: 0, wide: false };
    } else camera = { from: side(st, st.portal - 28, 12, 6), to: up(frameAt(st, st.portal + 4), 3), shot: 3, ease: 0, wide: true };
  }
  return { cars, ramp, points, truck: dark >= 0.999 ? null : truck, camera: clear(camera, ground), dark };
}

/** How long a station's way in lasts. */
export const inEnd = (st: Station) => (st.points === null ? 23.5 : 29.5);

/**
 * The way in to a station, `t` seconds after the picture starts to come back: out of the
 * tunnel, in to the platform, and the truck backed off the wagon to where it's left.
 */
export function arrival(st: Station, ground: Ground, t: number): TrainFrame {
  const valley = st.points !== null;
  // Arriving trains face −1: their fronts toward the platform, coming from the tunnel.
  const shots = valley ? [0, 6.5, 12.5, 19, 24.5] : [0, 6.5, 0, 12, 17.5];
  let head: number;
  let shot: number;
  let points = valley ? 1 : 0;
  const dark = 1 - smooth(0, 1.2, t);
  if (t < shots[1]) {
    head = st.portal - 12 - 16 * t;
    shot = 10;
  } else if (valley && t < shots[2]) {
    head = st.points! + 70 - 13 * (t - shots[1]);
    shot = 11;
  } else if (t < shots[3]) {
    // Braking to a stop at the platform.
    const T = shots[3] - 1.2;
    const a = 1.1;
    const left = Math.max(0, T - t);
    head = st.arrive + 0.5 * a * left * left;
    shot = 12;
    points = 0;
  } else {
    head = st.arrive;
    shot = 13;
    points = 0;
  }
  const cars = carsOn(st.line, head, -1);
  const w = wagonOf(cars);
  const unload = shots[3];
  const ramp = smooth(unload, unload + 1.2, t);
  // The truck backs down the ramp, along the track behind the train, then turns away from it to where it's left.
  let truck: TruckPose;
  if (t < unload + 1) truck = { x: w.x, z: w.z, heading: w.yaw, base: w.y + WAGON.deck, pitch: w.pitch };
  else {
    const wfx = Math.sin(w.yaw);
    const wfz = Math.cos(w.yaw);
    const foot = { x: w.x - wfx * (WAGON.half + WAGON.rampRun + 1), z: w.z - wfz * (WAGON.half + WAGON.rampRun + 1) };
    const clear = { x: foot.x - wfx * 6, z: foot.z - wfz * 6 };
    const path = [{ x: w.x, z: w.z }, foot, clear, st.leave];
    const u = smooth(unload + 1, (valley ? shots[4] : unload + 5.5) - 0.4, t);
    const p = along(path, u);
    // Backing off it faces the train; turning away, it comes round to face the way it's left.
    const heading = turnToward(w.yaw, st.leave.heading, smooth(0.55, 1, u));
    truck = stand(w, ramp, ground, p.x, p.z, heading);
  }
  let camera: TrainFrame["camera"];
  if (shot === 10) {
    // Outside the tunnel's mouth, looking in: the light comes up as the train comes out.
    camera = { from: side(st, st.portal - 40, 10, 6), to: up(frameAt(st, st.portal), 3.5), shot: 10, ease: 0, wide: true };
  } else if (shot === 11) {
    const p = frameAt(st, st.points!);
    camera = { from: { x: p.x + p.lx * st.side * 12 - p.fx * 20, y: p.y + 3.5, z: p.z + p.lz * st.side * 12 - p.fz * 20 }, to: up(cars[0], 2), shot: 11, ease: 0, wide: false };
  } else if (shot === 12) {
    // Across the track from the platform, where nothing stands, low over the ground, as the train draws in.
    const at = side(st, st.arrive + FLAT_FROM_HEAD * 0.5, -16, 0);
    camera = { from: up(at, Math.max(0, ground(at.x, at.z) - at.y) + 4.5), to: up(cars[0], 2), shot: 12, ease: 0, wide: true };
  } else {
    camera = { from: side(st, st.arrive + FLAT_FROM_HEAD + 4, 20, 6.5, 10), to: { x: truck.x, y: truck.base + 1.2, z: truck.z }, shot: 13, ease: 2.2, wide: true };
  }
  return { cars, ramp, points, truck, camera: clear(camera, ground), dark };
}

import type { Ground, Obstacle } from "./world";

/**
 * A 4x4 on a heightfield. Arcade values tuned by feel; units are metres and seconds.
 *
 * The body is a point with a velocity, with three springs on top — height, pitch and
 * roll — chasing what the four wheels feel underneath. That is enough for the things
 * that matter here: hills slow you down, you roll back down them, the body sways over
 * bumps and leans in corners, and a crest taken fast puts you in the air. Rocks low
 * enough for the tyres are bumps under the wheels; taller ones, and trees, stop you.
 *
 * Sideways motion bleeds away at a rate set by the ground: almost at once on dirt, so
 * the truck goes where it points; slowly on snow, and very slowly on ice, so it slides.
 */
export const G = 9.8;
export const BRAKE = 11;
export const MAX_REVERSE = -6;
const AIR_GRAVITY = 1.6;
const MAX_STEER = 0.6;
const STEER_RATE = 2.6;
const SPRING = 90;
const DAMP = 10;
const TILT_SPRING = 70;
const TILT_DAMP = 9;
/** How fast sideways slip dies away on dirt, and on snow for the grippiest tyres. */
const DIRT_TRACTION = 30;
const SNOW_TRACTION = 7;

export type Car = {
  x: number;
  z: number;
  /** Body centre height. */
  y: number;
  vy: number;
  /** Yaw. 0 faces +z; increasing turns toward +x, which is the car's left. */
  heading: number;
  /** Along the heading; negative is reverse. */
  speed: number;
  /** Across the heading, positive to the left: how much it is sliding. */
  side: number;
  /** Front-wheel angle, eased toward the input. */
  steer: number;
  /** Nose-up and left-side-up angles, and their rates. */
  pitch: number;
  pitchV: number;
  roll: number;
  rollV: number;
  grounded: boolean;
  /** Ground height under the body last step, for damping against the ground's motion. */
  groundY: number;
  /** Metres driven, for the odometer. */
  distance: number;
};

/** Everything about the rig and its parts that changes how it drives. See shop.ts. */
export type CarSpec = {
  accel: number;
  maxSpeed: number;
  wheelbase: number;
  track: number;
  /** Body centre above the ground at rest, tyres included. */
  ride: number;
  /** How far the wheels can droop before they leave the ground. */
  travel: number;
  /** Deepest water it will drive into. */
  wade: number;
  /** Traction on climbs: how much more of the engine's push it keeps going uphill. */
  grip: number;
  /** Tallest rock the tyres climb over rather than stop at. */
  clearance: number;
  /** 0–1: how well the tyres hold on snow. Road tyres ~0.2, studded ~0.95. */
  snowGrip: number;
  /** Collision circle radius; the car is two of these, front and back. */
  radius: number;
};

/** The original overlander on road tyres: what tests drive unless they say otherwise. */
export const STOCK: CarSpec = {
  accel: 5.4, maxSpeed: 17.5, wheelbase: 2.6, track: 1.7, ride: 1.15, travel: 0.32,
  wade: 1.4, grip: 1, clearance: 0.45, snowGrip: 0.2, radius: 1.15,
};

export type Input = { left: boolean; right: boolean; gas: boolean; brake: boolean };

export const noInput = (): Input => ({ left: false, right: false, gas: false, brake: false });

export function makeCar(ground: Ground, x: number, z: number, heading: number, spec: CarSpec = STOCK): Car {
  const groundY = ground.height(x, z);
  return {
    x, z, y: groundY + spec.ride, vy: 0, heading, speed: 0, side: 0, steer: 0,
    pitch: 0, pitchV: 0, roll: 0, rollV: 0, grounded: true, groundY, distance: 0,
  };
}

/** How fast the car is turning, radians a second: the bicycle model, and none in the air. */
export const yawRateOf = (car: Car, spec: CarSpec) => (car.grounded ? (car.speed * Math.tan(car.steer)) / spec.wheelbase : 0);

/** How far a climbable rock lifts a wheel at (x, z): a dome, highest at its centre. */
function bump(x: number, z: number, near: readonly Obstacle[], clearance: number) {
  let top = 0;
  for (const o of near) {
    if (o.h > clearance || o.h <= 0.05) continue;
    const d2 = (x - o.x) ** 2 + (z - o.z) ** 2;
    const r2 = o.r * o.r;
    if (d2 < r2) top = Math.max(top, o.h * (1 - d2 / r2));
  }
  return top;
}

/** Ground height under each wheel, rocks included: front-left, front-right, rear-left, rear-right. */
export function wheelGround(car: Car, ground: Ground, spec: CarSpec = STOCK, near = ground.obstaclesNear(car.x, car.z)) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const lx = fz;
  const lz = -fx;
  const f = spec.wheelbase / 2;
  const l = spec.track / 2;
  const at = (x: number, z: number) => ground.height(x, z) + bump(x, z, near, spec.clearance);
  return [
    at(car.x + fx * f + lx * l, car.z + fz * f + lz * l),
    at(car.x + fx * f - lx * l, car.z + fz * f - lz * l),
    at(car.x - fx * f + lx * l, car.z - fz * f + lz * l),
    at(car.x - fx * f - lx * l, car.z - fz * f - lz * l),
  ] as const;
}

/** How quickly sliding dies away here, and how much of the engine and brakes reach the ground. */
export function traction(slip: number, spec: CarSpec) {
  const snow = Math.min(1, slip);
  const ice = Math.max(0, Math.min(1, slip - 1));
  const rate = (DIRT_TRACTION + (0.6 + spec.snowGrip * SNOW_TRACTION - DIRT_TRACTION) * snow) * (1 - 0.65 * ice * (1 - spec.snowGrip * 0.5));
  return { rate, bite: Math.max(0.2, Math.min(1, rate / 8)) };
}

/** Advances the car by `dt` seconds. Mutates and returns `car`. Keep dt small (≤ 1/60). */
export function step(car: Car, input: Input, dt: number, ground: Ground, spec: CarSpec = STOCK): Car {
  const near = ground.obstaclesNear(car.x, car.z);
  const [fl, fr, rl, rr] = wheelGround(car, ground, spec, near);
  const groundY = (fl + fr + rl + rr) / 4;
  const slopePitch = clampTilt(Math.atan2((fl + fr - rl - rr) / 2, spec.wheelbase));
  const slopeRoll = clampTilt(Math.atan2((fl + rl - fr - rr) / 2, spec.track));
  // How fast the ground under the body is rising. Capped, so a facet edge on a steep
  // outcrop can't fling the car skyward.
  const lift = Math.abs(car.speed) * 0.6 + 1;
  const groundVy = Math.max(-lift, Math.min(lift, (groundY - car.groundY) / dt));
  car.groundY = groundY;

  // Suspension: springs can only push, so a crest taken fast leaves the body in the air.
  const compression = groundY + spec.ride - car.y;
  car.grounded = compression > -spec.travel;
  // Heavier in the air than on the ground: hops stay short and landings come soon.
  let ay = car.grounded ? -G : -G * AIR_GRAVITY;
  if (car.grounded) ay += Math.max(0, G + SPRING * compression - DAMP * (car.vy - groundVy));
  car.vy += ay * dt;
  car.y += car.vy * dt;
  // Bump stop. The centre sample keeps the body out of a ridge between the wheels.
  const floor = Math.max(groundY + spec.ride - 0.4, ground.height(car.x, car.z) + bump(car.x, car.z, near, spec.clearance) + spec.ride - 0.6);
  if (car.y < floor) {
    car.y = floor;
    car.vy = Math.max(car.vy, groundVy, 0);
  }

  const depth = ground.waterAt(car.x, car.z) - groundY;
  const wading = depth > 0 ? Math.min(1, depth / spec.wade) : 0;
  const grip = traction(ground.slipAt(car.x, car.z), spec);
  let drive = 0;

  if (car.grounded) {
    // Gravity along the slope: hills cost speed going up and give it back coming down.
    car.speed -= G * Math.sin(slopePitch) * dt;

    // Better tyres keep more of the push on a climb; on the flat they change nothing.
    const climb = Math.min(1, Math.abs(Math.sin(slopePitch)) * 4);
    if (input.gas) drive = spec.accel * (1 + (spec.grip - 1) * climb) * (1 - wading * 0.7) * grip.bite;
    else if (input.brake) drive = (car.speed > 0.5 ? -BRAKE : -spec.accel * 0.8) * grip.bite;
    car.speed += drive * dt;
    if (!input.gas && !input.brake) {
      // Rolling resistance and engine braking. Enough to hold the car on a gentle slope.
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (1.4 + Math.abs(car.speed) * 0.2) * grip.bite * dt);
    }
    if (wading > 0) car.speed *= Math.exp(-wading * 2.2 * dt);
    const top = spec.maxSpeed * (1 - wading * 0.75);
    car.speed = Math.max(MAX_REVERSE, Math.min(top, car.speed));
  }

  // Bicycle-model steering, softened at speed so it stays calm.
  const steerTarget = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * MAX_STEER / (1 + Math.abs(car.speed) / 10);
  const ds = steerTarget - car.steer;
  car.steer += Math.sign(ds) * Math.min(Math.abs(ds), STEER_RATE * dt);
  const yawRate = yawRateOf(car, spec);

  // Turning swings the nose, not the momentum: re-split the velocity against the new
  // heading, then let the sideways part die away as fast as the ground allows.
  const vx = Math.sin(car.heading) * car.speed + Math.cos(car.heading) * car.side;
  const vz = Math.cos(car.heading) * car.speed - Math.sin(car.heading) * car.side;
  car.heading += yawRate * dt;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.speed = vx * fx + vz * fz;
  car.side = vx * fz - vz * fx;
  if (car.grounded) car.side *= Math.exp(-grip.rate * dt);

  const k = Math.cos(slopePitch) * dt;
  const nx = car.x + (fx * car.speed + fz * car.side) * k;
  const nz = car.z + (fz * car.speed - fx * car.side) * k;
  // Fording is fine; driving into the deep end is not. The car stops at the edge but
  // keeps a little speed, so steering can still turn it along the shore.
  if (ground.waterAt(nx, nz) - ground.height(nx, nz) > spec.wade) {
    car.speed = Math.max(-1.5, Math.min(1.5, car.speed));
    car.side = 0;
  } else {
    car.distance += Math.hypot(nx - car.x, nz - car.z);
    car.x = nx;
    car.z = nz;
  }

  // Body tilt follows the ground, plus squat under throttle and lean in corners.
  if (car.grounded) {
    const pitchTarget = slopePitch + drive * 0.008;
    const rollTarget = slopeRoll + car.speed * yawRate * 0.014 - car.side * 0.02;
    car.pitchV += (TILT_SPRING * (pitchTarget - car.pitch) - TILT_DAMP * car.pitchV) * dt;
    car.rollV += (TILT_SPRING * (rollTarget - car.roll) - TILT_DAMP * car.rollV) * dt;
  } else {
    // In the air: settle gently rather than tumble. This is not a game about crashing.
    car.pitchV += (-0.15 - car.pitch) * 2 * dt;
    car.rollV += -car.roll * 2 * dt;
    car.pitchV *= Math.exp(-3 * dt);
    car.rollV *= Math.exp(-3 * dt);
  }
  car.pitch = clampTilt(car.pitch + car.pitchV * dt);
  car.roll = clampTilt(car.roll + car.rollV * dt);

  collide(car, ground, spec);

  // The valley wall is the real boundary; this just stops anyone tunnelling past it.
  const r = Math.hypot(car.x, car.z);
  if (r > ground.limit) {
    car.x *= ground.limit / r;
    car.z *= ground.limit / r;
    car.speed *= 0.5;
    car.side *= 0.5;
  }
  return car;
}

/** The body never tips past this, whatever the ground does under it. */
const MAX_TILT = 0.7;
const clampTilt = (a: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, a));

function collide(car: Car, ground: Ground, spec: CarSpec) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const offset = spec.wheelbase * 0.46;
  for (const end of [1, -1]) {
    const cx = car.x + fx * offset * end;
    const cz = car.z + fz * offset * end;
    for (const o of ground.obstaclesNear(cx, cz)) {
      if (o.h <= spec.clearance) continue;
      const dx = cx - o.x;
      const dz = cz - o.z;
      const d = Math.hypot(dx, dz);
      const min = spec.radius + o.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const nz = dz / d;
      car.x += nx * (min - d);
      car.z += nz * (min - d);
      // Lose the part of the motion that was heading into the obstacle.
      const into = (fx * nx + fz * nz) * car.speed;
      if (into < 0) {
        car.speed *= 1 - Math.min(1, Math.abs(into) / Math.max(Math.abs(car.speed), 1e-6)) * 0.9;
        car.pitchV -= Math.sign(car.speed || 1) * Math.min(0.6, Math.abs(into) * 0.08);
      }
      car.side *= 0.5;
    }
  }
}

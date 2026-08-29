import { ENTER_RADIUS, LEVELS, WORLD, type Level } from "./levels";

// Arcade values, tuned by feel. Units are px and seconds.
export const ACCEL = 520;
export const BRAKE = 900;
export const MAX_SPEED = 460;
export const MAX_REVERSE = -190;
export const DRAG = 0.86;
export const TURN_RATE = 2.9;

export type Car = { x: number; y: number; angle: number; speed: number };
export type Input = { left: boolean; right: boolean; gas: boolean; brake: boolean };

export const noInput = (): Input => ({ left: false, right: false, gas: false, brake: false });

/** Advances the car by `dt` seconds. Mutates and returns `car`. */
export function step(car: Car, input: Input, dt: number): Car {
  if (input.gas) car.speed += ACCEL * dt;
  else if (input.brake) car.speed -= BRAKE * dt;
  else car.speed *= Math.pow(DRAG, dt * 60);
  car.speed = Math.max(MAX_REVERSE, Math.min(MAX_SPEED, car.speed));

  // Steering scales with speed, so the car can't pirouette while parked, and
  // inverts in reverse the way backing up a real car does.
  const grip = Math.min(1, Math.abs(car.speed) / 140);
  const dir = car.speed >= 0 ? 1 : -1;
  if (input.left) car.angle -= TURN_RATE * grip * dir * dt;
  if (input.right) car.angle += TURN_RATE * grip * dir * dt;

  car.x = Math.max(20, Math.min(WORLD.w - 20, car.x + Math.cos(car.angle) * car.speed * dt));
  car.y = Math.max(20, Math.min(WORLD.h - 20, car.y + Math.sin(car.angle) * car.speed * dt));
  return car;
}

/** The level the car is close enough to enter, if any. */
export function levelAt(car: Car): Level | null {
  return LEVELS.find((l) => Math.hypot(l.x - car.x, l.y - car.y) < ENTER_RADIUS) ?? null;
}

import { describe, it, expect } from "vitest";
import { makeCar, noInput, step, MAX_SPEED, MAX_REVERSE, RIDE, type Car, type Input } from "./physics";
import type { Ground, Obstacle } from "./world";

/** Test grounds: flat by default, or any height function, with optional obstacles. */
const ground = (height: (x: number, z: number) => number = () => 0, obstacles: Obstacle[] = [], water = -100): Ground => ({
  height,
  obstaclesNear: () => obstacles,
  water,
  limit: 1000,
});

const flat = ground();
const DT = 1 / 120;
const run = (c: Car, g: Ground, input: Partial<Input>, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) step(c, { ...noInput(), ...input }, DT, g);
  return c;
};

describe("step on flat ground", () => {
  it("accelerates along its heading (0 = +z)", () => {
    const c = run(makeCar(flat, 0, 0, 0), flat, { gas: true }, 1);
    expect(c.speed).toBeGreaterThan(3);
    expect(c.z).toBeGreaterThan(1);
    expect(c.x).toBeCloseTo(0, 5);
  });

  it("coasts to a stop when nothing is pressed", () => {
    const c = makeCar(flat, 0, 0, 0);
    c.speed = MAX_SPEED;
    expect(run(c, flat, {}, 8).speed).toBe(0);
  });

  it("clamps to the speed limits in both directions", () => {
    expect(run(makeCar(flat, 0, 0, 0), flat, { gas: true }, 15).speed).toBeCloseTo(MAX_SPEED, 5);
    expect(run(makeCar(flat, 0, 0, 0), flat, { brake: true }, 15).speed).toBeCloseTo(MAX_REVERSE, 5);
  });

  it("cannot turn while parked, and turns left (toward +x) while moving", () => {
    expect(run(makeCar(flat, 0, 0, 0), flat, { left: true }, 1).heading).toBe(0);
    const c = makeCar(flat, 0, 0, 0);
    c.speed = 10;
    run(c, flat, { left: true, gas: true }, 1);
    expect(c.heading).toBeGreaterThan(0.2);
    expect(c.x).toBeGreaterThan(0);
  });

  it("steers the opposite way in reverse", () => {
    const c = makeCar(flat, 0, 0, 0);
    c.speed = -5;
    expect(run(c, flat, { left: true, brake: true }, 1).heading).toBeLessThan(0);
  });

  it("rests on its suspension at ride height", () => {
    const c = makeCar(flat, 0, 0, 0);
    c.y += 0.5;
    run(c, flat, {}, 3);
    expect(c.y).toBeCloseTo(RIDE, 2);
    expect(c.grounded).toBe(true);
  });

  it("leans out of a corner", () => {
    const c = makeCar(flat, 0, 0, 0);
    c.speed = 12;
    run(c, flat, { left: true, gas: true }, 1.5);
    // Turning left, the body rolls onto its right side: left side up.
    expect(c.roll).toBeGreaterThan(0.01);
  });
});

describe("step on slopes", () => {
  // Rises 1 m per 4 m toward +z: about 14 degrees.
  const ramp = ground((_, z) => z * 0.25);

  it("climbs slower than it drives on the flat", () => {
    const up = run(makeCar(ramp, 0, 0, 0), ramp, { gas: true }, 3);
    const level = run(makeCar(flat, 0, 0, 0), flat, { gas: true }, 3);
    expect(up.speed).toBeLessThan(level.speed * 0.7);
    expect(up.pitch).toBeGreaterThan(0.15);
  });

  it("rolls back down a steep hill when left alone", () => {
    const c = run(makeCar(ramp, 0, 0, 0), ramp, {}, 3);
    expect(c.speed).toBeLessThan(-1);
    expect(c.z).toBeLessThan(0);
  });

  it("holds still on a gentle slope", () => {
    const gentle = ground((_, z) => z * 0.05);
    const c = run(makeCar(gentle, 0, 0, 0), gentle, {}, 3);
    expect(Math.abs(c.z)).toBeLessThan(0.05);
  });

  it("leaves the ground over a crest taken fast", () => {
    // A ridge at z = 20: up at 30%, then a sharp drop.
    const crest = ground((_, z) => (z < 20 ? z * 0.3 : 6 - (z - 20) * 0.8));
    const c = makeCar(crest, 0, 0, 0);
    c.speed = MAX_SPEED;
    let airborne = false;
    for (let t = 0; t < 3 && !airborne; t += DT) {
      step(c, { ...noInput(), gas: true }, DT, crest);
      airborne ||= !c.grounded;
    }
    expect(airborne).toBe(true);
  });
});

describe("step against the world", () => {
  it("stops at a tree instead of driving through it", () => {
    const tree = ground(() => 0, [{ x: 0, z: 10, r: 0.5 }]);
    const c = run(makeCar(tree, 0, 0, 0), tree, { gas: true }, 4);
    expect(c.z).toBeLessThan(10 - 1);
    expect(Math.abs(c.speed)).toBeLessThan(2);
  });

  it("slows in shallow water and refuses the deep end", () => {
    // Dry until z = 10, then shelving down into a lake.
    const lake = ground((_, z) => (z < 10 ? 1 : 1 - (z - 10) * 0.2), [], 0);
    const c = run(makeCar(lake, 0, 0, 0), lake, { gas: true }, 12);
    expect(c.z).toBeGreaterThan(10);
    expect(lake.water - lake.height(c.x, c.z)).toBeLessThan(1.4);
  });

  it("cannot leave the world", () => {
    const c = makeCar(flat, 990, 0, Math.PI / 2);
    run(c, flat, { gas: true }, 10);
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(1000 + 1e-6);
  });
});

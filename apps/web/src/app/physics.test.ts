import { describe, it, expect } from "vitest";
import { step, levelAt, noInput, MAX_SPEED, MAX_REVERSE, type Car } from "./physics";
import { HUB, LEVELS, WORLD } from "./levels";

const car = (over: Partial<Car> = {}): Car => ({ x: HUB.x, y: HUB.y, angle: 0, speed: 0, ...over });
const run = (c: Car, input: Partial<ReturnType<typeof noInput>>, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) step(c, { ...noInput(), ...input }, 1 / 60);
  return c;
};

describe("step", () => {
  it("accelerates forward along its heading", () => {
    const c = run(car({ angle: 0 }), { gas: true }, 1);
    expect(c.speed).toBeGreaterThan(0);
    expect(c.x).toBeGreaterThan(HUB.x);
    expect(c.y).toBeCloseTo(HUB.y, 5);
  });

  it("coasts to a near stop when nothing is pressed", () => {
    const c = run(car({ speed: 300 }), {}, 3);
    expect(Math.abs(c.speed)).toBeLessThan(1);
  });

  it("clamps to the speed limits in both directions", () => {
    expect(run(car(), { gas: true }, 10).speed).toBeCloseTo(MAX_SPEED, 5);
    expect(run(car(), { brake: true }, 10).speed).toBeCloseTo(MAX_REVERSE, 5);
  });

  it("cannot turn while parked, but can while moving", () => {
    expect(run(car(), { left: true }, 1).angle).toBeCloseTo(0, 5);
    expect(run(car({ speed: 300 }), { left: true }, 0.5).angle).toBeLessThan(0);
  });

  it("steers the opposite way in reverse", () => {
    expect(run(car({ speed: -150 }), { left: true }, 0.5).angle).toBeGreaterThan(0);
  });

  it("keeps the car inside the world", () => {
    const c = run(car({ x: WORLD.w - 100, angle: 0 }), { gas: true }, 20);
    expect(c.x).toBeLessThanOrEqual(WORLD.w - 20);
    expect(c.x).toBeGreaterThan(0);
  });
});

describe("levelAt", () => {
  it("finds nothing at the hub", () => {
    expect(levelAt(car())).toBeNull();
  });

  it("finds a level once the car pulls up to it", () => {
    for (const level of LEVELS) {
      expect(levelAt(car({ x: level.x, y: level.y }))?.id).toBe(level.id);
    }
  });
});

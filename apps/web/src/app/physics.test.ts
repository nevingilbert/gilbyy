import { describe, it, expect } from "vitest";
import { makeCar, noInput, step, MAX_REVERSE, STOCK, type Car, type CarSpec, type Input } from "./physics";
import type { Ground, Obstacle } from "./world";

/** Test grounds: flat by default, or any height function, with optional obstacles. */
const ground = (height: (x: number, z: number) => number = () => 0, obstacles: Obstacle[] = [], water = -100, slip = 0): Ground => ({
  height,
  waterAt: () => water,
  obstaclesNear: () => obstacles,
  slipAt: () => slip,
  limit: 1000,
});
const MAX_SPEED = STOCK.maxSpeed;
const RIDE = STOCK.ride;

const flat = ground();
const DT = 1 / 120;
const run = (c: Car, g: Ground, input: Partial<Input>, seconds: number, spec: CarSpec = STOCK) => {
  for (let t = 0; t < seconds; t += DT) step(c, { ...noInput(), ...input }, DT, g, spec);
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

describe("tyres", () => {
  const rock = (h: number) => ground(() => 0, [{ x: 0, z: 10, r: 1.4, h }]);

  it("rolls over a rock lower than its clearance, rising as it does", () => {
    const g = rock(0.4);
    const c = makeCar(g, 0, 0, 0);
    let peak = 0;
    for (let t = 0; t < 5; t += DT) {
      step(c, { ...noInput(), gas: true }, DT, g);
      peak = Math.max(peak, c.y);
    }
    expect(c.z).toBeGreaterThan(14);
    expect(peak).toBeGreaterThan(RIDE + 0.08);
  });

  it("is stopped by a taller rock, unless the tyres can clear it", () => {
    const g = rock(1.0);
    expect(run(makeCar(g, 0, 0, 0), g, { gas: true }, 5).z).toBeLessThan(9);
    expect(run(makeCar(g, 0, 0, 0), g, { gas: true }, 5, { ...STOCK, clearance: 1.2 }).z).toBeGreaterThan(12);
  });

  it("climbs steeper with more grip", () => {
    // About 36 degrees: just past what stock tyres can manage.
    const steep = ground((_, z) => Math.max(0, z - 3) * 0.73);
    const stock = run(makeCar(steep, 0, 0, 0), steep, { gas: true }, 8);
    const grippy = run(makeCar(steep, 0, 0, 0), steep, { gas: true }, 8, { ...STOCK, grip: 1.3 });
    expect(grippy.z).toBeGreaterThan(stock.z + 5);
  });
});

describe("snow and ice", () => {
  const snow = ground(() => 0, [], -100, 1);
  const ice = ground(() => 0, [], -100, 2);
  /** Up to speed in a straight line, then a hard left: how far does it slide sideways? */
  const slide = (g: Ground, spec: CarSpec = STOCK) => {
    const c = makeCar(g, 0, 0, 0);
    c.speed = 14;
    let most = 0;
    for (let t = 0; t < 1.5; t += DT) {
      step(c, { ...noInput(), gas: true, left: true }, DT, g, spec);
      most = Math.max(most, Math.abs(c.side));
    }
    return most;
  };

  it("hardly slides on dirt, slides on snow, slides most on ice", () => {
    const dirt = slide(flat);
    expect(dirt).toBeLessThan(0.9);
    expect(slide(snow)).toBeGreaterThan(dirt * 3);
    expect(slide(ice)).toBeGreaterThan(slide(snow));
  });

  it("holds on snow with studded tyres", () => {
    expect(slide(snow, { ...STOCK, snowGrip: 0.95 })).toBeLessThan(slide(snow) * 0.5);
  });

  it("pulls away slowly on ice", () => {
    const onIce = run(makeCar(ice, 0, 0, 0), ice, { gas: true }, 2);
    const onDirt = run(makeCar(flat, 0, 0, 0), flat, { gas: true }, 2);
    expect(onIce.speed).toBeLessThan(onDirt.speed * 0.5);
  });
});

describe("step against the world", () => {
  it("counts the distance it drives", () => {
    const c = run(makeCar(flat, 0, 0, 0), flat, { gas: true }, 4);
    expect(c.distance).toBeCloseTo(Math.hypot(c.x, c.z), 1);
  });

  it("stops at a tree instead of driving through it", () => {
    const tree = ground(() => 0, [{ x: 0, z: 10, r: 0.5, h: Infinity }]);
    const c = run(makeCar(tree, 0, 0, 0), tree, { gas: true }, 4);
    expect(c.z).toBeLessThan(10 - 1);
    expect(Math.abs(c.speed)).toBeLessThan(2);
  });

  it("slows in shallow water and refuses the deep end", () => {
    // Dry until z = 10, then shelving down into a lake.
    const lake = ground((_, z) => (z < 10 ? 1 : 1 - (z - 10) * 0.2), [], 0);
    const c = run(makeCar(lake, 0, 0, 0), lake, { gas: true }, 12);
    expect(c.z).toBeGreaterThan(10);
    expect(lake.waterAt(c.x, c.z) - lake.height(c.x, c.z)).toBeLessThan(STOCK.wade + 0.1);
  });

  it("wades deeper with a snorkel", () => {
    const lake = ground((_, z) => (z < 10 ? 1 : 1 - (z - 10) * 0.2), [], 0);
    const stock = run(makeCar(lake, 0, 0, 0), lake, { gas: true }, 15);
    const snorkel = run(makeCar(lake, 0, 0, 0), lake, { gas: true }, 15, { ...STOCK, wade: 2.6 });
    expect(snorkel.z).toBeGreaterThan(stock.z + 4);
  });

  // The island's tide (tide.ts) can come in round a truck that drove out while it was low.
  it("can always drive out of water that rose round it, and never further in", () => {
    let sea = -1.5;
    // A beach shelving gently into the sea, toward +z.
    const beach: Ground = { ...ground((_, z) => -z * 0.05), waterAt: () => sea };
    const depth = (c: Car) => sea - beach.height(c.x, c.z);
    const c = run(makeCar(beach, 0, 0, 0), beach, { gas: true }, 60);
    expect(depth(c)).toBeGreaterThan(STOCK.wade - 0.2);
    expect(depth(c)).toBeLessThan(STOCK.wade + 0.1);
    // The tide comes in: now it stands in far more water than it could have driven into.
    sea = 0;
    const far = c.z;
    run(c, beach, { gas: true }, 5);
    expect(c.z).toBeLessThan(far + 0.01);
    // Backing up the beach works, until it's only wading again.
    run(c, beach, { brake: true }, 30);
    expect(depth(c)).toBeLessThan(STOCK.wade);
  });

  it("cannot leave the world", () => {
    const c = makeCar(flat, 990, 0, Math.PI / 2);
    run(c, flat, { gas: true }, 10);
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(1000 + 1e-6);
  });
});

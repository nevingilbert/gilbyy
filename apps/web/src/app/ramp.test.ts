import { describe, expect, it } from "vitest";
import { makeCar, noInput, step } from "./physics";
import { FENCE, RAMP, deckLift, rampLift, rampLocal, rampObstacles, rampPoint, type Ramp } from "./ramp";
import { STOCK_LOADOUT, specFor } from "./shop";
import { STARTERS, VEHICLES, type VehicleId } from "./vehicles";
import type { Ground, Obstacle } from "./world";

const ramp: Ramp = { x: 40, z: -30, heading: 0.7 };
/** Level ground with the ramp on it, and what stands round it. */
const yard = (): Ground => {
  const solid = rampObstacles(ramp, () => 0) as Obstacle[];
  return { height: (x, z) => rampLift([ramp], x, z), waterAt: () => -100, obstaclesNear: () => solid, slipAt: () => 0, limit: 5000 };
};

/** Drives from (u, w) against the ramp, pointed `turn` round from the way up it, flat out for `seconds`. */
function drive(id: VehicleId, u: number, w: number, turn: number, seconds: number, gas = true) {
  const ground = yard();
  const spec = specFor(id, STOCK_LOADOUT);
  const from = rampPoint(ramp, u, w);
  const car = makeCar(ground, from.x, from.z, ramp.heading + turn, spec);
  let aloft = 0, air = 0, top = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    step(car, { ...noInput(), gas }, 1 / 60, ground, spec);
    aloft = car.grounded ? 0 : aloft + 1 / 60;
    air = Math.max(air, aloft);
    top = Math.max(top, car.y - spec.ride);
  }
  return { car, air, top, ...rampLocal(ramp, car.x, car.z) };
}

describe("the ramp's shape", () => {
  it("is level where the wheels roll on, steepest at the lip, and nowhere a sheer wall", () => {
    expect(deckLift(0, 0)).toBe(0);
    expect(deckLift(0.5, 0)).toBeLessThan(0.02);
    expect(deckLift(RAMP.length, 0)).toBeCloseTo(RAMP.height);
    const grade = (u: number) => deckLift(u + 0.5, 0) - deckLift(u - 0.5, 0);
    for (let u = 1; u < RAMP.length - 1; u++) expect(grade(u + 1)).toBeGreaterThan(grade(u));
    expect(grade(RAMP.length - 0.5)).toBeLessThan(0.45);
    // The same height right across the deck, then down to nothing over the boarded sides and back.
    expect(deckLift(9, RAMP.width / 2)).toBeCloseTo(deckLift(9, 0));
    expect(deckLift(9, RAMP.width / 2 + RAMP.side / 2)).toBeCloseTo(deckLift(9, 0) / 2);
    expect(deckLift(9, RAMP.width / 2 + RAMP.side)).toBeCloseTo(0);
    expect(deckLift(9, RAMP.width / 2 + RAMP.side + 0.01)).toBe(0);
    expect(deckLift(RAMP.length + RAMP.back / 2, 0)).toBeCloseTo(RAMP.height / 2);
    expect(deckLift(RAMP.length + RAMP.back, 0)).toBe(0);
    expect(deckLift(-1, 0)).toBe(0);
  });

  it("lies where it's put, turned the way it faces", () => {
    const lip = rampPoint(ramp, RAMP.length, 0);
    expect(rampLift([ramp], lip.x, lip.z)).toBeCloseTo(RAMP.height);
    expect(Math.hypot(lip.x - ramp.x, lip.z - ramp.z)).toBeCloseTo(RAMP.length);
    expect(Math.atan2(lip.x - ramp.x, lip.z - ramp.z)).toBeCloseTo(ramp.heading);
    const there = rampLocal(ramp, lip.x, lip.z);
    expect(there.u).toBeCloseTo(RAMP.length);
    expect(there.w).toBeCloseTo(0);
    expect(rampLift([ramp], ramp.x + 200, ramp.z)).toBe(0);
    expect(rampLift([], lip.x, lip.z)).toBe(0);
  });
});

describe("the jump", () => {
  it("puts every rig in the air for about a second, and the quicker the rig the longer", () => {
    const airs = VEHICLES.map((v) => ({ v, ...drive(v.id, -110, 0, 0, 12) }));
    for (const a of airs) {
      expect(a.air, a.v.id).toBeGreaterThan(0.95);
      expect(a.air, a.v.id).toBeLessThan(1.6);
      // Off the lip and no higher than a storey above it; nobody is flung.
      expect(a.top, a.v.id).toBeGreaterThan(RAMP.height);
      expect(a.top, a.v.id).toBeLessThan(RAMP.height + 3);
    }
    const quickest = airs.reduce((b, a) => (a.v.maxSpeed > b.v.maxSpeed ? a : b));
    const slowest = airs.reduce((b, a) => (a.v.maxSpeed < b.v.maxSpeed ? a : b));
    expect(quickest.air).toBeGreaterThan(slowest.air + 0.2);
  });

  it("comes down inside the landing, wheels down and still rolling", () => {
    for (const v of VEHICLES) {
      // Just long enough to be over the lip and down again.
      const { car, u, w } = drive(v.id, -110, 0, 0, 110 / v.maxSpeed + 5.5);
      expect(car.grounded, v.id).toBe(true);
      expect(u, v.id).toBeGreaterThan(RAMP.length + 12);
      expect(Math.abs(w), v.id).toBeLessThan(1);
      expect(car.speed, v.id).toBeGreaterThan(v.maxSpeed * 0.9);
      expect(Math.abs(car.roll), v.id).toBeLessThan(0.1);
    }
  });

  it("gives next to no air to a truck that rolls off the end", () => {
    const { air, u } = drive("bluff", RAMP.length - 6, 0, 0, 8, false);
    // No throttle: it rolls back down instead.
    expect(u).toBeLessThan(RAMP.length);
    expect(air).toBeLessThan(0.2);
  });
});

describe("what stands round the ramp", () => {
  it("is a fence down each side and boards under the lip", () => {
    const solid = rampObstacles(ramp, () => 0);
    const local = solid.map((o) => ({ ...o, ...rampLocal(ramp, o.x, o.z) }));
    const posts = local.filter((o) => o.top === undefined);
    const boards = local.filter((o) => o.top !== undefined);
    expect(posts.every((o) => Math.abs(Math.abs(o.w) - FENCE.out) < 1e-6 && o.u >= FENCE.from - 1e-6 && o.u <= RAMP.length + RAMP.back + 1e-6)).toBe(true);
    // Too close together for a truck to pass between two of them.
    const left = posts.filter((o) => o.w > 0).map((o) => o.u).sort((a, b) => a - b);
    for (let i = 1; i < left.length; i++) expect(left[i] - left[i - 1]).toBeLessThan(2);
    // Clear of the deck: a truck with its wheels on the very edge doesn't touch one.
    const reach = RAMP.width / 2 + Math.max(...STARTERS.map((v) => specFor(v.id, STOCK_LOADOUT).radius));
    expect(FENCE.out - 0.35).toBeGreaterThan(reach);
    expect(boards.length).toBeGreaterThan(4);
    expect(boards.every((o) => o.u > RAMP.length && o.u < RAMP.length + RAMP.back && Math.abs(o.w) <= RAMP.width / 2 + 1e-6)).toBe(true);
    expect(boards.every((o) => o.top === 1)).toBe(true);
  });

  it("stops a truck driving into the back or a side, without flinging it", () => {
    const back = drive("duneclaw", RAMP.length + 60, 0, Math.PI, 8);
    expect(back.u).toBeGreaterThan(RAMP.length + 1);
    expect(back.top).toBeLessThan(0.6);
    expect(back.air).toBeLessThan(0.1);
    const side = drive("duneclaw", RAMP.length - 4, 60, -Math.PI / 2, 8);
    expect(side.w).toBeGreaterThan(FENCE.out);
    expect(side.top).toBeLessThan(0.6);
    expect(side.air).toBeLessThan(0.1);
  });

  it("lets a truck roll slowly off the lip without catching on the boards under it", () => {
    const ground = yard();
    const spec = specFor("bluff", STOCK_LOADOUT);
    const at = rampPoint(ramp, RAMP.length - 5, 0);
    const car = makeCar(ground, at.x, at.z, ramp.heading, spec);
    for (let t = 0; t < 10; t += 1 / 60) step(car, { ...noInput(), gas: car.speed < 4 }, 1 / 60, ground, spec);
    expect(rampLocal(ramp, car.x, car.z).u).toBeGreaterThan(RAMP.length + RAMP.back + 5);
    expect(car.grounded).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { buildIsland } from "./island";
import { PoseGate, packPose, unpackPose, type Pose } from "./net";
import { RAM, STOCK, makeCar, noInput, step, type Car, type CarSpec, type Input } from "./physics";
import { PARTS, STOCK_LOADOUT, priceOf, specFor } from "./shop";
import { VEHICLES } from "./vehicles";
import { WINCH_REACH, cableEnds, canWinch, hasWinch } from "./winch";
import { buildWorld, type Ground, type Obstacle, type World } from "./world";

const ground = (obstacles: Obstacle[] = [], water = -100): Ground => ({
  height: () => 0,
  waterAt: () => water,
  obstaclesNear: () => obstacles,
  slipAt: () => 0,
  limit: 1000,
});
const DT = 1 / 120;
const run = (c: Car, g: Ground, input: Partial<Input>, seconds: number, spec: CarSpec = STOCK) => {
  for (let t = 0; t < seconds && !(input.gas && c.stuck); t += DT) step(c, { ...noInput(), ...input }, DT, g, spec);
  return c;
};
/** A rock dead ahead of a truck at the origin: far enough off to be hit flat out, or near enough to be hit slowly. */
const FAR = 45;
const NEAR = 7;
const rock = (z: number, h: number, x = 0): Obstacle => ({ x, z, r: 0.9, h, boulder: Number.isFinite(h) });
/** Flat out at a rock a little too tall for stock tyres. */
const hungUp = () => {
  const g = ground([rock(FAR, 0.8)]);
  return { g, car: run(makeCar(g, 0, 0, 0), g, { gas: true }, 12) };
};

describe("getting stuck on a rock", () => {
  it("only stops at a rock a little too tall for its tyres when it comes up slowly", () => {
    const g = ground([rock(NEAR, 0.8)]);
    const c = makeCar(g, 0, 0, 0);
    let fastest = 0;
    for (let t = 0; t < 5; t += DT) {
      step(c, { ...noInput(), gas: true }, DT, g);
      fastest = Math.max(fastest, c.speed);
    }
    expect(fastest).toBeLessThan(RAM);
    expect(c.stuck).toBeNull();
    expect(c.z).toBeLessThan(NEAR);
    // And backs away from it as it always could.
    expect(run(c, g, { brake: true }, 3).z).toBeLessThan(2);
  });

  it("rides up onto it when it's rammed, and then nothing the driver does moves the truck", () => {
    const { g, car } = hungUp();
    expect(car.stuck).not.toBeNull();
    run(car, g, {}, 2);
    const at = { x: car.x, z: car.z, distance: car.distance };
    // On top of the rock, held up off its springs.
    expect(Math.hypot(car.x, car.z - FAR)).toBeLessThan(1);
    expect(car.y).toBeGreaterThan(STOCK.ride + 0.3);
    for (const input of [{ gas: true }, { brake: true }, { gas: true, left: true }, { brake: true, right: true }, {}]) {
      for (let t = 0; t < 6; t += DT) step(car, { ...noInput(), ...input }, DT, g);
    }
    expect(car.stuck).not.toBeNull();
    expect(Math.hypot(car.x - at.x, car.z - at.z)).toBeLessThan(0.01);
    expect(car.distance).toBe(at.distance);
    expect(car.speed).toBe(0);
  });

  it("spins its wheels in the air when the driver tries the throttle", () => {
    const { g, car } = hungUp();
    run(car, g, {}, 3);
    expect(Math.abs(car.stuck!.spin)).toBeLessThan(0.1);
    for (let t = 0; t < 2; t += DT) step(car, { ...noInput(), gas: true }, DT, g);
    expect(car.stuck!.spin).toBeGreaterThan(5);
  });

  it("isn't caught by a glancing blow", () => {
    // Off to one side: the bumper clips it, but it would pass outside the wheels.
    const g = ground([rock(FAR, 0.8, 1.6)]);
    const c = run(makeCar(g, 0, 0, 0), g, { gas: true }, 12);
    expect(c.stuck).toBeNull();
  });

  it("takes a taller rock to catch a truck on bigger tyres", () => {
    const lifted = { ...STOCK, clearance: 1.2 };
    const low = ground([rock(FAR, 0.8)]);
    const over = run(makeCar(low, 0, 0, 0), low, { gas: true }, 12, lifted);
    expect(over.stuck).toBeNull();
    expect(over.z).toBeGreaterThan(FAR + 20);
    const tall = ground([rock(FAR, 1.5)]);
    expect(run(makeCar(tall, 0, 0, 0), tall, { gas: true }, 12, lifted).stuck).not.toBeNull();
  });

  it("is never caught by a tree, or by a boulder far too tall to mount", () => {
    for (const h of [Infinity, 2.5]) {
      const g = ground([rock(FAR, h)]);
      const c = run(makeCar(g, 0, 0, 0), g, { gas: true }, 12);
      expect(c.stuck).toBeNull();
      expect(c.z).toBeLessThan(FAR);
    }
  });

  it("is never caught by a post or a board, however low", () => {
    // The jump's fence and the boards under its lip have heights of their own, and only stop a truck.
    const g = ground([{ x: 0, z: FAR, r: 0.35, h: 0.8 }]);
    const c = run(makeCar(g, 0, 0, 0), g, { gas: true }, 12);
    expect(c.stuck).toBeNull();
    expect(c.z).toBeLessThan(FAR);
  });

  it("is never caught in single player, where nobody could pull it off", () => {
    const g = ground([rock(FAR, 0.8)]);
    const c = run(makeCar(g, 0, 0, 0), g, { gas: true }, 12, { ...STOCK, hang: 0 });
    expect(c.stuck).toBeNull();
    expect(c.z).toBeLessThan(FAR);
  });

  it("doesn't come to rest in water, or with a tree through it", () => {
    const wet = ground([rock(FAR, 0.8)], 0.3);
    expect(run(makeCar(wet, 0, 0, 0), wet, { gas: true }, 16).stuck).toBeNull();
    const wooded = ground([rock(FAR, 0.8), { x: 0, z: FAR + 1.5, r: 0.45, h: Infinity }]);
    expect(run(makeCar(wooded, 0, 0, 0), wooded, { gas: true }, 12).stuck).toBeNull();
  });

  it("comes off on the end of a winch, and drives away", () => {
    const { g, car } = hungUp();
    run(car, g, {}, 2);
    car.stuck!.pull = { x: 18, z: car.z };
    const from = car.x;
    for (let t = 0; t < 12 && car.stuck; t += DT) step(car, noInput(), DT, g);
    expect(car.stuck).toBeNull();
    // Hauled toward the winch, and clear of the rock.
    expect(car.x).toBeGreaterThan(from + 1.5);
    for (const end of [1, -1]) expect(Math.hypot(car.x, car.z + end * STOCK.wheelbase * 0.46 - FAR)).toBeGreaterThan(STOCK.radius + 0.9 + 0.5);
    // Settles back onto its springs, and goes when asked.
    run(car, g, {}, 2);
    expect(car.y).toBeCloseTo(STOCK.ride, 1);
    const z = car.z;
    run(car, g, { gas: true }, 2);
    expect(car.z).toBeGreaterThan(z + 8);
  });

  it("is hauled no nearer the winch than a truck's length", () => {
    const { g, car } = hungUp();
    // A winch right alongside: there's nowhere to haul it, so it's let go where it is.
    car.stuck!.pull = { x: 3, z: car.z };
    for (let t = 0; t < 3 && car.stuck; t += DT) step(car, noInput(), DT, g);
    expect(car.stuck).toBeNull();
  });
});

describe("rocks to get stuck on", () => {
  const worlds: [string, World][] = [["the valley", buildWorld()], ["the island", buildIsland()]];
  const tops = (w: World) => w.rocks.map((r) => r.y + r.sy * 0.95 - w.height(r.x, r.z));

  it("are there for every rig on every set of tyres, in both worlds", () => {
    for (const [, world] of worlds) {
      const heights = tops(world);
      for (const v of VEHICLES) {
        for (const t of PARTS.tyres) {
          const spec = specFor(v.id, { ...STOCK_LOADOUT, tyres: t.id });
          expect(heights.filter((h) => h > spec.clearance && h <= spec.clearance + spec.hang).length).toBeGreaterThan(40);
        }
      }
    }
  });

  it("really do catch a truck driven flat out at one", () => {
    const world = worlds[0][1];
    const spec = specFor("ridgeback", STOCK_LOADOUT);
    const heights = tops(world);
    let caught = 0;
    let tried = 0;
    for (let i = 0; i < world.rocks.length && tried < 60; i++) {
      if (heights[i] <= spec.clearance || heights[i] > spec.clearance + spec.hang) continue;
      tried++;
      const r = world.rocks[i];
      // From the north, the south, the east and the west, until one run-up is clear.
      for (let k = 0; k < 4; k++) {
        const heading = (k * Math.PI) / 2;
        const car = makeCar(world, r.x - Math.sin(heading) * 60, r.z - Math.cos(heading) * 60, heading, spec);
        for (let t = 0; t < 10 && !car.stuck; t += 1 / 60) step(car, { ...noInput(), gas: true }, 1 / 60, world, spec);
        if (!car.stuck) continue;
        caught++;
        break;
      }
    }
    expect(caught).toBeGreaterThan(10);
  });
});

describe("the winch", () => {
  const fitted = { ...STOCK_LOADOUT, winch: "winch" };

  it("is sold at the garage, and changes nothing about how its own truck drives", () => {
    expect(priceOf("winch:winch")).toBeGreaterThan(0);
    expect(hasWinch(STOCK_LOADOUT)).toBe(false);
    expect(hasWinch(fitted)).toBe(true);
    // A truck that has driven since before there were winches has no word for one.
    expect(hasWinch({ ...STOCK_LOADOUT, winch: undefined as unknown as string })).toBe(false);
    for (const v of VEHICLES) expect(specFor(v.id, fitted)).toEqual(specFor(v.id, STOCK_LOADOUT));
  });

  it("reaches a stuck truck within the cable's length, and no further", () => {
    const me = { x: 0, z: 0 };
    expect(canWinch(me, fitted, { x: WINCH_REACH - 1, z: 0 })).toBe(true);
    expect(canWinch(me, fitted, { x: WINCH_REACH + 1, z: 0 })).toBe(false);
    expect(canWinch(me, STOCK_LOADOUT, { x: 5, z: 0 })).toBe(false);
    // The stuck driver's game allows for the other end being a little out.
    expect(canWinch(me, fitted, { x: WINCH_REACH + 1, z: 0 }, 4)).toBe(true);
  });

  it("runs its cable from the front bumper to the nearer end of the stuck truck", () => {
    const flat = ground();
    const puller = makeCar(flat, 0, 0, 0);
    const ahead = cableEnds(puller, STOCK, makeCar(flat, 0, 15, 0), STOCK);
    expect(ahead.from.z).toBeGreaterThan(1);
    // Facing the same way, it's the stuck truck's tail that's nearer; turned round, its nose.
    expect(ahead.to.z).toBeLessThan(15);
    expect(cableEnds(puller, STOCK, makeCar(flat, 0, 15, Math.PI), STOCK).to.z).toBeLessThan(15);
    expect(cableEnds(puller, STOCK, makeCar(flat, 0, -15, 0), STOCK).to.z).toBeGreaterThan(-15);
  });
});

describe("telling the others", () => {
  const parked = (stuck: boolean, hooked = false): Pose => ({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, speed: 0, steer: 0, turn: 0, stuck, hooked });

  it("sends a pose when a truck gets stuck, is hooked, and comes free, though it isn't moving", () => {
    const gate = new PoseGate();
    gate.sent(parked(false), 0);
    expect(gate.due(parked(false), 60, 2)).toBe(false);
    expect(gate.due(parked(true), 61, 2)).toBe(true);
    gate.sent(parked(true), 61);
    expect(gate.due(parked(true), 120, 2)).toBe(false);
    expect(gate.due(parked(true, true), 121, 2)).toBe(true);
    gate.sent(parked(true, true), 121);
    expect(gate.due(parked(false), 130, 2)).toBe(true);
  });

  it("carries it in the pose, and reads an older tab's pose as not stuck", () => {
    expect(unpackPose(packPose(parked(true)))).toMatchObject({ stuck: true, hooked: false });
    expect(unpackPose(packPose(parked(true, true)))).toMatchObject({ stuck: true, hooked: true });
    expect(unpackPose(packPose(parked(false)))).toMatchObject({ stuck: false, hooked: false });
    expect(unpackPose(packPose(parked(true)).slice(0, 9))).toMatchObject({ stuck: false, hooked: false });
  });
});

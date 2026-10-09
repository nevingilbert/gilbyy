import { describe, expect, it } from "vitest";
import { startRun, tick } from "./mission-run";
import { makeCar, noInput, step } from "./physics";
import { METRES_PER_MILE, STOCK_LOADOUT, specFor, type Loadout } from "./shop";
import { STARTERS, vehicleById } from "./vehicles";
import { buildWorld, type Mission } from "./world";

const world = buildWorld();
const miles = (m: Mission) => {
  let metres = 0;
  let at: { x: number; z: number } = m.start;
  for (const g of m.gates) {
    metres += Math.hypot(g.x - at.x, g.z - at.z);
    at = g;
  }
  return metres / METRES_PER_MILE;
};

/**
 * Drives `m` from its start arch with a simple autopilot: full throttle at the next
 * flag, through its middle. No path finding, so it only manages courses whose straight
 * lines between flags are drivable.
 */
function drive(m: Mission, loadout: Loadout = STOCK_LOADOUT) {
  const spec = specFor("bluff", loadout);
  const car = makeCar(world, m.start.x, m.start.z, m.start.heading, spec);
  const run = startRun(m);
  run.clock = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 400; t += dt) {
    const g = m.gates[run.next];
    const close = Math.hypot(g.x - car.x, g.z - car.z) < 12;
    const tx = g.x + (close ? Math.sin(g.heading) * 12 : 0);
    const tz = g.z + (close ? Math.cos(g.heading) * 12 : 0);
    const off = Math.atan2(Math.sin(Math.atan2(tx - car.x, tz - car.z) - car.heading), Math.cos(Math.atan2(tx - car.x, tz - car.z) - car.heading));
    const input = { ...noInput(), gas: Math.abs(off) < 0.9 || car.speed < 4, brake: Math.abs(off) > 0.9 && car.speed > 6, left: off > 0.04, right: off < -0.04 };
    const from = { x: car.x, z: car.z };
    step(car, input, dt, world, spec);
    const e = tick(run, dt, from, car);
    if (e?.kind === "finish") return { seconds: e.seconds, miles: car.distance / METRES_PER_MILE };
    if (e?.kind === "lost") break;
  }
  return null;
}

describe("the courses", () => {
  it("are all laid out", () => {
    expect(world.missions.map((m) => m.id).sort()).toEqual([
      "convoy", "deep-woods", "far-bank", "forest-slalom", "grand-tour", "high-ridge", "hill-race",
      "ice-drift", "lakeshore-loop", "race", "ridge-run", "snowfield", "southern-shore",
    ]);
  });

  // The server refuses a claim quicker than `minSeconds` or that banked less than
  // `minMiles`, so an honest run must clear both comfortably. Lakeshore Loop is left out:
  // the straight line to its fifth flag crosses a bay, which a person drives round.
  it.each(world.missions.filter((m) => m.id !== "lakeshore-loop").map((m) => [m.id, m] as const))(
    "%s can be driven by a starter rig, slower than the limit and banking more than it asks",
    (_, m) => {
      // Snowfield needs snow gear; everything else is driven on what a starter comes with.
      const run = drive(m, m.id === "snowfield" ? { ...STOCK_LOADOUT, winter: "chains" } : STOCK_LOADOUT);
      expect(run).not.toBeNull();
      expect(run!.seconds).toBeGreaterThan(m.minSeconds);
      expect(run!.miles).toBeGreaterThan(m.minMiles * 1.4);
    },
  );
});

describe("the economy", () => {
  it("pays even a repeat run at least five times the miles it covers", () => {
    for (const m of world.missions) expect(m.repeatReward, m.id).toBeGreaterThanOrEqual(5 * miles(m));
  });

  it("pays a first finish at least two and a half times a repeat", () => {
    for (const m of world.missions) expect(m.reward, m.id).toBeGreaterThanOrEqual(2.5 * m.repeatReward);
  });

  it("puts the best rig hours of driving away, and every course's first finish together within reach of it", () => {
    const best = vehicleById("duneclaw").price;
    const fastestStarter = Math.max(...STARTERS.map((v) => v.maxSpeed)) * 3600 / METRES_PER_MILE;
    expect(best / fastestStarter).toBeGreaterThan(6);
    expect(world.missions.reduce((sum, m) => sum + m.reward, 0)).toBeGreaterThan(best);
  });
});

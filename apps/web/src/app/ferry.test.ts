import { describe, expect, it } from "vitest";
import { DOCK_REACH, PIER, dockBoard, dockLeave, fromDock, toDock } from "./dock";
import { FERRY, LAND, SAIL, ferryBase, mooredPose, sailIn, sailOut } from "./ferry";
import { buildIsland } from "./island";
import { TIDE } from "./tide";
import { buildVegas } from "./vegas";
import type { World } from "./world";

const worlds: Record<"island" | "vegas", World> = { island: buildIsland(), vegas: buildVegas() };
const STEP = 0.05;

describe.each(["island", "vegas"] as const)("the %s's dock", (id) => {
  const world = worlds[id];
  const d = world.dock!;
  const ground = (x: number, z: number) => world.height(x, z);
  const berth = fromDock(d, 0, PIER.length + FERRY.gap + FERRY.length / 2);

  it("runs a level causeway out from the shore, its road over high water, with deep water at its end", () => {
    expect(d).not.toBeNull();
    for (let lz = PIER.slope; lz <= PIER.length; lz += 2) {
      for (const lx of [-PIER.half, 0, PIER.half]) {
        const p = fromDock(d, lx, lz);
        expect(ground(p.x, p.z), `at ${lx}, ${lz}`).toBeCloseTo(d.y, 1);
      }
    }
    expect(d.y).toBeGreaterThan(d.water + 2);
    // The ferry's keel clears the bottom of its berth even at low water on the island, and
    // its raked ends the bottom under them.
    const low = d.water - (id === "island" ? TIDE.fall : 0);
    for (let lz = -FERRY.length / 2; lz <= FERRY.length / 2; lz += 1) {
      const p = fromDock(d, 0, PIER.length + FERRY.gap + FERRY.length / 2 + lz);
      const keel = Math.abs(lz) <= FERRY.body ? FERRY.draught : 0.5;
      expect(low - keel - ground(p.x, p.z), `keel at ${lz}`).toBeGreaterThan(0.3);
    }
    expect(world.waterAt(berth.x, berth.z)).toBeCloseTo(d.water, 5);
  });

  it("is somewhere a truck can drive from the camp, on stock tyres", () => {
    const board = dockBoard(d);
    const k = Math.round((board.z + 3000) / 10) * 601 + Math.round((board.x + 3000) / 10);
    expect(world.zone[k]).toBe(1);
    // And the spot a truck waits at is out on the road, its arrival spot back by the shore.
    expect(Math.abs(toDock(d, board.x, board.z).x)).toBeLessThan(PIER.half);
    const leave = dockLeave(d);
    expect(toDock(d, leave.x, leave.z).z).toBeLessThan(PIER.length / 2);
    expect(DOCK_REACH).toBeLessThan(PIER.length / 4);
  });

  it("films the way out: along the causeway, over the ramp, up the deck, and away into the haze", () => {
    const water = d.water;
    const from = { ...dockBoard(d), heading: d.heading + 0.4 };
    let last = sailOut(d, from, ground, water, 0);
    for (let t = STEP; t <= SAIL.end + 1e-9; t += STEP) {
      const f = sailOut(d, from, ground, water, t);
      if (f.truck && last.truck && f.camera.shot === last.camera.shot) expect(Math.hypot(f.truck.x - last.truck.x, f.truck.z - last.truck.z), `t ${t}`).toBeLessThan(1.2);
      expect(f.camera.from.y).toBeGreaterThan(ground(f.camera.from.x, f.camera.from.z));
      last = f;
    }
    // Aboard, on the deck, and the ramp up, before it casts off.
    const aboard = sailOut(d, from, ground, water, SAIL.rampUp[1]);
    expect(aboard.ramps[0]).toBe(0);
    expect(aboard.truck!.base).toBeCloseTo(water + FERRY.deck, 2);
    const f = mooredPose(d, water);
    expect(ferryBase(d, f, aboard.ramps, ground, aboard.truck!.x, aboard.truck!.z)).toBeCloseTo(water + FERRY.deck, 2);
    // Gone into the haze, the ferry well out from the dock, by the end.
    expect(last.haze).toBe(1);
    expect(last.truck).toBeNull();
    expect(Math.hypot(last.ferry.x - berth.x, last.ferry.z - berth.z)).toBeGreaterThan(60);
  });

  it("films the way in: out of the haze to the causeway, the ramp down, and the truck driven off to the shore", () => {
    const water = d.water;
    expect(sailIn(d, ground, water, 0).haze).toBe(1);
    let last = sailIn(d, ground, water, 0);
    for (let t = STEP; t <= LAND.end + 1e-9; t += STEP) {
      const f = sailIn(d, ground, water, t);
      if (f.camera.shot === last.camera.shot) expect(Math.hypot(f.truck!.x - last.truck!.x, f.truck!.z - last.truck!.z), `t ${t}`).toBeLessThan(1.2);
      expect(f.camera.from.y).toBeGreaterThan(ground(f.camera.from.x, f.camera.from.z));
      last = f;
    }
    expect(last.haze).toBe(0);
    expect(last.ramps[0]).toBe(1);
    const leave = dockLeave(d);
    expect(Math.hypot(last.truck!.x - leave.x, last.truck!.z - leave.z)).toBeLessThan(0.5);
    expect(Math.cos(last.truck!.heading - leave.heading)).toBeGreaterThan(0.99);
    expect(last.truck!.base).toBeCloseTo(ground(leave.x, leave.z), 1);
    // Tied up where it started from.
    expect(Math.hypot(last.ferry.x - berth.x, last.ferry.z - berth.z)).toBeLessThan(0.01);
  });
});

describe("the island's dock", () => {
  it("leaves the island as it was, but for the trees, rocks and bushes where the causeway goes", () => {
    const d = worlds.island.dock!;
    // Clear of every course, the garages, the camp and the sandbar's course.
    for (const m of worlds.island.missions) {
      for (const g of [m.start, ...m.gates]) {
        const p = toDock(d, g.x, g.z);
        expect(p.z < -20 || p.z > PIER.length + 180 || Math.abs(p.x) > 30, `${m.id}`).toBe(true);
      }
    }
    for (const s of worlds.island.sites) expect(Math.hypot(s.x - d.x, s.z - d.z)).toBeGreaterThan(60);
  });
});

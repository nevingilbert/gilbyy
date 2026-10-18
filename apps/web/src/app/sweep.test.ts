import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCityData } from "./city-streets";
import { CONVOY_MAX, lineUp } from "./convoy";
import { clearSpot, devSpots, driveCourse, spawnSpots, spotProblems, wayThrough } from "./dev";
import { buildWorldOf } from "./island";
import { lineUpAlone } from "./mission-run";
import { courseGround } from "./missions";
import { STOCK_LOADOUT, specFor } from "./shop";
import type { WorldId } from "./terrain";
import { VEHICLES } from "./vehicles";
import type { World } from "./world";
import { WORLDS } from "./worlds";

/**
 * Every world swept, as the dev panel's "Check this world" does in the browser (DevPanel.tsx),
 * though here without what only the scene puts in: the garages', the camp's and the
 * arches' colliders. Every place the game puts a truck down has room for every rig, and
 * a bot can drive every course, start to finish.
 */

const IDS = Object.keys(WORLDS) as WorldId[];
/** The bot's rig: one that can go anywhere a course does, the rivers and the snow included. */
const KITTED = specFor("summit", { ...STOCK_LOADOUT, tyres: "big33", snorkel: "snorkel", winter: "chains" });

beforeAll(async () => {
  await loadCityData();
}, 60000);

describe.each(IDS)("%s, swept", (id) => {
  // One world at a time, let go once its checks are done: the city alone is a lot to hold.
  let world: World;
  beforeAll(() => {
    world = buildWorldOf(id);
  }, 60000);
  afterAll(() => {
    world = undefined as unknown as World;
  });

  it("names everywhere worth jumping to: the camp, each garage, the café, the way out, every course and easter egg", () => {
    const names = devSpots(world).map((s) => s.name);
    expect(names[0]).toBe("Camp");
    expect(names.filter((n) => n.startsWith("Garage")).length).toBe(world.sites.length);
    expect(names).toContain("Café");
    expect(names.filter((n) => /^(Course|Convoy|Race): /.test(n)).length).toBe(world.missions.length);
    expect(names.filter((n) => n.startsWith("Easter egg")).length).toBe(world.landmarks.length);
    expect(names.some((n) => /^(Airstrip|Station|Dock|Helipad)/.test(n))).toBe(true);
  });

  it("puts a truck down only where every rig has room: the camp, the tents, the trips and every course's line-up", () => {
    const problems = new Set<string>();
    for (const v of VEHICLES) {
      const spec = specFor(v.id, STOCK_LOADOUT);
      for (const s of spawnSpots(world)) for (const p of spotProblems(world, s, spec)) problems.add(`${s.name} for the ${v.id}: ${p.why}`);
    }
    expect([...problems]).toEqual([]);
  });

  it("finds somewhere clear near anywhere a truck is jumped to", () => {
    for (const s of devSpots(world)) {
      const at = clearSpot(world, s.x, s.z, KITTED);
      expect(at, s.name).not.toBeNull();
      expect(spotProblems(world, { ...s, ...at! }, KITTED), s.name).toEqual([]);
    }
  });

  it("keeps every course out of the campground: its line-up, its gates and the line between them", () => {
    // A pitch's tent, table and stools stand within five metres of it, and they're the
    // scene's (campground-model.ts), not in the world this test builds: so by the pitches.
    const near = (x: number, z: number) => Math.min(...world.pitches.map((p) => Math.hypot(p.x - x, p.z - z)));
    const into: string[] = [];
    for (const m of world.missions) {
      const waits = m.crew > 1 ? Array.from({ length: CONVOY_MAX }, (_, slot) => lineUp(m, slot)) : [lineUpAlone(m)];
      for (const w of waits) if (near(w.x, w.z) < 8) into.push(`${m.name}'s line-up`);
      let from: { x: number; z: number } = m.start;
      m.gates.forEach((g, i) => {
        const n = Math.ceil(Math.hypot(g.x - from.x, g.z - from.z) / 2);
        for (let k = 0; k <= n; k++) {
          if (near(from.x + ((g.x - from.x) * k) / n, from.z + ((g.z - from.z) * k) / n) < 7) {
            into.push(`${m.name} on the way to gate ${i + 1}`);
            break;
          }
        }
        from = g;
      });
    }
    expect([...new Set(into)]).toEqual([]);
  });

  // A truck comes to each gate from the last one, or to the first from the arch: met more
  // than 60 degrees off square, its flags stand nearly in line along the way, or with the
  // way in on their far side, and driving through them doesn't count.
  it("meets every course's gates within 60 degrees of square on the way in to them", () => {
    const askew: string[] = [];
    for (const m of world.missions) {
      const path = [m.start, ...m.gates];
      m.gates.forEach((g, i) => {
        // From the last point that isn't on the same spot, for a course that ends on its last point twice.
        let k = i;
        while (k > 0 && Math.hypot(path[k].x - g.x, path[k].z - g.z) < 0.01) k--;
        const into = Math.atan2(g.x - path[k].x, g.z - path[k].z);
        const off = Math.abs(Math.atan2(Math.sin(g.heading - into), Math.cos(g.heading - into)));
        if (off > Math.PI / 3) askew.push(`${m.id}, gate ${i + 1} at ${g.x.toFixed(0)}, ${g.z.toFixed(0)}: ${Math.round((off * 180) / Math.PI)} degrees off`);
      });
    }
    expect(askew).toEqual([]);
  });

  it("can be driven round every course, start to finish", () => {
    const stuck = world.missions
      .map((m) => driveCourse(world, m, KITTED))
      .filter((r) => r.stuck)
      .map((r) => `${r.name}: ${r.stuck!.why}, at ${r.stuck!.x.toFixed(0)}, ${r.stuck!.z.toFixed(0)}, ${r.passed} of ${r.of} gates in ${r.seconds.toFixed(0)} s`);
    expect(stuck).toEqual([]);
  });

  // San Francisco's own.
  it.runIf(id === "city")("finds somewhere clear in the corners of the city's square, not only in a circle round its middle", () => {
    // Dry ground further out than the circle that fits in the square, by more than the search reaches.
    const corners: { x: number; z: number }[] = [];
    for (let x = -world.limit + 40; x <= world.limit - 40; x += 40) {
      for (let z = -world.limit + 40; z <= world.limit - 40; z += 40) {
        if (Math.hypot(x, z) > world.limit + 80 && world.height(x, z) > world.waterAt(x, z) + 1) corners.push({ x, z });
      }
    }
    expect(corners.length).toBeGreaterThan(20);
    const found = corners.filter((p) => clearSpot(world, p.x, p.z, KITTED));
    expect(found.length / corners.length).toBeGreaterThan(0.8);
    for (const p of found.slice(0, 20)) expect(spotProblems(world, { name: "a corner", heading: 0, ...clearSpot(world, p.x, p.z, KITTED)! }, KITTED)).toEqual([]);
  });

  it.runIf(id === "city")("finds a way under the Bay Bridge on the Embarcadero, not up on its deck", () => {
    // From the waterfront to where its approach crosses over, eighteen metres up.
    const deck = world.height(1675.7, -797);
    const road = courseGround((x, z, above) => world.height(x, z, above), { start: { x: 1656.8, z: -837.4, heading: 0.6 }, gates: [{ x: 1675.7, z: -797, heading: 0.3, width: 15 }] });
    expect(deck - road.gates[0]).toBeGreaterThan(10);
    expect(Math.abs(road.gates[0] - road.start)).toBeLessThan(2);
    const way = wayThrough(world, { x: 1656.8, z: -837.4, y: road.start }, { x: 1684.1, z: -752.9 }, KITTED);
    expect(way).not.toBeNull();
  });

  it.runIf(id === "city")("starts the Embarcadero far enough along for ten friends to line up on the street", () => {
    const m = world.missions.find((q) => q.id === "embarcadero")!;
    expect(Math.hypot(m.start.x - 931.6, m.start.z + 1660.1)).toBeGreaterThan(10);
  });
});

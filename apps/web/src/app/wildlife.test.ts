import { describe, expect, it } from "vitest";
import { fieldDist } from "./airport";
import { buildIsland } from "./island";
import {
  ALARM_SPEED, SPECIES, habitat, passable, placeHerds, reach, speciesIn, stepWildlife, type Herd, type SpeciesId, type Threat,
} from "./wildlife";
import { buildWorld, sampleGrid, WORLD, type World } from "./world";

const valley = buildWorld();
const island = buildIsland();
const STEP = 1 / 30;

/** A fresh herd of this species, the first one placed. */
const herdOf = (world: World, id: SpeciesId) => placeHerds(world).find((h) => h.species === id)!;
/** Runs one herd for `seconds`, with whatever `threats` says is about at each moment. */
function run(world: World, herd: Herd, seconds: number, threats: (t: number) => Threat[] = () => [], from = 0) {
  for (let t = from; t < from + seconds; t += STEP) stepWildlife(world, [herd], threats(t), herd.home, STEP, t);
}

describe("where the animals live", () => {
  const herds = { valley: placeHerds(valley), island: placeHerds(island) };

  it("gives each world its own animals", () => {
    expect(speciesIn("valley")).toEqual(["deer", "hare", "reindeer", "duck"]);
    expect(speciesIn("island")).toEqual(["crab", "gull", "boar", "macaw", "dolphin"]);
    for (const world of [valley, island]) {
      const mine = herds[world.id];
      expect(mine.every((h) => SPECIES[h.species].world === world.id)).toBe(true);
      // Each kind finds room for most of its herds.
      for (const id of speciesIn(world.id)) expect(mine.filter((h) => h.species === id).length).toBeGreaterThan(SPECIES[id].herds * 0.8);
    }
  });

  it("starts them in the same places every time", () => {
    const again = placeHerds(valley);
    expect(again.map((h) => h.home)).toEqual(herds.valley.map((h) => h.home));
    expect(again[5].animals.map((a) => [a.x, a.z, a.tone])).toEqual(herds.valley[5].animals.map((a) => [a.x, a.z, a.tone]));
  });

  it("puts every herd where its kind lives, clear of everything players drive to", () => {
    for (const world of [valley, island]) {
      for (const h of herds[world.id]) {
        const { x, z } = h.home;
        expect(habitat(world, h.species, x, z)).toBe(true);
        expect(sampleGrid(world.siteDist, x, z)).toBeGreaterThan(45);
        expect(sampleGrid(world.campDist, x, z)).toBeGreaterThan(20);
        expect(fieldDist(world.airport, x, z)).toBeGreaterThan(80);
        for (const l of world.landmarks) expect(Math.hypot(l.x - x, l.z - z)).toBeGreaterThan(40);
        // Those on foot start on ground they can stand on.
        if (SPECIES[h.species].way === "walk" || SPECIES[h.species].way === "perch")
          for (const a of h.animals) expect(passable(world, h.species, a.x, a.z)).toBe(true);
      }
    }
    const at = (world: World, id: SpeciesId) => herds[world.id].filter((h) => h.species === id).map((h) => h.home);
    for (const p of at(valley, "reindeer")) expect(sampleGrid(valley.snow, p.x, p.z)).toBeGreaterThan(0.8);
    for (const p of at(valley, "deer")) expect(sampleGrid(valley.snow, p.x, p.z)).toBeLessThan(0.1);
    for (const p of at(valley, "duck")) {
      expect(valley.waterAt(p.x, p.z)).toBe(WORLD.water);
      expect(valley.waterAt(p.x, p.z) - valley.height(p.x, p.z)).toBeGreaterThan(2.5);
    }
    for (const p of at(island, "crab")) expect(island.height(p.x, p.z)).toBeLessThan(1.6);
    for (const p of at(island, "dolphin")) expect(island.height(p.x, p.z)).toBeLessThan(-4);
  });

  it("has something in front of the camp for the opening shot", () => {
    const inFront = (world: World, id: SpeciesId, within: number) =>
      herds[world.id].some((h) => {
        if (h.species !== id) return false;
        const [dx, dz] = [h.home.x - world.camp.x, h.home.z - world.camp.z];
        return Math.hypot(dx, dz) < within && dx * Math.sin(world.camp.heading) + dz * Math.cos(world.camp.heading) > 0;
      });
    expect(inFront(valley, "deer", 300)).toBe(true);
    expect(inFront(island, "gull", 120)).toBe(true);
    expect(inFront(island, "dolphin", 450)).toBe(true);
  });
});

describe("how they behave", () => {
  it("lets a parked truck watch, and runs from one coming at it", () => {
    const sp = SPECIES.deer;
    expect(reach(sp, 0)).toBe(sp.calm);
    expect(reach(sp, ALARM_SPEED * 2)).toBe(sp.wary);
    const herd = herdOf(valley, "deer");
    const parked: Threat = { x: herd.home.x + 30, z: herd.home.z, speed: 0, heading: 0 };
    run(valley, herd, 8, () => [parked]);
    expect(herd.animals.every((a) => a.state !== "flee")).toBe(true);
    // The same truck, 40 m off and driving at them: they all go, even those it isn't nearest.
    const coming: Threat = { x: herd.home.x + 40, z: herd.home.z, speed: 15, heading: -Math.PI / 2 };
    run(valley, herd, 0.3, () => [coming]);
    expect(herd.animals.every((a) => a.state === "flee")).toBe(true);
  });

  for (const id of ["deer", "hare", "reindeer", "boar"] as SpeciesId[]) {
    it(`gets a ${id} out of the way of a truck faster than it can run`, () => {
      for (const speed of [17, 30]) {
        for (const [i, heading] of [0, 1.1, 2.6, 4].entries()) {
          const world = SPECIES[id].world === "valley" ? valley : island;
          const herd = herdOf(world, id);
          herd.animals = [herd.animals[0]];
          const a = herd.animals[0];
          [a.x, a.z] = [herd.home.x, herd.home.z];
          // Dead at it, from 80 m, and in one case off a little to the side.
          const off = i === 3 ? 1.5 : 0;
          const [fx, fz] = [Math.sin(heading), Math.cos(heading)];
          const start = { x: a.x - fx * 80 + fz * off, z: a.z - fz * 80 - fx * off };
          let nearest = Infinity;
          run(world, herd, 160 / speed, (t) => {
            const truck = { x: start.x + fx * speed * t, z: start.z + fz * speed * t, speed, heading };
            nearest = Math.min(nearest, Math.hypot(a.x - truck.x, a.z - truck.z));
            return [truck];
          });
          expect(nearest).toBeGreaterThan(3);
        }
      }
    });
  }

  it("has a crab dig in when a truck comes over it, and come out again after", () => {
    const herd = herdOf(island, "crab");
    const a = herd.animals[0];
    const truck: Threat = { x: a.x + 3, z: a.z, speed: 10, heading: 0 };
    run(island, herd, 1, () => [truck]);
    expect(a.state).toBe("hide");
    expect(a.tuck).toBe(1);
    run(island, herd, 6, () => [], 1);
    expect(a.state).not.toBe("hide");
  });

  for (const id of ["duck", "gull"] as SpeciesId[]) {
    it(`has ${id}s fly off together and settle again where they live`, () => {
      const world = SPECIES[id].world === "valley" ? valley : island;
      const herd = herdOf(world, id);
      const a = herd.animals[0];
      const truck: Threat = { x: a.x + 8, z: a.z, speed: 8, heading: -Math.PI / 2 };
      run(world, herd, 1, () => [truck]);
      expect(herd.animals.every((b) => b.state === "fly")).toBe(true);
      run(world, herd, 2, () => [], 1);
      expect(Math.max(...herd.animals.map((b) => b.y - world.height(b.x, b.z)))).toBeGreaterThan(3);
      run(world, herd, 60, () => [], 3);
      for (const b of herd.animals) {
        expect(["graze", "walk"]).toContain(b.state);
        expect(passable(world, id, b.x, b.z)).toBe(true);
        expect(Math.hypot(b.x - herd.home.x, b.z - herd.home.z)).toBeLessThan(SPECIES[id].range + 20);
      }
    });
  }

  it("keeps each kind on its own ground as it wanders, and drifts home after a fright", () => {
    for (const world of [valley, island]) {
      for (const id of speciesIn(world.id)) {
        const sp = SPECIES[id];
        if (sp.way !== "walk" && sp.way !== "perch") continue;
        const herd = herdOf(world, id);
        const a = herd.animals[0];
        // A scare to start, then three quiet minutes.
        const truck: Threat = { x: a.x + 5, z: a.z, speed: 20, heading: -Math.PI / 2 };
        run(world, herd, 0.5, () => [truck]);
        run(world, herd, 180, () => [], 0.5);
        for (const b of herd.animals) {
          expect(passable(world, id, b.x, b.z)).toBe(true);
          expect(Math.hypot(b.x - herd.home.x, b.z - herd.home.z)).toBeLessThan(sp.range + 60);
        }
      }
    }
  });

  it("keeps dolphins out at sea, leaping now and then, and macaws low enough to be seen", () => {
    const pod = herdOf(island, "dolphin");
    const flock = herdOf(island, "macaw");
    let leapt = false;
    for (let t = 0; t < 120; t += 0.25) {
      stepWildlife(island, [pod, flock], [], pod.home, 0.25, t);
      stepWildlife(island, [flock], [], flock.home, 0.25, t);
      for (const d of pod.animals) {
        expect(island.height(d.x, d.z)).toBeLessThan(-1.5);
        if (d.y > WORLD.water + 0.5) leapt = true;
      }
      for (const m of flock.animals) {
        const above = m.y - island.height(m.x, m.z);
        // Below the chase camera, which is about 8.5 m over the truck, and over the treetops' trunks.
        expect(above).toBeGreaterThan(2.5);
        expect(above).toBeLessThan(8);
      }
    }
    expect(leapt).toBe(true);
  });

  it("only moves herds near the truck", () => {
    const herd = herdOf(valley, "reindeer");
    const before = herd.animals.map((a) => [a.x, a.z, a.state]);
    const far = { x: herd.home.x + 2000, z: herd.home.z };
    for (let t = 0; t < 30; t += STEP) stepWildlife(valley, [herd], [], far, STEP, t);
    expect(herd.active).toBe(false);
    expect(herd.animals.map((a) => [a.x, a.z, a.state])).toEqual(before);
  });
});

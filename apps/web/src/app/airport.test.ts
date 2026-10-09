import { describe, it, expect } from "vitest";
import { APRON, FIELD_CLEAR, RUNWAY, fieldDist, fromField, inFunnel, toField } from "./airport";
import { boardSpot, leaveSpot, planeObstacles, standPose } from "./flight";
import { ISLAND, buildIsland, buildWorldOf, islandFire, makeIsland } from "./island";
import { makeCar, noInput, step } from "./physics";
import { STOCK_LOADOUT, specFor } from "./shop";
import { buildWorld, CELL, HALF, ROW, WORLD, type World } from "./world";

const valley = buildWorld();
const island = buildIsland();
const zoneOf = (w: World, x: number, z: number) => w.zone[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];
const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Points all over the paving of a world's airstrip. */
function paving(w: World) {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z <= RUNWAY.length; z += 10) for (const x of [-RUNWAY.half, 0, RUNWAY.half]) out.push(fromField(w.airport, x, z));
  for (let z = -APRON.back; z <= APRON.front; z += 8) for (let x = -APRON.half; x <= APRON.half; x += 8) out.push(fromField(w.airport, x, z));
  return out;
}

describe.each([["valley", valley], ["island", island]] as const)("the airstrip in the %s", (_, w) => {
  it("is level, dry, and where the truck can get to it", () => {
    for (const p of paving(w)) {
      expect(Math.abs(w.height(p.x, p.z) - w.airport.y)).toBeLessThan(0.05);
      expect(w.height(p.x, p.z)).toBeGreaterThan(w.waterAt(p.x, p.z) + 1);
      expect(zoneOf(w, p.x, p.z)).toBeGreaterThan(0);
    }
  });

  it("has nothing growing or lying on it, and no trees under the way in", () => {
    for (const s of [...w.trees, ...w.rocks, ...w.bushes]) expect(fieldDist(w.airport, s.x, s.z)).toBeGreaterThanOrEqual(FIELD_CLEAR);
    expect(w.trees.some((t) => inFunnel(w.airport, t.x, t.z))).toBe(false);
  });

  it("maps field space onto the ground and back", () => {
    const p = fromField(w.airport, 7, 120);
    const back = toField(w.airport, p.x, p.z);
    expect(back.x).toBeCloseTo(7, 9);
    expect(back.z).toBeCloseTo(120, 9);
    // Down the runway is the way the plane points.
    const far = fromField(w.airport, 0, RUNWAY.length);
    expect(Math.atan2(far.x - w.airport.x, far.z - w.airport.z)).toBeCloseTo(Math.atan2(Math.sin(w.airport.heading), Math.cos(w.airport.heading)), 9);
  });

  it("keeps the plane solid, with open apron behind its tail to board from", () => {
    const stand = standPose(w.airport);
    expect(w.obstaclesNear(stand.x, stand.z).some((o) => apart(o, stand) < 2 && o.h === Infinity)).toBe(true);
    for (const spot of [boardSpot(w.airport), leaveSpot(w.airport)]) {
      expect(fieldDist(w.airport, spot.x, spot.z)).toBe(0);
      expect(w.obstaclesNear(spot.x, spot.z).some((o) => apart(o, spot) < o.r + 3)).toBe(false);
    }
    // Driving at the tail from the apron, the widest rig stops short of the fuselage.
    const spec = specFor("duneclaw", STOCK_LOADOUT);
    const from = leaveSpot(w.airport);
    const car = makeCar(w, from.x, from.z, w.airport.heading, spec);
    for (let i = 0; i < 120 * 8; i++) step(car, { ...noInput(), gas: true }, 1 / 120, w, spec);
    expect(planeObstacles(w.airport).every((o) => apart(o, car) > o.r)).toBe(true);
    expect(toField(w.airport, car.x, car.z).z).toBeLessThan(4);
  });

  it("is the same on every load", () => {
    const again = buildWorldOf(w.id);
    expect(again.airport).toEqual(w.airport);
    expect(again.trees.length).toBe(w.trees.length);
  });
});

describe("the valley's airstrip", () => {
  const a = valley.airport;

  it("is over the river, where only the snorkel gets you", () => {
    for (const p of paving(valley)) expect(zoneOf(valley, p.x, p.z)).toBe(2);
    expect(zoneOf(valley, boardSpot(a).x, boardSpot(a).z)).toBe(2);
  });

  it("is well away from the garages, the camp and the courses", () => {
    for (const s of valley.sites) expect(apart(s, a)).toBeGreaterThan(420);
    expect(apart(valley.start, a)).toBeGreaterThan(1500);
    for (const m of valley.missions) for (const g of [m.start, ...m.gates]) expect(fieldDist(a, g.x, g.z)).toBeGreaterThan(80);
  });

  it("is hidden: banked round its sides and its closed end, and screened with pines", () => {
    // Forty metres out from the paving, the ground stands well above the field.
    const rim: number[] = [];
    for (let z = -APRON.back; z <= 100; z += 20) for (const x of [-APRON.half - 40, APRON.half + 40]) rim.push(fromFieldHeight(x, z));
    for (let x = -APRON.half; x <= APRON.half; x += 20) rim.push(fromFieldHeight(x, -APRON.back - 40));
    expect(Math.min(...rim)).toBeGreaterThan(a.y + 4);
    expect(rim.reduce((s, h) => s + h, 0) / rim.length).toBeGreaterThan(a.y + 8);
    // And it's thick with trees, none of them a golden larch.
    const screen = valley.trees.filter((t) => fieldDist(a, t.x, t.z) < 84);
    expect(screen.length).toBeGreaterThan(900);
    expect(screen.filter((t) => t.kind === "pine" && t.tone >= 0.16).length / screen.length).toBeGreaterThan(0.9);
    for (const t of screen) expect(t.y).toBeCloseTo(valley.height(t.x, t.z) - 0.3, 4);
  });

  it("opens toward the mountains, not the lake", () => {
    const far = fromField(a, 0, RUNWAY.length);
    expect(Math.hypot(far.x, far.z)).toBeGreaterThan(Math.hypot(a.x, a.z));
    expect(Math.hypot(far.x, far.z)).toBeLessThan(WORLD.wallStart);
  });

  function fromFieldHeight(lx: number, lz: number) {
    const p = fromField(a, lx, lz);
    return valley.height(p.x, p.z);
  }
});

describe("the island", () => {
  const shape = makeIsland(20261009);

  it("has sea all round it, and no mountains", () => {
    for (let k = 0; k < 24; k++) {
      const [x, z] = [Math.sin(k) * 1950, Math.cos(k) * 1950];
      expect(island.height(x, z)).toBeLessThan(-20);
      expect(island.waterAt(x, z)).toBe(WORLD.water);
    }
    expect(island.heights.reduce((m, h) => Math.max(m, h), 0)).toBeLessThan(150);
    expect(island.sea).toBe(true);
    expect(valley.sea).toBe(false);
  });

  it("runs from the water up a beach, through dunes, into jungle in the middle", () => {
    for (let k = 0; k < 24; k++) {
      const bearing = (k / 24) * Math.PI * 2;
      const shore = shape.shoreAlong(bearing);
      const at = (r: number) => ({ x: Math.sin(bearing) * r, z: Math.cos(bearing) * r });
      expect(shape.inland(at(shore).x, at(shore).z)).toBeCloseTo(0, 2);
      // The beach: just above the water and nearly flat.
      const beach = shape.height(at(shore - 60).x, at(shore - 60).z);
      expect(beach).toBeGreaterThan(0.3);
      expect(beach).toBeLessThan(4.5);
      // Jungle well inside, none on the sand.
      expect(shape.jungle(at(400).x, at(400).z)).toBe(1);
      expect(shape.jungle(at(shore - 200).x, at(shore - 200).z)).toBe(0);
    }
    // Dunes between: the ground behind the beach is hummocky sand, higher than the beach.
    const dunes = island.heights.filter((h, k) => island.forest[k] === 0 && h > 6).length;
    expect(dunes * CELL * CELL).toBeGreaterThan(1.5e6);
    // And the jungle is the high ground.
    expect(island.height(0, 0)).toBeGreaterThan(60);
  });

  it("grows palms on the sand and a canopy in the jungle, and nothing in the sea", () => {
    const inJungle = island.trees.filter((t) => Math.hypot(t.x, t.z) < ISLAND.jungle - 200);
    expect(inJungle.length).toBeGreaterThan(8000);
    expect(inJungle.filter((t) => t.kind === "canopy").length / inJungle.length).toBeGreaterThan(0.6);
    const onSand = island.trees.filter((t) => shape.jungle(t.x, t.z) === 0);
    expect(onSand.length).toBeGreaterThan(500);
    expect(onSand.every((t) => t.kind === "palm")).toBe(true);
    expect(island.trees.every((t) => t.kind === "palm" || t.kind === "canopy")).toBe(true);
    expect(island.trees.every((t) => island.height(t.x, t.z) > 1)).toBe(true);
    // The open beach is left clear to drive along.
    expect(island.trees.some((t) => shape.inland(t.x, t.z) < 60)).toBe(false);
  });

  it("pitches thirty tents in a row on the beach, level and clear, each facing the sea", () => {
    expect(island.pitches).toHaveLength(30);
    const bays = island.pitches.map((p) => p.parking);
    const hs = bays.map((b) => island.height(b.x, b.z));
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05);
    expect(hs[0]).toBeCloseTo(ISLAND.campY, 1);
    for (const p of island.pitches) {
      const b = p.parking;
      expect(island.obstaclesNear(b.x, b.z).some((o) => apart(o, b) < 10)).toBe(false);
      expect(zoneOf(island, b.x, b.z)).toBe(1);
      expect(shape.inland(p.x, p.z)).toBeGreaterThan(60);
      expect(shape.inland(p.x, p.z)).toBeLessThan(ISLAND.beach + 5);
      // Straight ahead is the water, and behind is higher ground.
      const ahead = (d: number) => island.height(b.x + Math.sin(b.heading) * d, b.z + Math.cos(b.heading) * d);
      expect(ahead(160)).toBeLessThan(0);
      expect(ahead(-150)).toBeGreaterThan(ISLAND.campY + 1);
      expect(apart(b, p)).toBeCloseTo(4, 6);
    }
    // Next to each other, about a pitch apart.
    for (let i = 1; i < 30; i++) expect(apart(island.pitches[i], island.pitches[i - 1])).toBeCloseTo(12.5, 0);
    expect(island.start).toEqual(bays[0]);
    const fire = islandFire(island);
    expect(island.height(fire.x, fire.z)).toBeGreaterThan(0.6);
    expect(island.obstaclesNear(fire.x, fire.z).some((o) => apart(o, fire) < 12)).toBe(false);
  });

  it("has three garages, one in each ring, each on level ground a drive from the tents", () => {
    expect(island.sites.map((s) => s.style)).toEqual(["shack", "outpost", "lodge"]);
    for (const s of island.sites) {
      const hs = [0, 1, 2, 3, 4, 5].map((k) => island.height(s.x + Math.cos(k) * 15, s.z + Math.sin(k) * 15));
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05);
      expect(zoneOf(island, s.x, s.z)).toBe(1);
      expect(apart(s, island.camp)).toBeGreaterThan(500);
      expect([...island.trees, ...island.rocks].some((t) => apart(t, s) < 20)).toBe(false);
      for (const o of island.sites) if (o !== s) expect(apart(s, o)).toBeGreaterThan(600);
    }
  });

  it("has a course in each ring, with a clear line and a way in through the trees", () => {
    expect(island.missions.map((m) => m.id)).toEqual(["beach-run", "dune-dash", "jungle-loop"]);
    for (const m of island.missions) {
      const pts = [m.start, ...m.gates];
      for (let i = 1; i < pts.length; i++) {
        for (let k = 0; k <= 20; k++) {
          const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 20;
          const z = pts[i - 1].z + ((pts[i].z - pts[i - 1].z) * k) / 20;
          expect(island.height(x, z)).toBeGreaterThan(0.4);
          expect(island.obstaclesNear(x, z).some((o) => Math.hypot(o.x - x, o.z - z) < 4)).toBe(false);
        }
      }
      expect(m.crew).toBe(1);
      expect(apart(m.start, island.camp)).toBeGreaterThan(200);
    }
    // Two tracks cut out of the jungle: from the lodge and from the jungle course's start.
    expect(island.roads).toHaveLength(2);
    for (const road of island.roads) {
      for (let i = 0; i < road.xs.length; i++) expect(island.obstaclesNear(road.xs[i], road.zs[i]).some((o) => Math.hypot(o.x - road.xs[i], o.z - road.zs[i]) < 4)).toBe(false);
    }
  });

  it("can be driven all over on stock tyres", () => {
    const land = island.heights.reduce((n, h) => n + (h > 0.5 ? 1 : 0), 0);
    const reachable = island.heights.reduce((n, h, k) => n + (h > 0.5 && island.zone[k] === 1 ? 1 : 0), 0);
    expect(reachable / land).toBeGreaterThan(0.995);
    expect(zoneOf(island, island.airport.x, island.airport.z)).toBe(1);
    expect(island.slipAt(0, 0)).toBe(0);
  });

  it("has no railway, rivers or easter eggs", () => {
    expect(island.track.xs).toHaveLength(0);
    expect(island.rivers).toHaveLength(0);
    expect(island.landmarks).toHaveLength(0);
    expect(island.id).toBe("island");
    expect(valley.id).toBe("valley");
  });

  it("puts its airstrip along the back of the beach, far from the tents", () => {
    const a = island.airport;
    expect(a.y).toBeLessThan(5);
    expect(apart(a, island.camp)).toBeGreaterThan(1500);
    for (const p of paving(island)) expect(shape.jungle(p.x, p.z)).toBe(0);
  });
});

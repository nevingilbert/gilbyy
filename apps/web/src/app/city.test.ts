import { beforeAll, describe, expect, it } from "vitest";
import { CABLE_CAR, CABLE_CARS, CABLE_SPEED, cableCars, cableCycle, cableRun } from "./cable-car";
import { LANDMARK_FOOTPRINT, buildCity, footprintPoints, inCrooked, kerbAt, type CityWorld } from "./city";
import { deckPoint } from "./city-bridges";
import { fogAt } from "./city-model";
import { SIDEWALK, STREET_WIDTH, loadCityData, toGame } from "./city-streets";
import { makeCar, step } from "./physics";
import { BED, carsOn, linePoint } from "./rail";
import { STOCK_LOADOUT, specFor } from "./shop";
import { vehicleById } from "./vehicles";
import { placeHerds, speciesIn } from "./wildlife";
import { sampleGrid } from "./world";

let city: CityWorld;
// The city's ground and streets are fetched on their own (ADR 0022).
beforeAll(async () => {
  await loadCityData();
  city = buildCity();
}, 30000);

describe("San Francisco", () => {
  it("is laid on the real street map, 1:2.5 across, its corners where the streets meet", () => {
    const at = (a: string, b: string, lon: number, lat: number) => {
      const c = city.city.graph.corner(a, b);
      expect(c, `${a} & ${b}`).not.toBeNull();
      const p = toGame(lon, lat);
      expect(Math.hypot(c!.x - p.x, c!.z - p.z), `${a} & ${b}`).toBeLessThan(25);
    };
    at("Powell St", "Geary St", -122.408, 37.7873);
    at("Hyde St", "Beach St", -122.4205, 37.8065);
    at("Pennsylvania Ave", "22nd St", -122.393, 37.7576);
    // The whole city fits, its edge a square, and everything you drive to is inside it.
    expect(city.square).toBe(true);
    const spots = [city.camp, city.cafe, ...city.sites, city.station!.board, city.station!.leave, ...city.missions.flatMap((m) => [m.start, ...m.gates])];
    for (const p of spots) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(city.limit - 20);
  });

  it("keeps its buildings off the streets and clear of the camp, the garages and the railway", () => {
    const { buildings, kerb } = city.city;
    expect(buildings.length).toBeGreaterThan(20000);
    for (let i = 0; i < buildings.length; i += 5) {
      const b = buildings[i];
      expect(kerbAt(kerb, b.x, b.z)).toBeGreaterThan(0);
      expect(sampleGrid(city.campDist, b.x, b.z)).toBeGreaterThan(8);
      expect(sampleGrid(city.siteDist, b.x, b.z)).toBeGreaterThan(12);
      expect(sampleGrid(city.trackDist, b.x, b.z)).toBeGreaterThan(6);
    }
  });

  it("stands its landmarks back off the streets and their pavements, solid where each is drawn", () => {
    const { kerb, landmarks, walls } = city.city;
    const onStreet: string[] = [];
    for (const l of landmarks) {
      const f = LANDMARK_FOOTPRINT[l.kind];
      if (!f) continue;
      // The walls are where the model is: both go by the landmark's own spot and turn.
      expect(walls.distance(l.x, l.z), l.kind).toBeLessThan(-1);
      const on = footprintPoints(l.rot, f, 0.5).find((p) => kerbAt(kerb, l.x + p.x, l.z + p.z) < SIDEWALK);
      if (on) onStreet.push(`the ${l.kind} at ${(l.x + on.x).toFixed(0)}, ${(l.z + on.z).toFixed(0)}`);
    }
    expect(onStreet).toEqual([]);
  });

  it("leaves the Embarcadero open past Pier 39, which runs out over the water from it", () => {
    const { walls, streets, landmarks } = city.city;
    const pier = landmarks.find((l) => l.kind === "pier39")!;
    let near = 0;
    for (const s of streets.filter((q) => q.name === "The Embarcadero")) {
      for (let k = 0; k < s.xs.length; k++) {
        if (Math.hypot(s.xs[k] - pier.x, s.zs[k] - pier.z) > 160) continue;
        near++;
        // Nothing on the road, and the pier on the bay side of it.
        expect(walls.distance(s.xs[k], s.zs[k]), `at ${s.xs[k].toFixed(0)}, ${s.zs[k].toFixed(0)}`).toBeGreaterThan(STREET_WIDTH[s.cls] / 2);
        expect(pier.z).toBeLessThan(s.zs[k] - 30);
      }
    }
    expect(near).toBeGreaterThan(4);
    // Its deck over the water.
    expect(pier.y).toBeGreaterThan(city.waterAt(pier.x, pier.z) + 1);
  });

  it("stands Fort Point under the Golden Gate's deck, as it is: a truck up on the bridge passes over it", () => {
    const fort = city.city.landmarks.find((l) => l.kind === "fortPoint")!;
    const gg = city.city.decks.find((d) => d.name === "golden-gate")!;
    let over = 0;
    for (let s = 0; s < gg.length; s += 2) {
      const p = deckPoint(gg, s);
      if (Math.hypot(p.x - fort.x, p.z - fort.z) > 40) continue;
      for (const side of [-6, 0, 6]) {
        const [x, z] = [p.x + p.fz * side, p.z - p.fx * side];
        for (const o of city.obstaclesNear(x, z).filter((q) => q.r >= 25 && q.bottom === undefined)) {
          over++;
          // Under a truck on the deck, and over the fort's own walls, so one on the ground runs into them.
          expect(o.top!).toBeLessThan(p.y - 2);
          expect(o.top!).toBeGreaterThan(fort.y + 14);
        }
      }
    }
    expect(over).toBeGreaterThan(0);
  });

  it("has the train at Fourth and King standing solid at its platform, with room beside it and past it", () => {
    const st = city.station!;
    for (const c of carsOn(st.line, st.head, st.facing)) {
      expect(city.obstaclesNear(c.x, c.z).some((o) => o.h > 5 && Math.hypot(o.x - c.x, o.z - c.z) < o.r), c.kind).toBe(true);
    }
    // Where a truck waits to board, and where it's left after a trip, there's nothing within a truck's length.
    for (const p of [st.board, st.leave]) expect(city.obstaclesNear(p.x, p.z).some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 4)).toBe(false);
  });

  it("paves the bridges' decks, so the racing car is as quick across the Golden Gate as along a street", () => {
    for (const d of city.city.decks) for (let i = 0; i < d.xs.length; i++) expect(city.pavedAt!(d.xs[i], d.zs[i]), `${d.name}, ${d.s[i]} m along`).toBe(true);
    const gg = city.city.decks.find((d) => d.name === "golden-gate")!;
    const spec = specFor("slipstream", STOCK_LOADOUT);
    const p = deckPoint(gg, 150);
    const car = makeCar(city, p.x, p.z, Math.atan2(p.fx, p.fz), spec);
    for (let t = 0; t < 12; t += 1 / 60) step(car, { left: false, right: false, gas: true, brake: false }, 1 / 60, city, spec);
    expect(city.city.deckIndex.roadAt(car.x, car.z)).not.toBeNull();
    expect(car.speed).toBeGreaterThan(vehicleById("slipstream").maxSpeed * 0.95);
  });

  it("carries a truck across the Golden Gate, high over the water, and lets it pass under", () => {
    const gg = city.city.decks.find((d) => d.name === "golden-gate")!;
    const mid = deckPoint(gg, gg.length / 2);
    const deck = gg.ys[Math.round(gg.ys.length / 2)];
    // Up on the deck it's the deck; down in the water, the bottom of the strait.
    expect(city.height(mid.x, mid.z, deck)).toBeCloseTo(deck, 0);
    expect(city.height(mid.x, mid.z, 0)).toBeLessThan(0);
    expect(deck).toBeGreaterThan(30);
    // Its railings stop a truck on the deck, not one passing underneath.
    const side = { x: mid.x + mid.fz * gg.half, z: mid.z - mid.fx * gg.half };
    const rails = city.obstaclesNear(side.x, side.z).filter((o) => o.bottom !== undefined);
    expect(rails.length).toBeGreaterThan(0);
    for (const r of rails) expect(r.bottom!).toBeGreaterThan(20);
  });

  it("lays Lombard's crooked block in eight hairpins, its beds in flower", () => {
    const { crooked, flowers, streets } = city.city;
    const lane = streets.find((s) => s.name === "Lombard St" && s.cls === 0)!;
    // Across the block the lane swings from side to side: a hairpin each time it turns back.
    const across = Array.from(lane.xs, (x, i) => (x - crooked.x) * crooked.dz - (lane.zs[i] - crooked.z) * crooked.dx);
    let turns = 0;
    for (let i = 1; i < across.length - 1; i++) if ((across[i] - across[i - 1]) * (across[i + 1] - across[i]) < 0 && Math.abs(across[i]) > 3) turns++;
    expect(turns).toBe(8);
    expect(flowers.length).toBeGreaterThan(60);
    for (const f of flowers) expect(inCrooked(crooked, f.x, f.z)).toBe(true);
  });

  it("cuts its railway down to the rails all the way to the tunnel, whose face stands on the level", () => {
    const { line } = city.city.rail;
    const portal = city.station!.portal;
    for (let s = 0; s <= portal; s += 1) {
      const p = linePoint(line, s);
      expect(city.height(p.x, p.z) - (p.y - BED.under), `${s}`).toBeLessThan(0.06);
    }
    // Past it the hill stands over the rails.
    const inside = linePoint(line, portal + 25);
    expect(city.height(inside.x, inside.z) - inside.y).toBeGreaterThan(4);
  });

  it("runs its cable cars up and down the line in their own lanes, and turns them round at each end", () => {
    const { cable, kerb } = city.city;
    const ground = (x: number, z: number) => city.height(x, z);
    const P = cableCycle(cable);
    let last = cableCars(cable, ground, 0);
    const ends = Array.from({ length: CABLE_CARS }, () => new Set<number>());
    for (let t = 0.5; t <= P; t += 0.5) {
      const now = cableCars(cable, ground, t);
      now.forEach((c, k) => {
        // Never a jump, and always in the street. Its lane is the outside of some corners, a longer way round.
        expect(Math.hypot(c.x - last[k].x, c.z - last[k].z)).toBeLessThan(CABLE_SPEED * 0.5 * 1.6);
        expect(kerbAt(kerb, c.x, c.z)).toBeLessThan(0.5);
        const run = cableRun(cable, k, t);
        if (run.turn !== null) ends[k].add(run.s);
        // Never on top of another: passing, they're a lane apart.
        for (let j = 0; j < k; j++) expect(Math.hypot(c.x - now[j].x, c.z - now[j].z)).toBeGreaterThan(CABLE_CAR.width + 1);
      });
      last = now;
    }
    for (const e of ends) expect([...e].sort((a, b) => a - b)).toEqual([0, cable.length]);
  });

  it("has its own animals, where they live", () => {
    expect(speciesIn("city")).toEqual(["bison", "sealion", "pelican", "parrot"]);
    const herds = placeHerds(city);
    const of = (id: string) => herds.filter((h) => h.species === id);
    const paddock = toGame(-122.4994, 37.7697);
    expect(of("bison")).toHaveLength(1);
    expect(Math.hypot(of("bison")[0].home.x - paddock.x, of("bison")[0].home.z - paddock.z)).toBeLessThan(46);
    expect(of("sealion").length).toBeGreaterThan(0);
    for (const h of of("sealion")) expect(city.height(h.home.x, h.home.z)).toBeLessThan(-1);
    expect(of("pelican").length).toBeGreaterThan(5);
    expect(of("parrot")).toHaveLength(2);
  });

  it("brings the fog in through the Gate of an afternoon, and burns it off by late morning", () => {
    expect(fogAt(13)).toBe(0);
    expect(fogAt(20)).toBe(1);
    expect(fogAt(3)).toBe(1);
    expect(fogAt(16.5)).toBeGreaterThan(0);
    expect(fogAt(16.5)).toBeLessThan(1);
    expect(fogAt(9.5)).toBeGreaterThan(0);
    expect(fogAt(9.5)).toBeLessThan(1);
  });
});

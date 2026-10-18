import { describe, it, expect } from "vitest";
import { makeCar, step } from "./physics";
import { STOCK_LOADOUT, specFor } from "./shop";
import {
  buildWorld, campPitches, sampleGrid, gridX, gridZ, CAFE, FROZEN, START, WORLD, LAKES, ROW, CELL, HALF, STOCK_WADE,
} from "./world";

const world = buildWorld();
const zoneAt = (x: number, z: number) => world.zone[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];

describe("buildWorld", () => {
  it("is deterministic", () => {
    const again = buildWorld();
    expect(again.trees.length).toBe(world.trees.length);
    expect(again.heights[12345]).toBe(world.heights[12345]);
    expect(again.trees[100]).toEqual(world.trees[100]);
    expect(again.sites).toEqual(world.sites);
  });

  it("spawns the car on dry, level ground with room to move", () => {
    const h = world.height(START.x, START.z);
    expect(h).toBeGreaterThan(world.waterAt(START.x, START.z) + 2);
    expect(Math.abs(world.height(START.x + 10, START.z) - h)).toBeLessThan(1.5);
    expect(world.obstaclesNear(START.x, START.z).some((o) => Math.hypot(o.x - START.x, o.z - START.z) < 15)).toBe(false);
  });

  it("has lakes, and keeps trees out of the water", () => {
    for (const lake of LAKES) expect(world.height(lake.x, lake.z)).toBeLessThan(WORLD.water - 10);
    expect(world.trees.every((t) => world.height(t.x, t.z) > world.waterAt(t.x, t.z))).toBe(true);
  });

  it("walls the valley in", () => {
    const rim = [0, 1, 2, 3, 4, 5].map((k) => world.height(Math.cos(k) * 2800, Math.sin(k) * 2800));
    expect(Math.min(...rim)).toBeGreaterThan(world.height(START.x, START.z) + 150);
  });

  it("has rivers too deep to ford on stock tyres, cutting off part of the valley", () => {
    for (const river of world.rivers) {
      const mid = Math.floor(river.xs.length / 2);
      expect(world.waterAt(river.xs[mid], river.zs[mid]) - world.height(river.xs[mid], river.zs[mid])).toBeGreaterThan(STOCK_WADE + 0.5);
    }
    expect(zoneAt(START.x, START.z)).toBe(1);
    const snorkelOnly = world.zone.filter((z) => z === 2).length;
    expect(snorkelOnly * CELL * CELL).toBeGreaterThan(1e6);
  });

  it("puts eight differently styled garages in reach, two of them over the river", () => {
    expect(world.sites).toHaveLength(8);
    expect(new Set(world.sites.map((s) => s.style)).size).toBe(8);
    expect(world.sites.filter((s) => zoneAt(s.x, s.z) === 2)).toHaveLength(2);
    expect(world.sites.filter((s) => zoneAt(s.x, s.z) === 1)).toHaveLength(6);
  });

  it("lays out thirty level, clear parking bays at the campground, and the café on flat ground", () => {
    const bays = campPitches().map((p) => p.parking);
    expect(bays).toHaveLength(30);
    const hs = bays.map((b) => world.height(b.x, b.z));
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05);
    for (const b of bays) {
      expect(world.obstaclesNear(b.x, b.z).some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 4)).toBe(false);
      expect(zoneAt(b.x, b.z)).toBe(1);
    }
    expect(Math.abs(world.height(CAFE.x, CAFE.z + 26) - world.height(CAFE.x, CAFE.z))).toBeLessThan(0.1);
  });

  it("has snow country with a frozen lake, and green grass at camp", () => {
    expect(world.slipAt(FROZEN[0].x, FROZEN[0].z)).toBeGreaterThan(1.9);
    expect(world.slipAt(FROZEN[0].x, FROZEN[0].z - 500)).toBeGreaterThan(0.9);
    expect(world.slipAt(START.x, START.z)).toBe(0);
  });

  it("lays out missions with their gates on dry ground, clear of trees", () => {
    expect(world.missions.length).toBeGreaterThanOrEqual(4);
    for (const m of world.missions) {
      expect(m.gates.length).toBeGreaterThanOrEqual(6);
      for (const g of m.gates) {
        expect(world.height(g.x, g.z)).toBeGreaterThan(world.waterAt(g.x, g.z));
        expect(world.trees.some((t) => Math.hypot(t.x - g.x, t.z - g.z) < 3)).toBe(false);
      }
    }
  });

  it("runs a dirt road from the camp out to the station, round the garages' yards and the café, not through them", () => {
    const st = world.station!;
    const road = world.roads.find((r) => Math.hypot(r.xs.at(-1)! - st.x, r.zs.at(-1)! - st.z) < 1)!;
    expect(road).toBeDefined();
    expect(Math.hypot(road.xs[0] - world.camp.x, road.zs[0] - world.camp.z)).toBeLessThan(80);
    for (let i = 1; i < road.xs.length; i++) {
      const [ax, az, bx, bz] = [road.xs[i - 1], road.zs[i - 1], road.xs[i], road.zs[i]];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
      for (let k = 0; k <= n; k++) {
        const [x, z] = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
        for (const s of world.sites) expect(Math.hypot(s.x - x, s.z - z), `the ${s.style}'s yard at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThan(30);
        expect(Math.hypot(CAFE.x - x, CAFE.z - z), "the café").toBeGreaterThan(30);
      }
    }
  });

  it("lays the road on to the café and the road out to the station where any truck can drive them, both ways", () => {
    const st = world.station!;
    const roads = [
      world.roads.find((r) => r.xs.at(-1) === CAFE.x && r.zs.at(-1) === CAFE.z + 12)!,
      world.roads.find((r) => Math.hypot(r.xs.at(-1)! - st.x, r.zs.at(-1)! - st.z) < 1)!,
    ];
    const h = (x: number, z: number) => world.height(x, z);
    const spec = specFor("bluff", STOCK_LOADOUT);
    /** A stock truck along a line, gas on, steering for a point a little way ahead on it: whether it gets to the end. */
    const drives = (pts: { x: number; z: number }[]) => {
      const cum = pts.map((_, i) => (i ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) : 0));
      for (let i = 1; i < cum.length; i++) cum[i] += cum[i - 1];
      const point = (s: number) => {
        let i = 1;
        while (i < pts.length - 1 && cum[i] < s) i++;
        const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / (cum[i] - cum[i - 1])));
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t };
      };
      const along = (x: number, z: number) => {
        let best = { s: 0, d: Infinity };
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]];
          const len = cum[i] - cum[i - 1];
          const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (len * len)));
          const d = Math.hypot(a.x + (b.x - a.x) * t - x, a.z + (b.z - a.z) * t - z);
          if (d < best.d) best = { s: cum[i - 1] + t * len, d };
        }
        return best.s;
      };
      const first = point(2);
      const car = makeCar(world, pts[0].x, pts[0].z, Math.atan2(first.x - pts[0].x, first.z - pts[0].z), spec);
      for (let t = 0; t < 300; t += 1 / 60) {
        const s = along(car.x, car.z);
        if (s > cum.at(-1)! - 3) return true;
        const aim = point(s + 8);
        const off = Math.atan2(Math.sin(Math.atan2(aim.x - car.x, aim.z - car.z) - car.heading), Math.cos(Math.atan2(aim.x - car.x, aim.z - car.z) - car.heading));
        step(car, { gas: car.speed < 9, brake: car.speed > 12, left: off > 0.03, right: off < -0.03 }, 1 / 60, world, spec);
      }
      return false;
    };
    for (const road of roads) {
      const pts = road.xs.map((x, i) => ({ x, z: road.zs[i] }));
      // Every metre along, across the dirt's width: never steeper than 35 degrees, well short of the most any truck climbs.
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
        for (let d = 0; d < len; d += 1) {
          for (const w of [-2.5, 0, 2.5]) {
            const [x, z] = [a.x + ux * d + uz * w, a.z + uz * d - ux * w];
            const slope = Math.hypot(h(x + 1, z) - h(x - 1, z), h(x, z + 1) - h(x, z - 1)) / 2;
            expect(slope, `steep at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(Math.tan((35 * Math.PI) / 180));
          }
        }
      }
      expect(drives(pts), `along to ${pts.at(-1)!.x.toFixed(0)}, ${pts.at(-1)!.z.toFixed(0)}`).toBe(true);
      expect(drives([...pts].reverse()), `back from ${pts.at(-1)!.x.toFixed(0)}, ${pts.at(-1)!.z.toFixed(0)}`).toBe(true);
    }
  });

  it("lays a closed railway loop, gently graded, with bridges and level crossings", () => {
    const { track } = world;
    const n = track.xs.length;
    expect(Math.hypot(track.xs[0] - track.xs[n - 1], track.zs[0] - track.zs[n - 1])).toBeLessThan(10);
    for (let i = 0; i < n; i++) expect(Math.abs(track.ys[(i + 1) % n] - track.ys[i])).toBeLessThan(0.12);
    expect(track.bridges.length).toBeGreaterThanOrEqual(2);
    expect(track.crossings).toHaveLength(4);
  });
});

describe("sampleGrid", () => {
  it("returns the grid heights at grid vertices", () => {
    for (const [i, j] of [[0, 0], [150, 150], [77, 203], [299, 12]]) {
      expect(sampleGrid(world.heights, gridX(i), gridZ(j))).toBeCloseTo(world.heights[j * ROW + i], 4);
    }
  });

  it("interpolates linearly along a cell edge", () => {
    const [i, j] = [120, 80];
    const mid = sampleGrid(world.heights, (gridX(i) + gridX(i + 1)) / 2, gridZ(j));
    expect(mid).toBeCloseTo((world.heights[j * ROW + i] + world.heights[j * ROW + i + 1]) / 2, 4);
  });
});

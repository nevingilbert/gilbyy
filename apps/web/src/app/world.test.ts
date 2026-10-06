import { describe, it, expect } from "vitest";
import { buildWorld, sampleGrid, gridX, gridZ, START, WORLD } from "./world";

const world = buildWorld();
const ROW = WORLD.segments + 1;

describe("buildWorld", () => {
  it("is deterministic", () => {
    const again = buildWorld();
    expect(again.trees.length).toBe(world.trees.length);
    expect(again.heights[12345]).toBe(world.heights[12345]);
    expect(again.trees[100]).toEqual(world.trees[100]);
  });

  it("spawns the car on dry, level ground with room to move", () => {
    const h = world.height(START.x, START.z);
    expect(h).toBeGreaterThan(WORLD.water + 2);
    expect(Math.abs(world.height(START.x + 10, START.z) - h)).toBeLessThan(1.5);
    expect(world.obstaclesNear(START.x, START.z).some((o) => Math.hypot(o.x - START.x, o.z - START.z) < 15)).toBe(false);
  });

  it("has lakes, and keeps trees out of them", () => {
    expect(world.height(210, -300)).toBeLessThan(WORLD.water - 5);
    expect(world.trees.every((t) => world.height(t.x, t.z) > WORLD.water)).toBe(true);
  });

  it("walls the valley in", () => {
    const rim = [0, 1, 2, 3].map((k) => world.height(Math.cos(k) * 1150, Math.sin(k) * 1150));
    expect(Math.min(...rim)).toBeGreaterThan(world.height(START.x, START.z) + 100);
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

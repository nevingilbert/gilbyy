import { describe, it, expect } from "vitest";
import { LANDMARKS, LANDMARK_CLEAR, LANDMARK_KINDS, landmarkUrl } from "./landmarks";
import { buildWorld, CELL, HALF, ROW, START } from "./world";

const world = buildWorld();
const zoneAt = (x: number, z: number) => world.zone[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];
const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("landmarks", () => {
  it("are one each of the bank, church, school and casino, the same on every load", () => {
    expect(world.landmarks.map((l) => l.kind).sort()).toEqual([...LANDMARK_KINDS].sort());
    expect(buildWorld().landmarks).toEqual(world.landmarks);
  });

  it("stand on level, dry, cleared ground anyone can drive to", () => {
    for (const l of world.landmarks) {
      expect(zoneAt(l.x, l.z)).toBe(1);
      const hs = [0, 1, 2, 3, 4, 5].map((k) => world.height(l.x + Math.cos(k) * 15, l.z + Math.sin(k) * 15));
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05);
      expect(world.height(l.x, l.z)).toBeGreaterThan(world.waterAt(l.x, l.z) + 1);
      expect([...world.trees, ...world.rocks, ...world.bushes].some((s) => apart(s, l) < LANDMARK_CLEAR)).toBe(false);
    }
  });

  it("keep well clear of the camp, the garages, the courses and each other", () => {
    const others = [START, ...world.sites, ...world.missions.flatMap((m) => [m.start, ...m.gates])];
    for (const l of world.landmarks) {
      for (const o of others) expect(apart(l, o)).toBeGreaterThan(250);
      for (const m of world.landmarks) if (m !== l) expect(apart(l, m)).toBeGreaterThan(700);
    }
  });

  it("leave the trees around them standing on the ground", () => {
    const near = world.trees.filter((t) => world.landmarks.some((l) => apart(t, l) < 60));
    expect(near.length).toBeGreaterThan(0);
    for (const t of near) expect(t.y).toBeCloseTo(world.height(t.x, t.z) - 0.3, 4);
  });

  it("each point at one of the owner's other projects, over https", () => {
    expect(LANDMARK_KINDS.map(landmarkUrl)).toEqual([
      "https://deal.gilbyy.com/", "https://salem.gilbyy.com/", "https://times.gilbyy.com/", "https://bets.gilbyy.com/",
    ]);
    for (const k of LANDMARK_KINDS) expect(LANDMARKS[k].title.length).toBeGreaterThan(0);
  });
});

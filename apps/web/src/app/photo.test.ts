import { describe, it, expect } from "vitest";
import {
  CLEARANCE, FURTHEST, HIGHEST, LOWEST, NEAREST, cameraAt, clampOrbit, dragOrbit, easeOrbit, orbitFrom, photoName, zoomOrbit,
} from "./photo";

const flat = () => -Infinity;
const centre = { x: 120, y: 40, z: -60 };

describe("photo mode", () => {
  it("starts where the chase camera was, so the picture doesn't jump", () => {
    // The chase camera: 11.5 m behind a truck heading 0.7 and 8.5 m over it (scene.ts).
    const heading = 0.7;
    const chase = { x: centre.x - Math.sin(heading) * 11.5, y: centre.y + 8, z: centre.z - Math.cos(heading) * 11.5 };
    const o = orbitFrom(chase, centre);
    expect(o.yaw).toBeCloseTo(heading, 9);
    const back = cameraAt(o, centre, flat);
    expect(back.x).toBeCloseTo(chase.x, 9);
    expect(back.y).toBeCloseTo(chase.y, 9);
    expect(back.z).toBeCloseTo(chase.z, 9);
  });

  it("keeps the camera out of the truck, within sight of it, and never right underneath", () => {
    expect(clampOrbit({ yaw: 0, pitch: 0.4, dist: 0.5 }).dist).toBe(NEAREST);
    expect(clampOrbit({ yaw: 0, pitch: 0.4, dist: 900 }).dist).toBe(FURTHEST);
    expect(clampOrbit({ yaw: 0, pitch: 3, dist: 10 }).pitch).toBe(HIGHEST);
    expect(clampOrbit({ yaw: 0, pitch: -3, dist: 10 }).pitch).toBe(LOWEST);
    expect(HIGHEST).toBeLessThan(Math.PI / 2);
    expect(clampOrbit({ yaw: 7, pitch: 0, dist: 10 }).yaw).toBeCloseTo(7 - Math.PI * 2, 9);
    let o = { yaw: 0, pitch: 0.5, dist: 12 };
    for (let i = 0; i < 40; i++) o = zoomOrbit(o, 0.7);
    expect(o.dist).toBe(NEAREST);
    for (let i = 0; i < 40; i++) o = zoomOrbit(o, 1.4);
    expect(o.dist).toBe(FURTHEST);
  });

  it("turns the truck with the finger, like a turntable", () => {
    // Looking along +z, the camera's left is +x. Dragging right takes it round that way.
    const o = { yaw: 0, pitch: 0.3, dist: 12 };
    const before = cameraAt(o, centre, flat);
    const after = cameraAt(dragOrbit(o, 40, 0), centre, flat);
    expect(after.x).toBeGreaterThan(before.x);
    expect(Math.hypot(after.x - centre.x, after.z - centre.z)).toBeCloseTo(Math.hypot(before.x - centre.x, before.z - centre.z), 9);
    // Dragging down lifts it; dragging up brings it down toward the ground.
    expect(cameraAt(dragOrbit(o, 0, 40), centre, flat).y).toBeGreaterThan(before.y);
    expect(cameraAt(dragOrbit(o, 0, -40), centre, flat).y).toBeLessThan(before.y);
  });

  it("never puts the camera under the floor", () => {
    // A truck in a hollow: the ground rises steeply all round it.
    const bowl = (x: number, z: number) => centre.y - 1 + 0.4 * Math.hypot(x - centre.x, z - centre.z);
    for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.3) {
      for (let pitch = LOWEST; pitch <= HIGHEST; pitch += 0.1) {
        for (const dist of [NEAREST, 10, 30, FURTHEST]) {
          const at = cameraAt({ yaw, pitch, dist }, centre, bowl);
          expect(at.y).toBeGreaterThanOrEqual(bowl(at.x, at.z) + CLEARANCE - 1e-9);
        }
      }
    }
    // Looking up from low down, over open ground, it sits just over the floor.
    expect(cameraAt({ yaw: 1, pitch: LOWEST, dist: 20 }, centre, () => centre.y - 0.2).y).toBeCloseTo(centre.y - 0.2 + CLEARANCE, 9);
  });

  it("eases round the short way, and gets there", () => {
    const from = { yaw: 3, pitch: 0.2, dist: 10 };
    const to = { yaw: -3, pitch: 0.6, dist: 20 };
    // From 3 to −3 is a little over half a radian through ±π, not six radians back through 0.
    const half = easeOrbit(from, to, 0.5);
    expect(Math.abs(half.yaw)).toBeGreaterThan(3);
    expect(half.pitch).toBeCloseTo(0.4, 9);
    expect(half.dist).toBeCloseTo(15, 9);
    const there = easeOrbit(from, to, 1);
    expect(there.yaw).toBeCloseTo(-3, 9);
    expect(there.pitch).toBeCloseTo(0.6, 9);
    expect(there.dist).toBeCloseTo(20, 9);
  });

  it("names a picture by when it was taken", () => {
    expect(photoName(new Date(2026, 9, 10, 7, 5, 9))).toBe("gilbyy-2026-10-10-070509.png");
    expect(photoName(new Date(2026, 0, 1, 23, 59, 0))).toBe("gilbyy-2026-01-01-235900.png");
  });
});

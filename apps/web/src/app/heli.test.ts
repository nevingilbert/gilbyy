import { describe, expect, it } from "vitest";
import {
  HELI, LIFT, PAD, PAD_REACH, SET, SLUNG, fromPad, heliObstacles, hookOf, liftOff, padBoard, padLeave, parked, setDown, standAt, toPad,
  type HeliFrame,
} from "./heli";
import { buildJapan } from "./japan";
import { buildVegas } from "./vegas";
import type { World } from "./world";

const worlds: Record<"vegas" | "japan", World> = { vegas: buildVegas(), japan: buildJapan() };
const STEP = 0.05;
const zone = (w: World, x: number, z: number) => w.zone[Math.round((z + 3000) / 10) * 601 + Math.round((x + 3000) / 10)];

describe.each(["vegas", "japan"] as const)("the %s's helipad", (id) => {
  const world = worlds[id];
  const p = world.pad!;
  const ground = (x: number, z: number) => world.height(x, z);

  /** Nothing in a frame jumps from the last, and nothing is under the ground. */
  const steady = (f: HeliFrame, last: HeliFrame, t: number) => {
    expect(Math.hypot(f.heli.x - last.heli.x, f.heli.y - last.heli.y, f.heli.z - last.heli.z), `helicopter at ${t}`).toBeLessThan(2.5);
    if (f.truck && last.truck) expect(Math.hypot(f.truck.x - last.truck.x, f.truck.base - last.truck.base, f.truck.z - last.truck.z), `truck at ${t}`).toBeLessThan(2.5);
    expect(f.heli.y - HELI.belly, `helicopter at ${t}`).toBeGreaterThanOrEqual(ground(f.heli.x, f.heli.z) - 1e-6);
    if (f.truck) expect(f.truck.base, `truck at ${t}`).toBeGreaterThanOrEqual(ground(f.truck.x, f.truck.z) - 1e-6);
    expect(f.camera.from.y, `camera at ${t}`).toBeGreaterThan(ground(f.camera.from.x, f.camera.from.z));
    // The truck only leaves the ground on the hook, hanging the slings' length under it.
    if (f.truck?.hung) {
      expect(f.slung, `at ${t}`).toBe(true);
      expect(hookOf(f.heli, f.cable).y - f.truck.base, `at ${t}`).toBeCloseTo(SLUNG, 5);
    }
  };
  const standing = (f: HeliFrame) => {
    const s = parked(p, ground);
    for (const k of ["x", "y", "z", "heading", "pitch", "roll"] as const) expect(f.heli[k], k).toBeCloseTo(s[k], 6);
    expect(f.rotor).toBe(0);
  };

  it("is level ground round the circle and out to the helicopter's stand, nothing growing on either", () => {
    for (let lx = -PAD.radius; lx <= PAD.stand + 4; lx += 2) {
      for (let lz = -16; lz <= 16; lz += 2) {
        if (Math.hypot(lx, lz) > PAD.flat - 8) continue;
        const q = fromPad(p, lx, lz);
        expect(ground(q.x, q.z), `at ${lx}, ${lz}`).toBeCloseTo(p.y, 1);
      }
    }
    const s = standAt(p);
    for (const t of world.trees) {
      expect(Math.hypot(t.x - s.x, t.z - s.z)).toBeGreaterThan(HELI.rotor + 2);
      expect(Math.hypot(t.x - p.x, t.z - p.z)).toBeGreaterThan(PAD.radius + 2);
    }
    expect(zone(world, p.x, p.z)).toBe(1);
  });

  it("leaves the circle free to drive onto, and sets a truck down past where the helicopter is offered", () => {
    for (const o of heliObstacles(p)) {
      const q = toPad(p, o.x, o.z);
      expect(Math.hypot(q.x, q.z) - o.r).toBeGreaterThan(PAD.radius);
    }
    const leave = padLeave(p);
    expect(Math.hypot(leave.x - p.x, leave.z - p.z)).toBeGreaterThan(PAD_REACH);
    expect(Math.hypot(leave.x - p.x, leave.z - p.z)).toBeLessThan(PAD.radius - 2);
  });

  it("films the way out: over the truck, the hook down onto it, and away into the haze with it slung underneath", () => {
    // Stopped a little off the middle, facing any way at all.
    const centre = padBoard(p);
    const from = { ...fromPad(p, 3, -2), heading: centre.heading + 2.5 };
    let last = liftOff(p, from, ground, 0);
    standing(last);
    expect(last.truck).toMatchObject({ x: from.x, z: from.z, heading: from.heading, hung: false });
    for (let t = STEP; t <= LIFT.end + 1e-9; t += STEP) {
      const f = liftOff(p, from, ground, t);
      steady(f, last, t);
      last = f;
    }
    // Hooked before it's lifted, and carried off well clear of the rim or the pad.
    expect(liftOff(p, from, ground, LIFT.hook).truck!.hung).toBe(false);
    expect(liftOff(p, from, ground, LIFT.away).truck!.hung).toBe(true);
    expect(last.haze).toBe(1);
    expect(last.truck).toBeNull();
    expect(Math.hypot(last.heli.x - p.x, last.heli.z - p.z)).toBeGreaterThan(100);
  });

  it("films the way in: out of the haze with the truck under it, down onto the pad, and back to its stand", () => {
    let last = setDown(p, ground, 0);
    expect(last.haze).toBe(1);
    expect(last.truck!.hung).toBe(true);
    for (let t = STEP; t <= SET.end + 1e-9; t += STEP) {
      const f = setDown(p, ground, t);
      steady(f, last, t);
      last = f;
    }
    expect(last.haze).toBe(0);
    expect(last.slung).toBe(false);
    standing(last);
    const leave = padLeave(p);
    expect(last.truck).toMatchObject({ hung: false, heading: leave.heading });
    expect(Math.hypot(last.truck!.x - leave.x, last.truck!.z - leave.z)).toBeLessThan(0.01);
    expect(last.truck!.base).toBeCloseTo(ground(leave.x, leave.z), 1);
  });
});

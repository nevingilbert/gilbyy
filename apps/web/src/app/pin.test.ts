import { describe, expect, it } from "vitest";
import { buildIsland } from "./island";
import { PIN_GRAB, PIN_HEAD, PIN_REACH, PIN_STEM, markFor, onMini, onPin, pinAt, reached } from "./pin";
import { buildWorld } from "./world";

describe("the pin", () => {
  it("lands under the click, on either world's sheet", () => {
    for (const world of [buildWorld(), buildIsland()]) {
      const span = world.mapSpan;
      expect(pinAt(0.5, 0.5, span)).toEqual({ x: 0, z: 0 });
      // The sheet is north-up: its left edge is west (−x) and its top edge north (−z).
      expect(pinAt(0, 0, span)).toEqual({ x: -span / 2, z: -span / 2 });
      expect(pinAt(1, 0.5, span)).toEqual({ x: span / 2, z: 0 });
      // The camp is on the sheet, so it can be pinned.
      const fx = world.camp.x / span + 0.5;
      const fy = world.camp.z / span + 0.5;
      expect(fx).toBeGreaterThan(0);
      expect(fx).toBeLessThan(1);
      const p = pinAt(fx, fy, span);
      expect(p.x).toBeCloseTo(world.camp.x, 6);
      expect(p.z).toBeCloseTo(world.camp.z, 6);
    }
  });

  it("is taken up by a click on it, from its point to its head, and moved by a click elsewhere", () => {
    const span = 6000;
    const pin = { x: 300, z: -900 };
    const fx = pin.x / span + 0.5;
    const fy = pin.z / span + 0.5;
    for (const px of [330, 700]) {
      expect(onPin(pin, fx, fy, span, px)).toBe(true);
      // Its head, which is what a finger goes for, and a little over it.
      expect(onPin(pin, fx, fy - PIN_STEM, span, px)).toBe(true);
      expect(onPin(pin, fx, fy - PIN_STEM - PIN_HEAD, span, px)).toBe(true);
      // Just inside a fingertip to one side, and just outside it.
      expect(onPin(pin, fx + (PIN_GRAB - 1) / px, fy - PIN_STEM / 2, span, px)).toBe(true);
      expect(onPin(pin, fx + (PIN_GRAB + 1) / px, fy - PIN_STEM / 2, span, px)).toBe(false);
      // Below its point there's no pin: that's somewhere else to put it.
      expect(onPin(pin, fx, fy + (PIN_GRAB + 1) / px, span, px)).toBe(false);
      expect(onPin(pin, fx + 0.2, fy, span, px)).toBe(false);
    }
  });

  it("is reached from a little way off", () => {
    const pin = { x: 100, z: 100 };
    expect(reached(pin, 100, 100)).toBe(true);
    expect(reached(pin, 100 + PIN_REACH - 1, 100)).toBe(true);
    expect(reached(pin, 100, 100 + PIN_REACH + 1)).toBe(false);
  });

  it("is held at the minimap's rim when it's further off than the minimap shows", () => {
    const car = { x: 50, z: -20 };
    expect(onMini({ x: 150, z: -20 }, car, 400)).toEqual({ x: 150, z: -20, far: false });
    const east = onMini({ x: 2050, z: -20 }, car, 400);
    expect(east).toEqual({ x: 450, z: -20, far: true });
    const off = onMini({ x: 50 - 3000, z: -20 + 4000 }, car, 400);
    expect(off.far).toBe(true);
    expect(Math.hypot(off.x - car.x, off.z - car.z)).toBeCloseTo(400, 6);
    // Still the way to it: three west for every four south.
    expect((off.x - car.x) / (off.z - car.z)).toBeCloseTo(-0.75, 6);
    // On the truck itself there's no way to it to work out.
    expect(onMini(car, car, 400)).toEqual({ ...car, far: false });
  });

  it("leads the compass ahead of the guidance, but not ahead of a friend's call or a course", () => {
    const call = { x: 1, z: 1 };
    const pin = { x: 2, z: 2 };
    const guide = { x: 3, z: 3 };
    expect(markFor(false, null, pin, guide)).toBe(pin);
    expect(markFor(false, null, null, guide)).toBe(guide);
    expect(markFor(false, call, pin, guide)).toBe(call);
    expect(markFor(true, call, pin, guide)).toBeNull();
    expect(markFor(false, null, null, null)).toBeNull();
  });
});

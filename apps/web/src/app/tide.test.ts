import { describe, expect, it } from "vitest";
import { TIDE, TIDE_LENGTH, ebbAt, untilEbb } from "./tide";

describe("the tide", () => {
  it("goes from high water to low and back, and never past either", () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < TIDE_LENGTH; t += 0.5) {
      lo = Math.min(lo, ebbAt(t));
      hi = Math.max(hi, ebbAt(t));
    }
    expect(lo).toBe(0);
    expect(hi).toBe(TIDE.fall);
  });

  it("comes round again every ten minutes, whenever you look", () => {
    expect(TIDE_LENGTH).toBe(600);
    for (const t of [0, 37, 250, 599.5]) {
      expect(ebbAt(t + TIDE_LENGTH)).toBeCloseTo(ebbAt(t), 9);
      expect(ebbAt(t - 3 * TIDE_LENGTH)).toBeCloseTo(ebbAt(t), 9);
    }
  });

  // The sea is a sheet the whole island can see: it must creep, not jump.
  it("moves slowly, with no jumps where one stage meets the next", () => {
    for (let t = 0; t < TIDE_LENGTH; t += 0.1) expect(Math.abs(ebbAt(t + 0.1) - ebbAt(t))).toBeLessThan(0.0025);
  });

  it("stays out longer than it stays in", () => {
    let out = 0, inn = 0;
    for (let t = 0; t < TIDE_LENGTH; t += 1) {
      if (ebbAt(t) === TIDE.fall) out++;
      if (ebbAt(t) === 0) inn++;
    }
    expect(out).toBeGreaterThan(inn * 2);
    expect(inn).toBeGreaterThan(90);
  });

  it("knows how long until the sea is next out as far as asked", () => {
    for (const least of [0.4, 1, TIDE.fall]) {
      for (let t = -50; t < TIDE_LENGTH + 50; t += 7) {
        const wait = untilEbb(t, least);
        if (ebbAt(t) >= least) expect(wait, `${least} at ${t}`).toBe(0);
        else {
          expect(wait, `${least} at ${t}`).toBeGreaterThan(0);
          // Out far enough when the wait is over, and not a moment before.
          expect(ebbAt(t + wait + 0.01)).toBeGreaterThanOrEqual(least);
          expect(ebbAt(t + wait - 0.5)).toBeLessThan(least);
        }
      }
    }
  });

  it("is never more than a few minutes from showing the sand", () => {
    let longest = 0;
    for (let t = 0; t < TIDE_LENGTH; t += 1) longest = Math.max(longest, untilEbb(t, 1));
    expect(longest).toBeLessThan(260);
  });
});

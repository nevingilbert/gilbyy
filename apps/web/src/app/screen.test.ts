import { describe, expect, it } from "vitest";
import { BASE_FOV, MAX_FOV, fovFor, wideShotBack } from "./screen";

const across = (aspect: number) => 2 * Math.atan(Math.tan((fovFor(aspect) * Math.PI) / 360) * aspect);

describe("the camera's view for the screen", () => {
  it("is the game's 48 degrees on a screen wider than tall", () => {
    expect(fovFor(16 / 9)).toBe(BASE_FOV);
    expect(fovFor(951 / 669)).toBe(BASE_FOV); // an iPhone Duo open, on its side
    expect(fovFor(1)).toBe(BASE_FOV);
  });

  it("opens up upright, to as wide across as a square screen's", () => {
    const duo = 669 / 951; // an iPhone Duo open, upright
    expect(fovFor(duo)).toBeGreaterThan(BASE_FOV);
    expect(across(duo)).toBeCloseTo(across(1), 5);
    const shut = 466 / 678; // and shut
    expect(across(shut)).toBeCloseTo(across(1), 5);
  });

  it("stops before a tall phone's edges stretch", () => {
    expect(fovFor(390 / 844)).toBe(MAX_FOV);
    expect(fovFor(0)).toBe(BASE_FOV);
    expect(fovFor(Number.NaN)).toBe(BASE_FOV);
  });

  it("stands a film's wide shot back only as far as the screen needs", () => {
    expect(wideShotBack(16 / 9)).toBe(1);
    expect(wideShotBack(951 / 669)).toBe(1);
    expect(wideShotBack(669 / 951)).toBeGreaterThan(1);
    expect(wideShotBack(669 / 951)).toBeLessThan(1.25 / (669 / 951));
    expect(wideShotBack(0.2)).toBe(2.4);
  });
});

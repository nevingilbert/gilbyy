import { describe, it, expect } from "vitest";
import { DAY_LENGTH, START_HOUR, hourAt, skyAt } from "./daylight";
import { CONSIST, TRAIN_LENGTH, TRAIN_SPEED, crossingClosed, trackPoint, trainCars, trainHead, trainObstacles } from "./track";
import { buildWorld } from "./world";

const { track } = buildWorld();

describe("the train", () => {
  it("keeps every car on the rails, nose to tail", () => {
    const cars = trainCars(track, 123.4);
    expect(cars).toHaveLength(CONSIST.length);
    for (let i = 1; i < cars.length; i++) {
      const gap = Math.hypot(cars[i].x - cars[i - 1].x, cars[i].z - cars[i - 1].z);
      expect(gap).toBeGreaterThan(9);
      expect(gap).toBeLessThan(16);
    }
    const head = trackPoint(track, trainHead(track, 123.4));
    expect(Math.hypot(head.x - cars[0].x, head.z - cars[0].z)).toBeLessThan(10);
  });

  it("goes all the way round and comes back", () => {
    const lap = track.length / TRAIN_SPEED;
    expect(trainHead(track, 50 + lap)).toBeCloseTo(trainHead(track, 50), 3);
  });

  it("closes a crossing before it arrives and opens it after it has gone", () => {
    const crossing = track.crossings[0];
    const at = (s: number) => (s - trainHead(track, 0) + track.length * 10) % track.length / TRAIN_SPEED;
    expect(crossingClosed(track, crossing, at(crossing - 400))).toBe(false);
    expect(crossingClosed(track, crossing, at(crossing - 100))).toBe(true);
    expect(crossingClosed(track, crossing, at(crossing + TRAIN_LENGTH / 2))).toBe(true);
    expect(crossingClosed(track, crossing, at(crossing + TRAIN_LENGTH + 80))).toBe(false);
  });

  it("is solid along its whole length", () => {
    const cars = trainCars(track, 10);
    const obstacles = trainObstacles(cars);
    expect(obstacles.length).toBeGreaterThan(CONSIST.length * 3);
    expect(obstacles.every((o) => o.h === Infinity)).toBe(true);
  });
});

describe("time of day", () => {
  it("opens in the late afternoon and loops once a day", () => {
    expect(hourAt(0)).toBeCloseTo(START_HOUR, 5);
    expect(hourAt(DAY_LENGTH + 30)).toBeCloseTo(hourAt(30), 5);
  });

  it("runs the night quicker than the day", () => {
    const at = (h: number) => {
      let t = 0;
      while (Math.abs(hourAt(t) - h) > 0.02) t += 1;
      return t;
    };
    const day = at(15) - at(13);
    const night = at(2) - at(0);
    expect(night).toBeLessThan(day);
  });

  it("is dark at midnight and bright at noon, with the sun up only by day", () => {
    expect(skyAt(0).night).toBe(1);
    expect(skyAt(12).night).toBe(0);
    expect(skyAt(12).sunDir[1]).toBeGreaterThan(0.5);
    expect(skyAt(0).sunDir[1]).toBeLessThan(0);
    expect(skyAt(12).lightIntensity).toBeGreaterThan(skyAt(0).lightIntensity * 4);
    // The light always comes from above the horizon, sun or moon.
    for (let h = 0; h < 24; h += 0.5) expect(skyAt(h).lightDir[1]).toBeGreaterThan(0);
  });
});

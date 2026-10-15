import { describe, it, expect } from "vitest";
import { DAY_LENGTH, START_HOUR, hourAt, skyAt } from "./daylight";
import { makeCar, noInput, step, type Car } from "./physics";
import { STOCK_LOADOUT, specFor } from "./shop";
import {
  ABUTMENT_HALF, CONSIST, DECK_UNDERSIDE, DWELL, GUARD_LENGTH, TRAIN_LENGTH, TRAIN_SPEED, atStation, lapTime, trainMotion,
  bridgeEnds, crossingClosed, trackFrame, trackPoint, trainCars, trainHead, trainObstacles, trestleLegs,
} from "./track";
import { buildWorld } from "./world";

const world = buildWorld();
const { track } = world;
/** Seconds of game time, in the first lap, at which the front of the train is at distance `s`. */
const when = (s: number) => {
  let best = 0;
  let off = Infinity;
  for (let t = 0; t < lapTime(track); t += 0.05) {
    const d = Math.abs((((trainHead(track, t) - s) % track.length) + track.length * 1.5) % track.length - track.length / 2);
    if (d < off) {
      off = d;
      best = t;
    }
  }
  return best;
};

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
    const lap = lapTime(track);
    expect(trainHead(track, 50 + lap)).toBeCloseTo(trainHead(track, 50), 3);
    // A lap is the loop at speed, the slowing and the pulling away, and the minute at the platform.
    expect(lap).toBeGreaterThan(track.length / TRAIN_SPEED + DWELL);
    expect(lap).toBeLessThan(track.length / TRAIN_SPEED + DWELL + 60);
  });

  it("stands at the station a minute each lap, then pulls away (ADR 0022)", () => {
    const lap = lapTime(track);
    let standing = 0;
    for (let t = 0.25; t < lap; t += 0.5) {
      const m = trainMotion(track, t);
      if (m.speed === 0) {
        standing += 0.5;
        expect(m.head).toBeCloseTo(track.stop!, 6);
      }
      expect(m.speed).toBeLessThanOrEqual(TRAIN_SPEED + 1e-9);
    }
    expect(standing).toBeCloseTo(DWELL, 0);
    // Never a jump: it moves no further in a step than its top speed allows.
    for (let t = 0; t < lap; t += 0.25) {
      const d = (((trainHead(track, t + 0.25) - trainHead(track, t)) % track.length) + track.length) % track.length;
      expect(d).toBeLessThanOrEqual(TRAIN_SPEED * 0.25 + 1e-6);
    }
    // What the platform is told: in now, or how long until it is.
    const in_ = lap - DWELL / 2;
    expect(atStation(track, in_)).toMatchObject({ standing: true });
    expect(atStation(track, in_)!.left).toBeCloseTo(DWELL / 2, 3);
    expect(atStation(track, 10)).toMatchObject({ standing: false });
    expect(atStation(track, 10)!.due).toBeCloseTo(lap - DWELL - 10, 3);
  });

  it("closes a crossing before it arrives and opens it after it has gone", () => {
    const crossing = track.crossings[0];
    expect(crossingClosed(track, crossing, when(crossing - 400))).toBe(false);
    expect(crossingClosed(track, crossing, when(crossing - 100))).toBe(true);
    expect(crossingClosed(track, crossing, when(crossing + TRAIN_LENGTH / 2))).toBe(true);
    expect(crossingClosed(track, crossing, when(crossing + TRAIN_LENGTH + 80))).toBe(false);
  });

  it("is solid along its whole length", () => {
    const cars = trainCars(track, 10);
    const obstacles = trainObstacles(cars);
    expect(obstacles.length).toBeGreaterThan(CONSIST.length * 3);
    expect(obstacles.every((o) => o.h === Infinity)).toBe(true);
  });
});

describe("the bridges", () => {
  const ends = bridgeEnds(track, world.height);
  // The widest rig on the tallest tyres, with a snorkel: if it can't get on, nothing can.
  const big = specFor("duneclaw", { ...STOCK_LOADOUT, tyres: "crawler37", snorkel: "snorkel" });
  const drive = (car: Car, seconds: number, watch: (c: Car) => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      step(car, { ...noInput(), gas: true }, 1 / 60, world, big);
      watch(car);
    }
  };

  it("has an abutment at both ends of each", () => {
    expect(ends).toHaveLength(track.bridges.length * 2);
    for (const e of ends) expect((e.deep - e.bank) * e.dir).toBeGreaterThan(5);
  });

  it("stops a truck driving along the rails at the guard", () => {
    for (const e of ends) {
      const bank = trackFrame(track, e.bank);
      const [ix, iz] = [bank.fx * e.dir, bank.fz * e.dir];
      const from = trackFrame(track, e.bank - e.dir * 30);
      const car = makeCar(world, from.x, from.z, Math.atan2(ix, iz), big);
      let furthest = -Infinity;
      drive(car, 8, (c) => (furthest = Math.max(furthest, (c.x - bank.x) * ix + (c.z - bank.z) * iz)));
      expect(furthest).toBeLessThan(-GUARD_LENGTH);
      expect(Math.abs(car.speed)).toBeLessThan(0.5);
    }
  });

  it("keeps a truck out from under the low ends", () => {
    for (const e of ends) {
      const mid = trackFrame(track, (e.bank + e.deep) / 2);
      for (const side of [1, -1]) {
        const car = makeCar(world, mid.x + mid.lx * side * 16, mid.z + mid.lz * side * 16, Math.atan2(-mid.lx * side, -mid.lz * side), big);
        let closest = Infinity;
        drive(car, 8, (c) => {
          const across = Math.abs((c.x - mid.x) * mid.lx + (c.z - mid.z) * mid.lz);
          closest = Math.min(closest, across);
          // Under the deck, there's always room for the truck.
          if (across < 2.1 + 1.1) {
            const above = trackFrame(track, (e.bank + e.deep) / 2 + (c.x - mid.x) * mid.fx + (c.z - mid.z) * mid.fz);
            expect(above.y - DECK_UNDERSIDE - world.height(c.x, c.z)).toBeGreaterThan(3);
          }
        });
        // It got right up to the abutment, and no further.
        expect(closest).toBeGreaterThan(ABUTMENT_HALF);
        expect(closest).toBeLessThan(ABUTMENT_HALF + 4);
      }
    }
  });

  it("stands the trestle on solid legs", () => {
    const legs = trestleLegs(track, world.height, ends);
    expect(legs.length).toBeGreaterThan(10);
    for (const leg of legs) {
      expect(world.obstaclesNear(leg.x, leg.z).some((o) => o.h === Infinity && Math.hypot(o.x - leg.x, o.z - leg.z) < 0.01)).toBe(true);
    }
  });

  it("lets a truck pass under the train crossing overhead", () => {
    const [a, b] = track.bridges[0];
    const over = trackPoint(track, (a + b) / 2);
    const near = (list: { x: number; z: number }[]) => list.filter((o) => Math.hypot(o.x - over.x, o.z - over.z) < 8).length;
    const cars = trainCars(track, when((a + b) / 2 + TRAIN_LENGTH / 2));
    expect(near(trainObstacles(cars))).toBeGreaterThan(0);
    expect(near(trainObstacles(cars, world.height))).toBe(0);
    // On the ground it's as solid as ever.
    const level = trainCars(track, when(track.crossings[0] + TRAIN_LENGTH / 2));
    expect(trainObstacles(level, world.height)).toHaveLength(trainObstacles(level).length);
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

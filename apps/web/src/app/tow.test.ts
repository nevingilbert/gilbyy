import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { makeCar } from "./physics";
import { STOCK_LOADOUT, specFor } from "./shop";
import { LocalStore } from "./store";
import {
  TOW_APPROACH, TOW_FEE, TOW_GONE, TOW_LEAVE, TOW_RUN, TOW_SPEC, TOW_STOP, TOW_WAIT, approachLine, fmtAway, towArrived, towAway, towBack,
  towDrive, towDriveTime, towLeaving, towVisit, towWait, type TowLine, type TowVisit,
} from "./tow";
import { buildWorld, type Ground, type Obstacle } from "./world";

const ground = (obstacles: Obstacle[] = [], wet: (x: number, z: number) => boolean = () => false): Ground => ({
  height: () => 0,
  waterAt: (x, z) => (wet(x, z) ? 1 : -100),
  obstaclesNear: (x, z) => obstacles.filter((o) => Math.hypot(o.x - x, o.z - z) < 30),
  slipAt: () => 0,
  limit: 3000,
});
const tree = (x: number, z: number): Obstacle => ({ x, z, r: 0.5, h: Infinity });
/** A truck stuck at the origin, and a garage due south of it (+z). */
const HERE = { x: 0, z: 0 };
const GARAGE = { x: 0, z: 600 };
/** How near a line passes to a point. */
const passes = (l: TowLine, x: number, z: number) => {
  let nearest = Infinity;
  for (let back = 0; back <= l.length; back += 0.5) nearest = Math.min(nearest, Math.hypot(l.x - Math.sin(l.heading) * back - x, l.z - Math.cos(l.heading) * back - z));
  return nearest;
};

describe("ringing BBB", () => {
  it("costs what the server takes", () => {
    const dir = resolve(__dirname, "../../../../supabase/migrations");
    const sql = readdirSync(dir).map((f) => readFileSync(resolve(dir, f), "utf8")).filter((s) => s.includes("function public.call_tow()"));
    expect(sql).toHaveLength(1);
    expect(Number(sql[0].match(/fee constant numeric := ([\d.]+);/)?.[1])).toBe(TOW_FEE);
  });

  it("takes the fee from the miles to spend, and nothing from a driver who hasn't got it", async () => {
    const store = new LocalStore();
    store.addMiles(TOW_FEE + 2);
    expect(await store.tow()).toBeNull();
    expect(store.get().balance).toBeCloseTo(2);
    expect(store.get().lifetime).toBeCloseTo(TOW_FEE + 2);
    expect(await store.tow()).toMatch(/not enough/i);
    expect(store.get().balance).toBeCloseTo(2);
  });
});

describe("the wait", () => {
  it("is longer from a garage further off, but never very short or very long", () => {
    expect(towWait(20)).toBe(TOW_WAIT.min);
    expect(towWait(880)).toBeCloseTo(40);
    expect(towWait(1500)).toBeGreaterThan(towWait(880));
    expect(towWait(9000)).toBe(TOW_WAIT.max);
  });

  it("counts the distance down from the garage to where the truck comes into sight", () => {
    const line: TowLine = { x: 0, z: TOW_STOP, heading: Math.PI, length: 40 };
    const wait = towWait(880);
    expect(towAway(880, line, 0)).toBeCloseTo(880);
    expect(towAway(880, line, wait)).toBeCloseTo(40 + TOW_STOP);
    let before = Infinity;
    for (let t = 0; t <= wait + 5; t += 0.5) {
      const away = towAway(880, line, t);
      expect(away).toBeLessThanOrEqual(before);
      before = away;
    }
    expect(fmtAway(1609.344)).toBe("1.00 mi");
    expect(fmtAway(160)).toBe("0.10 mi");
  });
});

describe("the way in", () => {
  it("comes straight from the garage across open ground, and pulls up short of the truck", () => {
    const line = approachLine(ground(), HERE, GARAGE);
    expect(line.length).toBe(TOW_RUN);
    expect(Math.hypot(line.x, line.z)).toBeCloseTo(TOW_STOP);
    // On the garage's side, and facing the truck.
    expect(line.z).toBeCloseTo(TOW_STOP);
    expect(Math.cos(line.heading)).toBeCloseTo(-1);
  });

  it("is no longer than the way from the garage", () => {
    expect(approachLine(ground(), HERE, { x: 0, z: 30 }).length).toBeCloseTo(30 - TOW_STOP - 4);
    expect(approachLine(ground(), HERE, { x: 0, z: 8 }).length).toBe(0);
  });

  it("goes round a tree, a pond or a rock rather than through it", () => {
    for (const g of [ground([tree(0, 40)]), ground([{ x: 0.5, z: 30, r: 1.2, h: 1.1 }]), ground([], (x, z) => Math.abs(x) < 6 && z > 20 && z < 50)]) {
      const line = approachLine(g, HERE, GARAGE);
      expect(line.length).toBe(TOW_RUN);
      expect(Math.hypot(line.x, line.z)).toBeCloseTo(TOW_STOP);
      // Still from the garage's side of things, not from behind.
      expect(line.z).toBeGreaterThan(0);
    }
    expect(passes(approachLine(ground([tree(0, 40)]), HERE, GARAGE), 0, 40)).toBeGreaterThan(0.5 + TOW_SPEC.radius);
  });

  it("takes a shorter run where the trees crowd in, and none at all where they're all round", () => {
    const ring = (radius: number, gap: number) => {
      const n = Math.ceil((2 * Math.PI * radius) / gap);
      return Array.from({ length: n }, (_, i) => tree(Math.sin((i / n) * 2 * Math.PI) * radius, Math.cos((i / n) * 2 * Math.PI) * radius));
    };
    const crowded = approachLine(ground(ring(40, 2)), HERE, GARAGE);
    expect(crowded.length).toBeGreaterThan(0);
    expect(crowded.length).toBeLessThan(TOW_RUN);
    const hemmed = approachLine(ground(ring(TOW_STOP, 1.5)), HERE, GARAGE);
    expect(hemmed.length).toBe(0);
    expect(Math.hypot(hemmed.x, hemmed.z)).toBeCloseTo(TOW_STOP);
  });

  it("is there for most trucks stuck on a rock in the real valley", () => {
    const world = buildWorld();
    const spec = specFor("bluff", STOCK_LOADOUT);
    let tried = 0;
    let run = 0;
    let none = 0;
    for (const r of world.rocks) {
      const h = r.y + r.sy * 0.95 - world.height(r.x, r.z);
      // Only rocks a truck could reach: plenty stand on the valley's wall, past where anyone can drive.
      if (h <= spec.clearance || h > spec.clearance + spec.hang || Math.hypot(r.x, r.z) > world.limit - 30) continue;
      if (++tried > 300) break;
      const site = world.sites.reduce((best, s) => (Math.hypot(s.x - r.x, s.z - r.z) < Math.hypot(best.x - r.x, best.z - r.z) ? s : best));
      const line = approachLine(world, r, site);
      if (line.length >= 20) run++;
      if (line.length === 0) none++;
    }
    expect(run / 300).toBeGreaterThan(0.6);
    expect(none / 300).toBeLessThan(0.15);
  });
});

describe("the visit", () => {
  const flat = ground();
  const visit = (length: number): TowVisit => ({ line: { x: 0, z: TOW_STOP, heading: Math.PI, length }, car: makeCar(flat, 0, 0, 0, TOW_SPEC), t: 0, gone: -1 });
  const DT = 1 / 60;

  it("drives in at speed and brakes to a stop where it pulls up", () => {
    expect(towDrive(60, 0)).toBe(0);
    expect(towDrive(60, towDriveTime(60))).toBeCloseTo(60);
    expect(towDrive(60, 0.1) / 0.1).toBeCloseTo(TOW_APPROACH, 0);
    let before = -1;
    for (let t = 0; t <= towDriveTime(60) + 1; t += 0.1) {
      expect(towDrive(60, t)).toBeGreaterThanOrEqual(before);
      before = towDrive(60, t);
    }
  });

  it("comes into sight faint, pulls up, waits for the truck to come free, then backs away and is gone", () => {
    const v = visit(40);
    expect(towVisit(v, flat, DT, true)).toBeLessThan(0.1);
    expect(v.car.z).toBeCloseTo(TOW_STOP + 40, 0);
    while (!towArrived(v)) towVisit(v, flat, DT, true);
    expect(towVisit(v, flat, DT, true)).toBe(1);
    expect(v.car.z).toBeCloseTo(TOW_STOP, 1);
    expect(v.car.y).toBeCloseTo(TOW_SPEC.ride);
    // However long the hauling takes.
    for (let t = 0; t < 20; t += DT) towVisit(v, flat, DT, true);
    expect(v.gone).toBe(-1);
    expect(v.car.z).toBeCloseTo(TOW_STOP, 1);
    // Free: it lets go and backs off the way it came.
    for (let t = 0; t < 2; t += DT) towVisit(v, flat, DT, false);
    expect(v.car.z).toBeGreaterThan(TOW_STOP + 2);
    expect(v.car.speed).toBeLessThan(0);
    let fade = 1;
    for (let t = 0; t < TOW_GONE; t += DT) fade = towVisit(v, flat, DT, false);
    expect(fade).toBe(0);
    expect(towBack(TOW_GONE)).toBeGreaterThan(15);
  });

  it("doesn't turn back before it has arrived, even for a truck that got free some other way", () => {
    const v = visit(40);
    for (let t = 0; t < towDriveTime(40) - 0.5; t += DT) towVisit(v, flat, DT, false);
    expect(v.gone).toBe(-1);
    for (let t = 0; t < 1; t += DT) towVisit(v, flat, DT, false);
    expect(v.gone).toBeGreaterThanOrEqual(0);
  });
});

describe("the film of it leaving", () => {
  const door = { inside: { x: 0, z: 0 }, approach: { x: 0, z: 9 }, heading: 0, sink: 0.8 };

  it("opens the door, pulls out through it and away, and shuts it behind", () => {
    const start = towLeaving(door, 0);
    expect(start).toMatchObject({ x: 0, z: 0, rolled: 0, out: false, open: 0, dark: 0 });
    expect(start.sink).toBeCloseTo(0.8);
    // The door is up before the truck reaches it.
    let t = 0;
    while (towLeaving(door, t).rolled < 3) t += 0.05;
    expect(towLeaving(door, t).open).toBeGreaterThan(0.9);
    const end = towLeaving(door, TOW_LEAVE);
    expect(end.out).toBe(true);
    expect(end.sink).toBe(0);
    expect(end.z).toBeGreaterThan(18);
    expect(end.z).toBeLessThan(30);
    expect(end.open).toBe(0);
    expect(end.dark).toBe(1);
  });

  it("is watched from out in front of the door, off to one side", () => {
    const { camera } = towLeaving(door, 1);
    expect(camera.z).toBeGreaterThan(20);
    expect(Math.abs(camera.x)).toBeGreaterThan(5);
  });
});

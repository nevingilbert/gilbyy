import { describe, expect, it } from "vitest";
import { kerbAt } from "./city";
import { LINE_UP_BACK } from "./convoy";
import { crossed } from "./mission-run";
import { OFF_ROAD, makeCar, step } from "./physics";
import { METRES_PER_MILE, STOCK_LOADOUT, specFor } from "./shop";
import { BEACH, CROSS, STRIP_X, VEGAS, buildVegas, fromResort, resortFrame, resortMasses, type Resort } from "./vegas";
import { vehicleById } from "./vehicles";
import { placeHerds } from "./wildlife";
import type { Mission } from "./world";

const vegas = buildVegas();
const ground = (x: number, z: number) => vegas.height(x, z);
const zone = (x: number, z: number) => vegas.zone[Math.round((z + 3000) / 10) * 601 + Math.round((x + 3000) / 10)];
const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
/** Every point a metre or two apart along a course's line, from its arch through its flags. */
const along = (m: Mission) => {
  const pts = [m.start, ...m.gates];
  const out: { x: number; z: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / 2);
    for (let k = 0; k < n; k++) out.push({ x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / n, z: pts[i - 1].z + ((pts[i].z - pts[i - 1].z) * k) / n });
  }
  return out;
};
const miles = (m: Mission) => along(m).length * 2 / METRES_PER_MILE;

describe("Las Vegas", () => {
  it("is a world of its own, with a dock and no airstrip or station, its camp where a truck can drive", () => {
    expect(vegas.id).toBe("vegas");
    expect(vegas.dock).not.toBeNull();
    expect(vegas.airport).toBeNull();
    expect(vegas.station).toBeNull();
    expect(zone(vegas.start.x, vegas.start.z)).toBe(1);
    for (const s of [...vegas.sites, vegas.cafe]) expect(zone(s.x, s.z), `${"style" in s ? s.style : "diner"}`).toBe(1);
  });

  it("has four courses to drive alone and four for friends, two of them races", () => {
    expect(vegas.missions.filter((m) => m.crew === 1)).toHaveLength(4);
    expect(vegas.missions.filter((m) => m.crew > 1)).toHaveLength(4);
    expect(vegas.missions.filter((m) => m.race).map((m) => m.id).sort()).toEqual(["grand-prix-race", "red-rock-race"]);
  });

  it("lays every course on dry ground a truck can reach, nowhere steeper than a rig can take", () => {
    for (const m of vegas.missions) {
      for (const p of along(m)) {
        expect(vegas.waterAt(p.x, p.z) - ground(p.x, p.z), `${m.id} wet at ${p.x}, ${p.z}`).toBeLessThan(0.4);
        expect(slope(p.x, p.z), `${m.id} steep at ${p.x}, ${p.z}`).toBeLessThan(0.48);
        expect(zone(p.x, p.z), `${m.id} out of reach at ${p.x}, ${p.z}`).toBeGreaterThan(0);
      }
    }
  });

  it("leaves room behind a course for friends' trucks to line up", () => {
    for (const m of vegas.missions.filter((m) => m.crew > 1)) {
      for (let d = 0; d <= LINE_UP_BACK; d += 4) {
        const x = m.start.x - Math.sin(m.start.heading) * d;
        const z = m.start.z - Math.cos(m.start.heading) * d;
        expect(vegas.waterAt(x, z) - ground(x, z), `${m.id} at ${d}`).toBeLessThan(0.4);
        expect(slope(x, z), `${m.id} at ${d}`).toBeLessThan(0.4);
      }
    }
  });

  it("pays a repeat run at least five times the miles it covers, and a first finish two and a half times that", () => {
    for (const m of vegas.missions) {
      expect(m.repeatReward, m.id).toBeGreaterThanOrEqual(5 * miles(m));
      expect(m.reward, m.id).toBeGreaterThanOrEqual(2.5 * m.repeatReward);
    }
  });

  it("runs the Grand Prix on tarmac the whole way round, and the Strip's course up its lanes, clear of the sign", () => {
    for (const id of ["grand-prix", "grand-prix-race", "the-strip"]) {
      const m = vegas.missions.find((m) => m.id === id)!;
      for (const p of along(m)) expect(vegas.pavedAt!(p.x, p.z), `${id} at ${p.x}, ${p.z}`).toBe(true);
    }
    const strip = vegas.missions.find((m) => m.id === "the-strip")!;
    for (const p of along(strip)) expect(Math.hypot(p.x - vegas.vegas.sign.x, p.z - vegas.vegas.sign.z)).toBeGreaterThan(4);
    // The Strip runs the length of the town, its cross streets off it.
    for (const z of Object.values(CROSS)) expect(kerbAt(vegas.vegas.kerb, STRIP_X, z)).toBeLessThan(-5);
  });

  it("takes the canyon's courses down the side canyon to a beach by the river, where any truck can drive", () => {
    for (const id of ["canyon-descent", "rim-to-river"]) {
      const m = vegas.missions.find((m) => m.id === id)!;
      const end = m.gates[m.gates.length - 1];
      expect(ground(end.x, end.z), id).toBeLessThan(VEGAS.lake + 4);
      expect(zone(end.x, end.z), id).toBe(1);
      expect(ground(m.start.x, m.start.z), id).toBeGreaterThan(VEGAS.rim - 12);
    }
    // The beaches are out of the river: dry, and only just above it.
    const canyon = vegas.vegas.canyon;
    const i = Math.round(canyon.xs.length * 0.6);
    const [dx, dz] = [canyon.xs[i + 1] - canyon.xs[i - 1], canyon.zs[i + 1] - canyon.zs[i - 1]];
    const len = Math.hypot(dx, dz);
    for (const s of [1, -1]) {
      const x = canyon.xs[i] + (dz / len) * BEACH * s;
      const z = canyon.zs[i] - (dx / len) * BEACH * s;
      expect(ground(x, z) - VEGAS.lake).toBeGreaterThan(0.2);
      expect(ground(x, z) - VEGAS.lake).toBeLessThan(3);
    }
    // And in the middle the river's too deep for any rig to ford.
    expect(VEGAS.lake - ground(canyon.xs[i], canyon.zs[i])).toBeGreaterThan(3);
  });

  it("has bighorn on the canyon's walls and Red Rock, jackrabbits and roadrunners on the desert, condors over the canyon", () => {
    const herds = placeHerds(vegas);
    for (const id of ["bighorn", "jackrabbit", "roadrunner", "condor"] as const) expect(herds.filter((h) => h.species === id).length, id).toBeGreaterThan(2);
    // The condors circle at the rim's height, out over the canyon.
    for (const h of herds.filter((h) => h.species === "condor")) expect(ground(h.home.x, h.home.z)).toBeLessThan(VEGAS.rim - 60);
  });

  it("finishes Red Rock Race back at its arch, through flags that face the way the race comes in", () => {
    const m = vegas.missions.find((q) => q.id === "red-rock-race")!;
    const [end, before] = [m.gates.at(-1)!, m.gates.at(-2)!];
    // Once round, and no two flags on one spot.
    expect(Math.hypot(end.x - m.start.x, end.z - m.start.z)).toBeLessThan(1);
    m.gates.forEach((g, i) => i && expect(Math.hypot(g.x - m.gates[i - 1].x, g.z - m.gates[i - 1].z), `gate ${i + 1}`).toBeGreaterThan(1));
    // Driven in from the last flag but one, straight through the finish's middle, it counts.
    const [dx, dz] = [(end.x - before.x) / Math.hypot(end.x - before.x, end.z - before.z), (end.z - before.z) / Math.hypot(end.x - before.x, end.z - before.z)];
    expect(crossed(end, { x: end.x - dx * 2, z: end.z - dz * 2 }, { x: end.x + dx * 2, z: end.z + dz * 2 })).toBe(true);
  });

  it("keeps the resorts off the streets", () => {
    for (const r of vegas.vegas.roads) {
      for (let i = 0; i < r.xs.length; i++) expect(vegas.vegas.walls.distance(r.xs[i], r.zs[i]), `${r.name}`).toBeGreaterThan(r.half);
    }
  });

  it("stands nothing a truck runs into on a road or its pavement: the wheel's feet are clear of Flamingo Road", () => {
    const { kerb, resorts } = vegas.vegas;
    const into = new Set<string>();
    const check = (r: Resort, x: number, z: number) => {
      if (kerbAt(kerb, x, z) < 1.6) into.add(`the ${r.kind} at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    };
    for (const r of resorts) {
      const { rot } = resortFrame(r);
      const { boxes, rounds } = resortMasses(r);
      for (const o of rounds) {
        const c = fromResort(r, o.x, o.z);
        for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) check(r, c.x + Math.cos(a) * o.r, c.z + Math.sin(a) * o.r);
      }
      for (const b of boxes) {
        const c = fromResort(r, b.x, b.z);
        const [cos, sin] = [Math.cos(rot + b.rot), Math.sin(rot + b.rot)];
        for (let u = -b.hw; u <= b.hw + 1e-6; u += 1) for (let v = -b.hd; v <= b.hd + 1e-6; v += 1) check(r, c.x + u * cos + v * sin, c.z - u * sin + v * cos);
      }
    }
    expect([...into]).toEqual([]);
  });
});

describe("the Slipstream", () => {
  const spec = specFor("slipstream", STOCK_LOADOUT);
  const flatOut = (x: number, z: number, heading: number, seconds: number) => {
    const car = makeCar(vegas, x, z, heading, spec);
    for (let t = 0; t < seconds; t += 1 / 60) step(car, { left: false, right: false, gas: true, brake: false }, 1 / 60, vegas, spec);
    return car;
  };

  it("is the quickest thing there is on tarmac", () => {
    const car = flatOut(STRIP_X + 5, 980, Math.PI, 12);
    expect(car.speed).toBeGreaterThan(vehicleById("slipstream").maxSpeed * 0.98);
    expect(car.speed).toBeGreaterThan(vehicleById("sandfly").maxSpeed + 5);
  });

  it("and crawls off it", () => {
    const car = flatOut(-900, 700, -Math.PI / 2, 12);
    expect(vegas.pavedAt!(car.x, car.z)).toBe(false);
    expect(car.speed).toBeLessThan(vehicleById("slipstream").maxSpeed * OFF_ROAD.speed + 0.1);
    expect(car.speed).toBeLessThan(vehicleById("ridgeback").maxSpeed);
  });
});

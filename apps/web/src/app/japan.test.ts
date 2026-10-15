import { describe, expect, it } from "vitest";
import { LINE_UP_BACK } from "./convoy";
import { JAPAN, buildJapan } from "./japan";
import { METRES_PER_MILE } from "./shop";
import { VEHICLES, vehicleById } from "./vehicles";
import { placeHerds } from "./wildlife";
import type { Mission } from "./world";

const japan = buildJapan();
const ground = (x: number, z: number) => japan.height(x, z);
const zone = (x: number, z: number) => japan.zone[Math.round((z + 3000) / 10) * 601 + Math.round((x + 3000) / 10)];
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
const miles = (m: Mission) => (along(m).length * 2) / METRES_PER_MILE;

describe("Japan", () => {
  it("is a world of its own, with a helipad and no airstrip, station or dock, its camp where a truck can drive", () => {
    expect(japan.id).toBe("japan");
    expect(japan.pad).not.toBeNull();
    expect(japan.airport).toBeNull();
    expect(japan.station).toBeNull();
    expect(japan.dock).toBeNull();
    expect(zone(japan.start.x, japan.start.z)).toBe(1);
    for (const s of [...japan.sites, japan.cafe]) expect(zone(s.x, s.z), `${"style" in s ? s.style : "teahouse"}`).toBe(1);
  });

  it("has four courses to drive alone and four for friends, two of them races", () => {
    expect(japan.missions.filter((m) => m.crew === 1)).toHaveLength(4);
    expect(japan.missions.filter((m) => m.crew > 1)).toHaveLength(4);
    expect(japan.missions.filter((m) => m.race).map((m) => m.id).sort()).toEqual(["harbour-run", "pagoda-race"]);
  });

  it("lays every course on dry ground a truck can reach, nowhere steeper than a rig can take", () => {
    for (const m of japan.missions) {
      for (const p of along(m)) {
        expect(japan.waterAt(p.x, p.z) - ground(p.x, p.z), `${m.id} wet at ${p.x}, ${p.z}`).toBeLessThan(0.4);
        expect(slope(p.x, p.z), `${m.id} steep at ${p.x}, ${p.z}`).toBeLessThan(0.48);
        expect(zone(p.x, p.z), `${m.id} out of reach at ${p.x}, ${p.z}`).toBeGreaterThan(0);
        expect(japan.slipAt(p.x, p.z), `${m.id} on snow at ${p.x}, ${p.z}`).toBe(0);
      }
    }
  });

  it("leaves room behind a course for friends' trucks to line up", () => {
    for (const m of japan.missions.filter((m) => m.crew > 1)) {
      for (let d = 0; d <= LINE_UP_BACK; d += 4) {
        const x = m.start.x - Math.sin(m.start.heading) * d;
        const z = m.start.z - Math.cos(m.start.heading) * d;
        expect(japan.waterAt(x, z) - ground(x, z), `${m.id} at ${d}`).toBeLessThan(0.4);
        expect(slope(x, z), `${m.id} at ${d}`).toBeLessThan(0.4);
      }
    }
  });

  it("pays a repeat run at least five times the miles it covers, and a first finish two and a half times that", () => {
    for (const m of japan.missions) {
      expect(m.repeatReward, m.id).toBeGreaterThanOrEqual(5 * miles(m));
      expect(m.reward, m.id).toBeGreaterThanOrEqual(2.5 * m.repeatReward);
    }
  });

  it("caps the mountain with snow as slippery as the valley's, and keeps it off the lowlands", () => {
    const f = JAPAN.fuji;
    expect(ground(f.x + 60, f.z)).toBeGreaterThan(f.snow + 40);
    expect(japan.slipAt(f.x + 60, f.z)).toBe(1);
    expect(japan.slipAt(japan.start.x, japan.start.z)).toBe(0);
    expect(japan.slipAt(JAPAN.lake.x, JAPAN.lake.z + JAPAN.lake.r + 40)).toBe(0);
  });

  it("floats its boats off the harbour, stands its gate in the lake's shallows, and keeps the houses off the streets", () => {
    const boats = japan.japan.features.filter((f) => f.kind === "boat");
    expect(boats.length).toBeGreaterThan(2);
    for (const b of boats) expect(ground(b.x, b.z), `boat at ${b.x}, ${b.z}`).toBeLessThan(-2);
    const gate = japan.japan.features.find((f) => f.kind === "torii")!;
    const depth = japan.waterAt(gate.x, gate.z) - ground(gate.x, gate.z);
    expect(depth).toBeGreaterThan(0.2);
    expect(depth).toBeLessThan(1.5);
    // A truck that wades out to it meets its pillars, not thin air.
    expect(japan.obstaclesNear(gate.x, gate.z + 6).some((o) => Math.hypot(o.x - gate.x, o.z - gate.z - 6) < 0.1)).toBe(true);
    for (const r of japan.japan.roads) {
      for (let i = 0; i < r.xs.length; i++) expect(japan.japan.walls.distance(r.xs[i], r.zs[i]), r.name).toBeGreaterThan(r.half);
    }
    expect(japan.japan.houses.length).toBeGreaterThan(100);
  });

  it("has sika in the woods and meadows, macaques round the hot spring, and cranes in the paddies", () => {
    const herds = placeHerds(japan);
    for (const id of ["sika", "macaque", "crane"] as const) expect(herds.filter((h) => h.species === id).length, id).toBeGreaterThan(2);
    for (const h of herds.filter((h) => h.species === "macaque")) expect(Math.hypot(h.home.x - JAPAN.onsen.x, h.home.z - JAPAN.onsen.z)).toBeLessThan(450);
    for (const h of herds.filter((h) => h.species === "crane")) expect(japan.waterAt(h.home.x, h.home.z)).toBeGreaterThan(ground(h.home.x, h.home.z));
  });
});

describe("the Kei Truck", () => {
  it("is the narrowest rig there is, and sold in Japan only", () => {
    const kei = vehicleById("kei");
    expect(kei.id).toBe("kei");
    for (const v of VEHICLES) if (v.id !== "kei") expect(kei.width).toBeLessThan(v.width);
    expect(kei.only).toBe("japan");
  });
});

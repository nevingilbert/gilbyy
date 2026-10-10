import { describe, expect, it } from "vitest";
import { fieldDist } from "./airport";
import { startRun, tick } from "./mission-run";
import { TOO_QUICK } from "./missions";
import { makeCar, noInput, step } from "./physics";
import { buildIsland } from "./island";
import { RAMP, rampLocal } from "./ramp";
import { METRES_PER_MILE, PARTS, STOCK_LOADOUT, priceOf, specFor, type Loadout } from "./shop";
import { STARTERS, VEHICLES, vehicleById, type VehicleId } from "./vehicles";
import { buildWorld, type Mission, type World } from "./world";

const world = buildWorld();
const island = buildIsland();
const miles = (m: Mission) => {
  let metres = 0;
  let at: { x: number; z: number } = m.start;
  for (const g of m.gates) {
    metres += Math.hypot(g.x - at.x, g.z - at.z);
    at = g;
  }
  return metres / METRES_PER_MILE;
};

/**
 * Drives `m` from its start arch with a simple autopilot: full throttle at the next
 * flag, through its middle. No path finding, so it only manages courses whose straight
 * lines between flags are drivable.
 */
function drive(m: Mission, loadout: Loadout = STOCK_LOADOUT, rig: VehicleId = "bluff", ground: World = world) {
  const spec = specFor(rig, loadout);
  const car = makeCar(ground, m.start.x, m.start.z, m.start.heading, spec);
  const run = startRun(m);
  run.clock = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 400; t += dt) {
    const g = m.gates[run.next];
    const close = Math.hypot(g.x - car.x, g.z - car.z) < 12;
    const tx = g.x + (close ? Math.sin(g.heading) * 12 : 0);
    const tz = g.z + (close ? Math.cos(g.heading) * 12 : 0);
    const off = Math.atan2(Math.sin(Math.atan2(tx - car.x, tz - car.z) - car.heading), Math.cos(Math.atan2(tx - car.x, tz - car.z) - car.heading));
    const input = { ...noInput(), gas: Math.abs(off) < 0.9 || car.speed < 4, brake: Math.abs(off) > 0.9 && car.speed > 6, left: off > 0.04, right: off < -0.04 };
    const from = { x: car.x, z: car.z };
    step(car, input, dt, ground, spec);
    const e = tick(run, dt, from, car, car.grounded);
    if (e?.kind === "finish") return { seconds: e.seconds, air: e.air, miles: car.distance / METRES_PER_MILE };
    if (e?.kind === "lost") break;
  }
  return null;
}

describe("the courses", () => {
  it("are all laid out", () => {
    expect(world.missions.map((m) => m.id).sort()).toEqual([
      "barn-round", "big-air", "convoy", "deep-woods", "far-bank", "flat-out", "forest-slalom", "grand-tour", "high-ridge", "hill-race",
      "ice-drift", "lakehead-race", "lakeshore-loop", "race", "ridge-run", "snowfield", "snowline", "southern-shore", "trackside",
      "two-lakes-race",
    ]);
    expect(island.missions.map((m) => m.id).sort()).toEqual([
      "beach-run", "coast-convoy", "dune-dash", "dune-derby", "hilltop", "jungle-loop", "sand-race", "tideline",
    ]);
  });

  // Half to drive alone and half for friends, in each world, and of those for friends half
  // together and half against each other.
  it("are split evenly between driving alone and driving with friends", () => {
    for (const [courses, each] of [[world.missions, 10], [island.missions, 4]] as const) {
      expect(courses.filter((m) => m.crew === 1)).toHaveLength(each);
      expect(courses.filter((m) => m.crew > 1)).toHaveLength(each);
      expect(courses.filter((m) => m.crew > 1 && m.race)).toHaveLength(each / 2);
    }
  });

  // New courses are laid out round what was there (ADR 0019): the thirteen older ones, the
  // easter eggs and the airstrip must stay exactly where players have already found them.
  it("leave the older courses, the easter eggs and the airstrip where they were", () => {
    const at = (p: { x: number; z: number }) => [Math.round(p.x), Math.round(p.z)];
    expect(world.missions.slice(0, 13).map((m) => [m.id, ...at(m.start)])).toEqual([
      ["forest-slalom", -240, -120], ["ridge-run", 300, 540], ["lakeshore-loop", -987, 871], ["ice-drift", -35, -1550],
      ["convoy", -613, -89], ["race", -751, -326], ["grand-tour", 482, 572], ["hill-race", -1219, -70],
      ["deep-woods", 740, 1700], ["southern-shore", 111, 1122], ["high-ridge", -710, 1850], ["snowfield", -280, -1540],
      ["far-bank", 868, -478],
    ]);
    expect(world.landmarks.map((l) => [l.kind, ...at(l)])).toEqual([["school", -1520, -560], ["casino", -230, 1480], ["bank", 1450, 1150], ["church", 10, 2170]]);
    expect(at(world.airport)).toEqual([1240, -280]);
    expect(island.missions.slice(0, 3).map((m) => [m.id, ...at(m.start)])).toEqual([["beach-run", -1477, 208], ["dune-dash", -1025, -691], ["jungle-loop", -426, 323]]);
  });

  it("keep the newer ones clear of the older ones, the easter eggs and the hidden airstrip", () => {
    const line = (m: Mission) => {
      const pts = [m.start, ...m.gates];
      return pts.slice(1).flatMap((b, i) => {
        const a = pts[i];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10);
        return Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }));
      });
    };
    const newer = world.missions.slice(13);
    expect(newer).toHaveLength(7);
    for (const m of newer) {
      const mine = line(m);
      for (const other of world.missions.filter((o) => o !== m)) {
        const theirs = line(other);
        // A run of flags keeps 150 m off; a loop, which needs more room to exist at all, 100 m at its flags.
        expect(Math.min(...mine.map((p) => Math.min(...theirs.map((q) => Math.hypot(p.x - q.x, p.z - q.z))))), `${m.id} and ${other.id}`).toBeGreaterThan(75);
      }
      for (const p of mine) {
        expect(fieldDist(world.airport, p.x, p.z), m.id).toBeGreaterThan(500);
        for (const l of world.landmarks) expect(Math.hypot(l.x - p.x, l.z - p.z), `${m.id} and the ${l.kind}`).toBeGreaterThan(250);
      }
    }
  });

  // The server refuses a claim quicker than `minSeconds` or that banked less than
  // `minMiles`, so an honest run must clear both comfortably. Lakeshore Loop is left out:
  // the straight line to its fifth flag crosses a bay, which a person drives round.
  it.each(world.missions.filter((m) => m.id !== "lakeshore-loop").map((m) => [m.id, m] as const))(
    "%s can be driven by a starter rig, slower than the limit and banking more than it asks",
    (_, m) => {
      // Snowfield needs snow gear; everything else is driven on what a starter comes with.
      const run = drive(m, m.id === "snowfield" ? { ...STOCK_LOADOUT, winter: "chains" } : STOCK_LOADOUT);
      expect(run).not.toBeNull();
      expect(run!.seconds).toBeGreaterThan(m.minSeconds);
      expect(run!.miles).toBeGreaterThan(m.minMiles * 1.4);
    },
  );

  it.each(island.missions.map((m) => [m.id, m] as const))("%s, on the island, can be driven by a starter rig the same way", (_, m) => {
    const run = drive(m, STOCK_LOADOUT, "bluff", island);
    expect(run).not.toBeNull();
    expect(run!.seconds).toBeGreaterThan(m.minSeconds);
    expect(run!.miles).toBeGreaterThan(m.minMiles * 1.4);
  });

  // The limit used to be 23 m/s, which the Sandfly (24.5) beat along the beach: an honest
  // run in the island's own rig was refused as too fast to be true.
  it("never take the quickest rigs, flat out, for cheats", () => {
    const quickest = Math.max(...VEHICLES.map((v) => v.maxSpeed));
    expect(TOO_QUICK).toBeGreaterThan(quickest * 1.08);
    for (const rig of ["duneclaw", "sandfly"] as const) {
      for (const [ground, courses] of [[world, world.missions], [island, island.missions]] as const) {
        for (const m of courses) {
          // The autopilot doesn't get every course round at this speed; where it does, the time has to stand.
          const run = drive(m, { ...STOCK_LOADOUT, winter: "chains" }, rig, ground);
          if (run) expect(run.seconds, `${rig} on ${m.id}`).toBeGreaterThan(m.minSeconds);
        }
      }
    }
    const beach = island.missions.find((m) => m.id === "beach-run")!;
    expect(drive(beach, STOCK_LOADOUT, "sandfly", island)!.seconds).toBeLessThan(beach.minSeconds * 1.2);
  });
});

describe("the jump", () => {
  const jump = world.missions.find((m) => m.id === "big-air")!;
  const ramp = jump.ramp!;

  it("is the one course with a ramp, a short drive from camp on open, level ground", () => {
    expect([...world.missions, ...island.missions].filter((m) => m.ramp).map((m) => m.id)).toEqual(["big-air"]);
    expect(Math.hypot(jump.start.x - world.start.x, jump.start.z - world.start.z)).toBeLessThan(1400);
    // The ramp's own ground is a levelled pad; the run at it and the landing beyond are close to level.
    const bare = (u: number, w = 0) => world.height(ramp.x + Math.sin(ramp.heading) * u + Math.cos(ramp.heading) * w, ramp.z + Math.cos(ramp.heading) * u - Math.sin(ramp.heading) * w);
    const pad = [-8, -1, RAMP.length + RAMP.back + 1, RAMP.length + 10].flatMap((u) => [bare(u), bare(u, 8), bare(u, -8)]);
    expect(Math.max(...pad) - Math.min(...pad)).toBeLessThan(0.05);
    const hs = [-20, -10, -1, RAMP.length + RAMP.back + 1, RAMP.length + 20, RAMP.length + 45].flatMap((u) => [bare(u), bare(u, 5), bare(u, -5)]);
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(2);
  });

  it("runs straight up the middle of the ramp, with a flag on the deck at the lip", () => {
    expect(ramp.heading).toBeCloseTo(jump.start.heading);
    const local = [jump.start, ...jump.gates].map((p) => rampLocal(ramp, p.x, p.z));
    for (const p of local) expect(Math.abs(p.w)).toBeLessThan(0.01);
    // Three flags before it, one on the deck just short of the lip, two beyond.
    expect(local.map((p) => (p.u < 0 ? "before" : p.u < RAMP.length ? "on" : "beyond"))).toEqual(["before", "before", "before", "before", "on", "beyond", "beyond"]);
    const lip = jump.gates[3];
    expect(local[4].u).toBeGreaterThan(RAMP.length - 2);
    expect(lip.width).toBeLessThan(RAMP.width);
    // That flag's posts stand on the deck, not in the air beside it.
    for (const side of [1, -1]) {
      const post = { x: lip.x + Math.cos(lip.heading) * side * (lip.width / 2), z: lip.z - Math.sin(lip.heading) * side * (lip.width / 2) };
      expect(world.height(post.x, post.z)).toBeCloseTo(world.height(lip.x, lip.z), 1);
    }
    expect(world.height(lip.x, lip.z) - world.height(ramp.x, ramp.z)).toBeGreaterThan(RAMP.height * 0.8);
  });

  it("has the fastest rig down before the first landing flag, and room past the finish to pull up", () => {
    for (const rig of ["bluff", "sandfly"] as const) {
      const spec = specFor(rig, STOCK_LOADOUT);
      const car = makeCar(world, jump.start.x, jump.start.z, jump.start.heading, spec);
      let landed = 0;
      let flown = false;
      for (let t = 0; t < 14 && !landed; t += 1 / 60) {
        step(car, { ...noInput(), gas: true }, 1 / 60, world, spec);
        const { u } = rampLocal(ramp, car.x, car.z);
        flown ||= u > RAMP.length && !car.grounded;
        if (flown && car.grounded) landed = u;
      }
      expect(landed, rig).toBeGreaterThan(RAMP.length + 10);
      expect(landed, rig).toBeLessThan(rampLocal(ramp, jump.gates[4].x, jump.gates[4].z).u);
    }
    // Nothing to hit for 40 m beyond the last flag.
    const end = jump.gates[5];
    for (let d = 0; d <= 40; d += 2) {
      const p = { x: end.x + Math.sin(end.heading) * d, z: end.z + Math.cos(end.heading) * d };
      expect(world.obstaclesNear(p.x, p.z).some((o) => o.h > 0.8 && Math.hypot(o.x - p.x, o.z - p.z) < o.r + 3)).toBe(false);
      expect(world.height(p.x, p.z)).toBeGreaterThan(world.waterAt(p.x, p.z) + 0.4);
    }
  });

  it("is about a second in the air for a starter, and longer for a quicker rig", () => {
    const slow = drive(jump)!;
    const quick = drive(jump, STOCK_LOADOUT, "duneclaw")!;
    expect(slow.air).toBeGreaterThan(0.9);
    expect(slow.air).toBeLessThan(1.4);
    expect(quick.air).toBeGreaterThan(slow.air + 0.1);
  });
});

describe("the economy", () => {
  const everyCourse = [...world.missions, ...island.missions];
  /** Miles an hour at the fastest starter's top speed: the most plain driving earns at first. */
  const fastestStarter = (Math.max(...STARTERS.map((v) => v.maxSpeed)) * 3600) / METRES_PER_MILE;

  it("pays even a repeat run at least five times the miles it covers, in both worlds", () => {
    for (const m of everyCourse) expect(m.repeatReward, m.id).toBeGreaterThanOrEqual(5 * miles(m));
  });

  it("pays a first finish at least two and a half times a repeat", () => {
    for (const m of everyCourse) expect(m.reward, m.id).toBeGreaterThanOrEqual(2.5 * m.repeatReward);
  });

  it("puts the best rig hours of driving away, and every course's first finish together within reach of it", () => {
    const best = vehicleById("duneclaw").price;
    expect(best / fastestStarter).toBeGreaterThan(6);
    expect(world.missions.reduce((sum, m) => sum + m.reward, 0)).toBeGreaterThan(best);
  });

  it("keeps the first upgrade of each kind a quarter of an hour's drive away, bar the snorkel and snow gear", () => {
    const cheapest = (prices: number[]) => Math.min(...prices.filter((p) => p > 0));
    const quarterHour = fastestStarter / 4;
    expect(cheapest(VEHICLES.filter((v) => !v.only).map((v) => v.price))).toBeLessThanOrEqual(quarterHour);
    for (const kind of ["paint", "tyres", "lights"] as const) expect(cheapest(PARTS[kind].map((p) => p.price)), kind).toBeLessThanOrEqual(quarterHour);
    // The snorkel and the snow gear are for later, and courses pay for them.
    for (const key of ["snorkel:snorkel", "winter:chains", "tyres:studded"]) expect(priceOf(key), key).toBeGreaterThan(quarterHour * 2);
  });
});

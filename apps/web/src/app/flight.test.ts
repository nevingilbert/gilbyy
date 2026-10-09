import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { APRON, RUNWAY, fieldDist, toField } from "./airport";
import {
  ARRIVE, DEPART, PLANE, RAMP_DOWN, RAMP_FOOT, RAMP_SHUT, arrival, boardSpot, deckAt, departure, leaveSpot, rideOnDeck, standPose, type Frame,
} from "./flight";
import { buildIsland } from "./island";
import { worldTopic } from "./net";
import { itemKey, soldOnlyIn } from "./shop";
import { LocalStore } from "./store";
import { VEHICLES } from "./vehicles";
import { buildWorld, type World } from "./world";
import { WORLDS, WORLD_IDS, flightFrom, isWorld } from "./worlds";

const migration = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261009180000_island.sql"), "utf8");

const valley = buildWorld();
const island = buildIsland();
const STEP = 0.05;

/** Every frame of a film, with its time. */
const frames = (end: number, at: (t: number) => Frame) => Array.from({ length: Math.round(end / STEP) + 1 }, (_, i) => ({ t: i * STEP, f: at(i * STEP) }));

describe.each([["valley", valley], ["island", island]] as const)("flying out of and into the %s", (_, w: World) => {
  const a = w.airport;
  const from = { ...boardSpot(a), heading: a.heading + 0.8 };
  const out = frames(DEPART.end, (t) => departure(a, from, t));
  const back = frames(ARRIVE.end, (t) => arrival(a, t));
  const local = (f: Frame) => toField(a, f.plane.x, f.plane.z);
  const airborne = (f: Frame) => f.plane.y > a.y + 0.5;

  it("starts and ends with the plane on its stand, wheels down and ramp shut", () => {
    for (const f of [out[0].f, back[back.length - 1].f]) {
      expect(f.plane).toEqual(standPose(a));
      expect(f.gear).toBe(1);
    }
    expect(out[0].f.ramp).toBe(0);
    expect(toField(a, standPose(a).x, standPose(a).z).z).toBeCloseTo(PLANE.stand, 9);
  });

  it("takes off down the runway, leaves the ground well before the end, and climbs away", () => {
    let last = -Infinity;
    for (const { f } of out) {
      const p = local(f);
      expect(Math.abs(p.x)).toBeLessThan(1e-6);
      expect(p.z).toBeGreaterThanOrEqual(last - 1e-9);
      expect(f.plane.y).toBeGreaterThanOrEqual(a.y);
      expect(f.plane.heading).toBe(a.heading);
      last = p.z;
    }
    const lifted = out.find(({ f }) => airborne(f))!;
    expect(lifted.t).toBeGreaterThan(DEPART.roll + 3);
    expect(local(lifted.f).z).toBeLessThan(RUNWAY.length - 60);
    const end = out[out.length - 1].f;
    expect(end.plane.y).toBeGreaterThan(a.y + 30);
    expect(local(end).z).toBeGreaterThan(RUNWAY.length);
    expect(end.gear).toBe(0);
    // It doesn't move until the ramp is shut and the brakes are off.
    for (const { t, f } of out) if (t <= DEPART.roll) expect(f.plane).toEqual(standPose(a));
    expect(DEPART.rampUp[1]).toBeLessThanOrEqual(DEPART.roll);
  });

  it("comes in over the far end, touches down on the runway and stops short of the stand", () => {
    const final = back.filter(({ t }) => t >= ARRIVE.final && t < ARRIVE.parked);
    let last = Infinity;
    for (const { t, f } of final) {
      const p = local(f);
      expect(Math.abs(p.x)).toBeLessThan(1e-6);
      expect(p.z).toBeLessThanOrEqual(last + 1e-9);
      expect(f.plane.y).toBeGreaterThanOrEqual(a.y - 1e-9);
      // On the ground only on the runway, and with its wheels down.
      if (!airborne(f)) {
        expect(p.z).toBeGreaterThan(PLANE.stand);
        expect(p.z).toBeLessThan(RUNWAY.length - 20);
      }
      if (t > ARRIVE.touchdown - 2) expect(f.gear).toBe(1);
      last = p.z;
    }
    const touch = final.find(({ f }) => !airborne(f))!;
    expect(touch.t).toBeCloseTo(ARRIVE.touchdown, 0);
    // Stopped, or all but, by the cut.
    const [p, q] = [final[final.length - 2].f, final[final.length - 1].f];
    expect(Math.hypot(p.plane.x - q.plane.x, p.plane.z - q.plane.z) / STEP).toBeLessThan(8);
  });

  it("clears the ground and the trees wherever it's in the air", () => {
    for (const { f } of [...out, ...back]) {
      if (!airborne(f)) continue;
      const { x, y, z } = f.plane;
      // Past the grid's edge there is nothing to hit; sampleGrid would repeat the rim.
      if (Math.max(Math.abs(x), Math.abs(z)) > 2990) continue;
      expect(y - w.height(x, z)).toBeGreaterThan(Math.min(6, (y - a.y) * 0.8));
      for (const t of w.trees) {
        if (Math.abs(t.x - x) > 16 || Math.abs(t.z - z) > 16) continue;
        expect(y - (t.y + 10 * t.scale)).toBeGreaterThan(1);
      }
    }
  });

  it("hides the change of worlds in cloud", () => {
    expect(out[out.length - 1].f.cloud).toBe(1);
    expect(back[0].f.cloud).toBe(1);
    for (const { t, f } of out) if (t < DEPART.cloud[0]) expect(f.cloud).toBe(0);
    for (const { t, f } of back) if (t > ARRIVE.clear[1]) expect(f.cloud).toBe(0);
    expect(back[0].f.cruising).toBe(true);
    expect(back.every(({ t, f }) => f.cruising === t < ARRIVE.final)).toBe(true);
    expect(out.some(({ f }) => f.cruising)).toBe(false);
  });

  it("drives the truck from where it stopped up the ramp into the hold, with the ramp down under it", () => {
    expect(out[0].f.truck).toEqual(from);
    let last = -Infinity;
    for (const { t, f } of out) {
      if (t >= DEPART.rampUp[1]) {
        expect(f.truck).toBeNull();
        continue;
      }
      const p = toField(a, f.truck!.x, f.truck!.z);
      expect(p.z).toBeGreaterThanOrEqual(last - 1e-6);
      last = p.z;
      // While any of it is on the ramp, the ramp is all the way down.
      if (p.z + 1.3 > PLANE.stand + RAMP_FOOT && p.z - 1.3 < PLANE.stand + PLANE.hinge) expect(f.ramp).toBe(1);
    }
    const parked = out.filter(({ f }) => f.truck).pop()!.f.truck!;
    const p = toField(a, parked.x, parked.z);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(PLANE.stand + PLANE.park, 6);
    expect(Math.cos(parked.heading - a.heading)).toBeCloseTo(1, 6);
    expect(out[out.length - 1].f.ramp).toBe(0);
  });

  it("drives it out again onto the apron, facing away from the plane", () => {
    for (const { t, f } of back) expect(f.truck === null).toBe(t < ARRIVE.parked);
    const first = back.find(({ f }) => f.truck)!.f.truck!;
    expect(toField(a, first.x, first.z).z).toBeCloseTo(PLANE.stand + PLANE.park, 6);
    for (const { f } of back) {
      if (!f.truck) continue;
      const z = toField(a, f.truck.x, f.truck.z).z;
      // On the ramp only once it's down.
      if (z - 1.3 < PLANE.stand + PLANE.hinge && z + 1.3 > PLANE.stand + RAMP_FOOT) expect(f.ramp).toBe(1);
    }
    const end = back[back.length - 1].f.truck!;
    expect(end).toEqual(leaveSpot(a));
    expect(Math.cos(end.heading - a.heading)).toBeCloseTo(-1, 6);
    expect(fieldDist(a, end.x, end.z)).toBe(0);
    expect(toField(a, end.x, end.z).z).toBeGreaterThan(-APRON.back + 10);
  });

  it("keeps the camera off the ground, out of the trees, and looking at something", () => {
    for (const { f } of [...out, ...back]) {
      const c = f.camera.from;
      const inGrid = Math.max(Math.abs(c.x), Math.abs(c.z)) < 2990;
      if (inGrid) expect(c.y - w.height(c.x, c.z)).toBeGreaterThan(1.2);
      expect(Math.hypot(c.x - f.camera.to.x, c.y - f.camera.to.y, c.z - f.camera.to.z)).toBeGreaterThan(8);
      expect(Math.hypot(c.x - f.plane.x, c.y - (f.plane.y + PLANE.centre), c.z - f.plane.z)).toBeGreaterThan(PLANE.radius + 4);
      if (inGrid) expect(w.obstaclesNear(c.x, c.z).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + 1.5 && c.y - w.height(c.x, c.z) < 12)).toBe(false);
    }
    // Cuts only where a shot changes; the first shot eases in from wherever the camera was.
    expect(out[0].f.camera.ease).toBeGreaterThan(0);
    expect(new Set([...out, ...back].map(({ f }) => f.camera.shot)).size).toBe(6);
  });
});

describe("the ramp and the hold", () => {
  const a = valley.airport;
  const at = (lz: number, lx = 0) => {
    const cos = Math.cos(a.heading), sin = Math.sin(a.heading);
    const z = PLANE.stand + lz;
    return { x: a.x + lx * cos + z * sin, z: a.z - lx * sin + z * cos };
  };
  const deck = (lz: number, lx = 0) => deckAt(a, at(lz, lx).x, at(lz, lx).z);

  it("rise from the apron to the hold's floor", () => {
    expect(deck(RAMP_FOOT - 0.5)).toBe(0);
    expect(deck(RAMP_FOOT + 0.01)).toBeGreaterThan(0);
    expect(deck((RAMP_FOOT + PLANE.hinge) / 2)).toBeCloseTo(PLANE.floor / 2, 6);
    expect(deck(PLANE.hinge)).toBeCloseTo(PLANE.floor, 6);
    expect(deck(PLANE.park)).toBe(PLANE.floor);
    expect(deck(PLANE.bulkhead + 0.5)).toBe(0);
    expect(deck(PLANE.park, PLANE.holdHalf + 0.2)).toBe(0);
    // The ramp reaches the ground exactly when it is as long as it's said to be.
    expect(Math.hypot(PLANE.hinge - RAMP_FOOT, PLANE.floor)).toBeCloseTo(PLANE.ramp, 9);
    expect(Math.sin(RAMP_DOWN) * PLANE.ramp).toBeCloseTo(PLANE.floor, 9);
    expect(RAMP_SHUT).toBeGreaterThan(0.2);
  });

  it("carry a truck nose-up on the ramp and level in the hold", () => {
    const [wheelbase, ride] = [2.6, 1.1];
    const on = (lz: number) => rideOnDeck(a, { ...at(lz), heading: a.heading }, wheelbase, ride);
    expect(on(RAMP_FOOT - 6)).toEqual({ y: a.y + ride, pitch: 0 });
    const mid = on((RAMP_FOOT + PLANE.hinge) / 2);
    expect(mid.pitch).toBeCloseTo(RAMP_DOWN, 1);
    expect(mid.y).toBeCloseTo(a.y + PLANE.floor / 2 + ride, 6);
    expect(on(PLANE.park).pitch).toBeCloseTo(0, 9);
    expect(on(PLANE.park).y).toBeCloseTo(a.y + PLANE.floor + ride, 9);
    // Coming out it faces the other way, so the ramp drops away in front of it.
    expect(rideOnDeck(a, { ...at((RAMP_FOOT + PLANE.hinge) / 2), heading: a.heading + Math.PI }, wheelbase, ride).pitch).toBeCloseTo(-RAMP_DOWN, 1);
    // The tallest rig on the biggest tyres fits under the hold's roof.
    expect(PLANE.floor + 1.76 + 1.25).toBeLessThan(PLANE.centre + Math.sqrt(PLANE.radius ** 2 - PLANE.holdHalf ** 2));
  });
});

describe("the worlds", () => {
  it("are the valley and the island, each a flight from the other", () => {
    expect(WORLD_IDS).toEqual(["valley", "island"]);
    for (const id of WORLD_IDS) {
      expect(flightFrom(flightFrom(id))).toBe(id);
      expect(flightFrom(id)).not.toBe(id);
      expect(WORLDS[id].fare).toBeGreaterThan(0);
    }
    expect(isWorld("island")).toBe(true);
    expect(isWorld("moon")).toBe(false);
    expect(isWorld(null)).toBe(false);
    expect(isWorld("toString")).toBe(false);
  });
});

describe("the worlds and the server agree", () => {
  it("on what each flight costs", () => {
    const block = migration.match(/insert into public\.worlds \([^)]*\) values([\s\S]*?);/)?.[1] ?? "";
    const server = Object.fromEntries([...block.matchAll(/\('([^']+)',\s*([\d.]+)\)/g)].map((m) => [m[1], Number(m[2])]));
    expect(server).toEqual(Object.fromEntries(WORLD_IDS.map((id) => [id, WORLDS[id].fare])));
  });

  it("on what is sold in one world only", () => {
    const server = Object.fromEntries(
      [...migration.matchAll(/insert into public\.shop_items \(key, price, world\) values([\s\S]*?);/g)].flatMap(([, block]) =>
        [...block.matchAll(/\('([^']+)',\s*[\d.]+,\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]),
      ),
    );
    const client = Object.fromEntries(VEHICLES.filter((v) => v.only).map((v) => [itemKey("vehicle", v.id), v.only]));
    expect(server).toEqual(client);
    expect(client).toEqual({ "vehicle:sandfly": "island" });
    expect(soldOnlyIn("vehicle:sandfly")).toBe("island");
    expect(soldOnlyIn("vehicle:duneclaw")).toBeNull();
    expect(soldOnlyIn("tyres:mud")).toBeNull();
  });

  it("on each world's channel", () => {
    expect(worldTopic("valley")).toBe("world");
    expect(worldTopic("island")).toBe("world:island");
    // The valley's policy names its channel outright; the others are built from the world's id.
    expect(migration).toContain("p_topic = 'world:' || p.world");
    expect(migration).toContain("p.world <> 'valley'");
  });
});

describe("flying, in single player", () => {
  const rich = (miles: number, world?: "valley" | "island") => {
    const store = new LocalStore("local", null, world);
    store.addMiles(miles);
    return store;
  };

  it("costs the fare, and takes you there", async () => {
    const store = rich(WORLDS.island.fare + 12);
    expect(store.get().world).toBe("valley");
    expect(await store.fly("island")).toBeNull();
    expect(store.get().world).toBe("island");
    expect(store.get().balance).toBeCloseTo(12, 9);
    // Lifetime miles are what the leaderboard shows; spending never lowers them.
    expect(store.get().lifetime).toBeCloseTo(WORLDS.island.fare + 12, 9);
  });

  it("needs the whole fare, each way", async () => {
    const store = rich(WORLDS.island.fare - 0.1);
    expect(await store.fly("island")).toBe("Not enough miles yet.");
    expect(store.get().world).toBe("valley");
    store.addMiles(0.1);
    expect(await store.fly("island")).toBeNull();
    expect(await store.fly("valley")).toBe("Not enough miles yet.");
    expect(store.get().world).toBe("island");
  });

  it("charges nothing for where you already are, and goes nowhere that isn't there", async () => {
    const store = rich(1000);
    expect(await store.fly("valley")).toBeNull();
    expect(store.get().balance).toBe(1000);
    expect(await store.fly("moon" as "island")).toBe("The plane doesn't go there.");
    expect(store.get().balance).toBe(1000);
  });

  it("sells the Sandfly on the island and nowhere else, to keep once bought", async () => {
    const store = rich(1000);
    expect(await store.buy("vehicle:sandfly")).toBe("That's only sold on the island.");
    expect(store.get().owned).toEqual([]);
    await store.fly("island");
    expect(await store.buy("vehicle:sandfly")).toBeNull();
    expect(store.get().balance).toBe(1000 - WORLDS.island.fare - 30);
    await store.fly("valley");
    expect(await store.equip("sandfly", store.get().loadout)).toBeNull();
    expect(store.get().vehicle).toBe("sandfly");
    // Everything else is for sale in both.
    expect(await store.buy("tyres:mud")).toBeNull();
  });

  it("keeps each world's fog apart", async () => {
    const store = rich(1000);
    store.explore(5);
    store.explore(9);
    await store.fly("island");
    expect(store.explored()).toEqual([]);
    store.explore(7);
    expect(store.explored()).toEqual([7]);
    await store.fly("valley");
    expect(store.explored()).toEqual([5, 9]);
  });

  it("can start on the island, for looking at it", () => {
    expect(rich(0, "island").get().world).toBe("island");
  });
});

import { FIELD_CLEAR, FIELD_REACH, fieldDist, inFunnel, levelField, raiseBank, screenTrees, valleyAirfield, type Airport } from "./airport";
import { planeObstacles } from "./flight";
import { LANDMARK_BLEND, LANDMARK_CLEAR, LANDMARK_FLAT, chooseLandmarks, type Landmark } from "./landmarks";
import { planMissions, type Mission } from "./missions";
import { makeRandom } from "./noise";
import { buildTerrain, CAMP, CELL, START, campPitches, level, sampleGrid, WORLD, type Pitch, type Terrain, type WorldId } from "./terrain";
import { bridgeObstacles } from "./track";

export {
  CELL, HALF, ROW, START, WORLD, LAKES, FROZEN, STOCK_WADE, SNORKEL_WADE, CAMP, CAMP_CENTRE, CAMP_GATE, CAFE,
  CAMP_PITCHES, campPitches, gridX, gridZ, sampleGrid,
  type Pitch, type Site, type SiteStyle, type Track, type River, type Terrain, type WorldId,
} from "./terrain";
export type { Mission, Gate } from "./missions";
export type { Landmark, LandmarkKind } from "./landmarks";
export type { Airport } from "./airport";

/**
 * A world: ground from terrain.ts (the valley) or island.ts (the island), plus everything
 * scattered across it.
 *
 * Plain data and pure functions — no three.js — so physics and tests can use the same
 * ground the renderer draws. Units are metres; y is up.
 */

/** Something the truck can hit. `h` is how far its top stands above the ground. */
export type Obstacle = { x: number; z: number; r: number; h: number };
/** Pines and broadleaves grow in the valley; palms and the jungle's canopy trees on the island. */
export type TreeKind = "pine" | "broadleaf" | "palm" | "canopy";
export type Tree = { x: number; y: number; z: number; scale: number; rot: number; kind: TreeKind; tone: number };
export type Bush = { x: number; y: number; z: number; scale: number; rot: number; tone: number };
export type Rock = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tone: number };

/** What the physics needs from the world, so tests can hand it a flat plane or a ramp. */
export type Ground = {
  height(x: number, z: number): number;
  /** Height of the water surface here; the ground is wet wherever it is below this. */
  waterAt(x: number, z: number): number;
  obstaclesNear(x: number, z: number): readonly Obstacle[];
  /** How slippery the ground is: 0 dirt and grass, 1 packed snow, 2 bare ice. */
  slipAt(x: number, z: number): number;
  limit: number;
};

export type World = Ground & Terrain & {
  id: WorldId;
  /** Where a truck is put when it has no tent, and the thirty pitches. */
  start: { x: number; z: number; heading: number };
  pitches: Pitch[];
  /** The middle of the camp and the way it looks out. The opening shot hangs behind it. */
  camp: { x: number; z: number; heading: number };
  /** Every world has an airstrip; a flight goes from one to another (ADR 0014). */
  airport: Airport;
  /** True where the only water is the sea: one level sheet out to the horizon. */
  sea: boolean;
  /** How much ground the full map shows, in metres across. */
  mapSpan: number;
  trees: Tree[];
  bushes: Bush[];
  rocks: Rock[];
  missions: Mission[];
  /** The bank, church, school and casino: easter eggs, not on the map (ADR 0012). */
  landmarks: Landmark[];
  /** Distance to a mission course's driving line, kept clear of trees and rocks. */
  courseDist: Float32Array;
  /** For things placed after the world is built, like buildings. */
  addObstacles(list: readonly Obstacle[]): void;
};

/** How wide a tree, a boulder and a bush stand, for the physics. */
export const trunkRadius = (t: Tree) => (t.kind === "pine" ? 0.45 : t.kind === "palm" ? 0.32 : 0.55) * t.scale;

/** What stands in the way, bucketed so a lookup is a few cells. */
export function obstacleIndex() {
  const BUCKET = 16;
  const buckets = new Map<number, Obstacle[]>();
  const key = (bx: number, bz: number) => bx * 4096 + bz;
  const add = (o: Obstacle) => {
    const k = key(Math.floor(o.x / BUCKET), Math.floor(o.z / BUCKET));
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(o);
  };
  const near = (x: number, z: number) => {
    const bx = Math.floor(x / BUCKET);
    const bz = Math.floor(z / BUCKET);
    const out: Obstacle[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const b = buckets.get(key(bx + dx, bz + dz));
        if (b) out.push(...b);
      }
    return out;
  };
  return { add, near };
}

/** The valley. Deterministic, so it looks the same on every load. */
export function buildWorld(seed = 20261006): World {
  const rand = makeRandom(seed + 20);
  const terrain = buildTerrain(seed, rand);
  const { heights, forest, trackDist, riverDist, roadDist, siteDist, campDist } = terrain;
  const { missions, courseDist } = planMissions(terrain);
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const waterAt = (x: number, z: number) => sampleGrid(terrain.water, x, z);
  const field = (f: Float32Array, x: number, z: number) => sampleGrid(f, x, z);
  const slope = (x: number, z: number) => {
    const dx = ground(x + 2, z) - ground(x - 2, z);
    const dz = ground(x, z + 2) - ground(x, z - 2);
    return Math.hypot(dx, dz) / 4;
  };
  /** Clear of the railway, rivers, roads, yards, camp and courses, by at least these distances. */
  const clear = (x: number, z: number, track: number, river: number, road: number, site: number) =>
    field(trackDist, x, z) > track && field(riverDist, x, z) > river && field(roadDist, x, z) > road &&
    field(siteDist, x, z) > site && field(campDist, x, z) > site && field(courseDist, x, z) > Math.min(site, 7) &&
    field(terrain.ice, x, z) < 0.05;
  const half = WORLD.size / 2;

  // Trees on a jittered grid, thinned by forest density, kept off water, cliffs and clearings.
  let trees: Tree[] = [];
  const step = 9;
  for (let z = -half + step; z < half - step; z += step) {
    for (let x = -half + step; x < half - step; x += step) {
      const tx = x + (rand() - 0.5) * step;
      const tz = z + (rand() - 0.5) * step;
      const chance = field(forest, tx, tz) * 0.6 + 0.01;
      if (rand() > chance) continue;
      const y = ground(tx, tz);
      if (y < waterAt(tx, tz) + 1.2 || y > 205) continue;
      if (slope(tx, tz) > 0.75) continue;
      if (!clear(tx, tz, 10, 32, 6, 30)) continue;
      const kind = rand() < 0.14 ? "broadleaf" : "pine";
      trees.push({ x: tx, y: y - 0.3, z: tz, scale: 0.75 + rand() * 0.6, rot: rand() * Math.PI * 2, kind, tone: rand() });
    }
  }

  // Boulders: a few everywhere, many more on steep and rocky ground.
  let rocks: Rock[] = [];
  for (let tries = 0; tries < 80000 && rocks.length < 9000; tries++) {
    const x = (rand() - 0.5) * (WORLD.size - 40);
    const z = (rand() - 0.5) * (WORLD.size - 40);
    const y = ground(x, z);
    if (y < waterAt(x, z) - 1.5) continue;
    const s = slope(x, z);
    if (rand() > 0.05 + Math.min(0.8, s * 0.9)) continue;
    if (!clear(x, z, 6, 16, 5, 26)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 4.5;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // Bushes break up the open grass, thickening toward the forest edges. You drive through them.
  let bushes: Bush[] = [];
  for (let tries = 0; tries < 130000 && bushes.length < 13000; tries++) {
    const x = (rand() - 0.5) * (WORLD.size - 60);
    const z = (rand() - 0.5) * (WORLD.size - 60);
    const y = ground(x, z);
    if (y < waterAt(x, z) + 0.8 || y > 190 || slope(x, z) > 0.6) continue;
    if (rand() > 0.12 + field(forest, x, z) * 0.6) continue;
    if (!clear(x, z, 7, 28, 5, 24)) continue;
    bushes.push({ x, y: y - 0.25, z, scale: 0.6 + rand() * 0.9, rot: rand() * Math.PI * 2, tone: rand() });
  }

  /**
   * Reshapes the ground after the scatter is down: whatever stood within `reach` is put
   * back on the new ground, or dropped where it's `cleared`.
   */
  const reshape = (reach: (x: number, z: number) => boolean, dig: () => void, cleared: (x: number, z: number) => boolean) => {
    const was = new Map<object, number>();
    for (const s of [...trees, ...bushes, ...rocks]) if (reach(s.x, s.z)) was.set(s, ground(s.x, s.z));
    dig();
    const settle = <T extends { x: number; y: number; z: number }>(list: T[]) =>
      list.filter((s) => {
        const before = was.get(s);
        if (before === undefined) return true;
        if (cleared(s.x, s.z)) return false;
        s.y += ground(s.x, s.z) - before;
        return true;
      });
    [trees, bushes, rocks] = [settle(trees), settle(bushes), settle(rocks)];
  };

  // The easter-egg buildings go in last, so the scatter above is what it always was: each
  // gets a levelled yard, and whatever stood there is cleared or settled onto the new ground.
  const landmarks = chooseLandmarks(terrain, missions, seed);
  const toLandmark = (x: number, z: number) => landmarks.reduce((d, l) => Math.min(d, Math.hypot(l.x - x, l.z - z)), Infinity);
  reshape(
    // A levelled vertex moves the ground up to a cell beyond the blend.
    (x, z) => toLandmark(x, z) < LANDMARK_FLAT + LANDMARK_BLEND + 2 * CELL,
    () => landmarks.forEach((l) => level(heights, { x0: l.x, x1: l.x, z0: l.z, z1: l.z }, l.y, LANDMARK_FLAT, LANDMARK_BLEND, siteDist)),
    (x, z) => toLandmark(x, z) < LANDMARK_CLEAR,
  );

  // And after those, the airstrip over the river (ADR 0014): levelled, banked round, and
  // screened with pines, with the way in beyond its far end kept clear of trees.
  const airport = valleyAirfield(terrain, courseDist, [...terrain.sites, ...landmarks]);
  if (!airport) throw new Error("Nowhere over the river for an airstrip.");
  reshape(
    (x, z) => fieldDist(airport, x, z) < FIELD_REACH + 2 * CELL,
    () => {
      levelField(heights, airport, siteDist);
      raiseBank(heights, airport, seed + 93);
    },
    (x, z) => fieldDist(airport, x, z) < FIELD_CLEAR,
  );
  trees = trees.filter((t) => !inFunnel(airport, t.x, t.z));
  const standing = trees.filter((t) => fieldDist(airport, t.x, t.z) < FIELD_REACH + 2 * CELL);
  for (const s of screenTrees(airport, seed + 94)) {
    const y = ground(s.x, s.z);
    if (y < waterAt(s.x, s.z) + 1.2 || slope(s.x, s.z) > 0.75) continue;
    if (field(trackDist, s.x, s.z) < 10 || field(riverDist, s.x, s.z) < 32 || field(roadDist, s.x, s.z) < 6 || field(courseDist, s.x, s.z) < 7) continue;
    if (standing.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 2.5)) continue;
    // Dark pines only: a golden larch would give the place away.
    trees.push({ x: s.x, y: y - 0.3, z: s.z, scale: s.scale, rot: s.rot, kind: "pine", tone: 0.16 + s.tone * 0.84 });
  }

  const solid = obstacleIndex();
  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  // A boulder's top is about its half-height above its centre, which sits partly buried.
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z) });
  // The bridges' guards, abutments and legs: you can't drive onto a bridge, or in under its ends.
  for (const o of bridgeObstacles(terrain.track, ground)) solid.add(o);
  // The plane on its stand.
  for (const o of planeObstacles(airport)) solid.add(o);

  return {
    ...terrain, id: "valley", trees, bushes, rocks, missions, landmarks, courseDist, airport,
    start: START, pitches: campPitches(), camp: { x: CAMP.x, z: CAMP.z, heading: 0 },
    sea: false, mapSpan: WORLD.limit * 2.1,
    height: ground, waterAt, obstaclesNear: solid.near, limit: WORLD.limit,
    slipAt: (x, z) => Math.min(1, field(terrain.snow, x, z)) + field(terrain.ice, x, z),
    addObstacles: (list) => list.forEach(solid.add),
  };
}

import { FIELD_CLEAR, FIELD_REACH, fieldDist, inFunnel, levelField, raiseBank, screenTrees, valleyAirfield, type Airport } from "./airport";
import { planeObstacles } from "./flight";
import { LANDMARK_BLEND, LANDMARK_CLEAR, LANDMARK_FLAT, chooseLandmarks, type Landmark } from "./landmarks";
import { courseDistOf, planMissions, planMore, type Mission } from "./missions";
import { makeRandom } from "./noise";
import { PAD, rampLift, rampObstacles, rampPad } from "./ramp";
import { BED, besideBed, clearBed, lineFrame, mouthAt, pastEnd } from "./rail";
import { VALLEY_STOP, valleyStation, type Station } from "./station";
import { buildTerrain, CAFE, CAMP, CELL, FAR, ROW, START, campPitches, gridX, gridZ, level, nearest, sampleGrid, WORLD, type Path, type Pitch, type Terrain, type WorldId } from "./terrain";
import { TRAIN_LENGTH, bridgeObstacles } from "./track";

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

/**
 * Something the truck can hit. `h` is how far its top stands above the ground. With `top`,
 * the height of that top, a truck whose wheels are above it passes over: for the few
 * things a truck can be above, like the boards under a ramp's lip.
 */
export type Obstacle = {
  x: number;
  z: number;
  r: number;
  h: number;
  top?: number;
  /** A boulder: the one thing a truck can ride up onto and be stuck on (ADR 0021). Posts and boards only stop it. */
  boulder?: boolean;
  /** The height of its underside, for something a truck can drive under, like a bridge's railings: below it, a truck passes. */
  bottom?: number;
};
/**
 * Pines and broadleaves grow in the valley; palms and the jungle's canopy trees on the
 * island; Monterey cypress, blue gum and pines in San Francisco, and its palms.
 */
export type TreeKind = "pine" | "broadleaf" | "palm" | "canopy" | "cypress" | "eucalyptus";
export type Tree = { x: number; y: number; z: number; scale: number; rot: number; kind: TreeKind; tone: number };
export type Bush = { x: number; y: number; z: number; scale: number; rot: number; tone: number };
export type Rock = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tone: number };

/** What the physics needs from the world, so tests can hand it a flat plane or a ramp. */
export type Ground = {
  /**
   * The ground's height. Where a bridge crosses over (ADR 0022) there are two surfaces: given
   * `above`, the height of the asker's underside, it's whichever is under it; without, the higher.
   */
  height(x: number, z: number, above?: number): number;
  /** Height of the water surface here; the ground is wet wherever it is below this. */
  waterAt(x: number, z: number): number;
  obstaclesNear(x: number, z: number): readonly Obstacle[];
  /** How slippery the ground is: 0 dirt and grass, 1 packed snow, 2 bare ice. */
  slipAt(x: number, z: number): number;
  limit: number;
  /** The world's edge is a square `limit` either side of the middle, not a circle. The city's is (ADR 0022). */
  square?: boolean;
};

export type World = Ground & Terrain & {
  id: WorldId;
  /** Where a truck is put when it has no tent, and the thirty pitches. */
  start: { x: number; z: number; heading: number };
  pitches: Pitch[];
  /** The middle of the camp and the way it looks out. The opening shot hangs behind it. */
  camp: { x: number; z: number; heading: number };
  /** Where the café stands, where friends are made. */
  cafe: { x: number; z: number; rot: number };
  /** The airstrip, where there is one: a flight goes from one to another (ADR 0014). */
  airport: Airport | null;
  /** The railway station, where there is one, by its building: the train goes from one to the other (ADR 0022). */
  station: Station | null;
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
  /** Puts the sea `ebb` metres below high water (tide.ts). Only the island's sea has a tide; the valley's water stays put. */
  setTide(ebb: number): void;
};

/** A world with an airstrip, as the valley and the island have. */
export type AirWorld = World & { airport: Airport };

/** How wide a tree, a boulder and a bush stand, for the physics. */
export const trunkRadius = (t: Tree) => (t.kind === "pine" ? 0.45 : t.kind === "palm" || t.kind === "eucalyptus" ? 0.32 : 0.55) * t.scale;

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
export function buildWorld(seed = 20261006): AirWorld {
  const rand = makeRandom(seed + 20);
  const terrain = buildTerrain(seed, rand);
  const { heights, forest, trackDist, riverDist, roadDist, siteDist, campDist } = terrain;
  // The thirteen courses that were here first; then the easter eggs and the airstrip,
  // chosen from those alone, as they always were; and only then the newer courses, laid
  // out round all of it. So adding a course moves nothing a player has already found.
  const first = planMissions(terrain);
  const landmarks = chooseLandmarks(terrain, first, seed);
  const airport = valleyAirfield(terrain, courseDistOf(first, 20), [...terrain.sites, ...landmarks]);
  if (!airport) throw new Error("Nowhere over the river for an airstrip.");
  const missions = [...first, ...planMore(terrain, first, landmarks, airport)];
  // Keep every course clear of trees and rocks along its driving line, and where a crew lines up for it.
  const courseDist = courseDistOf(missions, 20, true);
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  // A ramp stands on a levelled pad, at the height of the ground where the wheels roll on.
  const ramps = missions.flatMap((m) => (m.ramp ? [m.ramp] : []));
  for (const r of ramps) level(heights, rampPad(r), ground(r.x, r.z), PAD.flat, PAD.blend);
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

  // The easter-egg buildings go in after the scatter: each gets a levelled yard, and
  // whatever stood there is cleared or settled onto the new ground.
  const toLandmark = (x: number, z: number) => landmarks.reduce((d, l) => Math.min(d, Math.hypot(l.x - x, l.z - z)), Infinity);
  reshape(
    // A levelled vertex moves the ground up to a cell beyond the blend.
    (x, z) => toLandmark(x, z) < LANDMARK_FLAT + LANDMARK_BLEND + 2 * CELL,
    () => landmarks.forEach((l) => level(heights, { x0: l.x, x1: l.x, z0: l.z, z1: l.z }, l.y, LANDMARK_FLAT, LANDMARK_BLEND, siteDist)),
    (x, z) => toLandmark(x, z) < LANDMARK_CLEAR,
  );

  // And after those, the airstrip over the river (ADR 0014): levelled, banked round, and
  // screened with pines, with the way in beyond its far end kept clear of trees.
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

  // And last, the station (ADR 0022): on the west side of the loop, where the train now
  // stops a minute each time round, with the branch off past the platform's end out to the
  // foot of the mountains and into a tunnel. A dirt road runs out to it from the camp.
  const station = valleyStation(terrain.track, ground);
  terrain.track.stop = VALLEY_STOP;
  const line = station.line;
  const from = line.s.findIndex((s) => s >= station.points!);
  const to = line.s.findIndex((s) => s > station.portal + 6);
  const branch = { xs: line.xs.slice(from, to), zs: line.zs.slice(from, to) };
  const branchNear = nearest(branch, false, 70);
  const bedAt = (k: number) => {
    const i = Math.min(branch.xs.length - 2, Math.floor(branchNear.at[k]));
    const t = branchNear.at[k] - i;
    return line.ys[from + i] + (line.ys[from + i + 1] - line.ys[from + i]) * t - BED.under;
  };
  // The yard beside the train, out to the building and a little past it: room to come round
  // behind the flat wagon to its ramp, and to back off it, at either end.
  const ends = [lineFrame(line, station.head - TRAIN_LENGTH - 14), lineFrame(line, station.head + 16)];
  const corners = ends.flatMap((f) => [2.5, 30].map((d) => ({ x: f.x + f.lx * station.side * d, z: f.z + f.lz * station.side * d })));
  const yard = { x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)), z0: Math.min(...corners.map((c) => c.z)), z1: Math.max(...corners.map((c) => c.z)) };
  const yardY = (ends[0].y + ends[1].y) / 2 - 0.4;
  const toYard = (x: number, z: number) => Math.hypot(Math.max(yard.x0 - x, 0, x - yard.x1), Math.max(yard.z0 - z, 0, z - yard.z1));
  const stationRoad: Path = { xs: [CAMP.x - 64, (CAMP.x - 64 + station.x) / 2, station.x], zs: [CAMP.z - 5, (CAMP.z + station.z) / 2 - 40, station.z] };
  const roadNear = nearest(stationRoad, false, 20);
  const fieldAt = (f: Float32Array, x: number, z: number) => sampleGrid(f, x, z);
  reshape(
    (x, z) => fieldAt(branchNear.dist, x, z) < 72 || toYard(x, z) < 16 + 2 * CELL || fieldAt(roadNear.dist, x, z) < 8,
    () => {
      const last = branch.xs.length - 1;
      for (let k = 0; k < heights.length; k++) {
        const d = branchNear.dist[k];
        if (d >= FAR) continue;
        // Not past the tunnel's mouth: the mountain over it stays whole.
        if (branchNear.at[k] > last - 1e-4 && pastEnd(branch, gridX(k % ROW), gridZ(Math.floor(k / ROW)))) continue;
        trackDist[k] = Math.min(trackDist[k], d);
        // A level bed for the rails; banks either side, and a walled cutting into the mountain.
        heights[k] = besideBed(heights[k], bedAt(k), d);
      }
      clearBed(heights, line, station.points!, station.portal + 2);
      // The tunnel's face stands where the cutting's floor ends.
      station.portal = mouthAt(line, station.portal - 40, (x, z) => sampleGrid(heights, x, z));
      level(heights, yard, yardY, 0, 16, siteDist);
      for (let k = 0; k < roadDist.length; k++) roadDist[k] = Math.min(roadDist[k], roadNear.dist[k]);
    },
    (x, z) => fieldAt(branchNear.dist, x, z) < 9 || toYard(x, z) < 3 || fieldAt(roadNear.dist, x, z) < 5,
  );
  terrain.roads.push(stationRoad);

  const solid = obstacleIndex();
  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  // A boulder's top is about its half-height above its centre, which sits partly buried.
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z), boulder: true });
  // The bridges' guards, abutments and legs: you can't drive onto a bridge, or in under its ends.
  for (const o of bridgeObstacles(terrain.track, ground)) solid.add(o);
  // The plane on its stand.
  for (const o of planeObstacles(airport)) solid.add(o);
  // A ramp's fence and the boards under its lip.
  for (const r of ramps) for (const o of rampObstacles(r, ground)) solid.add(o);

  return {
    ...terrain, id: "valley", cafe: CAFE, trees, bushes, rocks, missions, landmarks, courseDist, airport, station,
    start: START, pitches: campPitches(), camp: { x: CAMP.x, z: CAMP.z, heading: 0 },
    sea: false, mapSpan: WORLD.limit * 2.1,
    // A ramp isn't in the grid: its deck is laid over the ground for whoever asks.
    height: ramps.length ? (x, z) => ground(x, z) + rampLift(ramps, x, z) : ground, waterAt, obstaclesNear: solid.near, limit: WORLD.limit,
    slipAt: (x, z) => Math.min(1, field(terrain.snow, x, z)) + field(terrain.ice, x, z),
    addObstacles: (list) => list.forEach(solid.add),
    setTide: () => {},
  };
}

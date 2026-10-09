import { findField, inFunnel, levelField } from "./airport";
import { planeObstacles } from "./flight";
import { fbm, makeNoise2D, makeRandom, smoothstep } from "./noise";
import {
  CAMP_PITCHES, FAR, ROW, SITE_BLEND, SITE_FLAT, SNORKEL_WADE, STOCK_WADE, WORLD,
  flood, gridX, gridZ, level, nearest, sampleGrid, type Pitch, type Site, type Track,
} from "./terrain";
import { buildWorld, obstacleIndex, trunkRadius, type Bush, type Rock, type Tree, type World, type WorldId } from "./world";

/**
 * The island a plane takes you to (ADR 0014): sea all round instead of mountains, a beach
 * inside that, dunes behind the beach, and jungle in the middle. The tents are on the
 * beach, on the side the afternoon sun goes down on. There is an airstrip to fly home
 * from and one garage, a beach shack, which is the only place that sells the dune buggy.
 *
 * It lies on the same grid as the valley, so the renderer, the physics and the map read
 * it the same way. Pure data, no three.js. A bearing here is a heading: 0 is +z.
 */
export const ISLAND = {
  /** About how far from the middle the waterline is. */
  shore: 1500,
  /** About how wide the beach is, and how far from the middle the jungle begins. */
  beach: 130,
  jungle: 860,
  /** The tents stand this far up the beach from the waterline, at this height. */
  campBack: 72,
  campY: 2.3,
} as const;

/** The fire is this far down the beach from the row of tents. */
const FIRE_OUT = 36;
const DEG = Math.PI / 180;
const NO_TRACK: Track = { xs: [], zs: [], ys: [], s: [], length: 0, bridges: [], crossings: [] };

/** The shape of the ground, before anything is built on it. */
export function makeIsland(seed: number) {
  const coast = makeNoise2D(seed);
  const cove = makeNoise2D(seed + 1);
  const crest = makeNoise2D(seed + 2);
  const ripple = makeNoise2D(seed + 3);
  const edge = makeNoise2D(seed + 4);
  const hill = makeNoise2D(seed + 5);

  /** How far inland a point is; negative out at sea. */
  const inland = (x: number, z: number) =>
    ISLAND.shore + 110 * coast(x / 900, z / 900) + 30 * cove(x / 260, z / 260) - Math.hypot(x, z);
  /** 0 on the sand, 1 in the jungle, with a ragged edge between. */
  const jungle = (x: number, z: number) =>
    smoothstep(ISLAND.jungle + 110, ISLAND.jungle - 110, Math.hypot(x, z) + 90 * edge(x / 320, z / 320));

  const height = (x: number, z: number) => {
    const d = inland(x, z);
    // The seabed shelves gently for a way, then falls off.
    if (d < 0) return Math.max(-45, d > -90 ? d * 0.045 : -4.05 + (d + 90) * 0.22);
    const j = jungle(x, z);
    // The beach rises gently from the water; the land behind it climbs slowly toward the middle.
    let h = d * 0.028 + 5 * smoothstep(ISLAND.beach, 700, d);
    // Dunes: long ridges with rippled backs, dying away under the trees.
    const dunes = smoothstep(ISLAND.beach * 0.8, ISLAND.beach * 1.9, d) * (1 - j * 0.9);
    h += dunes * (1.5 + 11 * Math.pow(1 - Math.abs(crest(x / 150, z / 150)), 1.3) + 2.2 * fbm(ripple, x / 45, z / 45, 2));
    // The jungle stands on a hill, lumpy all over.
    const r = Math.hypot(x, z) / ISLAND.jungle;
    h += j * (7 + 58 * Math.max(0, 1 - r * r) * (0.75 + 0.35 * hill(x / 420, z / 420)) + 13 * fbm(hill, x / 230 + 40, z / 230 - 12, 3));
    return h;
  };

  /** How far from the middle the waterline is on a bearing. */
  const shoreAlong = (bearing: number) => {
    let lo = ISLAND.shore - 400;
    let hi = ISLAND.shore + 400;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inland(Math.sin(bearing) * mid, Math.cos(bearing) * mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { height, inland, jungle, shoreAlong };
}

const along = (bearing: number, r: number) => ({ x: Math.sin(bearing) * r, z: Math.cos(bearing) * r });

/**
 * Thirty pitches in a row along the beach, each facing the sea, where the shore runs
 * straightest on the side the afternoon sun is on. Also the middle of the row, where the
 * fire is, further down the beach.
 */
function layCamp(shape: ReturnType<typeof makeIsland>) {
  const SPACING = 12.5;
  const spread = (r: number) => Array.from({ length: CAMP_PITCHES }, (_, i) => ((i - (CAMP_PITCHES - 1) / 2) * SPACING) / r);
  let best = { bearing: 300 * DEG, back: 0, wobble: Infinity };
  for (let deg = 284; deg <= 316; deg++) {
    const shores = spread(ISLAND.shore).map((o) => shape.shoreAlong(deg * DEG + o));
    const wobble = Math.max(...shores) - Math.min(...shores);
    if (wobble < best.wobble) best = { bearing: deg * DEG, back: Math.min(...shores) - ISLAND.campBack, wobble };
  }
  const pitches: Pitch[] = spread(best.back).map((o, index) => {
    const rot = best.bearing + o;
    const p = along(rot, best.back);
    return { index, ...p, rot, parking: { x: p.x + Math.sin(rot) * 4, z: p.z + Math.cos(rot) * 4, heading: rot } };
  });
  return { pitches, heading: best.bearing, fire: along(best.bearing, best.back + FIRE_OUT), middle: along(best.bearing, best.back) };
}

/** The island. Deterministic, like the valley. */
export function buildIsland(seed = 20261009): World {
  const rand = makeRandom(seed + 20);
  const shape = makeIsland(seed);
  const heights = new Float32Array(ROW * ROW);
  const forest = new Float32Array(ROW * ROW);
  for (let j = 0; j < ROW; j++) {
    for (let i = 0; i < ROW; i++) {
      heights[j * ROW + i] = shape.height(gridX(i), gridZ(j));
      forest[j * ROW + i] = shape.jungle(gridX(i), gridZ(j));
    }
  }
  const far = () => new Float32Array(ROW * ROW).fill(FAR);
  const water = new Float32Array(ROW * ROW).fill(WORLD.water);
  const [trackDist, riverDist, roadDist, siteDist, campDist] = [far(), far(), far(), far(), far()];
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const field = (f: Float32Array, x: number, z: number) => sampleGrid(f, x, z);

  // The camp: a level shelf along the row of pitches, and a level patch round the fire.
  const camp = layCamp(shape);
  const row = nearest({ xs: camp.pitches.map((p) => p.x), zs: camp.pitches.map((p) => p.z) }, false, 60).dist;
  for (let k = 0; k < heights.length; k++) {
    if (row[k] >= FAR) continue;
    campDist[k] = Math.max(0, row[k] - 13);
    heights[k] = ISLAND.campY + (heights[k] - ISLAND.campY) * smoothstep(15, 44, row[k]);
  }
  level(heights, { x0: camp.fire.x, x1: camp.fire.x, z0: camp.fire.z, z1: camp.fire.z }, ground(camp.fire.x, camp.fire.z), 11, 14, campDist);

  // The airstrip: along the back of the beach on the far side, so the plane comes in over the water.
  const spots: { x: number; z: number }[] = [];
  for (let deg = 40; deg <= 140; deg += 2) for (const back of [85, 105, 125, 145]) spots.push(along(deg * DEG, shape.shoreAlong(deg * DEG) - back));
  const airport = findField({
    spots,
    headings: (x, z) => [-20, -10, 0, 10, 20].flatMap((off) => [90, -90].map((side) => Math.atan2(x, z) + (side + off) * DEG)),
    height: ground,
    rough: 9,
    rise: 0.04,
    allow: (x, z) => shape.inland(x, z) > 40 && shape.jungle(x, z) < 0.05,
    // As low on the beach as it will go.
    bonus: (a) => -Math.abs(a.y - 3),
  });
  if (!airport) throw new Error("Nowhere on the island for an airstrip.");
  levelField(heights, airport, siteDist);

  // The beach shack, along the shore from the camp, its door to the sea.
  let shack: Site | null = null;
  for (let deg = 345; deg >= 320 && !shack; deg -= 1) {
    const p = along(deg * DEG, shape.shoreAlong(deg * DEG) - 100);
    const hs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ground(p.x + Math.cos(k) * 24, p.z + Math.sin(k) * 24));
    if (Math.max(...hs) - Math.min(...hs) < 3 && Math.min(...hs) > 1.4) shack = { ...p, rot: deg * DEG, style: "shack", y: ground(p.x, p.z) };
  }
  if (!shack) throw new Error("Nowhere on the island for the shack.");
  level(heights, { x0: shack.x, x1: shack.x, z0: shack.z, z1: shack.z }, shack.y, SITE_FLAT, SITE_BLEND, siteDist);

  const start = camp.pitches[0].parking;
  const zone = new Uint8Array(ROW * ROW);
  flood(heights, water, STOCK_WADE, zone, 1, start);
  flood(heights, water, SNORKEL_WADE, zone, 2, start);

  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  /** Clear of the camp, the shack's yard and the airstrip, by at least these distances. */
  const clear = (x: number, z: number, site: number, tents: number) => field(siteDist, x, z) > site && field(campDist, x, z) > tents;

  // Trees on a jittered grid: canopy trees and palms thick in the jungle, and palms in
  // clumps along the back of the beach and among the dunes. None on the open sand.
  const clumps = makeNoise2D(seed + 11);
  const trees: Tree[] = [];
  const step = 9;
  const reach = ISLAND.shore + 200;
  for (let z = -reach; z < reach; z += step) {
    for (let x = -reach; x < reach; x += step) {
      const tx = x + (rand() - 0.5) * step;
      const tz = z + (rand() - 0.5) * step;
      const d = shape.inland(tx, tz);
      if (d < 62) continue;
      const j = shape.jungle(tx, tz);
      const inJungle = j > 0.35;
      const chance = inJungle ? j * 0.7 : (0.01 + 0.14 * smoothstep(0.2, 0.7, clumps(tx / 170, tz / 170))) * smoothstep(62, 115, d);
      if (rand() > chance) continue;
      const y = ground(tx, tz);
      if (y < 1.5 || slope(tx, tz) > 0.7 || !clear(tx, tz, 24, 20) || inFunnel(airport, tx, tz)) continue;
      const kind = inJungle && rand() > 0.24 ? "canopy" : "palm";
      trees.push({ x: tx, y: y - 0.3, z: tz, scale: (kind === "palm" ? 0.8 : 0.85) + rand() * 0.6, rot: rand() * Math.PI * 2, kind, tone: rand() });
    }
  }

  // Boulders on the jungle's slopes, and a few washed up along the shore.
  const rocks: Rock[] = [];
  for (let tries = 0; tries < 40000 && rocks.length < 2600; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    const y = ground(x, z);
    if (y < -0.5) continue;
    const j = shape.jungle(x, z);
    if (rand() > (j > 0.3 ? 0.04 + Math.min(0.8, slope(x, z) * 1.6) : y < 1.2 ? 0.05 : 0.004)) continue;
    if (!clear(x, z, 22, 26)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 4;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // Ferns under the trees, and scrub where the dunes begin to hold. You drive through them.
  const bushes: Bush[] = [];
  for (let tries = 0; tries < 90000 && bushes.length < 9000; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    const y = ground(x, z);
    if (y < 2.6 || slope(x, z) > 0.6) continue;
    const j = shape.jungle(x, z);
    if (rand() > (j > 0.15 ? 0.15 + j * 0.6 : 0.03)) continue;
    if (!clear(x, z, 20, 22)) continue;
    bushes.push({ x, y: y - 0.25, z, scale: 0.6 + rand() * 0.9, rot: rand() * Math.PI * 2, tone: rand() });
  }

  const solid = obstacleIndex();
  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z) });
  for (const o of planeObstacles(airport)) solid.add(o);

  return {
    id: "island",
    heights, water, forest, trackDist, riverDist, roadDist, siteDist, campDist, zone,
    snow: new Float32Array(ROW * ROW), ice: new Float32Array(ROW * ROW),
    track: NO_TRACK, rivers: [], roads: [], sites: [shack],
    trees, bushes, rocks, missions: [], landmarks: [], courseDist: far(), airport,
    start, pitches: camp.pitches, camp: { ...camp.middle, heading: camp.heading },
    sea: true, mapSpan: (ISLAND.shore + 420) * 2,
    height: ground, waterAt: () => WORLD.water, obstaclesNear: solid.near, limit: WORLD.limit,
    slipAt: () => 0,
    addObstacles: (list) => list.forEach(solid.add),
  };
}

/** Where the island's fire is: out from the middle of the row of tents, further down the beach. */
export function islandFire(world: World) {
  const { x, z, heading } = world.camp;
  return { x: x + Math.sin(heading) * FIRE_OUT, z: z + Math.cos(heading) * FIRE_OUT };
}

/** The ground of one world or the other, built from nothing. About a third of a second. */
export const buildWorldOf = (id: WorldId): World => (id === "island" ? buildIsland() : buildWorld());

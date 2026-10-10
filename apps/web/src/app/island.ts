import { findField, inFunnel, levelField } from "./airport";
import { LINE_UP_BACK } from "./convoy";
import { planeObstacles } from "./flight";
import { courseDistOf, courseLength, courseLimits, gatesAlong, type Mission } from "./missions";
import { fbm, makeNoise2D, makeRandom, smoothstep } from "./noise";
import {
  CAMP_PITCHES, FAR, ROW, SITE_BLEND, SITE_FLAT, SNORKEL_WADE, STOCK_WADE, WORLD,
  flood, gridX, gridZ, level, nearest, sampleGrid, type Path, type Pitch, type Site, type SiteStyle, type Track,
} from "./terrain";
import { buildWorld, obstacleIndex, trunkRadius, type Bush, type Rock, type Tree, type World, type WorldId } from "./world";

/**
 * The island a plane takes you to (ADR 0014): sea all round instead of mountains, a beach
 * inside that, dunes behind the beach, and jungle in the middle. The tents are on the
 * beach, on the side the afternoon sun goes down on. There is an airstrip to fly home
 * from, and three garages, one in each ring: a shack on the beach, an outpost in the dunes
 * and a lodge in the jungle. They are the only places that sell the dune buggy. A café
 * on the beach by the camp too (ADR 0016), and eight courses, half of them for friends
 * (ADR 0019). The sea has a tide (tide.ts), and off the camp there's a sandbar that only
 * shows when it's out, with a ninth course along it (ADR 0020).
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

/**
 * The sandbar (ADR 0020): a spit that leaves the beach a short drive past the last tent,
 * runs out to sea and hooks round to lie across the view from the camp, ending in a round
 * bank. Its top is under the sea at high water and bare sand at low (tide.ts).
 */
export const SANDBAR = {
  /** Where it leaves the beach: this many degrees round the shore from the middle of the camp, away from the café. */
  from: -16,
  /** Straight out to sea, then a quarter turn of this radius, then along the shore in front of the camp. */
  out: 190,
  bend: 100,
  along: 280,
  /** Half its width, and how big round the bank at its end is. */
  half: 23,
  head: 42,
  /**
   * Its top, give or take the ripples in it. Under enough water at high tide to be lost
   * in the shallows, and little enough that every rig can wade home over it.
   */
  top: -0.7,
  ripple: 0.07,
} as const;

/** The fire is this far down the beach from the row of tents. */
const FIRE_OUT = 36;
const DEG = Math.PI / 180;
type Pt = { x: number; z: number };
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

/**
 * The sandbar's middle line: where it is `s` metres along from the high-water mark, `side`
 * metres to the left of the middle, and which way it runs there.
 */
function sandbarOf(shape: ReturnType<typeof makeIsland>, campBearing: number) {
  const bearing = campBearing + SANDBAR.from * DEG;
  const root = along(bearing, shape.shoreAlong(bearing));
  // Out to sea, and along the shore toward the camp.
  const [ox, oz] = [Math.sin(bearing), Math.cos(bearing)];
  const [tx, tz] = [Math.cos(bearing), -Math.sin(bearing)];
  const turn = (SANDBAR.bend * Math.PI) / 2;
  const length = SANDBAR.out + turn + SANDBAR.along;
  const at = (s: number, side = 0) => {
    // How far round the quarter turn: none on the way out, all of it on the way along.
    const phi = Math.max(0, Math.min(Math.PI / 2, (s - SANDBAR.out) / SANDBAR.bend));
    const [a, b] = [
      Math.min(s, SANDBAR.out) + Math.sin(phi) * SANDBAR.bend,
      (1 - Math.cos(phi)) * SANDBAR.bend + Math.max(0, s - SANDBAR.out - turn),
    ];
    const heading = Math.atan2(ox * Math.cos(phi) + tx * Math.sin(phi), oz * Math.cos(phi) + tz * Math.sin(phi));
    return { x: root.x + ox * a + tx * b + Math.cos(heading) * side, z: root.z + oz * a + tz * b - Math.sin(heading) * side, heading };
  };
  const line: Path = { xs: [], zs: [] };
  for (let k = 0; k <= 80; k++) {
    const p = at((length * k) / 80);
    line.xs.push(p.x);
    line.zs.push(p.z);
  }
  return { at, line, length, end: at(length) };
}

/**
 * Raises the sandbar out of the seabed: level along its top, bar the ripples, with banks
 * that fall away gently at first and then steeply into deep water. Only ever raises.
 */
function raiseSandbar(heights: Float32Array, bar: ReturnType<typeof sandbarOf>, seed: number) {
  const ripple = makeNoise2D(seed + 6);
  const bank = 115;
  const toLine = nearest(bar.line, false, SANDBAR.head + bank).dist;
  for (let k = 0; k < heights.length; k++) {
    if (toLine[k] >= FAR) continue;
    const [x, z] = [gridX(k % ROW), gridZ(Math.floor(k / ROW))];
    // How far outside the sand's edge, along the spit or round the bank at its end.
    const e = Math.max(0, Math.min(toLine[k] - SANDBAR.half, Math.hypot(x - bar.end.x, z - bar.end.z) - SANDBAR.head));
    const y = SANDBAR.top + SANDBAR.ripple * ripple(x / 38, z / 38) - 0.08 * e - 0.004 * e * e;
    if (y > heights[k]) heights[k] = y;
  }
}

/**
 * The course along the sandbar: from the beach, flag to flag out along the spit and round
 * the hook, to a finish on the bank at its end. It can only be started while the tide has
 * the whole of it dry (`ebb`). Paid a little over what its length would earn elsewhere,
 * for the wait. Payouts must match `public.missions` (shop.test.ts checks).
 */
function sandbarCourse(bar: ReturnType<typeof sandbarOf>, ground: (x: number, z: number) => number): Mission {
  // The arch stands up the beach, above high water.
  const start = bar.at(-36);
  const flags: Pt[] = [];
  for (let s = 30, k = 0; s < bar.length - 40; s += 50, k++) flags.push(bar.at(s, k % 2 ? -8 : 8));
  flags.push(bar.at(bar.length - 20));
  // The lowest sand on the way, from where the spit leaves the beach, and a little over.
  let low = 0;
  for (let i = 1; i < flags.length; i++) {
    for (let k = 0; k <= 12; k++) low = Math.min(low, ground(flags[i - 1].x + ((flags[i].x - flags[i - 1].x) * k) / 12, flags[i - 1].z + ((flags[i].z - flags[i - 1].z) * k) / 12));
  }
  return {
    id: "sandbar", name: "Sandbar", blurb: `${flags.length - 1} flags out along the sandbar, while the tide's out.`,
    start: { x: start.x, z: start.z, heading: Math.atan2(flags[0].x - start.x, flags[0].z - start.z) }, gates: gatesAlong(start, flags, 12),
    reward: 25, repeatReward: 8, cooldown: 600, ...courseLimits(courseLength(start, flags)), crew: 1, race: false,
    ebb: Math.ceil((0.15 - low) * 20) / 20,
  };
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

  // Two more garages: an outpost among the dunes on the far side from the camp, and a
  // lodge up in the jungle. Each goes on the most level ground its stretch has, door outward.
  const levellest = (style: SiteStyle, spots: { deg: number; r: number }[]): Site => {
    let best: { site: Site; range: number } | null = null;
    for (const s of spots) {
      const p = along(s.deg * DEG, s.r);
      const hs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ground(p.x + Math.cos(k) * 24, p.z + Math.sin(k) * 24));
      const range = Math.max(...hs) - Math.min(...hs);
      if (!best || range < best.range) best = { site: { ...p, rot: s.deg * DEG, style, y: ground(p.x, p.z) }, range };
    }
    return best!.site;
  };
  const spread = (from: number, to: number, step: number, radii: (deg: number) => number[]) => {
    const out: { deg: number; r: number }[] = [];
    for (let deg = from; deg <= to; deg += step) for (const r of radii(deg)) out.push({ deg, r });
    return out;
  };
  const outpost = levellest("outpost", spread(156, 204, 2, (deg) => [250, 290, 330].map((back) => shape.shoreAlong(deg * DEG) - back)));
  const lodge = levellest("lodge", spread(24, 76, 2, () => [540, 600, 660]));
  const sites = [shack, outpost, lodge];
  for (const s of sites) level(heights, { x0: s.x, x1: s.x, z0: s.z, z1: s.z }, s.y, SITE_FLAT, SITE_BLEND, siteDist);

  // The café, on the beach a short drive past the last tent on the way to the shack, its door to the sea.
  const cafeAt = camp.heading + 20 * DEG;
  const cafe = { ...along(cafeAt, shape.shoreAlong(cafeAt) - 95), rot: cafeAt };
  level(heights, { x0: cafe.x, x1: cafe.x, z0: cafe.z, z1: cafe.z }, Math.max(1.8, ground(cafe.x, cafe.z)), SITE_FLAT, SITE_BLEND, siteDist);

  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  const missions = planCourses(shape, camp.heading, ground, slope, [lodge]);
  const courseDist = courseDistOf(missions, 20, true);
  // The top of the hill, where one course ends, is kept bald: there's the whole island to see from it.
  const summit = missions.find((m) => m.id === "hilltop")?.gates.at(-1);

  // Tracks cut through the jungle, straight out to the dunes: one from the lodge's door,
  // one from where the jungle course starts. Without them the trees are a wall.
  const loop = missions.find((m) => m.id === "jungle-loop");
  const tracks: Path[] = [{ x: lodge.x, z: lodge.z }, ...(loop ? [loop.start] : [])].map((from) => {
    const bearing = Math.atan2(from.x, from.z);
    const path: Path = { xs: [], zs: [] };
    for (let r = Math.hypot(from.x, from.z) + 14; r <= ISLAND.jungle + 150; r += 34) {
      const p = along(bearing, r);
      path.xs.push(p.x);
      path.zs.push(p.z);
    }
    return path;
  });
  for (const path of tracks) {
    const d = nearest(path, false, 30).dist;
    for (let k = 0; k < d.length; k++) roadDist[k] = Math.min(roadDist[k], d[k]);
  }

  /** Clear of the camp, the garages' yards, the airstrip, the courses and the tracks, by at least these distances. */
  const clear = (x: number, z: number, site: number, tents: number) =>
    field(siteDist, x, z) > site && field(campDist, x, z) > tents && field(courseDist, x, z) > 7 && field(roadDist, x, z) > 8;

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
      if (summit && Math.hypot(tx - summit.x, tz - summit.z) < 28) continue;
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

  // The sandbar and its course (ADR 0020) go in after the scatter, which never reaches
  // below the tide line: so nothing that was on the island before them has moved.
  const bar = sandbarOf(shape, camp.heading);
  raiseSandbar(heights, bar, seed);
  const sandbar = sandbarCourse(bar, ground);
  const toSandbar = courseDistOf([sandbar], 20, true);
  missions.push(sandbar);
  for (let k = 0; k < courseDist.length; k++) courseDist[k] = Math.min(courseDist[k], toSandbar[k]);
  // Whatever stood where its arch went, up the beach, is taken away.
  const clearOf = <T extends Pt>(list: T[]) => {
    let n = 0;
    for (const s of list) if (field(toSandbar, s.x, s.z) > 7) list[n++] = s;
    list.length = n;
  };
  clearOf(trees);
  clearOf(rocks);
  clearOf(bushes);

  // What a truck can reach at high water, wading and with a snorkel.
  const start = camp.pitches[0].parking;
  const zone = new Uint8Array(ROW * ROW);
  flood(heights, water, STOCK_WADE, zone, 1, start);
  flood(heights, water, SNORKEL_WADE, zone, 2, start);

  const solid = obstacleIndex();
  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z), boulder: true });
  for (const o of planeObstacles(airport)) solid.add(o);

  // The sea stands at high water until it's told how far the tide is out (tide.ts).
  let sea: number = WORLD.water;
  return {
    id: "island",
    heights, water, forest, trackDist, riverDist, roadDist, siteDist, campDist, zone,
    snow: new Float32Array(ROW * ROW), ice: new Float32Array(ROW * ROW),
    track: NO_TRACK, rivers: [], roads: tracks, sites,
    trees, bushes, rocks, missions, landmarks: [], courseDist, airport,
    cafe, start, pitches: camp.pitches, camp: { ...camp.middle, heading: camp.heading },
    sea: true, mapSpan: (ISLAND.shore + 420) * 2,
    height: ground, waterAt: () => sea, obstaclesNear: solid.near, limit: WORLD.limit,
    slipAt: () => 0,
    addObstacles: (list) => list.forEach(solid.add),
    setTide: (ebb) => void (sea = WORLD.water - ebb),
  };
}

/**
 * The island's courses. Four to drive alone: along the beach away from the camp,
 * zigzagging over the dunes, once round the hill under the trees, and straight up it.
 * And four for friends (ADR 0019): two together, two against each other.
 * Paid on the same scale as the valley's (ADR 0017). Payouts must match
 * `public.missions` (shop.test.ts checks).
 */
function planCourses(
  shape: ReturnType<typeof makeIsland>, campBearing: number,
  ground: (x: number, z: number) => number, slope: (x: number, z: number) => number,
  /** Buildings in the jungle, which a course through the trees keeps away from. */
  keepOff: Pt[],
): Mission[] {
  const camp = campBearing / DEG;
  const course = (start: Pt, pts: Pt[], width: number) => ({
    start: { ...start, heading: Math.atan2(pts[0].x - start.x, pts[0].z - start.z) },
    gates: gatesAlong(start, pts, width),
    cooldown: 600, ...courseLimits(courseLength(start, pts)), crew: 1, race: false,
  });

  // Along the beach, from past the last tent on round the shore.
  const sand = Array.from({ length: 11 }, (_, i) => {
    const b = (camp - 24 - i * 4) * DEG;
    return along(b, shape.shoreAlong(b) - 62);
  });
  // Over the dunes behind that beach, in and out across the ridges.
  const dunes = Array.from({ length: 11 }, (_, i) => {
    const b = (camp - 66 + i * 4) * DEG;
    return along(b, shape.shoreAlong(b) - (i % 2 ? 215 : 300));
  });
  // Round the hill: whichever circle under the trees has the gentlest worst stretch.
  let ring: { pts: { x: number; z: number }[]; steep: number } | null = null;
  for (const r of [380, 430, 480, 530]) {
    const pts = Array.from({ length: 15 }, (_, i) => along((camp - i * 24) * DEG, r));
    let steep = 0;
    for (let i = 0; i < 14; i++) for (let k = 0; k <= 10; k++) steep = Math.max(steep, slope(pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / 10, pts[i].z + ((pts[i + 1].z - pts[i].z) * k) / 10));
    if (!ring || steep < ring.steep) ring = { pts, steep };
  }
  const round = ring!.pts;
  // The start arch stands a little outside the first flag, on the way in from the dunes.
  const b0 = camp * DEG + 0.09;
  const gate = along(b0, Math.hypot(round[0].x, round[0].z) + 4);
  /** Dry all the way along, not only at the flags: a straight line between two flags can cut a cove. */
  const dry = (pts: Pt[]) =>
    pts.every((p, i) => {
      const q = pts[Math.max(0, i - 1)];
      for (let k = 0; k <= 10; k++) if (ground(q.x + ((p.x - q.x) * k) / 10, q.z + ((p.z - q.z) * k) / 10) <= 0.5) return false;
      return true;
    });
  const out: Mission[] = [];
  if (dry(sand)) out.push({ id: "beach-run", name: "Beach Run", blurb: "Ten flags along the sand, the sea on your right.", ...course(sand[0], sand.slice(1), 12), reward: 15, repeatReward: 5 });
  if (dry(dunes)) out.push({ id: "dune-dash", name: "Dune Dash", blurb: "Ten flags in and out across the dunes. The buggy was made for it.", ...course(dunes[0], dunes.slice(1), 12), reward: 20, repeatReward: 6 });
  out.push({ id: "jungle-loop", name: "Jungle Loop", blurb: "Once round the hill, under the trees.", ...course(gate, [...round.slice(1), round[0]], 10), reward: 35, repeatReward: 12 });

  // Five more since (ADR 0019): one to drive alone and four for friends, the island's first,
  // so it has as many of one as the other.
  /** A point on a bearing, `back` metres up the beach from the waterline. */
  const shore = (deg: number, back: number) => along(deg * DEG, shape.shoreAlong(deg * DEG) - back);
  /** `d` metres short of `from` on the way from there to `to`. */
  const before = (from: Pt, to: Pt, d: number) => {
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    return { x: from.x - ((to.x - from.x) / len) * d, z: from.z - ((to.z - from.z) / len) * d };
  };
  /** A course for friends: flags wide enough for two abreast, and dry ground behind the arch for ten trucks to line up on. */
  const crew = (start: Pt, pts: Pt[]) => (dry([before(start, pts[0], LINE_UP_BACK + 4), start, ...pts]) ? { ...course(start, pts, 14), crew: 2 } : null);
  /** A loop for friends: the start arch 40 m before its first flag, which is also its last. */
  const loop = (flags: Pt[]) => crew(before(flags[0], flags[1], 40), [...flags, flags[0]]);

  // Straight up the hill to its top, by whichever way in from the camp's side of the island
  // has the gentlest worst stretch. It crosses the loop between two of its flags.
  let top = { x: 0, z: 0 };
  for (let z = -300; z <= 300; z += 10) for (let x = -300; x <= 300; x += 10) if (ground(x, z) > ground(top.x, top.z)) top = { x, z };
  let up: { from: Pt; pts: Pt[]; steep: number } | null = null;
  for (let off = -75; off <= 75; off += 5) {
    const from = along((camp + off) * DEG, ISLAND.jungle + 130);
    const pts = Array.from({ length: 9 }, (_, i) => ({ x: from.x + ((top.x - from.x) * (i + 1)) / 9, z: from.z + ((top.z - from.z) * (i + 1)) / 9 }));
    const far = (p: Pt, q: Pt, d: number) => Math.hypot(p.x - q.x, p.z - q.z) > d;
    if (!pts.every((p) => far(p, gate, 90) && round.every((q) => far(p, q, 60)) && keepOff.every((q) => far(p, q, 140)))) continue;
    let steep = 0;
    for (let k = 0; k <= 200; k++) steep = Math.max(steep, slope(from.x + ((top.x - from.x) * k) / 200, from.z + ((top.z - from.z) * k) / 200));
    if (!up || steep < up.steep) up = { from, pts, steep };
  }
  if (up) out.push({ id: "hilltop", name: "Hilltop", blurb: "Straight up through the trees to the top of the island.", ...course(up.from, up.pts, 10), reward: 25, repeatReward: 8 });

  // For friends, together: from by the café along the beach past the shack, and home through the dunes behind it.
  const coast = loop([
    ...[34, 40, 46, 52, 58, 64, 70].map((d) => shore(camp + d, 50)), shore(camp + 73, 118),
    ...[70, 64, 58, 52, 46, 40, 34].map((d) => shore(camp + d, 185)), shore(camp + 31, 118),
  ]);
  if (coast) out.push({
    id: "coast-convoy", name: "Coast Convoy", blurb: "For two to ten friends: along the beach past the shack, and home through the dunes.",
    ...coast, reward: 40, repeatReward: 12,
  });

  // For friends, against each other: a lap of the beach below the outpost, out along the foot of
  // the dunes and back by the water. On the far side from the camp, clear of the airstrip.
  const lap = loop([
    ...[30, 34, 38, 42, 46, 50, 54].map((d) => shore(camp - d - 98, 175)), shore(camp - 154.5, 128),
    ...[54, 50, 46, 42, 38, 34, 30].map((d) => shore(camp - d - 98, 80)), shore(camp - 125.5, 128),
  ]);
  if (lap) out.push({
    id: "sand-race", name: "Sand Race", blurb: "Two to ten friends, one lap of the beach. Quickest wins; every finisher is paid the same.",
    ...lap, reward: 25, repeatReward: 8, race: true,
  });

  // For friends, together: in and out of the wet sand at the water's edge, round the coast from where the beach run ends.
  const tide = Array.from({ length: 13 }, (_, i) => shore(camp - 74 - i * 2.4, i % 2 ? 32 : 66));
  const wet = crew(tide[0], tide.slice(1));
  if (wet) out.push({
    id: "tideline", name: "Tideline", blurb: "For two to ten friends: twelve flags in and out of the wet sand, the sea on your left.",
    ...wet, reward: 30, repeatReward: 10,
  });

  // For friends, against each other: a lap over the dunes on the north-east side, out along
  // their seaward edge and back deeper in. Past where the coast convoy turns for home.
  const derby = loop([
    ...[84, 88, 92, 96, 100, 104, 108].map((d) => shore(camp + d, 160)), shore(camp + 110.5, 205),
    ...[108, 104, 100, 96, 92, 88, 84].map((d) => shore(camp + d, 250)), shore(camp + 81.5, 205),
  ]);
  if (derby) out.push({
    id: "dune-derby", name: "Dune Derby", blurb: "Two to ten friends, one lap over the dunes. Quickest wins; every finisher is paid the same.",
    ...derby, reward: 30, repeatReward: 10, race: true,
  });
  return out;
}

/** Where the island's fire is: out from the middle of the row of tents, further down the beach. */
export function islandFire(world: World) {
  const { x, z, heading } = world.camp;
  return { x: x + Math.sin(heading) * FIRE_OUT, z: z + Math.cos(heading) * FIRE_OUT };
}

/** The ground of one world or the other, built from nothing. About a third of a second. */
export const buildWorldOf = (id: WorldId): World => (id === "island" ? buildIsland() : buildWorld());

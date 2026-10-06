import { fbm, makeNoise2D, makeRandom, smoothstep } from "./noise";

/**
 * The world: one valley of rolling hills, ringed by mountains, with two lakes.
 *
 * Everything here is plain data and pure functions — no three.js — so physics and
 * tests can use the same ground the renderer draws. Units are metres; y is up.
 * The terrain is a grid of heights triangulated the same way here and in the mesh,
 * so the car's wheels sit exactly on the faces you see.
 */
export const WORLD = {
  size: 2400,
  segments: 300,
  /** Water surface height. Anywhere the ground dips below this is lake. */
  water: 0,
  /** Past this radius the valley wall gets too steep to climb; past `limit`, you stop. */
  edge: 900,
  limit: 1120,
} as const;

export const CELL = WORLD.size / WORLD.segments;
const HALF = WORLD.size / 2;
const ROW = WORLD.segments + 1;

const LAKES = [
  { x: 210, z: -300, r: 190, depth: 34 },
  { x: -460, z: 380, r: 240, depth: 40 },
];

/** Spawn on a gentle rise, looking down toward the nearer lake. */
export const START = { x: 0, z: 0, heading: Math.atan2(LAKES[0].x, LAKES[0].z) };

export type Obstacle = { x: number; z: number; r: number };
export type TreeKind = "pine" | "broadleaf";
export type Tree = { x: number; y: number; z: number; scale: number; rot: number; kind: TreeKind; tone: number };
export type Bush = { x: number; y: number; z: number; scale: number; rot: number; tone: number };
export type Rock = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; tone: number };

/** What the physics needs from the world, so tests can hand it a flat plane or a ramp. */
export type Ground = {
  height(x: number, z: number): number;
  obstaclesNear(x: number, z: number): readonly Obstacle[];
  water: number;
  limit: number;
};

export type World = Ground & {
  heights: Float32Array;
  /** 0–1 per grid vertex: how forested the ground is, for colouring the floor. */
  forest: Float32Array;
  trees: Tree[];
  bushes: Bush[];
  rocks: Rock[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function makeHeight(seed: number) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 1);
  const n3 = makeNoise2D(seed + 2);
  const n4 = makeNoise2D(seed + 3);

  const raw = (x: number, z: number) => {
    const r = Math.hypot(x, z);

    // Broad rolling ground, then rounded hills on top of it.
    let h = 16 + fbm(n1, x / 620, z / 620, 4) * 34;
    const hills = smoothstep(-0.1, 0.6, n2(x / 900, z / 900));
    h += Math.pow(Math.max(0, n3(x / 260, z / 260)), 2) * 48 * hills;

    // Rocky outcrops: sharp, ridged, and only in patches.
    const outcrop = smoothstep(0.3, 0.65, n4(x / 210 + 31, z / 210 - 17));
    if (outcrop > 0) h += outcrop * (1 - Math.abs(fbm(n4, x / 40, z / 40, 3))) * 13;

    for (const lake of LAKES) {
      const d = Math.hypot(x - lake.x, z - lake.z) / lake.r;
      if (d < 1.6) h -= lake.depth * Math.pow(1 - smoothstep(0, 1.6, d), 1.6);
    }

    // The valley wall: the horizon in every direction, and the edge of the world.
    const wall = smoothstep(WORLD.edge - 120, HALF - 20, r);
    return h + wall * wall * (260 + 140 * fbm(n2, x / 300, z / 300, 3));
  };

  // Keep the spawn point level and dry: blend toward a flat shelf around it.
  const shelf = Math.max(6, raw(START.x, START.z));
  return (x: number, z: number) => {
    const calm = 1 - smoothstep(30, 150, Math.hypot(x - START.x, z - START.z));
    return lerp(raw(x, z), shelf, calm * 0.9);
  };
}

/** Height of the triangulated surface at (x, z) — matches the rendered faces exactly. */
export function sampleGrid(heights: Float32Array, x: number, z: number) {
  const fx = Math.max(0, Math.min(WORLD.segments - 1e-6, (x + HALF) / CELL));
  const fz = Math.max(0, Math.min(WORLD.segments - 1e-6, (z + HALF) / CELL));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const h00 = heights[j * ROW + i];
  const h10 = heights[j * ROW + i + 1];
  const h01 = heights[(j + 1) * ROW + i];
  const h11 = heights[(j + 1) * ROW + i + 1];
  // Each cell is split along its 10–01 diagonal, the same as buildTerrain in scene.ts.
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Grid vertex (i, j) → world position. */
export const gridX = (i: number) => -HALF + i * CELL;
export const gridZ = (j: number) => -HALF + j * CELL;

/** Deterministic, so the valley looks the same on every load. */
export function buildWorld(seed = 20261006): World {
  const height = makeHeight(seed);
  const forestNoise = makeNoise2D(seed + 10);
  const forestAt = (x: number, z: number) => smoothstep(0.05, 0.5, fbm(forestNoise, x / 380, z / 380, 3));

  const heights = new Float32Array(ROW * ROW);
  const forest = new Float32Array(ROW * ROW);
  for (let j = 0; j < ROW; j++) {
    for (let i = 0; i < ROW; i++) {
      heights[j * ROW + i] = height(gridX(i), gridZ(j));
      forest[j * ROW + i] = forestAt(gridX(i), gridZ(j));
    }
  }
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const slope = (x: number, z: number) => {
    const dx = ground(x + 2, z) - ground(x - 2, z);
    const dz = ground(x, z + 2) - ground(x, z - 2);
    return Math.hypot(dx, dz) / 4;
  };

  const rand = makeRandom(seed + 20);
  const nearStart = (x: number, z: number, r: number) => Math.hypot(x - START.x, z - START.z) < r;

  // Trees on a jittered grid, thinned by forest density, kept off water, cliffs and the spawn.
  const trees: Tree[] = [];
  const step = 9;
  for (let z = -HALF + step; z < HALF - step; z += step) {
    for (let x = -HALF + step; x < HALF - step; x += step) {
      const tx = x + (rand() - 0.5) * step;
      const tz = z + (rand() - 0.5) * step;
      const chance = forestAt(tx, tz) * 0.85 + 0.015;
      if (rand() > chance) continue;
      const y = ground(tx, tz);
      if (y < WORLD.water + 1.2 || y > 205) continue;
      if (slope(tx, tz) > 0.75) continue;
      if (nearStart(tx, tz, 26)) continue;
      const kind: TreeKind = rand() < 0.14 ? "broadleaf" : "pine";
      trees.push({ x: tx, y: y - 0.3, z: tz, scale: 0.75 + rand() * 0.6, rot: rand() * Math.PI * 2, kind, tone: rand() });
    }
  }

  // Boulders: a few everywhere, many more on steep and rocky ground.
  const rocks: Rock[] = [];
  for (let tries = 0; tries < 14000 && rocks.length < 1700; tries++) {
    const x = (rand() - 0.5) * (WORLD.size - 40);
    const z = (rand() - 0.5) * (WORLD.size - 40);
    const y = ground(x, z);
    if (y < WORLD.water - 1.5) continue;
    const s = slope(x, z);
    if (rand() > 0.05 + Math.min(0.8, s * 0.9)) continue;
    if (nearStart(x, z, 22)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 4.5;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // Bushes break up the open grass, thickening toward the forest edges. You drive through them.
  const bushes: Bush[] = [];
  for (let tries = 0; tries < 24000 && bushes.length < 2800; tries++) {
    const x = (rand() - 0.5) * (WORLD.size - 60);
    const z = (rand() - 0.5) * (WORLD.size - 60);
    const y = ground(x, z);
    if (y < WORLD.water + 0.8 || y > 190 || slope(x, z) > 0.6) continue;
    if (rand() > 0.12 + forestAt(x, z) * 0.6) continue;
    if (nearStart(x, z, 12)) continue;
    bushes.push({ x, y: y - 0.25, z, scale: 0.6 + rand() * 0.9, rot: rand() * Math.PI * 2, tone: rand() });
  }

  // Only things big enough to stop a 4x4 collide. Bucketed so a lookup is a few cells.
  const BUCKET = 16;
  const buckets = new Map<number, Obstacle[]>();
  const key = (bx: number, bz: number) => bx * 4096 + bz;
  const add = (o: Obstacle) => {
    const k = key(Math.floor(o.x / BUCKET), Math.floor(o.z / BUCKET));
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(o);
  };
  for (const t of trees) add({ x: t.x, z: t.z, r: (t.kind === "pine" ? 0.45 : 0.55) * t.scale });
  for (const r of rocks) if (r.sy > 1.1) add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.75 });

  const obstaclesNear = (x: number, z: number) => {
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

  return { heights, forest, trees, bushes, rocks, height: ground, obstaclesNear, water: WORLD.water, limit: WORLD.limit };
}

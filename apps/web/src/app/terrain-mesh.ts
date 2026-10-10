import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeNoise2D, smoothstep } from "./noise";
import { PALETTE } from "./palette";
import { rampLift } from "./ramp";
import { CELL, ROW, WORLD, gridX, gridZ, sampleGrid, type World } from "./world";

const colour = (hex: string) => new THREE.Color(hex);

export type Surface =
  | "lakebed" | "shore" | "rock" | "snow" | "drift" | "ice" | "floor" | "grass" | "dirt"
  // The island's.
  | "seabed" | "wetsand" | "beach" | "sand" | "scrub" | "jungle";

/**
 * What the ground is made of at a point, and a 0–1 tone for variation within it.
 * Shared by the terrain colours and the grass, so tufts only grow where it's grassy.
 */
export function makeSurface(world: World) {
  const patch = makeNoise2D(41);
  const fine = makeNoise2D(42);
  if (world.id === "island") {
    return (x: number, y: number, z: number, ny: number): [Surface, number] => {
      const big = patch(x / 110, z / 110);
      const small = fine(x / 24, z / 24);
      const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
      // Under the sea the tone is the depth: pale in the shallows, dark where it falls away.
      if (y < -0.6) return ["seabed", Math.min(1, -y / 16)];
      if (y < 0.55 + small * 0.25) return ["wetsand", tone];
      // The shack's yard and the verges of the airstrip are packed sand.
      if (sampleGrid(world.siteDist, x, z) < 13 + big * 3) return ["wetsand", tone];
      const jungle = sampleGrid(world.forest, x, z);
      if (jungle > 0.5 + small * 0.2) return [ny < 0.8 ? "rock" : "jungle", tone];
      if (jungle > 0.12 + small * 0.1) return ["scrub", tone];
      return [y < 4.3 + big * 0.7 ? "beach" : "sand", tone];
    };
  }
  return (x: number, y: number, z: number, ny: number): [Surface, number] => {
    const big = patch(x / 110, z / 110);
    const small = fine(x / 24, z / 24);
    const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
    const water = sampleGrid(world.water, x, z);
    // The frozen lake is a flat sheet of ice; the snow country round it is drifts.
    if (sampleGrid(world.ice, x, z) > 0.5) return ["ice", tone];
    if (y < water - 0.8) return ["lakebed", tone];
    if (y < water + 0.9 + big * 0.5) return ["shore", tone];
    // Garage yards are packed dirt.
    if (sampleGrid(world.siteDist, x, z) < 15 + big * 4) return ["dirt", tone];
    const snow = sampleGrid(world.snow, x, z);
    if (snow > 0.55 + small * 0.25) return [ny < 0.7 ? "rock" : "drift", tone];
    if (ny < 0.83 + small * 0.04) return ["rock", tone];
    if (y > 180 + big * 35 && ny > 0.62) return ["snow", tone];
    if (sampleGrid(world.forest, x, z) > 0.6 + small * 0.2) return ["floor", tone];
    return ["grass", tone];
  };
}

export type SurfaceAt = ReturnType<typeof makeSurface>;

/** Blends smoothly through a list of colours as t goes 0 → 1. */
export function ramp(list: readonly THREE.Color[], t: number, out: THREE.Color) {
  const f = Math.max(0, Math.min(0.9999, t)) * (list.length - 1);
  const i = Math.floor(f);
  return out.copy(list[i]).lerp(list[i + 1], f - i);
}

/** Upward normal of the heightfield at a grid vertex, from its neighbours. */
function gridNormalY(H: Float32Array, i: number, j: number, out: THREE.Vector3) {
  const N = WORLD.segments;
  const dx = H[j * ROW + Math.min(N, i + 1)] - H[j * ROW + Math.max(0, i - 1)];
  const dz = H[Math.min(N, j + 1) * ROW + i] - H[Math.max(0, j - 1) * ROW + i];
  return out.set(-dx, 2 * CELL, -dz).normalize();
}

const CHUNK = 50;

/**
 * The terrain as smooth-shaded chunks with a colour per vertex, so grass fades softly
 * into rock and off-screen chunks are culled. Normals come from the whole grid, so the
 * chunks meet without seams. Triangulated exactly like sampleGrid.
 */
export function buildTerrainMesh(world: World, surface: SurfaceAt) {
  const H = world.heights;
  const palette: Record<Surface, THREE.Color[]> = {
    grass: PALETTE.grass.map(colour),
    floor: PALETTE.forestFloor.map(colour),
    rock: PALETTE.rock.map(colour),
    dirt: PALETTE.dirt.map(colour),
    shore: [colour(PALETTE.shore), colour(PALETTE.shore)],
    lakebed: [colour(PALETTE.lakebed), colour(PALETTE.lakebed)],
    snow: [colour(PALETTE.snow), colour(PALETTE.snow)],
    drift: PALETTE.snowDrift.map(colour),
    ice: [colour(PALETTE.ice), colour(PALETTE.ice)],
    seabed: PALETTE.seabed.map(colour),
    wetsand: [colour(PALETTE.wetSand), colour(PALETTE.wetSand)],
    beach: PALETTE.beach.map(colour),
    sand: PALETTE.dune.map(colour),
    scrub: PALETTE.scrub.map(colour),
    jungle: PALETTE.jungleFloor.map(colour),
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const side = CHUNK + 1;

  for (let cj = 0; cj < WORLD.segments; cj += CHUNK) {
    for (let ci = 0; ci < WORLD.segments; ci += CHUNK) {
      const pos = new Float32Array(side * side * 3);
      const nor = new Float32Array(side * side * 3);
      const col = new Float32Array(side * side * 3);
      for (let b = 0; b < side; b++) {
        for (let a = 0; a < side; a++) {
          const i = ci + a;
          const j = cj + b;
          const k = (b * side + a) * 3;
          const y = H[j * ROW + i];
          gridNormalY(H, i, j, n);
          const [kind, tone] = surface(gridX(i), y, gridZ(j), n.y);
          ramp(palette[kind], tone, c);
          pos.set([gridX(i), y, gridZ(j)], k);
          nor.set([n.x, n.y, n.z], k);
          col.set([c.r, c.g, c.b], k);
        }
      }
      const index: number[] = [];
      for (let b = 0; b < CHUNK; b++) {
        for (let a = 0; a < CHUNK; a++) {
          const v = b * side + a;
          index.push(v, v + side, v + 1, v + 1, v + side, v + side + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

/**
 * Lakes and rivers as one surface: every grid cell with water in it, each corner at the
 * water height there. Where a cell dips toward dry ground the sheet slides under the
 * terrain, which is what makes the shoreline. A slow ripple keeps it from looking painted.
 */
export function buildWaterMesh(world: World) {
  const H = world.heights;
  const W = world.water;
  const chunks = new Map<number, number[]>();
  // The sea is one level sheet out past the horizon, clearer than a lake so the shallows show pale.
  if (world.sea) {
    const far = WORLD.size * 1.5;
    chunks.set(0, [-far, WORLD.water, -far, -far, WORLD.water, far, far, WORLD.water, -far, far, WORLD.water, -far, -far, WORLD.water, far, far, WORLD.water, far]);
  }
  for (let j = 0; !world.sea && j < WORLD.segments; j++) {
    for (let i = 0; i < WORLD.segments; i++) {
      const ks = [j * ROW + i, j * ROW + i + 1, (j + 1) * ROW + i, (j + 1) * ROW + i + 1];
      if (!ks.some((k) => H[k] < W[k] - 0.02)) continue;
      const [k00, k10, k01, k11] = ks;
      const x0 = gridX(i), x1 = gridX(i + 1), z0 = gridZ(j), z1 = gridZ(j + 1);
      const key = Math.floor(j / CHUNK) * 100 + Math.floor(i / CHUNK);
      const list = chunks.get(key) ?? chunks.set(key, []).get(key)!;
      list.push(x0, W[k00], z0, x0, W[k01], z1, x1, W[k10], z0, x1, W[k10], z0, x0, W[k01], z1, x1, W[k11], z1);
    }
  }

  const time = { value: 0 };
  const material = new THREE.MeshPhongMaterial({
    color: world.sea ? PALETTE.sea : PALETTE.water,
    specular: world.sea ? PALETTE.seaSpecular : PALETTE.waterSpecular,
    shininess: 90,
    transparent: true,
    opacity: world.sea ? 0.7 : 0.82,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWaterXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterXZ = (modelMatrix * vec4(position, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vWaterXZ;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ripple = sin(vWaterXZ.x * 0.33 + uTime * 1.2) * sin(vWaterXZ.y * 0.27 - uTime * 0.9)
                     + 0.5 * sin((vWaterXZ.x + vWaterXZ.y) * 0.9 + uTime * 2.3);
        diffuseColor.rgb *= 1.0 + ripple * 0.045;`,
      );
  };
  material.customProgramCacheKey = () => "water";

  const group = new THREE.Group();
  for (const list of chunks.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { object: group, update: (t: number) => void (time.value = t) };
}

/** Cheap integer hash → [0, 1), for placing grass the same way every time. */
function hash(x: number, z: number, k: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Tall grass around the car only — a world-anchored grid of tufts within RADIUS,
 * re-laid whenever the car has moved a few metres, swaying in a shader wind.
 */
export function buildGrass(world: World, surface: SurfaceAt) {
  const RADIUS = 62;
  const SPACING = 1.15;
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + b * 0.7;
    const lean = 0.16 + (b % 2) * 0.1;
    const ox = Math.cos(a) * 0.1;
    const oz = Math.sin(a) * 0.1;
    const px = Math.cos(a + Math.PI / 2) * 0.13;
    const pz = Math.sin(a + Math.PI / 2) * 0.13;
    const l = [ox - px, 0, oz - pz];
    const r = [ox + px, 0, oz + pz];
    const tip = [ox + Math.cos(a) * lean, 0.7 + (b % 3) * 0.1, oz + Math.sin(a) * lean];
    // Both windings, rather than DoubleSide: back faces would get flipped normals and go dark.
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute([...l, ...r, ...tip, ...r, ...l, ...tip], 3));
    // Normals point up so blades light like the ground they grow from.
    blade.setAttribute("normal", new THREE.Float32BufferAttribute(Array(6).fill([0, 1, 0]).flat(), 3));
    const base = 0.9;
    const top = 1.22;
    blade.setAttribute("color", new THREE.Float32BufferAttribute([base, base, base, base, base, base, top, top, top, base, base, base, base, base, base, top, top, top], 3));
    blades.push(blade);
  }
  const geometry = mergeGeometries(blades);

  const time = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec2 at = instanceMatrix[3].xz;
        float gust = sin(uTime * 1.3 + at.x * 0.07 + at.y * 0.05) * 0.5 + 0.5;
        transformed.xz += vec2(0.8, 0.5) * position.y * position.y * (0.12 + 0.22 * gust) * sin(uTime * 2.1 + at.x * 0.4 + at.y * 0.3);`,
      );
  };
  material.customProgramCacheKey = () => "grass";

  const capacity = Math.ceil((Math.PI * RADIUS * RADIUS) / (SPACING * SPACING) * 1.1);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.setColorAt(0, new THREE.Color());

  /** What grows tufts: how much of the ground they cover, and their colours. */
  const tufts: Partial<Record<Surface, { share: number; tones: THREE.Color[] }>> = {
    grass: { share: 1, tones: PALETTE.grass.map(colour) },
    floor: { share: 0.3, tones: PALETTE.forestFloor.map(colour) },
    jungle: { share: 0.8, tones: PALETTE.fern.map(colour) },
    scrub: { share: 0.28, tones: PALETTE.scrub.map(colour) },
    // The beach and the dunes are bare sand.
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let cx = Infinity;
  let cz = Infinity;
  const ramps = world.missions.flatMap((mission) => (mission.ramp ? [mission.ramp] : []));

  function relay(x: number, z: number) {
    cx = x;
    cz = z;
    let n = 0;
    const g0x = Math.floor((x - RADIUS) / SPACING);
    const g0z = Math.floor((z - RADIUS) / SPACING);
    const span = Math.ceil((RADIUS * 2) / SPACING);
    rows: for (let gz = g0z; gz <= g0z + span; gz++) {
      for (let gx = g0x; gx <= g0x + span; gx++) {
        const tx = (gx + hash(gx, gz, 1)) * SPACING;
        const tz = (gz + hash(gx, gz, 2)) * SPACING;
        const d = Math.hypot(tx - x, tz - z);
        if (d > RADIUS) continue;
        // Nothing grows through a ramp's boards.
        if (ramps.length && rampLift(ramps, tx, tz) > 0) continue;
        const y = world.height(tx, tz);
        const ny = 2 / Math.hypot(world.height(tx + 1, tz) - world.height(tx - 1, tz), 2, world.height(tx, tz + 1) - world.height(tx, tz - 1));
        const [kind, tone] = surface(tx, y, tz, ny);
        const tuft = tufts[kind];
        if (!tuft || hash(gx, gz, 3) >= tuft.share) continue;
        // Not on the railway, the dirt roads, or the campground's gravel.
        if (sampleGrid(world.trackDist, tx, tz) < 5.5 || sampleGrid(world.roadDist, tx, tz) < 3.5) continue;
        if (sampleGrid(world.campDist, tx, tz) < 0.5) continue;
        const size = (0.7 + hash(gx, gz, 4) * 0.8) * (1 - smoothstep(RADIUS - 14, RADIUS, d));
        if (size < 0.05) continue;
        q.setFromAxisAngle(up, hash(gx, gz, 5) * Math.PI * 2);
        m.compose(v.set(tx, y - 0.05, tz), q, s.set(size, size * (0.8 + hash(gx, gz, 6) * 0.5), size));
        mesh.setMatrixAt(n, m);
        ramp(tuft.tones, Math.min(1, tone + (hash(gx, gz, 7) - 0.5) * 0.25), c);
        mesh.setColorAt(n, c);
        if (++n >= capacity) break rows;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function update(x: number, z: number, t: number) {
    time.value = t;
    if (Math.hypot(x - cx, z - cz) > 6) relay(x, z);
  }

  return { object: mesh, update };
}

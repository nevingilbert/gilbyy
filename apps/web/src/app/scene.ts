import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildCar } from "./car-model";
import { makeNoise2D, makeRandom, smoothstep } from "./noise";
import { PALETTE } from "./palette";
import type { Car } from "./physics";
import { CELL, WORLD, gridX, gridZ, sampleGrid, type Bush, type Rock, type Tree, type World } from "./world";

/** Low golden-hour sun, off to the left of the opening view so slopes read. */
const SUN_DIR = new THREE.Vector3(-0.75, 0.42, -0.55).normalize();
const FOG_DENSITY = 0.0016;
const SHADOW_SPAN = 55;

const colour = (hex: string) => new THREE.Color(hex);
const pick = <T,>(list: readonly T[], t: number) => list[Math.min(list.length - 1, Math.floor(t * list.length))];

export type Surface = "lakebed" | "shore" | "rock" | "snow" | "floor" | "grass";

/**
 * What the ground is made of at a point, and a 0–1 tone for variation within it.
 * Shared by the terrain colours and the grass, so tufts only grow where it's grassy.
 */
function makeSurface(world: World) {
  const patch = makeNoise2D(41);
  const fine = makeNoise2D(42);
  return (x: number, y: number, z: number, ny: number): [Surface, number] => {
    const big = patch(x / 110, z / 110);
    const small = fine(x / 24, z / 24);
    const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
    if (y < WORLD.water - 0.8) return ["lakebed", tone];
    if (y < WORLD.water + 0.9 + big * 0.5) return ["shore", tone];
    if (ny < 0.83 + small * 0.04) return ["rock", tone];
    if (y > 180 + big * 35 && ny > 0.62) return ["snow", tone];
    if (sampleGrid(world.forest, x, z) > 0.6 + small * 0.2) return ["floor", tone];
    return ["grass", tone];
  };
}

/** Blends smoothly through a list of colours as t goes 0 → 1. */
function ramp(list: readonly THREE.Color[], t: number, out: THREE.Color) {
  const f = Math.max(0, Math.min(0.9999, t)) * (list.length - 1);
  const i = Math.floor(f);
  return out.copy(list[i]).lerp(list[i + 1], f - i);
}

/**
 * The terrain as one smooth-shaded mesh with a colour per vertex, so grass fades
 * softly into rock. Triangulated exactly like world.sampleGrid.
 */
function buildTerrain(world: World, surface: ReturnType<typeof makeSurface>) {
  const N = WORLD.segments;
  const row = N + 1;
  const H = world.heights;
  const pos = new Float32Array(row * row * 3);
  const col = new Float32Array(row * row * 3);
  const index = new Uint32Array(N * N * 6);
  const palette: Record<Surface, THREE.Color[]> = {
    grass: PALETTE.grass.map(colour),
    floor: PALETTE.forestFloor.map(colour),
    rock: PALETTE.rock.map(colour),
    shore: [colour(PALETTE.shore), colour(PALETTE.shore)],
    lakebed: [colour(PALETTE.lakebed), colour(PALETTE.lakebed)],
    snow: [colour(PALETTE.snow), colour(PALETTE.snow)],
  };
  const c = new THREE.Color();

  for (let j = 0; j < row; j++) {
    for (let i = 0; i < row; i++) {
      const k = j * row + i;
      const x = gridX(i);
      const z = gridZ(j);
      const y = H[k];
      const dx = H[j * row + Math.min(N, i + 1)] - H[j * row + Math.max(0, i - 1)];
      const dz = H[Math.min(N, j + 1) * row + i] - H[Math.max(0, j - 1) * row + i];
      const ny = (2 * CELL) / Math.hypot(dx, 2 * CELL, dz);
      const [kind, tone] = surface(x, y, z, ny);
      ramp(palette[kind], tone, c);
      pos.set([x, y, z], k * 3);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  let p = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i;
      const b = a + 1;
      const d = a + row;
      index.set([a, d, b, b, d, d + 1], p);
      p += 6;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
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
function buildGrass(world: World, surface: ReturnType<typeof makeSurface>) {
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

  const grass = PALETTE.grass.map(colour);
  const floor = PALETTE.forestFloor.map(colour);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let cx = Infinity;
  let cz = Infinity;

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
        const y = world.height(tx, tz);
        const ny = 2 / Math.hypot(world.height(tx + 1, tz) - world.height(tx - 1, tz), 2, world.height(tx, tz + 1) - world.height(tx, tz - 1));
        const [kind, tone] = surface(tx, y, tz, ny);
        if (kind !== "grass" && !(kind === "floor" && hash(gx, gz, 3) < 0.3)) continue;
        const size = (0.7 + hash(gx, gz, 4) * 0.8) * (1 - smoothstep(RADIUS - 14, RADIUS, d));
        if (size < 0.05) continue;
        q.setFromAxisAngle(up, hash(gx, gz, 5) * Math.PI * 2);
        m.compose(v.set(tx, y - 0.05, tz), q, s.set(size, size * (0.8 + hash(gx, gz, 6) * 0.5), size));
        mesh.setMatrixAt(n, m);
        ramp(kind === "grass" ? grass : floor, Math.min(1, tone + (hash(gx, gz, 7) - 0.5) * 0.25), c);
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

/** Vertex-coloured geometry, so a tree's trunk and crown can share one draw call. */
function painted(geo: THREE.BufferGeometry, hex: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = colour(hex);
  const count = g.getAttribute("position").count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 5);
  trunk.translate(0, 1.2, 0);
  const tiers = [
    [1.75, 3.4, 2.9],
    [1.35, 3.0, 4.6],
    [0.9, 2.6, 6.2],
  ].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0));
  // The crown is white so the per-tree colour comes through untouched.
  return mergeGeometries([painted(trunk, PALETTE.trunk), ...tiers.map((t) => painted(t, "#ffffff"))]);
}

function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.4, 5).translate(0, 1.7, 0);
  const crown = new THREE.IcosahedronGeometry(1.9, 0).scale(1, 1.25, 1).translate(0, 4.6, 0);
  const side = new THREE.IcosahedronGeometry(1.3, 0).translate(0.9, 3.7, 0.4);
  return mergeGeometries([painted(trunk, PALETTE.trunk), painted(crown, "#ffffff"), painted(side, "#ffffff")]);
}

/** A lumpy boulder: an icosahedron with its corners pushed about. */
function boulderGeometry(seed: number) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute("normal").deleteAttribute("uv"));
  const rand = makeRandom(seed);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + rand() * 0.4;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Splits scattered items into map tiles, one InstancedMesh per tile, so whole tiles
 * can be culled — most of the forest is off-screen or out of the shadow's reach.
 */
function tiled<T extends { x: number; z: number }>(
  items: T[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  place: (item: T, m: THREE.Matrix4, c: THREE.Color) => void,
) {
  const TILE = 400;
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor(it.x / TILE)},${Math.floor(it.z / TILE)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  }
  const out = new THREE.Group();
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const list of groups.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      place(it, m, c);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    out.add(mesh);
  }
  return out;
}

function buildTrees(trees: Tree[]) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pine = PALETTE.pine.map(colour);
  const larch = PALETTE.larch.map(colour);
  const leaf = PALETTE.broadleaf.map(colour);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (t: Tree, m: THREE.Matrix4, c: THREE.Color) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.scale, t.scale * (0.9 + t.tone * 0.3), t.scale));
    if (t.kind === "broadleaf") c.copy(pick(leaf, t.tone));
    else c.copy(t.tone < 0.16 ? pick(larch, t.tone / 0.16) : pick(pine, (t.tone - 0.16) / 0.84));
  };
  const group = new THREE.Group();
  group.add(tiled(trees.filter((t) => t.kind === "pine"), pineGeometry(), mat, place));
  group.add(tiled(trees.filter((t) => t.kind === "broadleaf"), broadleafGeometry(), mat, place));
  return group;
}

function buildBushes(bushes: Bush[]) {
  const geo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.75, 1).translate(0, 0.5, 0),
    new THREE.IcosahedronGeometry(0.65, 0).scale(1, 0.8, 1).translate(0.7, 0.35, 0.2),
    new THREE.IcosahedronGeometry(0.55, 0).translate(-0.55, 0.3, -0.3),
  ].map((g) => g.deleteAttribute("uv")));
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const tones = PALETTE.bush.map(colour);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  return tiled(bushes, geo, mat, (b, m, c) => {
    q.setFromAxisAngle(up, b.rot);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.scale, b.scale, b.scale));
    c.copy(pick(tones, b.tone));
  });
}

function buildRocks(rocks: Rock[]) {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const tones = PALETTE.boulder.map(colour);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const group = new THREE.Group();
  for (let v = 0; v < 3; v++) {
    group.add(
      tiled(rocks.filter((_, i) => i % 3 === v), boulderGeometry(100 + v), mat, (r, m, c) => {
        q.setFromEuler(e.set(r.tone * 0.4, r.rot, 0));
        m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.sx, r.sy, r.sz));
        c.copy(pick(tones, r.tone));
      }),
    );
  }
  return group;
}

function buildWater() {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshPhongMaterial({
      color: PALETTE.water,
      specular: PALETTE.waterSpecular,
      shininess: 90,
      transparent: true,
      opacity: 0.82,
    }),
  );
  mesh.position.y = WORLD.water;
  mesh.receiveShadow = true;
  return mesh;
}

/** A gradient dome with a soft sun, drawn behind everything and immune to fog. */
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: colour(PALETTE.skyZenith) },
      horizon: { value: colour(PALETTE.skyHorizon) },
      haze: { value: colour(PALETTE.fog) },
      glow: { value: colour(PALETTE.sunGlow) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, haze, glow, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(haze, horizon, smoothstep(0.0, 0.12, h));
        col = mix(col, zenith, smoothstep(0.08, 0.75, h));
        float s = max(dot(d, sunDir), 0.0);
        col += glow * (pow(s, 5.0) * 0.28 + pow(s, 48.0) * 0.5 + smoothstep(0.9993, 0.9996, s) * 0.9);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}

export function createView(canvas: HTMLCanvasElement, world: World) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = colour(PALETTE.fog);
  scene.fog = new THREE.FogExp2(PALETTE.fog, FOG_DENSITY);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 4000);

  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.5));
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: 900,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.3;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const sky = buildSky();
  const surface = makeSurface(world);
  const grass = buildGrass(world, surface);
  scene.add(sky, buildTerrain(world, surface), grass.object, buildWater(), buildTrees(world.trees), buildBushes(world.bushes), buildRocks(world.rocks));

  const car = buildCar();
  scene.add(car.object);

  // Chase camera: high and behind, like Over the Hill's, easing after the car.
  let camYaw = NaN;
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  let clock = 0;
  const want = new THREE.Vector3();

  function render(state: Car, dt: number) {
    clock += dt;
    car.update(state, world, dt);
    grass.update(state.x, state.z, clock);

    const ease = (rate: number) => 1 - Math.exp(-rate * dt);
    if (Number.isNaN(camYaw)) camYaw = state.heading;
    let dy = state.heading - camYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * ease(2.2);

    const dist = 11.5 + Math.abs(state.speed) * 0.1;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    want.set(state.x - fx * dist, state.y + 8.5 + Math.abs(state.speed) * 0.05, state.z - fz * dist);
    want.y = Math.max(want.y, world.height(want.x, want.z) + 2.5);
    if (camPos.lengthSq() === 0) camPos.copy(want);
    else camPos.lerp(want, ease(4));
    camera.position.copy(camPos);
    look.set(state.x + fx * 4, state.y + 0.4, state.z + fz * 4);
    camera.lookAt(look);

    // The shadow box follows the car; snapping it to texels stops it shimmering.
    const texel = (SHADOW_SPAN * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(state.x / texel) * texel;
    const tz = Math.round(state.z / texel) * texel;
    sun.target.position.set(tx, state.y, tz);
    sun.position.set(tx, state.y, tz).addScaledVector(SUN_DIR, 400);
    sun.target.updateMatrixWorld();

    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function dispose() {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
    renderer.dispose();
  }

  resize();
  return { render, resize, dispose };
}

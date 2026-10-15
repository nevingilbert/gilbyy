import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeNoise2D, smoothstep } from "./noise";
import { PALETTE } from "./palette";
import { rampLift } from "./ramp";
import { CROOKED_KERB, inCrooked, kerbAt, type CityWorld } from "./city";
import { PIER, toDock } from "./dock";
import { PAD, toPad } from "./heli";
import { GROUNDS, VEGAS, type VegasWorld } from "./vegas";
import { JAPAN, JAPAN_GROUNDS, type JapanWorld } from "./japan";
import { CELL, ROW, WORLD, gridX, gridZ, sampleGrid, type World } from "./world";

const colour = (hex: string) => new THREE.Color(hex);

export type Surface =
  | "lakebed" | "shore" | "rock" | "snow" | "drift" | "ice" | "floor" | "grass" | "dirt"
  // The island's.
  | "seabed" | "wetsand" | "beach" | "sand" | "scrub" | "jungle"
  // The city's (ADR 0022): its streets and pavements, its yards, lawns, dry hills and woods.
  | "paved" | "yard" | "lawn" | "dryhill" | "cityfloor"
  // Vegas's (ADR 0023): the desert, Red Rock, the canyon's bands, the lake's white ring, its
  // shores and the river's beaches, the plateau, the town's lots; and the causeways' stone.
  | "desert" | "redrock" | "strata" | "bathtub" | "sandbank" | "rimland" | "lot" | "causeway"
  // Japan's (ADR 0024): meadow, the paddies, the cedar woods' floor, the mountain's ash, its
  // dark crags, the grey shingle of its beaches, the town's gravel.
  | "meadow" | "paddy" | "cedar" | "ash" | "crag" | "shingle" | "gravel";

/**
 * What the ground is made of at a point, and a 0–1 tone for variation within it.
 * Shared by the terrain colours and the grass, so tufts only grow where it's grassy.
 */
export function makeSurface(world: World) {
  const inner = surfaceOf(world);
  const { dock, pad } = world;
  if (!dock && !pad) return inner;
  return (x: number, y: number, z: number, ny: number): [Surface, number] => {
    // A causeway, wherever there's a dock (ADR 0023): its road paved, its banks stone.
    if (dock) {
      const p = toDock(dock, x, z);
      if (p.z > -4 && p.z < PIER.length + PIER.bank + 4 && Math.abs(p.x) < PIER.top + PIER.bank + 4) {
        // Its road down the middle, the rest of its top and its banks laid stone.
        if (Math.abs(p.x) <= PIER.half + 0.5 && p.z >= 0 && p.z <= PIER.length) return ["paved", 0.3];
        if (y > dock.water - 4) return ["causeway", (Math.sin(x * 1.7) * Math.sin(z * 1.3) + 1) / 2];
      }
    }
    // A helipad (ADR 0024): its circle, the helicopter's spot and the way between are paved,
    // so no grass comes up through them.
    if (pad) {
      const p = toPad(pad, x, z);
      if (Math.hypot(p.x, p.z) < PAD.radius + 2.5 || Math.hypot(p.x - PAD.stand, p.z) < 10.5 || (p.x > 0 && p.x < PAD.stand && Math.abs(p.z) < 4)) return ["paved", 0.3];
    }
    return inner(x, y, z, ny);
  };
}

function surfaceOf(world: World) {
  const patch = makeNoise2D(41);
  const fine = makeNoise2D(42);
  const japan = (world as Partial<JapanWorld>).japan;
  if (japan) {
    const cell = (x: number, z: number) => japan.ground[Math.round((z + WORLD.size / 2) / CELL) * ROW + Math.round((x + WORLD.size / 2) / CELL)];
    return (x: number, y: number, z: number, ny: number): [Surface, number] => {
      const big = patch(x / 110, z / 110);
      const small = fine(x / 24, z / 24);
      const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
      if (y < -0.6) return ["seabed", Math.min(1, -y / 16)];
      const water = sampleGrid(world.water, x, z);
      const kind = JAPAN_GROUNDS[cell(x, z)];
      // The paddies stand in a hand's depth of water; the lake and the hot spring are deep.
      if (kind === "paddy") return ["paddy", tone];
      if (water > WORLD.water + 0.05 && y < water - 0.8) return ["lakebed", tone];
      if (y < WORLD.water + 0.7 + small * 0.2) return ["wetsand", tone];
      // The town's streets, the garages' yards and the pad are paved; the camp is earth. Out
      // in the country the ground runs right up to the road, which the street paint lays on it.
      if ((kind === "town" && kerbAt(japan.kerb, x, z) < 1.8) || sampleGrid(world.siteDist, x, z) < 6) return ["paved", tone];
      if (sampleGrid(world.campDist, x, z) < 1) return ["dirt", tone];
      // The lake's shore is a ring of grey shingle.
      if (water > WORLD.water + 0.05 && y < water + 0.9 + big * 0.4) return ["shingle", tone];
      const snow = sampleGrid(world.snow, x, z);
      if (snow > 0.55 + small * 0.25) return [ny < 0.7 ? "crag" : "snow", tone];
      if (kind === "beach") return ["shingle", tone];
      if (kind === "ash") return [ny < 0.72 ? "crag" : "ash", tone];
      if (ny < 0.8 + small * 0.04) return ["crag", tone];
      if (kind === "forest") return ["cedar", tone];
      if (kind === "town") return ["gravel", tone];
      return ["meadow", tone];
    };
  }
  const vegas = (world as Partial<VegasWorld>).vegas;
  if (vegas) {
    const cell = (x: number, z: number) => vegas.ground[Math.round((z + WORLD.size / 2) / CELL) * ROW + Math.round((x + WORLD.size / 2) / CELL)];
    return (x: number, y: number, z: number, ny: number): [Surface, number] => {
      const big = patch(x / 110, z / 110);
      const small = fine(x / 24, z / 24);
      const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
      const water = sampleGrid(world.water, x, z);
      if (y < water - 0.8) return ["lakebed", tone];
      // The streets and pavements, the lots of everything built, the camp's earth.
      if (kerbAt(vegas.kerb, x, z) < 1.8 || sampleGrid(world.siteDist, x, z) < 4) return ["paved", tone];
      // The camp's ground is packed sand.
      if (sampleGrid(world.campDist, x, z) < 1) return ["sandbank", tone];
      const kind = GROUNDS[cell(x, z)];
      // The canyon is coloured by height, band over band, up from the river's beaches.
      if (kind === "canyon") {
        if (y < VEGAS.lake + 3.2 + small * 0.4) return ["sandbank", tone];
        return ["strata", Math.max(0, Math.min(1, (y - VEGAS.lake - 3) / (VEGAS.rim - VEGAS.lake) + small * 0.03))];
      }
      if (kind === "shore") {
        if (y < water + 0.9 + small * 0.3) return ["sandbank", tone];
        // The pale ring the lake left as it went down, where the shore is steep enough to show it.
        if (ny < 0.94 && y < VEGAS.lake + 7 + big) return ["bathtub", tone];
      }
      if (kind === "redrock") return [ny < 0.9 ? "redrock" : "redrock", ny < 0.9 ? tone : tone * 0.6 + 0.4];
      if (ny < 0.8) return ["redrock", tone];
      if (kind === "rim") return ["rimland", tone];
      if (kind === "town") return ["lot", tone];
      return ["desert", tone];
    };
  }
  const city = (world as Partial<CityWorld>).city;
  if (city) {
    const KINDS: (Surface | null)[] = [null, "cityfloor", "lawn", "dryhill", "beach", "paved"];
    return (x: number, y: number, z: number, ny: number): [Surface, number] => {
      const big = patch(x / 110, z / 110);
      const small = fine(x / 24, z / 24);
      const tone = Math.max(0, Math.min(1, (big * 0.7 + small * 0.3 + 1) / 2));
      if (y < -0.6) return ["seabed", Math.min(1, -y / 16)];
      const water = sampleGrid(world.water, x, z);
      if (water > WORLD.water + 0.05 && y < water - 0.8) return ["lakebed", tone];
      if (y < WORLD.water + 0.7 + small * 0.2) return ["wetsand", tone];
      // Lombard's crooked block: earth in the beds, and no tall grass to come up through its lane.
      if (inCrooked(city.crooked, x, z)) return ["yard", tone];
      // The garages stand on paved aprons, out on the pier as well; the campground is earth.
      if (kerbAt(city.kerb, x, z) < 1.8 || sampleGrid(world.siteDist, x, z) < 10) return ["paved", tone];
      if (sampleGrid(world.campDist, x, z) < 1) return ["dirt", tone];
      const park = KINDS[city.parks[Math.round((z + WORLD.size / 2) / CELL) * ROW + Math.round((x + WORLD.size / 2) / CELL)]];
      if (park === "dryhill" && ny < 0.8) return ["rock", tone];
      if (park) return [park, tone];
      return ["yard", tone];
    };
  }
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
export function buildTerrainMesh(world: World, surface: SurfaceAt, streets: THREE.Texture | null = null) {
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
    paved: [colour(PALETTE.city.pavement), colour(PALETTE.city.kerb)],
    yard: PALETTE.city.yard.map(colour),
    lawn: PALETTE.city.lawn.map(colour),
    dryhill: PALETTE.city.dryHill.map(colour),
    cityfloor: PALETTE.city.floor.map(colour),
    desert: PALETTE.vegas.desert.map(colour),
    redrock: PALETTE.vegas.redRock.map(colour),
    strata: PALETTE.vegas.strata.map(colour),
    bathtub: [colour(PALETTE.vegas.bathtub), colour(PALETTE.vegas.stucco[3])],
    sandbank: PALETTE.vegas.beach.map(colour),
    rimland: PALETTE.vegas.rimland.map(colour),
    lot: PALETTE.vegas.lot.map(colour),
    causeway: PALETTE.ferry.stone.map(colour),
    meadow: PALETTE.japan.meadow.map(colour),
    paddy: PALETTE.japan.paddy.map(colour),
    cedar: PALETTE.japan.forest.map(colour),
    ash: PALETTE.japan.ash.map(colour),
    crag: PALETTE.japan.crag.map(colour),
    shingle: PALETTE.japan.beach.map(colour),
    gravel: PALETTE.japan.town.map(colour),
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Where the tide (tide.ts) has left the seabed bare, it's wet sand, like the strip above
  // it. At high water there is none, and the ground is exactly the colours it was given.
  const sea = { value: WORLD.water as number };
  if (world.sea || streets) {
    const wet = { value: colour(PALETTE.wetSand) };
    // Streets are painted on from a street map: asphalt, the kerb, the pavement. The city's
    // (ADR 0022), and Vegas's (ADR 0023), which has no sea.
    const kerbs = streets ? { value: streets } : null;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSea = sea;
      shader.uniforms.uWet = wet;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vShoreY;\nvarying vec2 vGroundXZ;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShoreY = position.y;\nvGroundXZ = position.xz;");
      let streetsGlsl = "";
      if (kerbs) {
        const crooked = (world as Partial<CityWorld>).city?.crooked;
        shader.uniforms.uKerb = kerbs;
        shader.uniforms.uAsphalt = { value: colour(PALETTE.city.asphalt) };
        shader.uniforms.uWorn = { value: colour(PALETTE.city.asphaltWorn) };
        shader.uniforms.uPavement = { value: colour(PALETTE.city.pavement) };
        shader.uniforms.uKerbStone = { value: colour(PALETTE.city.kerb) };
        // Lombard's crooked block is left unpainted, a garden: its brick lane is a mesh of its
        // own, finer than the street map can draw (city-model.ts).
        shader.uniforms.uCrooked = { value: new THREE.Vector4(crooked?.x ?? 0, crooked?.z ?? 0, crooked?.dx ?? 1, crooked?.dz ?? 0) };
        shader.uniforms.uCrookedLength = { value: crooked?.length ?? -100 };
        streetsGlsl = `
          float kerbD = texture2D(uKerb, (vGroundXZ + ${(WORLD.size / 2).toFixed(1)}) / ${WORLD.size.toFixed(1)}).r * 255.0 / 8.0 - 16.0;
          vec2 crook = vGroundXZ - uCrooked.xy;
          float along = dot(crook, uCrooked.zw);
          float paint = 1.0 - step(${CROOKED_KERB.toFixed(1)}, along) * step(along, uCrookedLength - ${CROOKED_KERB.toFixed(1)}) * step(abs(crook.x * uCrooked.w - crook.y * uCrooked.z), 11.0);
          float onRoad = (1.0 - smoothstep(-0.1, 0.06, kerbD)) * paint;
          float onWalk = smoothstep(-0.1, 0.06, kerbD) * (1.0 - smoothstep(1.45, 1.7, kerbD)) * paint;
          float wear = 0.5 + 0.5 * sin(vGroundXZ.x * 0.21 + sin(vGroundXZ.y * 0.17) * 2.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uPavement, onWalk);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(uAsphalt, uWorn, wear * 0.5), onRoad);
          diffuseColor.rgb = mix(diffuseColor.rgb, uKerbStone, (1.0 - smoothstep(0.0, 0.22, abs(kerbD - 0.08))) * 0.85 * paint);`;
      }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nuniform float uSea;\nuniform vec3 uWet;\nvarying float vShoreY;\nvarying vec2 vGroundXZ;${kerbs ? "\nuniform sampler2D uKerb;\nuniform vec3 uAsphalt;\nuniform vec3 uWorn;\nuniform vec3 uPavement;\nuniform vec3 uKerbStone;\nuniform vec4 uCrooked;\nuniform float uCrookedLength;" : ""}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>${world.sea ? `
          float bare = smoothstep(uSea - 0.3, uSea + 0.05, vShoreY) * (1.0 - smoothstep(-0.6, -0.3, vShoreY));
          diffuseColor.rgb = mix(diffuseColor.rgb, uWet, bare);` : ""}${streetsGlsl}`,
        );
    };
    const key = `${world.sea ? "shore" : "inland"}${kerbs ? "-streets" : ""}`;
    material.customProgramCacheKey = () => key;
  }
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
  return { object: group, setSea: (level: number) => void (sea.value = level) };
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
  // Japan's paddies (ADR 0024) are a hand's depth of still water on each terrace, each a level
  // mirror of its own: a cell is laid flat at its lowest water, so none runs down the bank to
  // the terrace below, and they're thinner water than a lake's, the mud showing through.
  const paddies = world.id === "japan" ? new Map<number, number[]>() : null;
  // A sea world's lakes stand above the sea, each at its own level: the city's are (ADR 0022).
  for (let j = 0; j < WORLD.segments; j++) {
    for (let i = 0; i < WORLD.segments; i++) {
      const ks = [j * ROW + i, j * ROW + i + 1, (j + 1) * ROW + i, (j + 1) * ROW + i + 1];
      if (world.sea && !ks.some((k) => W[k] > WORLD.water + 0.05)) continue;
      const wet = ks.filter((k) => H[k] < W[k] - 0.02);
      if (!wet.length) continue;
      const [k00, k10, k01, k11] = ks;
      const x0 = gridX(i), x1 = gridX(i + 1), z0 = gridZ(j), z1 = gridZ(j + 1);
      // The hot spring is too small for the grid: japan-model.ts lays its water as a disc.
      if (paddies && Math.hypot(x0 + CELL / 2 - JAPAN.onsen.x, z0 + CELL / 2 - JAPAN.onsen.z) < JAPAN.onsen.r + 15) continue;
      const key = Math.floor(j / CHUNK) * 100 + Math.floor(i / CHUNK);
      const paddy = paddies && wet.every((k) => W[k] - H[k] < 0.3);
      const into = paddy ? paddies : chunks;
      const list = into.get(key) ?? into.set(key, []).get(key)!;
      const flat = paddy ? Math.min(...wet.map((k) => W[k])) : null;
      const y = (k: number) => flat ?? W[k];
      list.push(x0, y(k00), z0, x0, y(k01), z1, x1, y(k10), z0, x1, y(k10), z0, x0, y(k01), z1, x1, y(k11), z1);
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
  const paddyWater = new THREE.MeshPhongMaterial({
    color: PALETTE.japan.paddyWater, specular: PALETTE.waterSpecular, shininess: 60, transparent: true, opacity: 0.5, depthWrite: false,
  });
  for (const [lists, m] of [[chunks, material], [paddies, paddyWater]] as const) {
    for (const list of lists?.values() ?? []) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  // Out past the ground's edge the sea has nothing under it: a bed there, as deep as the
  // seabed at the edge, keeps the open sea one colour out to the horizon.
  if (world.sea) {
    const far = WORLD.size * 1.5;
    const deep = Math.min(...[0, WORLD.segments].flatMap((j) => [0, WORLD.segments].map((i) => H[j * ROW + i])), WORLD.water - 4);
    const bed = new THREE.PlaneGeometry(far * 2, far * 2).rotateX(-Math.PI / 2).translate(0, deep - 0.05, 0);
    group.add(new THREE.Mesh(bed, new THREE.MeshLambertMaterial({ color: PALETTE.seabed[PALETTE.seabed.length - 1] })));
  }
  return {
    object: group,
    update: (t: number) => void (time.value = t),
    /** Moves the sea's sheet to where the tide has it. A lake's or a river's stays where it is. */
    setSea: (level: number) => void (group.position.y = world.sea ? level - WORLD.water : 0),
  };
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
    // The city's watered lawns are cut short; its dry hills are long golden grass.
    lawn: { share: 0.35, tones: PALETTE.city.lawn.map(colour) },
    dryhill: { share: 1, tones: PALETTE.city.dryHill.map(colour) },
    cityfloor: { share: 0.25, tones: PALETTE.city.floor.map(colour) },
    // Japan's meadows are long grass, its cedar woods have a little, and its paddies are
    // planted out with young rice standing up through the water.
    meadow: { share: 1, tones: PALETTE.japan.meadow.map(colour) },
    cedar: { share: 0.3, tones: PALETTE.japan.forest.map(colour) },
    paddy: { share: 0.55, tones: PALETTE.japan.rice.map(colour) },
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

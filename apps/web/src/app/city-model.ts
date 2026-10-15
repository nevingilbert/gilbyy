import * as THREE from "three";
import { deckPoint, type Deck } from "./city-bridges";
import type { Building, District } from "./city-buildings";
import { KERB_N, type CityWorld } from "./city";
import { STREET_WIDTH, resample, toGame, type Pt } from "./city-streets";
import { makeRandom } from "./noise";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";

/**
 * Lombard's crooked lane, down its eight hairpins: red brick an alley's width wide, laid
 * over the ground, a stone kerb along each side. The street map's texels are too coarse
 * for it, so the terrain leaves the block unpainted and this goes on top.
 */
export function buildCrookedLane(lane: readonly Pt[], ground: (x: number, z: number) => number) {
  const group = new THREE.Group();
  if (lane.length < 2) return group;
  const pts = resample([...lane], 0.7);
  const half = STREET_WIDTH[0] / 2;
  // Its own materials, not the kit's shared ones: these are drawn both sides, pulled forward over the ground.
  const over = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const brick = over(PALETTE.city.lombardBrick);
  const stone = over(PALETTE.city.kerb);
  const strips: [THREE.Material, number, number, number][] = [
    [brick, -half + 0.3, half - 0.3, 0.09],
    [stone, half - 0.3, half + 0.05, 0.2],
    [stone, -half - 0.05, -half + 0.3, 0.2],
  ];
  // Across the lane at each point: the left of the way it runs, averaged over its two neighbours.
  const across = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.z - a.z) / l, z: -(b.x - a.x) / l };
  });
  for (const [material, from, to, lift] of strips) {
    const pos: number[] = [];
    const corner = (i: number, off: number) => {
      const x = pts[i].x + across[i].x * off;
      const z = pts[i].z + across[i].z * off;
      return [x, ground(x, z) + lift, z];
    };
    for (let i = 1; i < pts.length; i++) {
      const [a0, a1, b0, b1] = [corner(i - 1, from), corner(i - 1, to), corner(i, from), corner(i, to)];
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/**
 * Drawing San Francisco (ADR 0022): its buildings, its two bridges, and the street map the
 * terrain is painted from. The buildings are instanced boxes, a few draw calls for the
 * whole city, in tiles so those out of sight are skipped. Their windows are painted on in
 * the shader, storey by storey, and some are lit after dark. Between the camera and the
 * truck they're cut away, so a building never hides the truck.
 */

const colour = (hex: string) => new THREE.Color(hex);
const pick = <T,>(list: readonly T[], t: number) => list[Math.min(list.length - 1, Math.floor(t * list.length))];

/** What each neighbourhood's buildings are painted, and how wide a window bay and how tall a storey look. */
const LOOK: Record<District, { colours: readonly string[]; bay: number; storey: number; glass: number }> = {
  rows: { colours: PALETTE.city.houses, bay: 1.9, storey: 3.4, glass: 0.55 },
  avenues: { colours: PALETTE.city.stucco, bay: 2.4, storey: 3.3, glass: 0.45 },
  marina: { colours: [...PALETTE.city.stucco, ...PALETTE.city.houses.slice(0, 4)], bay: 2.2, storey: 3.3, glass: 0.5 },
  midrise: { colours: [...PALETTE.city.stucco, ...PALETTE.city.brick.slice(2)], bay: 1.8, storey: 3.2, glass: 0.6 },
  chinatown: { colours: [...PALETTE.city.brick, ...PALETTE.city.houses.slice(5)], bay: 2.0, storey: 3.4, glass: 0.55 },
  towers: { colours: PALETTE.city.tower, bay: 1.6, storey: 3.8, glass: 0.75 },
  lofts: { colours: PALETTE.city.brick, bay: 2.6, storey: 4, glass: 0.55 },
  sheds: { colours: PALETTE.city.shed, bay: 6, storey: 4.5, glass: 0.2 },
  barracks: { colours: [PALETTE.city.brick[0], PALETTE.city.brick[1], PALETTE.city.trim[0]], bay: 2.4, storey: 3.6, glass: 0.45 },
};

/** Uniforms every building shares: the night, and the camera and the truck for the cut-away. */
export type CityUniforms = { night: { value: number }; camera: { value: THREE.Vector3 }; truck: { value: THREE.Vector3 } };

/**
 * The buildings' material: Lambert, with windows from each instance's own storey height
 * and bay width (the `aLook` attribute), flat tar roofs, lit windows after dark, and the
 * cut-away round the line from the camera to the truck.
 */
function buildingMaterial(u: CityUniforms) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = u.night;
    shader.uniforms.uCamera = u.camera;
    shader.uniforms.uTruck = u.truck;
    shader.uniforms.uGlass = { value: colour(PALETTE.city.glass) };
    shader.uniforms.uRoof = { value: colour(PALETTE.city.roof) };
    shader.uniforms.uLit = { value: colour(PALETTE.windowGlow) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aLook;
        varying vec3 vCityPos;
        varying vec3 vCityNormal;
        varying vec4 vLook;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 cityWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vCityPos = cityWorld.xyz;
        vCityNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vLook = aLook;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uNight;
        uniform vec3 uCamera;
        uniform vec3 uTruck;
        uniform vec3 uGlass;
        uniform vec3 uRoof;
        uniform vec3 uLit;
        varying vec3 vCityPos;
        varying vec3 vCityNormal;
        varying vec4 vLook;
        float cityHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        // Cut away whatever stands between the camera and the truck: a cone from the camera
        // just wider than the truck where it reaches it, its edge dithered out.
        vec3 toTruck = uTruck - uCamera;
        float reach = length(toTruck);
        vec3 ray = toTruck / max(reach, 0.001);
        float along = dot(vCityPos - uCamera, ray);
        if (along > 0.0 && along < reach - 1.5) {
          float off = length(vCityPos - uCamera - ray * along);
          float r = 0.6 + 2.8 * along / max(reach, 1.0);
          float cut = 1.0 - smoothstep(r - 1.0, r, off);
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (cut > dither) discard;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float cityLit = 0.0;
        if (vCityNormal.y > 0.6) {
          // Flat roofs, tarred dark, a little of the wall colour left in them.
          diffuseColor.rgb = mix(diffuseColor.rgb, uRoof, 0.7);
        } else if (abs(vCityNormal.y) < 0.3) {
          vec2 across = normalize(vec2(-vCityNormal.z, vCityNormal.x));
          float u = dot(vCityPos.xz, across);
          float h = vCityPos.y - vLook.x;
          float storey = vLook.y;
          float bay = vLook.z;
          float fu = fract(u / bay);
          float fv = fract(h / storey);
          float floorN = floor(h / storey);
          float glassy = step(0.2, fu) * step(fu, 0.8) * step(0.3, fv) * step(fv, 0.82);
          // The ground floor: shopfronts and garage doors, a little darker; above, windows.
          glassy *= step(1.0, floorN) * step(h, vLook.w - 0.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGlass, glassy * 0.85);
          float cell = cityHash(vec3(floor(u / bay), floorN, vLook.x * 3.1 + vLook.w));
          cityLit = glassy * step(0.58, cell) * uNight;
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uLit * cityLit * 1.3;`,
      );
  };
  m.customProgramCacheKey = () => "city-buildings";
  return m;
}

/** A box from the ground up, one unit each way, its floor at y = 0: no bottom face. */
function unitBlock() {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return g;
}

/** A three-sided bay window, a unit wide, deep and tall, its back against z = 0, sticking out to +z. */
function unitBay() {
  const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.3, 1), new THREE.Vector2(-0.3, 1)]);
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0, 0);
}

/**
 * The city's buildings, in tiles: the blocks, the Victorians' bay windows and the cornices
 * along the tops. Near tiles are drawn, far ones left to the haze; the tall buildings are
 * one more set, drawn from anywhere, so the skyline stands across the city.
 */
export function buildBuildings(buildings: Building[], u: CityUniforms) {
  const TILE = 400;
  const SKYLINE = 20;
  const tiles = new Map<string, Building[]>();
  for (const b of buildings) {
    const k = b.top - b.base >= SKYLINE ? "sky" : `${Math.floor(b.x / TILE)},${Math.floor(b.z / TILE)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)!).push(b);
  }
  const material = buildingMaterial(u);
  const plain = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const block = unitBlock();
  const bayGeo = unitBay();
  const slab = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const parts: { mesh: THREE.InstancedMesh; x: number; z: number; always: boolean }[] = [];
  for (const [key, list] of tiles) {
    const geo = block.clone();
    const looks = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    const bays = list.filter((b) => b.bay);
    const bayMesh = bays.length ? new THREE.InstancedMesh(bayGeo, plain, bays.length) : null;
    const corniced = new Set(list.filter((b) => b.district === "rows" || b.district === "marina" || b.district === "chinatown" || b.district === "midrise"));
    const cornices = corniced.size ? new THREE.InstancedMesh(slab, plain, corniced.size) : null;
    let bi = 0;
    let ci = 0;
    let cx = 0;
    let cz = 0;
    list.forEach((b, i) => {
      const look = LOOK[b.district];
      q.setFromAxisAngle(up, b.rot);
      m.compose(v.set(b.x, b.base, b.z), q, s.set(b.w, b.top - b.base, b.d));
      mesh.setMatrixAt(i, m);
      c.copy(colour(pick(look.colours, b.tone)));
      mesh.setColorAt(i, c);
      looks.set([b.base + 0.6, look.storey, look.bay * (0.9 + (b.tone * 7) % 0.3), b.top], i * 4);
      cx += b.x;
      cz += b.z;
      // Where the front wall is: local +z is out of the front, half the depth from the middle.
      const fx = Math.sin(b.rot);
      const fz = Math.cos(b.rot);
      const front = { x: b.x + fx * (b.d / 2), z: b.z + fz * (b.d / 2) };
      if (b.bay && bayMesh) {
        const w = Math.min(3.4, b.w * 0.5);
        m.compose(v.set(front.x, b.base + 0.6 + 3.4, front.z), q, s.set(w, Math.max(1, b.top - b.base - 0.6 - 3.4 - 0.9), 0.85));
        bayMesh.setMatrixAt(bi, m);
        bayMesh.setColorAt(bi++, c.clone().lerp(colour(PALETTE.city.trim[0]), 0.15));
      }
      if (cornices && corniced.has(b)) {
        m.compose(v.set(front.x - fx * 0.15, b.top - 0.25, front.z - fz * 0.15), q, s.set(b.w + 0.2, 0.5, 0.7));
        cornices.setMatrixAt(ci, m);
        cornices.setColorAt(ci++, colour(pick(PALETTE.city.trim, b.tone)));
      }
    });
    geo.setAttribute("aLook", new THREE.InstancedBufferAttribute(looks, 4));
    for (const im of [mesh, bayMesh, cornices]) {
      if (!im) continue;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
      parts.push({ mesh: im, x: cx / list.length, z: cz / list.length, always: key === "sky" });
    }
  }
  /** Tiles further than this from the camera are left out: a few storeys are lost in the haze by then. */
  const FAR = 1600;
  return {
    object: group,
    cull(camera: THREE.Vector3) {
      for (const p of parts) p.mesh.visible = p.always || Math.hypot(p.x - camera.x, p.z - camera.z) < FAR;
    },
  };
}

/** The street map as a texture: each texel a kerb distance, which the terrain's shader paints as road, kerb or pavement. */
export function kerbTexture(world: CityWorld) {
  const tex = new THREE.DataTexture(world.city.kerb, KERB_N, KERB_N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** How much of the fog is in at an hour, 0–1: none in the middle of the day, all of it from dusk to breakfast. */
export function fogAt(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 18 || h < 8) return 1;
  if (h < 11) return 1 - (h - 8) / 3;
  if (h < 15) return 0;
  return (h - 15) / 3;
}

/**
 * The fog (ADR 0022): a bank of it lying off Ocean Beach and a tongue of it pushing in
 * through the Golden Gate, low enough that the bridge's towers stand up out of it. It rolls
 * in from the sea in the late afternoon, lies all night, and burns off by late morning.
 * Soft white lumps, one draw call, lit like everything else so it greys at dusk.
 */
export function buildFogBank() {
  const rand = makeRandom(9071);
  const puffs: { x: number; y: number; z: number; s: number; flat: number; gate: boolean }[] = [];
  // Off the beach, from the Cliff House down past Fort Funston.
  const [north, south] = [toGame(-122.52, 37.7795), toGame(-122.52, 37.705)];
  for (let i = 0; i < 46; i++) {
    const t = rand();
    puffs.push({ x: north.x - 40 - rand() * 260, y: 18 + rand() * 30, z: north.z + (south.z - north.z) * t, s: 80 + rand() * 80, flat: 0.17 + rand() * 0.08, gate: false });
  }
  // Through the Gate: out at sea, under the bridge and on into the bay toward Alcatraz.
  const [sea, bay] = [toGame(-122.53, 37.812), toGame(-122.44, 37.8195)];
  for (let i = 0; i < 54; i++) {
    const t = rand();
    const across = (rand() - 0.5) * 380 * (1 - t * 0.45);
    puffs.push({ x: sea.x + (bay.x - sea.x) * t, y: 14 + rand() * 26 * (1 - t * 0.5), z: sea.z + (bay.z - sea.z) * t + across, s: 70 + rand() * 60 * (1 - t * 0.4), flat: 0.18 + rand() * 0.08, gate: true });
  }
  // Smooth, not faceted like everything else: fog has no edges. Lit a little from within, so its shaded side isn't grey rock.
  const material = new THREE.MeshLambertMaterial({
    color: PALETTE.city.marineFog, emissive: PALETTE.city.marineFog, emissiveIntensity: 0.25, transparent: true, opacity: 0.5, depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), material, puffs.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    object: mesh,
    /** Rolls the fog in or out for the hour, and drifts it with the time. */
    update(hour: number, time: number) {
      const k = fogAt(hour);
      mesh.visible = k > 0.01;
      if (!mesh.visible) return;
      // Rolling in, the Gate's tongue comes in from the sea; burning off, it all thins and shrinks.
      const back = (1 - k) * 700;
      puffs.forEach((p, i) => {
        const drift = Math.sin(time * 0.01 + i) * 20;
        const grow = 0.45 + 0.55 * k;
        v.set(p.x - (p.gate ? back : back * 0.3) + drift, p.y, p.z);
        s.set(p.s * grow, p.s * p.flat * grow, p.s * 0.8 * grow);
        mesh.setMatrixAt(i, m.compose(v, q, s));
      });
      mesh.instanceMatrix.needsUpdate = true;
      material.opacity = 0.5 * Math.min(1, k * 1.4);
    },
  };
}

/**
 * The road closed, where a bridge runs on off the edge of the world: concrete barriers
 * across a deck `width` wide, along local x, and a striped board on posts behind them,
 * with a lamp at each end. Its circles stop a truck at the barriers.
 */
export function buildClosure(width: number, lamps: THREE.Material) {
  const k = new Kit();
  const concrete = lambert(PALETTE.concrete);
  const red = lambert(PALETTE.barnRed);
  const white = lambert(PALETTE.trimCream);
  const colliders: { x: number; z: number; r: number }[] = [];
  const n = Math.ceil(width / 3.2);
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (i + 0.5) * (width / n);
    // A barrier: a broad foot, a narrow top.
    k.box(concrete, width / n - 0.3, 0.35, 0.8, x, 0.18, 0);
    k.box(concrete, width / n - 0.3, 0.55, 0.35, x, 0.62, 0);
    colliders.push({ x, z: 0, r: 1.3 });
  }
  // The board: red and white stripes on two posts.
  for (const s of [-1, 1]) {
    k.box(white, 0.14, 2.2, 0.14, s * (width / 2 - 1.2), 1.1, 1.2);
    k.box(lamps, 0.4, 0.4, 0.4, s * (width / 2 - 1.2), 2.4, 1.2);
  }
  const stripes = Math.max(4, Math.round((width - 2.4) / 1.1));
  for (let i = 0; i < stripes; i++) {
    const x = -(width - 2.4) / 2 + (i + 0.5) * ((width - 2.4) / stripes);
    k.box(i % 2 ? white : red, (width - 2.4) / stripes, 0.7, 0.08, x, 1.8, 1.2, 0, 0, 0);
  }
  const group = new THREE.Group();
  k.build(group);
  return { object: group, colliders };
}

/**
 * A bridge: its deck, the railings along it, its towers, the main cables over them and
 * the suspenders down to the deck. The Golden Gate is International Orange; the Bay
 * Bridge grey, its new eastern span's single tower white.
 */
export function buildDeck(deck: Deck, lamps: THREE.Material) {
  const golden = deck.name === "golden-gate";
  const paint = lambert(golden ? PALETTE.city.bridgeOrange : PALETTE.city.bridgeGrey);
  const shade = lambert(tone(golden ? PALETTE.city.bridgeOrange : PALETTE.city.bridgeGrey, 0.78), THREE.DoubleSide);
  const road = lambert(PALETTE.city.asphalt, THREE.DoubleSide);
  const group = new THREE.Group();
  // The deck: a road on top, a deep girder down each side, from one end to the other.
  const pos: number[] = [];
  const add = (...v: number[]) => pos.push(...v);
  const n = deck.xs.length;
  const sideOf = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = deck.xs[b] - deck.xs[a];
    const dz = deck.zs[b] - deck.zs[a];
    const l = Math.hypot(dx, dz) || 1;
    return { lx: dz / l, lz: -dx / l };
  };
  const roadPos: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const [p, q] = [i, i + 1];
    const [sp, sq] = [sideOf(p), sideOf(q)];
    const h = deck.half;
    const pt = (k: number, sd: { lx: number; lz: number }, off: number, dy: number) => [deck.xs[k] + sd.lx * off, deck.ys[k] + dy, deck.zs[k] + sd.lz * off];
    // Road surface.
    const [a, b, cc, d] = [pt(p, sp, h, 0), pt(p, sp, -h, 0), pt(q, sq, h, 0), pt(q, sq, -h, 0)];
    roadPos.push(...a, ...b, ...cc, ...b, ...d, ...cc);
    // Girders: down each side from the road to 2.2 m under it, and the underside.
    for (const s of [1, -1]) {
      const [t0, t1, b0, b1] = [pt(p, sp, s * h, 0.05), pt(q, sq, s * h, 0.05), pt(p, sp, s * h, -2.2), pt(q, sq, s * h, -2.2)];
      if (s > 0) add(...t0, ...b0, ...t1, ...b0, ...b1, ...t1);
      else add(...t0, ...t1, ...b0, ...b0, ...t1, ...b1);
    }
    const [u0, u1, u2, u3] = [pt(p, sp, h, -2.2), pt(p, sp, -h, -2.2), pt(q, sq, h, -2.2), pt(q, sq, -h, -2.2)];
    add(...u0, ...u2, ...u1, ...u1, ...u2, ...u3);
  }
  const mesh = (list: number[], mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    const me = new THREE.Mesh(g, mat);
    me.castShadow = me.receiveShadow = true;
    return me;
  };
  group.add(mesh(roadPos, road), mesh(pos, shade));
  const k = new Kit();
  // Railings: a low rail each side, with posts, where the deck stands clear of the ground.
  for (const [a, b] of deck.rails) {
    for (let s = a; s < b; s += 5) {
      const p = deckPoint(deck, s);
      const yaw = Math.atan2(p.fx, p.fz);
      for (const sd of [1, -1]) {
        const x = p.x + p.fz * sd * (deck.half - 0.15);
        const z = p.z - p.fx * sd * (deck.half - 0.15);
        k.box(paint, 0.12, 1.1, 0.12, x, p.y + 0.55, z, 0, yaw);
        k.box(paint, 0.08, 0.08, 5.0, x, p.y + 1.05, z, 0, yaw);
      }
    }
    // Lamps every 40 m along the middle, for after dark.
    for (let s = a + 20; s < b; s += 40) {
      const p = deckPoint(deck, s);
      for (const sd of [1, -1]) {
        const x = p.x + p.fz * sd * (deck.half - 0.4);
        const z = p.z - p.fx * sd * (deck.half - 0.4);
        k.box(shade, 0.15, 6, 0.15, x, p.y + 3, z);
        k.box(lamps, 0.5, 0.25, 0.5, x, p.y + 6.05, z);
      }
    }
  }
  // Towers: two legs either side of the road, braced across above it, stepped in as they rise.
  for (const t of deck.towers) {
    const p = deckPoint(deck, t.s);
    const yaw = Math.atan2(p.fx, p.fz);
    const white = !golden && t === deck.towers[deck.towers.length - 1];
    const tm = white ? lambert(PALETTE.city.bridgeWhite) : paint;
    const tk = k.at(p.x, 0, p.z, yaw);
    const H = t.height;
    if (white) {
      // The new eastern span's: one tower of four tapering legs.
      for (const sx of [1, -1]) for (const sz of [1, -1]) tk.box(tm, 2.2, H, 2.2, sx * 1.6, H / 2, sz * 1.6);
      for (let y = 20; y < H; y += 22) tk.box(tm, 5.6, 1.2, 5.6, 0, y, 0);
    } else {
      for (const sx of [1, -1]) {
        const x = sx * t.legs;
        tk.box(tm, 3.2, H * 0.5, 3.6, x, H * 0.25, 0);
        tk.box(tm, 2.6, H * 0.32, 3.0, x, H * 0.66, 0);
        tk.box(tm, 2.0, H * 0.2, 2.4, x, H * 0.9, 0);
        tk.box(lambert(tone(golden ? PALETTE.city.bridgeOrange : PALETTE.city.bridgeGrey, 1.12)), 2.4, 1.2, 2.8, x, H, 0);
      }
      // Portal struts between the legs, above the road and up the tower.
      for (const y of [p.y + 9, H * 0.48, H * 0.7, H * 0.86, H * 0.98]) tk.box(tm, t.legs * 2, golden ? 3.4 : 2.2, 2.2, 0, y, 0);
      // The pier the tower stands on, down into the water.
      tk.box(lambert(PALETTE.concrete), t.legs * 2 + 6, 10, 9, 0, -2, 0);
    }
  }
  // Main cables: from anchorage up over each tower's top and down again, sagging between;
  // and suspenders every 8 m from the cable down to the deck.
  for (const cable of deck.cables) {
    const stops = [cable.from, ...cable.over, cable.to];
    const tops = stops.map((s, i) => {
      const p = deckPoint(deck, s);
      const tower = deck.towers.find((t) => Math.abs(t.s - s) < 1);
      return { s, y: i === 0 || i === stops.length - 1 ? p.y + 1 : (tower ? tower.height : p.y + 60) };
    });
    const heightAt = (s: number) => {
      for (let i = 0; i + 1 < tops.length; i++) {
        const [a, b] = [tops[i], tops[i + 1]];
        if (s < a.s || s > b.s) continue;
        const t = (s - a.s) / (b.s - a.s);
        const straight = a.y + (b.y - a.y) * t;
        const deckY = deckPoint(deck, s).y + 2;
        // A parabola between the towers, dipping to just over the deck in the middle of a main span.
        const dip = (straight - deckY) * cable.sag * 4 * t * (1 - t);
        return Math.max(deckY, straight - dip);
      }
      return deckPoint(deck, s).y;
    };
    for (const sd of [1, -1]) {
      for (let s = cable.from; s < cable.to; s += 4) {
        const a = deckPoint(deck, s);
        const b = deckPoint(deck, Math.min(cable.to, s + 4));
        const off = deck.half + 1.4;
        k.strut(paint, [a.x + a.fz * sd * off, heightAt(s), a.z - a.fx * sd * off], [b.x + b.fz * sd * off, heightAt(Math.min(cable.to, s + 4)), b.z - b.fx * sd * off], 0.7);
        if (Math.round(s) % 8 === 0) {
          const top = heightAt(s);
          if (top > a.y + 2.5) k.box(shade, 0.12, top - a.y, 0.12, a.x + a.fz * sd * off, (top + a.y) / 2, a.z - a.fx * sd * off);
        }
      }
    }
  }
  // The tunnel through Yerba Buena Island: a tube of concrete round the road.
  if (deck.tunnel) {
    const [a, b] = deck.tunnel;
    for (let s = a - 4; s < b + 4; s += 4) {
      const p = deckPoint(deck, s);
      const yaw = Math.atan2(p.fx, p.fz);
      const tk = k.at(p.x, p.y, p.z, yaw);
      tk.box(lambert(PALETTE.concreteDark, THREE.BackSide), deck.half * 2 + 2, 9, 4.2, 0, 4.2, 0);
      if (Math.round(s) % 16 === 0) tk.box(lamps, 1.2, 0.2, 0.4, 0, 8.4, 0);
    }
  }
  k.build(group);
  return group;
}


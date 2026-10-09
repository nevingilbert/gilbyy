import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeRandom } from "./noise";
import { PALETTE } from "./palette";
import type { Bush, Rock, Tree, TreeKind } from "./world";

/** Trees, bushes and boulders: everything scattered, instanced in culling tiles. */

const colour = (hex: string) => new THREE.Color(hex);
const pick = <T,>(list: readonly T[], t: number) => list[Math.min(list.length - 1, Math.floor(t * list.length))];

/** Vertex-coloured geometry, so a tree's trunk and crown can share one draw call. */
/** Untinted, so the per-instance colour comes through as-is. */
const WHITE = new THREE.Color(1, 1, 1);

function painted(geo: THREE.BufferGeometry, c: THREE.Color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
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
  return mergeGeometries([painted(trunk, colour(PALETTE.trunk)), ...tiers.map((t) => painted(t, WHITE))]);
}

function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.4, 5).translate(0, 1.7, 0);
  const crown = new THREE.IcosahedronGeometry(1.9, 0).scale(1, 1.25, 1).translate(0, 4.6, 0);
  const side = new THREE.IcosahedronGeometry(1.3, 0).translate(0.9, 3.7, 0.4);
  return mergeGeometries([painted(trunk, colour(PALETTE.trunk)), painted(crown, WHITE), painted(side, WHITE)]);
}

/**
 * The island's trees come as a trunk and a crown apart. One colour tints the whole of a
 * tree, which suits a pine, whose trunk hardly shows; a palm's is most of what you see.
 */
type Parts = { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry };

/** A palm: a leaning trunk in three lengths, and a crown of drooping fronds. */
function palmGeometry(): Parts {
  const trunk = colour(PALETTE.palmTrunk);
  const parts: THREE.BufferGeometry[] = [];
  const fronds: THREE.BufferGeometry[] = [];
  // Each length leans a little further, so the trunk curves; `at` is where the next one starts.
  let at = new THREE.Vector3(0, 0, 0);
  [[0.3, 0.24, 2.4, 0.08], [0.24, 0.19, 2.3, 0.2], [0.19, 0.15, 2.1, 0.32]].forEach(([r0, r1, h, lean]) => {
    const up = new THREE.Vector3(Math.sin(lean), Math.cos(lean), 0);
    const seg = new THREE.CylinderGeometry(r1, r0, h + 0.1, 5).rotateZ(-lean);
    const mid = at.clone().addScaledVector(up, h / 2);
    parts.push(painted(seg.translate(mid.x, mid.y, mid.z), trunk));
    at = at.addScaledVector(up, h);
  });
  // Fronds: flattened four-sided blades, every other one hanging lower.
  for (let i = 0; i < 9; i++) {
    const turn = (i / 9) * Math.PI * 2;
    const droop = i % 2 ? 0.55 : 0.12;
    const len = i % 2 ? 2.7 : 3.1;
    const blade = new THREE.ConeGeometry(0.5, len, 4).scale(1, 1, 0.14).rotateZ(-Math.PI / 2 - droop);
    blade.translate((Math.cos(droop) * len) / 2, (-Math.sin(droop) * len) / 2, 0).rotateY(turn).translate(at.x, at.y + 0.1, at.z);
    fronds.push(painted(blade, WHITE));
  }
  fronds.push(painted(new THREE.IcosahedronGeometry(0.34, 0).translate(at.x, at.y, at.z), WHITE));
  return { trunk: mergeGeometries(parts), crown: mergeGeometries(fronds) };
}

/** A jungle tree: a tall bare trunk under a wide, flat canopy in layers. */
function canopyGeometry(): Parts {
  const trunk = new THREE.CylinderGeometry(0.2, 0.36, 5.6, 6).translate(0, 2.8, 0);
  const layers = [
    [2.9, 0.42, 0, 6.3, 0],
    [2.1, 0.46, 0.9, 7.25, 0.5],
    [1.9, 0.5, -1.5, 5.6, -0.7],
  ].map(([r, flat, x, y, z]) => new THREE.IcosahedronGeometry(r, 0).scale(1, flat, 1).translate(x, y, z));
  return { trunk: painted(trunk, colour(PALETTE.trunk)), crown: mergeGeometries(layers.map((l) => painted(l, WHITE))) };
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
export function tiled<T extends { x: number; z: number }>(
  items: T[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  place: (item: T, m: THREE.Matrix4, c: THREE.Color) => void,
) {
  const TILE = 500;
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

/** `snowAt` is how snowy it is at a spot, 0–1: pines there are frosted. */
const TREE_GEOMETRY: Record<TreeKind, () => THREE.BufferGeometry | Parts> = {
  pine: pineGeometry, broadleaf: broadleafGeometry, palm: palmGeometry, canopy: canopyGeometry,
};

export function buildTrees(trees: Tree[], snowAt: (x: number, z: number) => number = () => 0) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pine = PALETTE.pine.map(colour);
  const frosted = PALETTE.snowPine.map(colour);
  const larch = PALETTE.larch.map(colour);
  const leaf = PALETTE.broadleaf.map(colour);
  const frond = PALETTE.palmFrond.map(colour);
  const canopy = PALETTE.canopy.map(colour);
  const flame = PALETTE.flameTree.map(colour);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (t: Tree, m: THREE.Matrix4, c: THREE.Color) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.scale, t.scale * (0.9 + t.tone * 0.3), t.scale));
    if (t.kind === "broadleaf") c.copy(pick(leaf, t.tone));
    else if (t.kind === "palm") c.copy(pick(frond, t.tone));
    // One jungle tree in thirty is in flower.
    else if (t.kind === "canopy") c.copy(t.tone < 0.035 ? pick(flame, t.tone / 0.035) : pick(canopy, (t.tone - 0.035) / 0.965));
    else if (snowAt(t.x, t.z) > 0.5) c.copy(pick(frosted, t.tone));
    else c.copy(t.tone < 0.16 ? pick(larch, t.tone / 0.16) : pick(pine, (t.tone - 0.16) / 0.84));
  };
  const group = new THREE.Group();
  for (const kind of Object.keys(TREE_GEOMETRY) as TreeKind[]) {
    const of = trees.filter((t) => t.kind === kind);
    if (!of.length) continue;
    const geo = TREE_GEOMETRY[kind]();
    if (geo instanceof THREE.BufferGeometry) group.add(tiled(of, geo, mat, place));
    else {
      group.add(tiled(of, geo.crown, mat, place));
      // The trunk keeps its own colour, whatever the crown's is.
      group.add(tiled(of, geo.trunk, mat, (t, m, c) => {
        place(t, m, c);
        c.copy(WHITE);
      }));
    }
  }
  return group;
}

/** `tones` is the valley's bushes unless told otherwise: the island's are ferns. */
export function buildBushes(bushes: Bush[], tones: readonly string[] = PALETTE.bush) {
  const geo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.75, 1).translate(0, 0.5, 0),
    new THREE.IcosahedronGeometry(0.65, 0).scale(1, 0.8, 1).translate(0.7, 0.35, 0.2),
    new THREE.IcosahedronGeometry(0.55, 0).translate(-0.55, 0.3, -0.3),
  ].map((g) => g.deleteAttribute("uv")));
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const colours = tones.map(colour);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  return tiled(bushes, geo, mat, (b, m, c) => {
    q.setFromAxisAngle(up, b.rot);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.scale, b.scale, b.scale));
    c.copy(pick(colours, b.tone));
  });
}

/**
 * A scatter of clouds for the plane to fly among (ADR 0014): flat-bottomed lumps in a long
 * box about the origin, with a clear lane down the middle of it along z. Hidden until wanted.
 */
export function buildClouds() {
  const rand = makeRandom(4711);
  const puff = mergeGeometries([
    new THREE.IcosahedronGeometry(1, 1).scale(1, 0.5, 0.8),
    new THREE.IcosahedronGeometry(0.7, 1).scale(1, 0.55, 0.9).translate(0.85, 0.12, 0.1),
    new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.6, 1).translate(-0.8, 0.05, -0.15),
    new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.7, 1).translate(0.1, 0.3, 0.2),
  ].map((g) => g.deleteAttribute("uv")));
  const tones = PALETTE.cloud.map(colour);
  const COUNT = 90;
  const mesh = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({ flatShading: true }), COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < COUNT; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const size = 16 + rand() * 30;
    // Never nearer the lane than the puff is wide, so nothing passes between the plane and the camera beside it.
    const x = side * (60 + size + rand() * 420);
    m.compose(new THREE.Vector3(x, -70 + rand() * 150, (rand() - 0.5) * 1500), q.setFromAxisAngle(up, rand() * Math.PI * 2), new THREE.Vector3(size, size * (0.7 + rand() * 0.4), size));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, pick(tones, rand()));
  }
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export function buildRocks(rocks: Rock[]) {
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

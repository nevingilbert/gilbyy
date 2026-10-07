import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeRandom } from "./noise";
import { PALETTE } from "./palette";
import type { Bush, Rock, Tree } from "./world";

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
export function buildTrees(trees: Tree[], snowAt: (x: number, z: number) => number = () => 0) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pine = PALETTE.pine.map(colour);
  const frosted = PALETTE.snowPine.map(colour);
  const larch = PALETTE.larch.map(colour);
  const leaf = PALETTE.broadleaf.map(colour);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (t: Tree, m: THREE.Matrix4, c: THREE.Color) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.scale, t.scale * (0.9 + t.tone * 0.3), t.scale));
    if (t.kind === "broadleaf") c.copy(pick(leaf, t.tone));
    else if (snowAt(t.x, t.z) > 0.5) c.copy(pick(frosted, t.tone));
    else c.copy(t.tone < 0.16 ? pick(larch, t.tone / 0.16) : pick(pine, (t.tone - 0.16) / 0.84));
  };
  const group = new THREE.Group();
  group.add(tiled(trees.filter((t) => t.kind === "pine"), pineGeometry(), mat, place));
  group.add(tiled(trees.filter((t) => t.kind === "broadleaf"), broadleafGeometry(), mat, place));
  return group;
}

export function buildBushes(bushes: Bush[]) {
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

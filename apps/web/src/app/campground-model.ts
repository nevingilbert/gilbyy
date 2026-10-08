import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, lambert, prism, roof, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";

export type { Circle };

/** The parking bay, in pitch space: centred at z = BAY_Z, and never under a collider. */
const BAY_Z = 4;
const BAY_W = 3.4;
const BAY_D = 6;
const TENT_Z = -4.5;

/** A faceted, squashed stone. */
const stone = (k: Kit, m: THREE.Material, s: number, x: number, z: number, ry = 0) =>
  k.add(m, new THREE.DodecahedronGeometry(s, 0).scale(1, 0.7, 1), x, s * 0.4, z, 0, ry);

/** Stones round an ash bed with logs leaning in over it; the embers are `glow`. Centred on the origin. */
function fireRing(k: Kit, glow: THREE.Material, r: number, logs: number) {
  const stones = [lambert(PALETTE.fireRing), lambert(tone(PALETTE.fireRing, 0.8))];
  const wood = [lambert(PALETTE.logWood), lambert(tone(PALETTE.logWood, 0.7))];
  const s = 0.13 + r * 0.12;
  const n = Math.round((Math.PI * 2 * r) / (s * 1.7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    stone(k, stones[i % 2], s * (0.85 + (i % 3) * 0.12), Math.cos(a) * r, Math.sin(a) * r, a * 3);
  }
  k.cyl(lambert(PALETTE.doorDark), r * 0.85, 0.05, 0, 0.025, 0, 0, 0, 10);
  const len = r * 1.25, lean = 0.65;
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2 + 0.4;
    k.at(0, 0, 0, -a).cyl(wood[i % 2], 0.05 + r * 0.05, len, r * 0.6 - (len / 2) * Math.sin(lean), (len / 2) * Math.cos(lean), 0, 0, lean, 6);
  }
  for (let i = 0; i < 3 + logs; i++) {
    const a = i * 2.4, d = r * (0.15 + ((i * 0.37) % 0.5));
    k.box(glow, 0.1 + r * 0.04, 0.06, 0.08 + r * 0.03, Math.cos(a) * d, 0.07, Math.sin(a) * d, 0, a);
  }
}

/** A picnic table along x: four top boards, two bench seats, splayed legs. */
function picnicTable(k: Kit) {
  const wood = lambert(PALETTE.picnic), dark = lambert(tone(PALETTE.picnic, 0.78));
  for (let i = 0; i < 4; i++) k.box(i % 2 ? dark : wood, 1.8, 0.06, 0.18, 0, 0.76, -0.285 + i * 0.19);
  for (const sz of [1, -1]) k.box(wood, 1.8, 0.06, 0.26, 0, 0.45, sz * 0.68);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) k.box(dark, 0.08, 0.87, 0.1, sx * 0.65, 0.37, sz * 0.385, -sz * 0.57);
    k.box(dark, 0.08, 0.08, 1.6, sx * 0.65, 0.39, 0);
  }
}

/** An A-frame ridge tent, door to +z, under a fly sheet with guy ropes out front and back. */
function ridgeTent(k: Kit, color: THREE.ColorRepresentation, rope: THREE.Material) {
  const w = 2.6, h = 1.75, l = 3.2;
  const pole = lambert(PALETTE.tentPole);
  k.add(lambert(color), prism([[w / 2, 0], [0, h], [-w / 2, 0]], l), 0, 0, 0);
  roof(k, lambert(tone(color, 0.86)), [[w / 2 + 0.15, 0.35], [0, h + 0.06], [-w / 2 - 0.15, 0.35]], l + 0.5, 0.04, 0.1);
  k.add(lambert(PALETTE.void), prism([[0.55, 0], [0, 1.2], [-0.55, 0]], 0.04), 0, 0, l / 2 + 0.02);
  for (const s of [1, -1]) k.box(lambert(tone(color, 0.86)), 0.12, 1.15, 0.12, s * 0.5, 0.58, l / 2 + 0.06, 0, 0, s * 0.42);
  for (const e of [1, -1]) {
    const z = e * (l / 2 + 0.28);
    k.cyl(pole, 0.03, h + 0.4, 0, (h + 0.4) / 2, z, 0, 0, 5);
    k.strut(rope, [0, h + 0.3, z], [0, 0, z + e * 1.1]);
    for (const s of [1, -1]) k.strut(rope, [s * (w / 2 + 0.2), 0.32, e * 1.1], [s * (w / 2 + 0.75), 0, e * 1.3]);
  }
}

/** A dome tent, faceted, with two crossed poles and a small porch at +z. */
function domeTent(k: Kit, color: THREE.ColorRepresentation, rope: THREE.Material) {
  const r = 1.5, sy = 0.85;
  const fly = lambert(tone(color, 0.86)), pole = lambert(PALETTE.tentPole);
  k.add(lambert(color), new THREE.SphereGeometry(r, 8, 4, Math.PI / 8, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1), 0, 0, 0);
  k.cyl(fly, r + 0.02, 0.2, 0, 0.1, 0, 0, 0, 8);
  for (const a of [Math.PI / 4, -Math.PI / 4]) k.add(pole, new THREE.TorusGeometry(r + 0.03, 0.03, 3, 10, Math.PI).scale(1, sy, 1), 0, 0, 0, 0, a);
  k.add(fly, prism([[0.75, 0], [0, 1.05], [-0.75, 0]], 1.1), 0, 0, r - 0.15);
  k.add(lambert(PALETTE.void), prism([[0.45, 0], [0, 0.8], [-0.45, 0]], 0.04), 0, 0, r + 0.42);
  for (const [x, z] of [[1, 0], [-1, 0], [0, -1]]) k.strut(rope, [x * 1.2, 0.75, z * 1.2], [x * 2.0, 0, z * 2.0]);
}

/**
 * One pitch, about 10 m wide (x) by 16 m deep (z). Origin at the pitch centre, ground level. The gravel parking bay
 * is at +z (3.4 m by 6 m, centred on z = 4), the tent behind it at −z; the table and fire swap sides every other pair.
 */
export function buildTentSite(index: number, glow: THREE.Material): {
  object: THREE.Group;
  colliders: Circle[];
  /** Where a car parks, in local space: the middle of the bay, facing +z (out toward the camp road). */
  parking: { x: number; z: number; heading: number };
} {
  const object = new THREE.Group();
  const k = new Kit();
  const n = PALETTE.tent.length;
  // Shifted by one each lap of the palette, so every colour turns up as both a ridge tent and a dome.
  const color = PALETTE.tent[(index + Math.floor(index / n)) % n];
  const side = Math.floor(index / 2) % 2 ? -1 : 1;
  const wood = lambert(PALETTE.picnic), line = lambert(PALETTE.parkingLine), gravel = lambert(PALETTE.dirt[1]);

  // Gravel bay with two lines and a log stop at the back; a gravel tent pad framed in timber.
  k.box(gravel, BAY_W + 0.5, 0.3, BAY_D + 0.4, 0, -0.13, BAY_Z);
  for (const s of [1, -1]) k.box(line, 0.12, 0.03, BAY_D, (s * BAY_W) / 2, 0.035, BAY_Z);
  k.cyl(lambert(PALETTE.logWood), 0.11, 2.2, 0, 0.08, BAY_Z - BAY_D / 2 + 0.35, 0, Math.PI / 2, 7);
  k.box(gravel, 4.4, 0.3, 5.4, 0, -0.13, TENT_Z);
  for (const s of [1, -1]) {
    k.box(wood, 4.6, 0.12, 0.14, 0, 0.06, TENT_Z + s * 2.7);
    k.box(wood, 0.14, 0.12, 5.3, s * 2.23, 0.06, TENT_Z);
  }

  const tent = k.at(0, 0.02, TENT_Z, (((index * 37) % 7) - 3) * 0.03);
  if (index % 2) domeTent(tent, color, line);
  else ridgeTent(tent, color, line);
  const colliders: Circle[] =
    index % 2
      ? [{ x: 0, z: TENT_Z, r: 1.6 }, { x: 0, z: TENT_Z + 1.7, r: 0.8 }]
      : [{ x: 0, z: TENT_Z - 0.8, r: 1.45 }, { x: 0, z: TENT_Z + 0.8, r: 1.45 }];

  // The number post at the road end of the bay: a plaque in the tent's colour.
  const px = -side * 2.35, pz = BAY_Z + BAY_D / 2 + 0.2;
  const p = k.at(px, 0, pz);
  p.box(lambert(PALETTE.timber), 0.16, 1.05, 0.16, 0, 0.52, 0);
  p.box(lambert(tone(PALETTE.timber, 0.75)), 0.2, 0.06, 0.2, 0, 1.07, 0);
  p.box(line, 0.44, 0.32, 0.05, 0, 0.86, 0.1);
  p.box(lambert(color), 0.36, 0.24, 0.05, 0, 0.86, 0.13);
  colliders.push({ x: px, z: pz, r: 0.25 });

  picnicTable(k.at(side * 3.3, 0, -0.4, side * 0.12));
  colliders.push({ x: side * 3.3, z: -0.4, r: 1.25 });

  const fx = -side * 3.0;
  fireRing(k.at(fx, 0, -0.1), glow, 0.6, 3);
  k.cyl(lambert(PALETTE.logWood), 0.2, 1.3, fx - side * 0.2, 0.2, -1.6, 0, Math.PI / 2, 7);
  colliders.push({ x: fx, z: -0.1, r: 0.85 }, { x: fx - side * 0.2, z: -1.6, r: 0.7 });

  // A lantern on a shepherd's hook behind the table.
  const h = k.at(side * 4.3, 0, -1.7);
  h.cyl(lambert(PALETTE.tentPole), 0.03, 1.75, 0, 0.88, 0, 0, 0, 5);
  h.box(lambert(PALETTE.tentPole), 0.34, 0.03, 0.03, -side * 0.15, 1.74, 0);
  h.box(glow, 0.14, 0.2, 0.14, -side * 0.3, 1.5, 0);
  h.box(lambert(PALETTE.doorDark), 0.18, 0.05, 0.18, -side * 0.3, 1.62, 0);
  colliders.push({ x: side * 4.3, z: -1.7, r: 0.2 });

  return { object: k.build(object), colliders, parking: { x: 0, z: BAY_Z, heading: 0 } };
}

/** An outhouse door's crescent: an outer arc and a shallower inner one meeting at the horns. */
function crescent(r: number) {
  const pts: number[][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 3 + (i / 8) * ((4 * Math.PI) / 3);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const [c, ri] = [0.467 * r, 0.867 * r];
  const a0 = Math.atan2(0.866 * r, 0.5 * r - c);
  for (let i = 7; i >= 1; i--) {
    const a = a0 + (i / 8) * (Math.PI * 2 - 2 * a0);
    pts.push([c + ri * Math.cos(a), ri * Math.sin(a)]);
  }
  return prism(pts, 0.03);
}

/** The heart of the camp: big fire pit with log benches, a notice board, a hand water pump, an outhouse. Origin at the fire. */
export function buildCampCentre(glow: THREE.Material): { object: THREE.Group; colliders: Circle[] } {
  const object = new THREE.Group();
  const k = new Kit();
  const logs = [lambert(PALETTE.logWood), lambert(tone(PALETTE.logWood, 0.8))];
  const wood = lambert(PALETTE.timber), woodDark = lambert(tone(PALETTE.timber, 0.75)), dark = lambert(PALETTE.doorDark);
  const rust = lambert(PALETTE.roofRust), grey = lambert(PALETTE.boardsGrey);
  const colliders: Circle[] = [{ x: 0, z: 0, r: 1.9 }];

  fireRing(k, glow, 1.5, 6);
  for (const [x, z, h] of [[0, 0, 1.0], [0.3, 0.2, 0.65], [-0.25, -0.25, 0.75]]) k.add(glow, new THREE.ConeGeometry(0.24, h, 5), x, h / 2 + 0.08, z);

  // Six split-log benches round the fire, on stumps.
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2, [x, z] = [Math.cos(a) * 4.3, Math.sin(a) * 4.3];
    const b = k.at(x, 0, z, -a - Math.PI / 2);
    b.cyl(logs[i % 2], 0.24, 2.0, 0, 0.5, 0, 0, Math.PI / 2, 8);
    b.box(lambert(tone(PALETTE.logWood, 1.3)), 1.96, 0.04, 0.34, 0, 0.72, 0);
    for (const s of [1, -1]) b.cyl(logs[(i + 1) % 2], 0.2, 0.3, s * 0.65, 0.15, 0, 0, 0, 7);
    colliders.push({ x, z, r: 1.05 });
  }

  // Notice board facing the fire: two posts, a little roof, a few blank notices pinned up, a lantern.
  const [nx, nz] = [-6.4, -5.6];
  const nb = k.at(nx, 0, nz, Math.atan2(-nx, -nz));
  for (const s of [1, -1]) nb.box(wood, 0.16, 2.35, 0.16, s * 1.0, 1.18, 0);
  nb.box(woodDark, 2.2, 1.35, 0.06, 0, 1.55, 0.06);
  nb.box(lambert(PALETTE.picnic), 2.0, 1.15, 0.06, 0, 1.55, 0.09);
  roof(nb.at(0, 0, 0, Math.PI / 2), rust, [[0.4, 2.3], [0, 2.58], [-0.4, 2.3]], 2.5, 0.06, 0.14);
  const notes: [THREE.ColorRepresentation, number, number, number][] = [
    [PALETTE.trimCream, -0.55, 1.7, 0.08], [PALETTE.hazardYellow, 0.05, 1.8, -0.05], [PALETTE.trimCream, 0.6, 1.55, 0.12],
    [PALETTE.tent[2], -0.2, 1.25, -0.1], [PALETTE.trimCream, 0.35, 1.2, 0.04],
  ];
  for (const [c, x, y, rz] of notes) nb.box(lambert(c), 0.34, 0.42, 0.02, x, y, 0.13, 0, 0, rz);
  nb.box(glow, 0.13, 0.18, 0.13, 1.15, 2.0, 0.3);
  nb.box(dark, 0.04, 0.04, 0.3, 1.15, 2.2, 0.15);
  colliders.push({ x: nx, z: nz, r: 1.2 });

  // Hand water pump on a concrete pad, a bucket under the spout.
  const [ux, uz] = [6.2, -4.6];
  const pm = k.at(ux, 0, uz, Math.atan2(-ux, -uz));
  const iron = lambert(PALETTE.shipping[3]);
  pm.box(lambert(PALETTE.concrete), 1.2, 0.2, 1.2, 0, 0.1, 0);
  pm.cyl(iron, 0.12, 1.1, 0, 0.75, 0, 0, 0, 8);
  pm.cyl(iron, 0.16, 0.28, 0, 1.38, 0, 0, 0, 8);
  pm.box(iron, 0.1, 0.1, 0.45, 0, 1.12, 0.25, 0.3);
  pm.box(dark, 0.06, 0.06, 0.85, 0, 1.68, -0.3, 0.45);
  pm.cyl(lambert(PALETTE.corrugated), 0.17, 0.3, 0, 0.35, 0.45, 0, 0, 8);
  colliders.push({ x: ux, z: uz, r: 0.75 });

  // Outhouse: grey boards, lean-to roof, a crescent in the door, a lamp beside it.
  const [ox, oz] = [8.6, 4.2];
  const oh = k.at(ox, 0, oz, Math.atan2(-ox, -oz));
  oh.box(grey, 1.5, 2.2, 1.5, 0, 1.1, 0);
  for (let x = -0.6; x <= 0.6; x += 0.3) oh.box(lambert(tone(PALETTE.boardsGrey, 0.78)), 0.05, 2.2, 1.54, x, 1.1, 0);
  const ok = oh.at(0, 0, 0, Math.PI / 2);
  ok.add(grey, prism([[0.75, 2.2], [-0.75, 2.2], [-0.75, 2.48]], 1.5), 0, 0, 0);
  roof(ok, rust, [[0.75, 2.2], [-0.75, 2.48]], 1.9, 0.08, 0.25);
  oh.box(wood, 0.8, 1.95, 0.06, 0, 1.0, 0.79);
  oh.add(lambert(PALETTE.void), crescent(0.11), 0.05, 1.65, 0.82);
  oh.box(glow, 0.12, 0.16, 0.12, 0.62, 1.95, 0.9);
  oh.box(dark, 0.16, 0.04, 0.16, 0.62, 2.05, 0.9);
  colliders.push({ x: ox, z: oz, r: 1.2 });

  // Firewood stacked by the benches.
  const [wx, wz] = [-8.0, 2.8];
  const pile = k.at(wx, 0, wz, Math.atan2(-wx, -wz));
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6 - row; i++) pile.cyl(logs[(i + row) % 2], 0.14, 0.7, (i - (5 - row) / 2) * 0.29, 0.14 + row * 0.25, 0, Math.PI / 2, 0, 6);
  colliders.push({ x: wx, z: wz, r: 1.0 });

  return { object: k.build(object), colliders };
}

/**
 * A log entrance arch with a blank wooden sign board, spanning a 7 m road along z. Origin at the road centre.
 * `ground(x)` is the ground's height at local x, relative to the origin: the posts, their stones and the wings stand
 * on it, so the arch can sit across a slope with its beam level.
 */
export function buildCampGate(ground: (x: number) => number): { object: THREE.Group; colliders: Circle[] } {
  const object = new THREE.Group();
  const k = new Kit();
  const logs = [lambert(PALETTE.logWood), lambert(tone(PALETTE.logWood, 0.8))];
  const wood = lambert(PALETTE.timber), woodDark = lambert(tone(PALETTE.timber, 0.75)), dark = lambert(PALETTE.doorDark);
  const stones = [lambert(PALETTE.fireRing), lambert(tone(PALETTE.fireRing, 0.8))];
  const X = 4.3, TOP = 5.9;
  const colliders: Circle[] = [];
  for (const s of [1, -1]) {
    // Each post runs from a little below its own footing up to the beam.
    const foot = ground(s * X) - 0.2;
    k.cyl(logs[0], 0.3, TOP + 0.35 - foot, s * X, (TOP + 0.35 + foot) / 2, 0, 0, 0, 9);
    // Knee brace from post to beam, well above the road.
    const [run, rise] = [1.3, 1.05];
    k.cyl(logs[1], 0.13, Math.hypot(run, rise), s * (X - run / 2), TOP - 0.25 - rise / 2, 0, 0, s * Math.atan2(run, rise), 7);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = s * X + Math.cos(a) * 0.45;
      stone(k.at(0, ground(x), 0), stones[i % 2], 0.24 + (i % 3) * 0.05, x, Math.sin(a) * 0.45, a * 2);
    }
    // A split-rail wing running out from each post, its rails following the ground.
    const [near, far] = [s * (X + 0.2), s * (X + 4.5)];
    for (const y of [0.55, 1.05]) k.strut(logs[1], [near, ground(near) + y, 0], [far, ground(far) + y, 0], 0.13);
    for (const d of [2.3, 4.4]) k.box(woodDark, 0.16, 1.5, 0.16, s * (X + d), ground(s * (X + d)) + 0.55, 0);
    colliders.push({ x: s * X, z: 0, r: 0.55 });
    for (const d of [1.2, 2.3, 3.4, 4.4]) colliders.push({ x: s * (X + d), z: 0, r: 0.4 });
  }
  k.cyl(logs[0], 0.28, 2 * X + 1.6, 0, TOP, 0, 0, Math.PI / 2, 9);
  // The board hangs on two chains: three planks in a log frame, bottom edge about 4 m up.
  for (const x of [1.7, -1.7]) k.box(dark, 0.04, 0.5, 0.04, x, TOP - 0.5, 0);
  for (let i = 0; i < 3; i++) k.box(i % 2 ? woodDark : wood, 4.2, 0.34, 0.1, 0, 4.98 - i * 0.34, 0);
  for (const y of [5.2, 4.08]) k.box(logs[1], 4.5, 0.14, 0.16, 0, y, 0);
  for (const s of [1, -1]) k.box(logs[1], 0.14, 1.26, 0.16, s * 2.18, 4.64, 0);
  return { object: k.build(object), colliders };
}

/**
 * Bakes every mesh under `root` into one mesh per material; add the result where `root` was, untransformed. Pitches share
 * their materials (lambert() caches by colour), so the 30 of them come to ~20 draw calls this way instead of ~480.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const toParent = new THREE.Matrix4().copy(root.matrixWorld).invert().premultiply(root.matrix);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const list = parts.get(mesh.material) ?? [];
    list.push(mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toParent, mesh.matrixWorld)));
    parts.set(mesh.material, list);
  });
  const out = new THREE.Group();
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";

export type GarageStyle = "workshop" | "barn" | "bunker" | "quonset" | "cabin" | "container" | "hangar" | "ranch";
export const GARAGE_STYLES: readonly GarageStyle[] = ["workshop", "barn", "bunker", "quonset", "cabin", "container", "hangar", "ranch"];

export type Circle = { x: number; z: number; r: number };

export type GarageModel = {
  /** Origin at ground level, centre of the building footprint. The door faces +z. */
  object: THREE.Group;
  /** 0 = shut, 1 = fully open. Called every frame while animating; must be cheap. */
  setDoor(open: number): void;
  /** Solid parts as circles in local space, for collision. Must NOT cover the door approach (the area in front of the door, and for the bunker the trap-door pad). */
  colliders: Circle[];
  /** Local z where the car waits in front of the door (prompt shows here; on exit the car is placed here facing +z). About 7 m in front of the door. */
  approachZ: number;
  /** Local z the car drives to when entering (just inside the door). */
  insideZ: number;
  /** Metres the car descends while driving in: 0 for all styles except the bunker (~4). */
  sink: number;
  /** Rough footprint radius, used to flatten terrain and clear trees around it. */
  radius: number;
};

// --- A small build kit, shared with train-model.ts and crossing-model.ts. ---

const materials = new Map<string, THREE.MeshLambertMaterial>();

/** Flat-shaded Lambert, one instance per colour, so a kit can merge everything that shares it. */
export function lambert(color: THREE.ColorRepresentation, side: THREE.Side = THREE.FrontSide) {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}/${side}`;
  let m = materials.get(key);
  if (!m) materials.set(key, (m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, side })));
  return m;
}

/** A palette colour, lighter or darker, for shading variety. */
export const tone = (color: THREE.ColorRepresentation, k: number) => new THREE.Color(color).multiplyScalar(k);

const ONE = new THREE.Vector3(1, 1, 1);

/** Collects static parts and merges them per material on build: a garage is ~15 draw calls, not ~300. */
export class Kit {
  constructor(
    private parts = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    private base = new THREE.Matrix4(),
  ) {}

  /** Takes `g` over, turned by Euler XYZ and moved into this kit's space. */
  add(m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, ONE).premultiply(this.base));
    const list = this.parts.get(m) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.parts.set(m, list);
  }

  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.add(m, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  /** A cylinder along y; rx or rz of π/2 lays it along z or x. */
  cyl(m: THREE.Material, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0, segs = 10) {
    this.add(m, new THREE.CylinderGeometry(r, r, h, segs), x, y, z, rx, 0, rz);
  }

  /** A thin square bar from a to b, [x, y, z] each: ropes, wires, chains. */
  strut(m: THREE.Material, a: readonly number[], b: readonly number[], t = 0.02) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    this.box(m, t, len, t, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z);
  }

  /** A child kit, offset and turned about y, feeding the same batches. */
  at(x: number, y: number, z: number, ry = 0) {
    return new Kit(this.parts, this.base.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)));
  }

  /** Merges everything added so far into one mesh per material, under `parent`. */
  build<T extends THREE.Object3D>(parent: T) {
    for (const [m, list] of this.parts) {
      const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.parts.clear();
    return parent;
  }
}

// --- Building parts, also used by the camp, the café and the mission props. ---

/** A polygon in xy, extruded `depth` along z and centred on z = 0. */
export function prism(shape: THREE.Shape | number[][], depth: number) {
  const s = Array.isArray(shape) ? new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y))) : shape;
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -depth / 2);
}

/** Boards along a profile in xy, eave to ridge to eave with the +x side first, `depth` long in z. */
export function roof(k: Kit, m: THREE.Material, pts: number[][], depth: number, t = 0.16, over = 0.4) {
  for (let i = 1; i < pts.length; i++) {
    const [[x0, y0], [x1, y1]] = [pts[i - 1], pts[i]];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
    // Overhang at the eaves only; inner joints just close up.
    const a = i === 1 ? over : t / 2;
    const b = i === pts.length - 1 ? over : t / 2;
    const s = (b - a) / 2;
    k.box(m, len + a + b, t, depth, (x0 + x1) / 2 + ux * s + (uy * t) / 2, (y0 + y1) / 2 + uy * s - (ux * t) / 2, 0, 0, 0, Math.atan2(uy, ux));
  }
}

/** The dark inside seen through an open door: a box drawn inside-out, so the car can drive into it. */
const lining = (k: Kit, w: number, h: number, depth: number, front: number) =>
  k.box(lambert(PALETTE.void, THREE.BackSide), w, h, depth, 0, h / 2 + 0.05, front - depth / 2);

/** Four walls with a door hole in the front (+z) one, lined behind the door. */
function shell(k: Kit, m: THREE.Material, w: number, d: number, h: number, dw: number, dh: number, t = 0.25) {
  const side = (w - dw) / 2;
  for (const s of [1, -1]) {
    k.box(m, side, h, t, (s * (w - side)) / 2, h / 2, d / 2 - t / 2);
    k.box(m, t, h, d, (s * (w - t)) / 2, h / 2, 0);
  }
  k.box(m, dw, h - dh, t, 0, (h + dh) / 2, d / 2 - t / 2);
  k.box(m, w, h, t, 0, h / 2, -d / 2 + t / 2);
  lining(k, dw + 0.6, dh + 0.2, Math.min(d - 2 * t, 6.6), d / 2 - t);
}

/** A framed window facing +z in `k`'s space. The pane is the caller's material, so it lights up after dark. */
export function pane(k: Kit, glass: THREE.Material, w: number, h: number, frame: THREE.ColorRepresentation = PALETTE.trimCream) {
  const f = lambert(frame);
  k.box(f, w + 0.22, h + 0.22, 0.1, 0, 0, 0.03);
  k.box(glass, w, h, 0.1, 0, 0, 0.06);
  k.box(f, w, 0.07, 0.06, 0, 0, 0.13);
  k.box(f, 0.07, h, 0.06, 0, 0, 0.13);
}

/** A moving part: built by `fill` in its own kit, under a group at (x, y, z). */
function part(root: THREE.Group, x: number, y: number, z: number, fill: (k: Kit) => void) {
  const k = new Kit();
  fill(k);
  const g = k.build(new THREE.Group());
  g.position.set(x, y, z);
  root.add(g);
  return g;
}

/** Two leaves hinged at the outer edges of a `w`-wide opening at z, swinging out toward +z. `leaf` builds one toward s·x. */
function swingDoors(root: THREE.Group, w: number, z: number, leaf: (k: Kit, s: number) => void, max = 1.9) {
  const hinges = [1, -1].map((s) => ({ s, g: part(root, (-s * w) / 2, 0, z, (k) => leaf(k, s)) }));
  return (t: number) => hinges.forEach(({ g, s }) => (g.rotation.y = -s * t * max));
}

/** Rings a rectangle with overlapping circles: enough to keep the car out, and none poke far past the edges. */
export function ring(out: Circle[], x0: number, x1: number, z0: number, z1: number) {
  const nx = Math.max(1, Math.round((x1 - x0) / 2.4));
  const nz = Math.max(1, Math.round((z1 - z0) / 2.4));
  const [cw, cd] = [(x1 - x0) / nx, (z1 - z0) / nz];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++)
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) out.push({ x: x0 + (i + 0.5) * cw, z: z0 + (j + 0.5) * cd, r: Math.hypot(cw, cd) * 0.43 });
  return out;
}

/** Where the car waits and parks for a door whose outer face is at z = `front`. */
const entry = (front: number, extent: number) => ({
  approachZ: front + 7,
  insideZ: front - 3.4,
  sink: 0,
  // Wide enough that the waiting car sits on flat, tree-free ground.
  radius: Math.max(extent, front + 9.5),
});

// --- Yard props. ---

function drum(k: Kit, x: number, z: number, color: THREE.ColorRepresentation) {
  k.cyl(lambert(color), 0.3, 0.9, x, 0.45, z);
  for (const y of [0.3, 0.62]) k.cyl(lambert(tone(color, 0.7)), 0.315, 0.05, x, y, z);
}

const tyres = (k: Kit, x: number, z: number, n: number) => {
  for (let i = 0; i < n; i++) k.add(lambert(PALETTE.tyre), new THREE.TorusGeometry(0.3, 0.13, 6, 10), x + (i % 2) * 0.06, 0.13 + i * 0.25, z, Math.PI / 2);
};

const bale = (k: Kit, x: number, y: number, z: number) =>
  k.cyl(lambert(tone(PALETTE.hazardYellow, 0.9)), 0.65, 1.2, x, y + 0.65, z, 0, Math.PI / 2, 12);

function crate(k: Kit, x: number, y: number, z: number, s: number, ry = 0) {
  k.box(lambert(PALETTE.timber), s, s, s, x, y + s / 2, z, 0, ry);
  k.box(lambert(tone(PALETTE.timber, 0.7)), s + 0.04, s * 0.18, s + 0.04, x, y + s / 2, z, 0, ry);
}

/** A workbench along x, with a vice. */
function bench(k: Kit) {
  const wood = lambert(PALETTE.timber);
  k.box(wood, 2.0, 0.1, 0.75, 0, 0.92, 0);
  k.box(wood, 1.9, 0.05, 0.6, 0, 0.3, 0);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(wood, 0.08, 0.9, 0.08, sx * 0.9, 0.45, sz * 0.3);
  k.box(lambert(PALETTE.doorDark), 0.25, 0.18, 0.2, 0.7, 1.06, 0.25);
}

// --- The styles. Each adds static parts to `k` and moving parts straight to `root`. ---

type Build = (root: THREE.Group, k: Kit, glass: THREE.Material) => Omit<GarageModel, "object">;

const workshop: Build = (root, k, glass) => {
  const W = 9, D = 8, H = 4.2, DW = 3.8, DH = 3.4, F = D / 2;
  const wall = lambert(PALETTE.plaster), wood = lambert(PALETTE.timber), dark = lambert(PALETTE.doorDark);
  shell(k, wall, W, D, H, DW, DH);
  const gable = [[W / 2, H], [0, H + 1.9], [-W / 2, H]];
  k.add(wall, prism(gable, D), 0, 0, 0);
  roof(k, lambert(PALETTE.roofSlate), gable, D + 0.8, 0.18, 0.45);
  for (const s of [1, -1]) k.box(wood, 0.2, DH + 0.2, 0.08, s * (DW / 2 + 0.1), DH / 2 + 0.1, F + 0.04);
  k.box(wood, DW + 0.6, 0.2, 0.08, 0, DH + 0.1, F + 0.04);
  // A blank sign board on the gable.
  k.box(lambert(PALETTE.trimCream), 3.6, 0.9, 0.06, 0, H + 0.55, F + 0.03);
  k.box(lambert(PALETTE.barnRed), 3.3, 0.65, 0.1, 0, H + 0.55, F + 0.06);
  pane(k.at(W / 2, 2.3, -0.6, Math.PI / 2), glass, 1.6, 1.0, PALETTE.timber);
  // Office annex with a lean-to roof.
  const a = k.at(-W / 2 - 1.6, 0, -0.4);
  a.box(lambert(tone(PALETTE.plaster, 0.88)), 3.2, 2.9, 4.6, 0, 1.45, 0);
  roof(a, lambert(PALETTE.roofRust), [[1.7, 3.45], [-1.7, 2.85]], 5.1, 0.14, 0.3);
  a.box(dark, 0.9, 2.0, 0.08, -0.85, 1.0, 2.32);
  pane(a.at(0.65, 1.65, 2.3), glass, 1.2, 0.9, PALETTE.timber);
  // Fuel pump on its island; the globe glows with the windows.
  const p = k.at(4.4, 0, F + 2.4, -0.3);
  p.box(lambert(PALETTE.concrete), 1.1, 0.16, 0.8, 0, 0.08, 0);
  p.box(lambert(PALETTE.barnRed), 0.55, 1.5, 0.4, 0, 0.9, 0);
  p.box(lambert(PALETTE.trimCream), 0.62, 0.14, 0.46, 0, 1.72, 0);
  p.box(glass, 0.3, 0.34, 0.22, 0, 1.96, 0);
  p.box(dark, 0.06, 0.8, 0.06, 0.33, 1.0, 0.1);
  drum(k, -7.1, -3.4, PALETTE.shipping[1]);
  drum(k, -6.4, -3.8, PALETTE.hazardYellow);
  tyres(k, 5.3, -2.4, 4);
  // Roll-up door: hangs from the top of the opening and shortens as it rolls.
  const door = part(root, 0, DH, F - 0.3, (dk) => {
    dk.box(lambert(PALETTE.corrugated), DW, DH, 0.08, 0, -DH / 2, 0);
    for (let y = 0.35; y < DH; y += 0.4) dk.box(lambert(tone(PALETTE.corrugated, 0.75)), DW, 0.05, 0.1, 0, -y, 0.02);
  });
  const colliders = ring(ring([{ x: 4.4, z: F + 2.4, r: 0.6 }, { x: -6.75, z: -3.6, r: 0.75 }, { x: 5.3, z: -2.4, r: 0.5 }], -W / 2, W / 2, -F, F), -W / 2 - 3.2, -W / 2, -2.7, 1.9);
  return { setDoor: (t) => (door.scale.y = 1 - 0.95 * t), colliders, ...entry(F, 9) };
};

const barn: Build = (root, k, glass) => {
  const W = 10, D = 12, H = 4, DW = 4, DH = 3.6, F = D / 2, top = H + 3.6;
  const red = lambert(PALETTE.barnRed), white = lambert(PALETTE.trimCream), tin = lambert(PALETTE.roofTin), dark = lambert(PALETTE.doorDark);
  shell(k, red, W, D, H, DW, DH);
  // Gambrel: steep lower slopes, shallow upper ones, white bargeboards.
  const prof = [[W / 2, H], [3.5, H + 2.4], [0, top], [-3.5, H + 2.4], [-W / 2, H]];
  k.add(red, prism(prof, D), 0, 0, 0);
  roof(k, tin, prof, D + 0.8);
  for (const z of [F + 0.42, -F - 0.42]) roof(k.at(0, 0, z), white, prof, 0.12, 0.24, 0.42);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) k.box(white, 0.22, H, 0.22, sx * (W / 2 - 0.08), H / 2, sz * (F - 0.08));
    k.box(white, 0.2, DH + 0.2, 0.1, sx * (DW / 2 + 0.1), DH / 2, F + 0.05);
    for (const z of [-2.8, 2.2]) pane(k.at(sx * (W / 2), 2.3, z, (sx * Math.PI) / 2), glass, 0.9, 0.9);
  }
  k.box(white, W, 0.2, 0.1, 0, H, F + 0.05);
  k.box(dark, DW * 2 + 0.4, 0.14, 0.14, 0, DH + 0.28, F + 0.2);
  // Hayloft door, hoist beam, cupola and wind vane.
  k.box(white, 1.9, 1.9, 0.06, 0, H + 1.2, F + 0.03);
  k.box(dark, 1.5, 1.5, 0.08, 0, H + 1.2, F + 0.06);
  for (const r of [1, -1]) k.box(white, 1.9, 0.12, 0.04, 0, H + 1.2, F + 0.11, 0, 0, (r * Math.PI) / 4);
  k.box(lambert(PALETTE.timber), 0.25, 0.25, 1.4, 0, H + 3.2, F + 0.5);
  k.box(white, 1.1, 1.0, 1.1, 0, top + 0.3, 0);
  k.box(dark, 1.12, 0.45, 0.6, 0, top + 0.35, 0);
  k.box(dark, 0.6, 0.45, 1.12, 0, top + 0.35, 0);
  k.add(tin, new THREE.ConeGeometry(0.95, 0.7, 4), 0, top + 1.15, 0, 0, Math.PI / 4);
  k.box(dark, 0.04, 0.7, 0.04, 0, top + 1.8, 0);
  k.box(dark, 0.7, 0.05, 0.12, 0, top + 1.95, 0, 0, 0.6);
  bale(k, 6.6, 0, 3.2);
  bale(k, 6.6, 0, 4.5);
  bale(k, 6.6, 1.13, 3.85);
  // Two halves on a track, sliding apart along the wall.
  const [w, h] = [DW / 2, DH + 0.1];
  const halves = [1, -1].map((s) => ({
    s,
    g: part(root, 0, 0, F + 0.18, (dk) => {
      dk.box(lambert(tone(PALETTE.barnRed, 0.82)), w, h, 0.1, 0, h / 2, 0);
      for (const y of [0.08, h - 0.08]) dk.box(white, w, 0.16, 0.06, 0, y, 0.07);
      for (const x of [1, -1]) dk.box(white, 0.16, h, 0.06, x * (w / 2 - 0.08), h / 2, 0.07);
      for (const r of [1, -1]) dk.box(white, Math.hypot(w, h) - 0.3, 0.14, 0.04, 0, h / 2, 0.08, 0, 0, r * Math.atan2(h, w));
    }),
  }));
  const setDoor = (t: number) => halves.forEach(({ g, s }) => (g.position.x = s * (DW / 4 + (t * DW) / 2)));
  return { setDoor, colliders: ring([{ x: 6.6, z: 3.85, r: 1.3 }], -W / 2, W / 2, -F, F), ...entry(F, 9) };
};

const bunker: Build = (root, k, glass) => {
  const conc = lambert(PALETTE.concrete), dark = lambert(PALETTE.concreteDark);
  const yellow = lambert(PALETTE.hazardYellow), black = lambert(PALETTE.doorDark);
  const TW = 4.4, TL = 7.5, TZ = 2.4, E = 0.35;
  // Pad flush with the ground (top at 0.12), and the hole under the leaves.
  k.box(conc, 10, 0.6, 14, 0, -0.18, 0);
  k.box(lambert(PALETTE.void), TW, 0.02, TL, 0, 0.13, TZ);
  const stripe = (len: number, x: number, z: number, alongX: boolean) => {
    const n = Math.round(len / 0.55);
    for (let i = 0, s = len / n; i < n; i++) {
      const o = -len / 2 + s * (i + 0.5);
      k.box(i % 2 ? black : yellow, alongX ? s : E, 0.08, alongX ? E : s, x + (alongX ? o : 0), 0.14, z + (alongX ? 0 : o));
    }
  };
  for (const s of [1, -1]) stripe(TL + 2 * E, s * (TW / 2 + E / 2), TZ, false);
  for (const s of [1, -1]) stripe(TW, 0, TZ + s * (TL / 2 + E / 2), true);
  // Stair hatch, with the radio mast on its roof; vents and drums beside it.
  const b = k.at(-1.8, 0.12, -5.3);
  b.box(conc, 3, 2.5, 3, 0, 1.25, 0);
  b.box(dark, 3.3, 0.2, 3.3, 0, 2.6, 0);
  b.box(black, 1.0, 1.9, 0.08, 0.6, 0.95, 1.52);
  pane(b.at(-0.7, 1.7, 1.5), glass, 0.7, 0.35, PALETTE.concreteDark);
  for (let i = 0; i < 6; i++) b.cyl(lambert(i % 2 ? PALETTE.barrierWhite : PALETTE.barrierRed), 0.07, 0.8, -1, 3.1 + i * 0.8, -1, 0, 0, 6);
  b.box(dark, 1.4, 0.06, 0.06, -1, 6.4, -1);
  b.box(dark, 0.06, 0.06, 1.0, -1, 5.9, -1);
  for (const [x, z] of [[2.0, -5.8], [2.7, -4.7]]) {
    k.cyl(dark, 0.15, 1.3, x, 0.7, z, 0, 0, 8);
    k.cyl(dark, 0.32, 0.14, x, 1.4, z, 0, 0, 8);
  }
  drum(k, -4.0, -4.2, PALETTE.shipping[3]);
  drum(k, -4.1, -3.5, PALETTE.shipping[0]);
  // Two steel leaves hinged on their long outer edges, opening upward past vertical.
  const steel = lambert(tone(PALETTE.roofTin, 0.7)), rib = lambert(tone(PALETTE.roofTin, 0.5)), lw = TW / 2 - 0.02;
  const leaves = [1, -1].map((s) => ({
    s,
    g: part(root, (-s * TW) / 2, 0.14, TZ, (lk) => {
      lk.box(steel, lw, 0.1, TL, (s * lw) / 2, 0.05, 0);
      for (let z = -TL / 2 + 0.6; z < TL / 2; z += 1.6) lk.box(rib, lw - 0.2, 0.06, 0.14, (s * lw) / 2, 0.12, z);
      lk.box(rib, 0.16, 0.12, TL, s * 0.1, 0.06, 0);
    }),
  }));
  const setDoor = (t: number) => leaves.forEach(({ g, s }) => (g.rotation.z = s * t * 1.75));
  const colliders = [{ x: -1.8, z: -5.3, r: 2.0 }, { x: 2.35, z: -5.25, r: 0.95 }, { x: -4.05, z: -3.85, r: 0.65 }];
  return { setDoor, colliders, approachZ: TZ + TL / 2 + 7, insideZ: TZ, sink: 4, radius: TZ + TL / 2 + 9.5 };
};

const quonset: Build = (root, k, glass) => {
  const R = 4.6, L = 12, F = L / 2, DW = 3.6, DH = 3.4;
  const ends = lambert(PALETTE.boardsGrey), green = lambert(PALETTE.shipping[3]), brace = lambert(tone(PALETTE.shipping[3], 0.7));
  // Half a cylinder along z, ribbed; double-sided so no sliver at the end walls shows through.
  k.add(lambert(PALETTE.corrugated, THREE.DoubleSide), new THREE.CylinderGeometry(R, R, L, 12, 1, true, Math.PI / 2, Math.PI), 0, 0, 0, Math.PI / 2);
  for (let z = -F; z <= F; z += 1.5) k.add(lambert(tone(PALETTE.corrugated, 0.75)), new THREE.TorusGeometry(R + 0.02, 0.07, 4, 12, Math.PI), 0, 0, z);
  const endWall = (door: boolean) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, R - 0.02, 0, Math.PI, false);
    if (door) s.lineTo(-DW / 2, 0).lineTo(-DW / 2, DH).lineTo(DW / 2, DH).lineTo(DW / 2, 0);
    return prism(s, 0.2);
  };
  k.add(ends, endWall(true), 0, 0, F - 0.1);
  k.add(ends, endWall(false), 0, 0, -F + 0.1);
  for (const s of [1, -1]) k.box(lambert(PALETTE.concrete), 0.45, 0.35, L + 0.3, s * R, 0.1, 0);
  lining(k, DW + 0.6, DH + 0.2, 6.8, F - 0.2);
  for (const s of [1, -1]) pane(k.at(s * 3.0, 1.9, F), glass, 0.8, 0.7);
  k.box(lambert(PALETTE.doorDark), 0.5, 0.1, 0.35, 0, DH + 0.45, F + 0.17);
  k.box(glass, 0.24, 0.16, 0.2, 0, DH + 0.33, F + 0.15);
  crate(k, R + 1.0, 0, 3.4, 0.9, 0.2);
  crate(k, R + 1.1, 0, 2.3, 0.8, -0.1);
  crate(k, R + 1.0, 0.9, 3.3, 0.7, 0.5);
  drum(k, -R - 0.9, 2.2, PALETTE.shipping[0]);
  drum(k, -R - 1.0, 2.9, PALETTE.shipping[3]);
  // Army-green double doors with Z braces.
  const setDoor = swingDoors(root, DW, F, (dk, s) => {
    const w = DW / 2 - 0.02;
    dk.box(green, w, DH - 0.04, 0.1, (s * w) / 2, DH / 2, 0.05);
    for (const y of [0.5, DH - 0.5]) dk.box(brace, w - 0.12, 0.14, 0.05, (s * w) / 2, y, 0.12);
    dk.box(brace, Math.hypot(w - 0.3, DH - 1), 0.14, 0.05, (s * w) / 2, DH / 2, 0.12, 0, 0, s * Math.atan2(DH - 1, w - 0.3));
  });
  return { setDoor, colliders: ring([{ x: R + 1.05, z: 2.85, r: 1.0 }, { x: -R - 0.95, z: 2.55, r: 0.75 }], -R, R, -F, F), ...entry(F, 9) };
};

const cabin: Build = (root, k, glass) => {
  const W = 9, D = 8, DW = 3.6, DH = 3.4, F = D / 2, r = 0.18, step = 0.34, H = 4.1, RISE = 3.4;
  const logs = [lambert(PALETTE.logWood), lambert(tone(PALETTE.logWood, 0.8))];
  const planks = [lambert(PALETTE.timber), lambert(tone(PALETTE.timber, 0.82))];
  const strap = lambert(PALETTE.doorDark), stone = [lambert(PALETTE.concrete), lambert(tone(PALETTE.concrete, 0.78))];
  // Stacked logs, front and back a half-course above the sides so the corners interlock.
  for (let i = 0; i < 12; i++) {
    const [m, y, along] = [logs[i % 2], r + i * step, W + 0.6];
    k.cyl(m, r, along, 0, y, -F + r, 0, Math.PI / 2, 7);
    if (y < DH) for (const s of [1, -1]) k.cyl(m, r, (along - DW) / 2, (s * (along + DW)) / 4, y, F - r, 0, Math.PI / 2, 7);
    else k.cyl(m, r, along, 0, y, F - r, 0, Math.PI / 2, 7);
    for (const s of [1, -1]) k.cyl(logs[(i + 1) % 2], r, D + 0.6, s * (W / 2 - r), y - step / 2, 0, Math.PI / 2, 0, 7);
  }
  for (const s of [1, -1]) k.box(planks[0], 0.24, DH + 0.2, 0.42, s * (DW / 2 + 0.12), (DH + 0.2) / 2, F - r);
  // Steep rusty roof, ridge along x, board gables; fieldstone chimney on the west end.
  const rk = k.at(0, 0, 0, Math.PI / 2);
  rk.add(planks[0], prism([[F - 0.2, H - 0.45], [F - 0.2, H], [0, H + RISE], [-F + 0.2, H], [-F + 0.2, H - 0.45]], W - 0.2), 0, 0, 0);
  roof(rk, lambert(PALETTE.roofRust), [[F, H], [0, H + RISE], [-F, H]], W + 1.2, 0.18, 0.6);
  for (let i = 0; i < 12; i++) k.box(stone[i % 2], i < 5 ? 1.2 : 0.9, 0.7, i < 5 ? 1.2 : 0.9, -W / 2 - 0.55, 0.35 + i * 0.7, -1.2);
  k.box(lambert(PALETTE.concreteDark), 1.05, 0.18, 1.05, -W / 2 - 0.55, 8.45, -1.2);
  pane(k.at(3.35, 2.0, F + 0.02), glass, 0.9, 0.8, PALETTE.timber);
  pane(k.at(W / 2 + 0.02, 2.0, 0.8, Math.PI / 2), glass, 1.0, 0.8, PALETTE.timber);
  pane(k.at(-W / 2 - 0.02, 2.0, 1.6, -Math.PI / 2), glass, 1.0, 0.8, PALETTE.timber);
  // Porch lamp.
  k.box(strap, 0.08, 0.08, 0.35, DW / 2 + 0.55, 2.95, F + 0.15);
  k.box(glass, 0.22, 0.3, 0.22, DW / 2 + 0.55, 2.75, F + 0.32);
  k.box(strap, 0.3, 0.06, 0.3, DW / 2 + 0.55, 2.93, F + 0.32);
  lining(k, DW + 0.4, DH + 0.1, 6.4, F - 2 * r);
  // Woodpile out back, a chopping stump with an axe by the side.
  const pile = k.at(1.2, 0, -F - 0.7);
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6 - row; i++) pile.cyl(logs[(i + row) % 2], 0.14, 0.7, (i - (5 - row) / 2) * 0.29, 0.14 + row * 0.25, 0, Math.PI / 2, 0, 6);
  k.cyl(logs[0], 0.32, 0.5, 5.9, 0.25, 2.4, 0, 0, 8);
  k.box(planks[1], 0.05, 0.75, 0.05, 5.9, 0.8, 2.5, 0.5);
  k.box(strap, 0.04, 0.16, 0.24, 5.9, 0.54, 2.36);
  // Plank doors on strap hinges.
  const setDoor = swingDoors(root, DW, F, (dk, s) => {
    const w = DW / 2 - 0.02;
    for (let i = 0; i < 4; i++) dk.box(planks[i % 2], w / 4, DH - 0.02, 0.1, s * (w / 4) * (i + 0.5), DH / 2, 0.06);
    for (const y of [0.6, DH - 0.6]) dk.box(strap, w * 0.8, 0.12, 0.04, s * w * 0.45, y, 0.13);
  });
  const props = [{ x: -W / 2 - 0.55, z: -1.2, r: 0.8 }, { x: 1.2, z: -F - 0.7, r: 0.9 }, { x: 5.9, z: 2.4, r: 0.4 }];
  return { setDoor, colliders: ring(props, -W / 2 - 0.3, W / 2 + 0.3, -F - 0.3, F), ...entry(F, 9) };
};

/** A shipping container along z, oversized so a truck fits, open at the +z end when `open`. */
function container(k: Kit, color: THREE.ColorRepresentation, len: number, open: boolean) {
  const W = 3.8, H = 3.6, m = lambert(color), d = lambert(tone(color, 0.7));
  k.box(m, W, 0.14, len, 0, H - 0.07, 0);
  k.box(m, W - 0.2, H - 0.2, 0.08, 0, H / 2, -len / 2 + 0.06);
  if (!open) k.box(m, W - 0.2, H - 0.2, 0.08, 0, H / 2, len / 2 - 0.06);
  for (const s of [1, -1]) {
    k.box(m, 0.08, H - 0.2, len - 0.2, s * (W / 2 - 0.06), H / 2, 0);
    for (let z = -len / 2 + 0.5; z < len / 2 - 0.3; z += 0.5) k.box(m, 0.08, H - 0.4, 0.2, (s * W) / 2, H / 2, z);
    for (const y of [0.1, H - 0.1]) k.box(d, 0.14, 0.2, len, s * (W / 2 - 0.05), y, 0);
    for (const e of [1, -1]) k.box(d, 0.2, H, 0.2, s * (W / 2 - 0.08), H / 2, e * (len / 2 - 0.1));
    k.box(d, W, 0.2, 0.16, 0, H - 0.1, s * (len / 2 - 0.08));
  }
  k.box(d, W, 0.2, 0.16, 0, 0.1, -len / 2 + 0.08);
}

const containers: Build = (root, k, glass) => {
  const [rust, blue, ochre, green] = PALETTE.shipping;
  const steel = lambert(tone(PALETTE.roofTin, 0.6)), leaf = lambert(tone(rust, 0.9)), bars = lambert(tone(rust, 0.72));
  container(k, rust, 10, true);
  container(k.at(3.85, 0, -1.5), blue, 7, false);
  container(k.at(1.9, 3.6, -3, Math.PI / 2), ochre, 7.6, false);
  lining(k, 3.5, 3.3, 9.6, 4.9);
  // The top one is the office: window and door onto a landing on the blue one's roof.
  pane(k.at(0.4, 5.5, -1.04), glass, 1.4, 0.8);
  k.box(lambert(PALETTE.doorDark), 0.95, 2.2, 0.08, 3.6, 4.75, -1.03);
  k.box(steel, 3.8, 0.05, 0.05, 3.85, 4.6, 1.95);
  for (const x of [2.0, 3.85, 5.7]) k.box(steel, 0.05, 1.0, 0.05, x, 4.1, 1.95);
  // Exterior stair up the side.
  const st = k.at(6.35, 0, -4);
  const run = 5.2, rise = 3.6, a = Math.atan2(rise, run), len = Math.hypot(run, rise);
  for (const s of [1, -1]) {
    st.box(steel, 0.08, 0.26, len, s * 0.5, rise / 2, run / 2, -a);
    st.box(steel, 0.05, 0.05, len, s * 0.5, rise / 2 + 1.0, run / 2, -a);
    for (const f of [0.1, 0.5, 0.9]) st.box(steel, 0.05, 1.0, 0.05, s * 0.5, rise * f + 0.5, run * f);
  }
  for (let i = 1; i < 12; i++) st.box(steel, 0.95, 0.05, 0.32, 0, (rise * i) / 12, (run * i) / 12);
  // Tarp lean-to over a workbench, with a lit window under it.
  const t = k.at(0, 0, 1.2);
  roof(t, lambert(green), [[-1.9, 3.5], [-5.4, 2.5]], 5.2, 0.05, 0.15);
  for (const z of [-2.4, 2.4]) t.cyl(lambert(PALETTE.timber), 0.07, 2.5, -5.2, 1.25, z, 0, 0, 6);
  bench(t.at(-3.2, 0, -0.6, Math.PI / 2));
  drum(t, -4.5, 1.6, PALETTE.hazardYellow);
  pane(k.at(-1.95, 2.1, 2.6, -Math.PI / 2), glass, 1.0, 0.7);
  // End doors on the rust one, with lock bars.
  const setDoor = swingDoors(root, 3.68, 5.0, (dk, s) => {
    dk.box(leaf, 1.84, 3.4, 0.08, s * 0.92, 1.8, 0.04);
    for (let y = 0.45; y < 3.4; y += 0.62) dk.box(bars, 1.6, 0.16, 0.05, s * 0.92, y, 0.1);
    for (const x of [0.5, 1.35]) dk.cyl(lambert(PALETTE.doorDark), 0.04, 3.3, s * x, 1.8, 0.15, 0, 0, 6);
  });
  const colliders = ring(ring(ring(ring([], -1.9, 5.75, -5, 2), -1.9, 1.9, 2, 5), -5.5, -2, -1.2, 3.8), 5.8, 6.9, -4, 1.2);
  return { setDoor, colliders, ...entry(5, 9) };
};

const hangar: Build = (root, k, glass) => {
  const W = 15, D = 13, H = 5.2, DW = 7.5, DH = 4.6, F = D / 2, RISE = 1.7;
  const tin = lambert(PALETTE.corrugated), rib = lambert(tone(PALETTE.corrugated, 0.78)), dark = lambert(PALETTE.doorDark);
  const steel = lambert(tone(PALETTE.roofTin, 0.6)), wood = lambert(PALETTE.timber);
  shell(k, tin, W, D, H, DW, DH, 0.2);
  const gable = [[W / 2, H], [0, H + RISE], [-W / 2, H]];
  k.add(tin, prism(gable, D), 0, 0, 0);
  roof(k, lambert(PALETTE.roofTin), gable, D + 0.8, 0.16, 0.5);
  k.box(steel, 0.5, 0.12, D + 0.9, 0, H + RISE + 0.12, 0);
  // Corrugation ribs; on the front only beside and above the door, where the leaves don't cover them.
  for (let z = -F + 0.25; z < F; z += 0.5) for (const s of [1, -1]) k.box(rib, 0.06, H, 0.1, s * (W / 2 + 0.01), H / 2, z);
  for (let x = -W / 2 + 0.25; x < W / 2; x += 0.5) {
    k.box(rib, 0.1, H, 0.06, x, H / 2, -F - 0.01);
    if (Math.abs(x) > DW / 2 + 0.1) k.box(rib, 0.1, H, 0.06, x, H / 2, F + 0.01);
    else k.box(rib, 0.1, H - DH, 0.06, x, (H + DH) / 2, F + 0.01);
  }
  for (const s of [1, -1]) for (const z of [-3.6, 0, 3.6]) pane(k.at(s * (W / 2 + 0.03), 3.9, z, (s * Math.PI) / 2), glass, 1.6, 0.7);
  // Side door, and the track the big leaves hang from, running the full width.
  k.box(dark, 0.08, 2.1, 1.0, W / 2 + 0.06, 1.05, F - 1.8);
  k.box(dark, W + 0.3, 0.24, 0.24, 0, DH + 0.32, F + 0.3);
  k.box(steel, W, 0.05, 0.14, 0, 0.03, F + 0.3);
  // Windsock: tapering red and white bands drooping off a hoop.
  const ws = k.at(-W / 2 - 3.6, 0, F + 1.4, Math.PI * 0.8);
  ws.box(lambert(PALETTE.concrete), 0.8, 0.2, 0.8, 0, 0.1, 0);
  ws.cyl(steel, 0.07, 6.6, 0, 3.3, 0, 0, 0, 8);
  const droop = 0.25;
  ws.add(steel, new THREE.TorusGeometry(0.36, 0.03, 4, 10), 0.25, 6.3, 0, 0, Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const [r0, d] = [0.36 - i * 0.045, 0.25 + (i + 0.5) * 0.44];
    const band = lambert(i % 2 ? PALETTE.barrierWhite : PALETTE.barrierRed, THREE.DoubleSide);
    ws.add(band, new THREE.CylinderGeometry(r0 - 0.045, r0, 0.44, 10, 1, true), 0.25 + d * Math.cos(droop), 6.3 - d * Math.sin(droop), 0, 0, 0, -Math.PI / 2 - droop);
  }
  // Fuel drums, and an old wooden propeller with yellow tips leaning on the wall.
  drum(k, -W / 2 - 0.8, -2.0, PALETTE.barrierRed);
  drum(k, -W / 2 - 0.85, -2.75, PALETTE.shipping[1]);
  drum(k, -W / 2 - 1.5, -2.35, PALETTE.barrierRed);
  const lean = 0.3, hub = 1.2 * Math.cos(lean);
  const pr = k.at(W / 2 + 0.42, 0, -2.6);
  pr.box(wood, 0.07, 2.4, 0.26, 0, hub, 0, 0, 0, lean);
  pr.box(lambert(tone(PALETTE.timber, 0.8)), 0.1, 0.6, 0.26, 0, hub, 0, 0, 0, lean);
  for (const e of [1, -1]) pr.box(lambert(PALETTE.hazardYellow), 0.08, 0.24, 0.27, -e * 1.08 * Math.sin(lean), hub + e * 1.08 * Math.cos(lean), 0, 0, 0, lean);
  pr.cyl(dark, 0.12, 0.3, 0, hub, 0, 0, Math.PI / 2, 8);
  // Two big corrugated leaves on separate tracks, sliding apart along the front.
  const paint = lambert(PALETTE.paint.skyBlue), paintRib = lambert(tone(PALETTE.paint.skyBlue, 0.8));
  const [lw, lh] = [DW / 2 + 0.06, DH + 0.2];
  const leaves = [1, -1].map((s) => ({
    s,
    g: part(root, 0, 0, F + (s > 0 ? 0.2 : 0.34), (dk) => {
      dk.box(paint, lw, lh, 0.06, 0, lh / 2, 0);
      for (let x = -lw / 2 + 0.2; x < lw / 2; x += 0.4) dk.box(paintRib, 0.06, lh, 0.1, x, lh / 2, 0);
      for (const y of [0.12, lh / 2, lh - 0.12]) dk.box(paintRib, lw, 0.14, 0.12, 0, y, 0);
    }),
  }));
  const setDoor = (t: number) => leaves.forEach(({ g, s }) => (g.position.x = s * (DW / 4 + (t * DW) / 2)));
  const props = [{ x: -W / 2 - 3.6, z: F + 1.4, r: 0.4 }, { x: -W / 2 - 1.1, z: -2.4, r: 1.0 }, { x: W / 2 + 0.45, z: -2.6, r: 0.5 }];
  return { setDoor, colliders: ring(props, -W / 2, W / 2, -F, F), ...entry(F, 12) };
};

/** A run of post-and-rail fence, posts every ~2.2 m; its colliders are small circles along the line. */
function fence(k: Kit, out: Circle[], x0: number, z0: number, x1: number, z1: number, gate = false) {
  const post = lambert(tone(PALETTE.timber, 0.75)), rail = lambert(tone(PALETTE.timber, 1.15));
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.2)), ry = Math.atan2(-(z1 - z0), x1 - x0);
  const at = (f: number) => [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
  for (let i = 0; i < n; i++) {
    const [x, z] = at(i / n);
    k.box(post, 0.18, 1.6, 0.18, x, 0.8, z, 0, ry);
  }
  for (const y of [0.5, 0.95, 1.4]) k.box(rail, len, 0.12, 0.07, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, ry);
  // A five-bar gate's brace across the middle panel.
  if (gate) {
    const [x, z] = at((Math.floor(n / 2) + 0.5) / n), seg = len / n;
    k.box(rail, Math.hypot(seg, 0.9) - 0.2, 0.12, 0.07, x, 0.95, z, 0, ry, Math.atan2(0.9, seg));
  }
  for (let i = 0; i <= 2 * n; i++) {
    const [x, z] = at(i / (2 * n));
    out.push({ x, z, r: 0.35 });
  }
}

const ranch: Build = (root, k, glass) => {
  const W = 10, D = 10, H = 3.8, DW = 3.8, DH = 3.4, F = D / 2, RISE = 2.6;
  const grey = lambert(PALETTE.boardsGrey), seam = lambert(tone(PALETTE.boardsGrey, 0.75));
  const wood = lambert(PALETTE.timber), woodDark = lambert(tone(PALETTE.timber, 0.75)), strap = lambert(PALETTE.doorDark);
  const hay = lambert(tone(PALETTE.hazardYellow, 0.9));
  shell(k, grey, W, D, H, DW, DH);
  const gable = [[W / 2, H], [0, H + RISE], [-W / 2, H]];
  k.add(grey, prism(gable, D), 0, 0, 0);
  roof(k, lambert(PALETTE.roofRust), gable, D + 0.8, 0.16, 0.5);
  // Board seams on every wall, up into the front gable; timber corner posts.
  for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) {
    k.box(seam, 0.08, H, 0.06, x, H / 2, -F - 0.02);
    const gh = RISE * (1 - Math.abs(x) / (W / 2)) - 0.1;
    if (Math.abs(x) > DW / 2 + 0.25) k.box(seam, 0.08, H + gh, 0.06, x, (H + gh) / 2, F + 0.02);
    else if (Math.abs(x) > 0.85) k.box(seam, 0.08, H - DH + gh, 0.06, x, (DH + H + gh) / 2, F + 0.02);
  }
  for (let z = -F + 0.3; z < F; z += 0.6) for (const s of [1, -1]) k.box(seam, 0.06, H, 0.08, s * (W / 2 + 0.02), H / 2, z);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(wood, 0.24, H, 0.24, sx * (W / 2 - 0.06), H / 2, sz * (F - 0.06));
  for (const s of [1, -1]) k.box(wood, 0.22, DH + 0.2, 0.12, s * (DW / 2 + 0.11), DH / 2 + 0.1, F + 0.06);
  k.box(wood, DW + 0.66, 0.22, 0.12, 0, DH + 0.11, F + 0.06);
  // A horseshoe over the door, open end up; the hayloft door and hoist beam above.
  k.add(lambert(PALETTE.rail), new THREE.TorusGeometry(0.15, 0.035, 4, 9, Math.PI * 1.5), 0, DH + 0.42, F + 0.08, 0, 0, -Math.PI * 1.25);
  k.box(wood, 1.5, 1.3, 0.08, 0, H + 0.95, F + 0.04);
  for (const r of [1, -1]) k.box(woodDark, 1.8, 0.12, 0.05, 0, H + 0.95, F + 0.1, 0, 0, r * Math.atan2(1.3, 1.5));
  k.box(wood, 0.22, 0.22, 1.4, 0, H + RISE - 0.45, F + 0.6);
  k.box(strap, 0.03, 1.1, 0.03, 0, H + RISE - 1.05, F + 1.15);
  // Dutch stall doors down the west side, top halves open.
  for (const z of [-3.4, -0.8]) {
    const st = k.at(-W / 2, 0, z, -Math.PI / 2);
    st.box(woodDark, 1.4, 2.35, 0.08, 0, 1.18, 0.07);
    st.box(lambert(PALETTE.void), 1.1, 0.95, 0.06, 0, 1.75, 0.11);
    st.box(wood, 1.1, 1.15, 0.08, 0, 0.66, 0.13);
    st.box(woodDark, 1.5, 0.1, 0.04, 0, 0.66, 0.18, 0, 0, Math.atan2(1.15, 1.1));
    st.box(wood, 1.1, 0.95, 0.06, 1.3, 1.75, 0.12);
  }
  for (const z of [-2.5, 1.5]) pane(k.at(W / 2 + 0.03, 2.2, z, Math.PI / 2), glass, 0.9, 0.7, PALETTE.timber);
  // Porch lamp, a wagon wheel leaning by the door, square bales, a hitching rail.
  k.box(strap, 0.08, 0.08, 0.35, DW / 2 + 0.6, 2.95, F + 0.15);
  k.box(glass, 0.22, 0.3, 0.22, DW / 2 + 0.6, 2.75, F + 0.32);
  k.box(strap, 0.3, 0.06, 0.3, DW / 2 + 0.6, 2.93, F + 0.32);
  const wl = k.at(-3.6, 0, F + 0.26);
  const tilt = -0.12, wy = 0.66 * Math.cos(tilt);
  wl.add(woodDark, new THREE.TorusGeometry(0.62, 0.05, 4, 14), 0, wy, 0, tilt);
  for (let i = 0; i < 4; i++) wl.box(wood, 0.05, 1.2, 0.04, 0, wy, 0, tilt, 0, (i * Math.PI) / 4);
  wl.cyl(strap, 0.1, 0.16, 0, wy, 0, Math.PI / 2 + tilt, 0, 8);
  for (const [z, y] of [[2.1, 0], [2.65, 0], [3.2, 0], [2.4, 0.46], [2.95, 0.46]]) {
    k.box(hay, 1.0, 0.45, 0.52, -W / 2 - 0.85, y + 0.23, z);
    for (const x of [-0.25, 0.25]) k.box(strap, 0.03, 0.46, 0.53, -W / 2 - 0.85 + x, y + 0.23, z);
  }
  for (const z of [F + 1.2, F + 3.6]) k.box(woodDark, 0.18, 1.2, 0.18, -W / 2 - 1.8, 0.6, z);
  k.cyl(wood, 0.1, 2.8, -W / 2 - 1.8, 1.12, F + 2.4, Math.PI / 2, 0, 7);
  // The corral on the east side: trough by the near fence, a round bale in the far corner.
  const [cx0, cx1, cz0, cz1] = [W / 2 + 1.6, W / 2 + 10.4, -F + 0.4, F - 1.6];
  const colliders: Circle[] = [];
  fence(k, colliders, cx0, cz0, cx1, cz0);
  fence(k, colliders, cx1, cz0, cx1, cz1);
  fence(k, colliders, cx1, cz1, cx0, cz1, true);
  fence(k, colliders, cx0, cz1, cx0, cz0);
  k.box(wood, 0.7, 0.55, 2.2, cx0 + 0.8, 0.28, -1.2);
  k.box(lambert(PALETTE.water), 0.5, 0.04, 2.0, cx0 + 0.8, 0.53, -1.2);
  bale(k, cx1 - 1.6, 0, cz0 + 1.6);
  // Plank doors with an X brace and strap hinges.
  const setDoor = swingDoors(root, DW, F, (dk, s) => {
    const w = DW / 2 - 0.02;
    for (let i = 0; i < 5; i++) dk.box(i % 2 ? woodDark : wood, w / 5, DH - 0.02, 0.1, s * (w / 5) * (i + 0.5), DH / 2, 0.06);
    for (const r of [1, -1]) dk.box(woodDark, Math.hypot(w, DH) - 0.3, 0.14, 0.04, (s * w) / 2, DH / 2, 0.13, 0, 0, r * Math.atan2(DH, w));
    for (const y of [0.5, DH - 0.5]) dk.box(strap, w * 0.5, 0.1, 0.04, s * w * 0.25, y, 0.15);
  });
  const props = [{ x: -W / 2 - 0.85, z: 2.65, r: 0.95 }, { x: -3.6, z: F + 0.3, r: 0.5 }];
  for (const z of [F + 1.2, F + 2.4, F + 3.6]) props.push({ x: -W / 2 - 1.8, z, r: 0.4 });
  return { setDoor, colliders: ring([...colliders, ...props], -W / 2, W / 2, -F, F), ...entry(F, 16.5) };
};

const BUILDERS: Record<GarageStyle, Build> = { workshop, barn, bunker, quonset, cabin, container: containers, hangar, ranch };

/** A garage the car can drive into. `windowMaterial` is shared and owned by the caller; it glows at night. */
export function buildGarage(style: GarageStyle, windowMaterial: THREE.Material): GarageModel {
  const object = new THREE.Group();
  const k = new Kit();
  const model = BUILDERS[style](object, k, windowMaterial);
  k.build(object);
  model.setDoor(0);
  return { object, ...model };
}

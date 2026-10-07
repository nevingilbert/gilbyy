import * as THREE from "three";
import { Kit, lambert, pane, prism, ring, roof, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";

const W = 12;
const D = 9;
const F = D / 2;
const H = 3.6;
const RISE = 2.0;
/** The awning: from the wall at AW_TOP out to AW_OUT in front of it, dropping to AW_LOW. */
const AW_TOP = 3.2;
const AW_LOW = 2.75;
const AW_OUT = 1.9;
const AW_HALF = 5.4;
/** Patio slab front edge; the gravel lot runs from here to LOT_END. */
const PATIO_END = F + 5.7;
const LOT_END = 25;

/** A bistro chair facing local +z. */
function chair(k: Kit, m: THREE.Material) {
  k.box(m, 0.42, 0.05, 0.42, 0, 0.47, 0);
  k.box(m, 0.42, 0.4, 0.05, 0, 0.72, -0.2, -0.1);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(m, 0.04, 0.47, 0.04, sx * 0.18, 0.24, sz * 0.18);
}

/** A round café table with `n` chairs round it, centred at (x, z). */
function table(k: Kit, x: number, z: number, n: number, turn: number) {
  const top = lambert(PALETTE.timber), iron = lambert(PALETTE.doorDark), seat = lambert(PALETTE.coffeeTrim);
  k.cyl(top, 0.45, 0.05, x, 0.8, z, 0, 0, 10);
  k.cyl(iron, 0.05, 0.72, x, 0.42, z, 0, 0, 6);
  k.cyl(iron, 0.26, 0.04, x, 0.07, z, 0, 0, 8);
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2;
    chair(k.at(x + Math.cos(a) * 0.8, 0.05, z + Math.sin(a) * 0.8, Math.atan2(-Math.cos(a), -Math.sin(a))), seat);
  }
}

/** The hanging sign's face, in the board's space facing +z: a cup on its saucer, steam rising. */
function cup(k: Kit) {
  const cream = lambert(PALETTE.coffeeTrim);
  k.add(cream, prism([[-0.32, 0.22], [0.32, 0.22], [0.24, -0.25], [-0.24, -0.25]], 0.05), -0.08, -0.05, 0.07);
  k.add(cream, new THREE.TorusGeometry(0.13, 0.045, 4, 10, Math.PI * 1.1), 0.22, 0.02, 0.07, 0, 0, -Math.PI * 0.55);
  k.add(cream, prism([[-0.5, -0.3], [0.5, -0.3], [0.4, -0.38], [-0.4, -0.38]], 0.05), -0.08, 0, 0.07);
  for (const x of [-0.22, 0.04])
    for (let i = 0; i < 3; i++) k.box(cream, 0.05, 0.13, 0.04, x + (i % 2 ? 0.04 : -0.02), 0.27 + i * 0.11, 0.07, 0, 0, i % 2 ? -0.5 : 0.5);
}

/**
 * A small roadside café, front facing +z. Origin at ground level in the middle of the building, which is 12 m by 9 m;
 * in front of it a flagged patio (to z ≈ 10) and then a gravel lot (to z = 25), both left free of colliders.
 */
export function buildCoffeeShop(windows: THREE.Material, glow: THREE.Material): {
  object: THREE.Group;
  colliders: Circle[];
  /** The meeting spot in local space: the patio/parking area in front of the shop where players gather. */
  meet: { x: number; z: number; r: number };
} {
  const object = new THREE.Group();
  const k = new Kit();
  const wall = lambert(PALETTE.coffeeWall), batten = lambert(tone(PALETTE.coffeeWall, 0.8)), trim = lambert(PALETTE.coffeeTrim);
  const dark = lambert(PALETTE.doorDark), wood = lambert(PALETTE.timber);

  // Board-and-batten box on a concrete skirt, cream corner boards and frieze.
  k.box(wall, W, H, D, 0, H / 2, 0);
  k.box(lambert(PALETTE.concreteDark), W + 0.12, 0.35, D + 0.12, 0, 0.17, 0);
  for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) {
    k.box(batten, 0.08, H, 0.06, x, H / 2, -F - 0.02);
    if (Math.abs(x) > 0.8) k.box(batten, 0.08, H, 0.06, x, H / 2, F + 0.02);
    else k.box(batten, 0.08, H - 2.5, 0.06, x, (H + 2.5) / 2, F + 0.02);
  }
  for (let z = -F + 0.3; z < F; z += 0.6) for (const s of [1, -1]) k.box(batten, 0.06, H, 0.08, s * (W / 2 + 0.02), H / 2, z);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, 0.22, H, 0.22, sx * (W / 2 - 0.05), H / 2, sz * (F - 0.05));
  for (const z of [F + 0.04, -F - 0.04]) k.box(trim, W + 0.1, 0.2, 0.1, 0, H - 0.1, z);

  // Gable roof, ridge along x, cream bargeboards; a fieldstone chimney through the back slope.
  const prof = [[F, H], [0, H + RISE], [-F, H]];
  const rk = k.at(0, 0, 0, Math.PI / 2);
  rk.add(wall, prism(prof, W), 0, 0, 0);
  roof(rk, lambert(PALETTE.roofSlate), prof, W + 0.8, 0.18, 0.5);
  for (const s of [1, -1]) roof(k.at(s * (W / 2 + 0.42), 0, 0, Math.PI / 2), trim, prof, 0.12, 0.22, 0.52);
  const stones = [lambert(PALETTE.concrete), lambert(tone(PALETTE.concrete, 0.8))];
  for (let i = 0; i < 5; i++) k.box(stones[i % 2], 0.8, 0.6, 0.8, 3.4, H + 0.3 + i * 0.6, -2.2);
  k.box(lambert(PALETTE.concreteDark), 0.95, 0.15, 0.95, 3.4, H + 3.1, -2.2);

  // Front: big windows either side of a red door with a glass panel; a bench under the left window.
  for (const s of [1, -1]) pane(k.at(s * 3.2, 1.65, F), windows, 3.0, 1.6, PALETTE.coffeeTrim);
  k.box(trim, 1.4, 2.55, 0.08, 0, 1.27, F + 0.04);
  k.box(lambert(tone(PALETTE.coffeeAwning[0], 0.85)), 1.1, 2.35, 0.06, 0, 1.18, F + 0.1);
  pane(k.at(0, 1.6, F + 0.1), windows, 0.65, 0.9, PALETTE.coffeeTrim);
  k.box(dark, 0.06, 0.06, 0.12, 0.42, 1.1, F + 0.18);
  k.box(wood, 1.8, 0.07, 0.42, -3.2, 0.46, F + 0.3);
  for (const x of [-0.75, 0.75]) k.box(dark, 0.06, 0.44, 0.38, -3.2 + x, 0.22, F + 0.3);
  // Sides and back.
  for (const s of [1, -1]) for (const z of [-1.8, 1.6]) pane(k.at(s * (W / 2 + 0.03), 1.75, z, (s * Math.PI) / 2), windows, 1.5, 1.1, PALETTE.coffeeTrim);
  pane(k.at(2.0, 1.8, -F - 0.03, Math.PI), windows, 1.0, 0.8, PALETTE.coffeeTrim);
  k.box(dark, 1.0, 2.15, 0.08, -3.0, 1.08, -F - 0.06);

  // Striped awning on three brackets, a scalloped valance, and a string of lights along its edge.
  const stripes = [lambert(PALETTE.coffeeAwning[0]), lambert(PALETTE.coffeeAwning[1])];
  const slope = Math.atan2(AW_TOP - AW_LOW, AW_OUT), len = Math.hypot(AW_OUT, AW_TOP - AW_LOW);
  const n = Math.round((2 * AW_HALF) / 0.6), sw = (2 * AW_HALF) / n;
  for (let i = 0; i < n; i++) {
    const x = -AW_HALF + sw * (i + 0.5);
    k.box(stripes[i % 2], sw, 0.05, len, x, (AW_TOP + AW_LOW) / 2, F + AW_OUT / 2, slope);
    k.add(stripes[i % 2], prism([[-sw / 2, 0], [sw / 2, 0], [sw / 2, -0.2], [0, -0.3], [-sw / 2, -0.2]], 0.04), x, AW_LOW, F + AW_OUT + 0.01);
  }
  for (const x of [-AW_HALF + 0.2, -1.1, 1.1, AW_HALF - 0.2]) k.strut(dark, [x, AW_TOP - 1.0, F + 0.05], [x, AW_LOW + 0.05, F + AW_OUT - 0.1], 0.06);
  const hooks = 6, wire = dark, lz = F + AW_OUT + 0.06, ly = AW_LOW - 0.2;
  for (let i = 0; i < hooks; i++) {
    const [x0, x1] = [-AW_HALF + (i * 2 * AW_HALF) / hooks, -AW_HALF + ((i + 1) * 2 * AW_HALF) / hooks];
    let prev = [x0, ly, lz];
    for (let j = 1; j <= 5; j++) {
      const f = j / 5, p = [x0 + (x1 - x0) * f, ly - 0.22 * 4 * f * (1 - f), lz];
      k.strut(wire, prev, p, 0.015);
      if (j < 5) k.add(glow, new THREE.IcosahedronGeometry(0.06, 0), p[0], p[1] - 0.06, p[2]);
      prev = p;
    }
  }

  // The hanging sign on a post at the front-left corner, facing the road.
  const [sx, sz] = [-7.4, 5.8];
  k.box(wood, 0.2, 5.0, 0.2, sx, 2.5, sz);
  k.box(wood, 2.6, 0.16, 0.16, sx + 1.2, 4.82, sz);
  k.strut(dark, [sx + 0.1, 4.15, sz], [sx + 0.6, 4.8, sz], 0.08);
  const sign = k.at(sx + 1.35, 3.8, sz);
  for (const x of [-0.75, 0.75]) sign.strut(dark, [x, 0.6, 0], [x, 0.95, 0], 0.03);
  sign.box(trim, 2.05, 1.35, 0.06, 0, 0, -0.02);
  sign.box(lambert(PALETTE.coffeeSign), 1.85, 1.15, 0.1, 0, 0, 0);
  cup(sign);

  // The patio: a concrete slab scored into flags, three tables, an umbrella over the middle one.
  const pz = (F + PATIO_END) / 2, pd = PATIO_END - F;
  k.box(lambert(PALETTE.concrete), 11.6, 0.35, pd, 0, -0.125, pz);
  for (const z of [F + 1.9, F + 3.8]) k.box(lambert(PALETTE.concreteDark), 11.6, 0.01, 0.05, 0, 0.055, z);
  for (const x of [-2.9, 0, 2.9]) k.box(lambert(PALETTE.concreteDark), 0.05, 0.01, pd, x, 0.055, pz);
  table(k, -3.6, F + 2.6, 3, 0.4);
  table(k, 3.6, F + 2.6, 3, 1.1);
  table(k, 0, F + 3.9, 2, 0);
  k.cyl(dark, 0.03, 2.3, 0, 1.2, F + 3.9, 0, 0, 5);
  for (let i = 0; i < 8; i++) {
    const shade = lambert(PALETTE.coffeeAwning[i % 2], THREE.DoubleSide);
    k.add(shade, new THREE.ConeGeometry(1.35, 0.45, 1, 1, true, (i * Math.PI) / 4, Math.PI / 4), 0, 2.3, F + 3.9);
  }
  k.box(dark, 0.06, 0.12, 0.06, 0, 2.58, F + 3.9);

  // Gravel lot, with timber wheel stops facing the patio.
  const lz0 = PATIO_END, lw = 24;
  k.box(lambert(PALETTE.dirt[1]), lw, 0.3, LOT_END - lz0, 0, -0.13, (lz0 + LOT_END) / 2);
  for (let x = -7.5; x <= 7.5; x += 3) k.box(wood, 1.6, 0.14, 0.22, x, 0.09, lz0 + 1.0);

  // Out the side and back: a propane tank on blocks, coffee sacks on a pallet.
  const tank = lambert(PALETTE.barrierWhite);
  k.cyl(tank, 0.5, 1.6, W / 2 + 1.3, 0.85, -1.8, Math.PI / 2, 0, 10);
  for (const e of [1, -1]) k.add(tank, new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), W / 2 + 1.3, 0.85, -1.8 + e * 0.8, (e * Math.PI) / 2);
  for (const e of [1, -1]) k.box(lambert(PALETTE.concrete), 0.7, 0.4, 0.3, W / 2 + 1.3, 0.2, -1.8 + e * 0.5);
  k.box(dark, 0.14, 0.18, 0.14, W / 2 + 1.3, 1.42, -1.8);
  const sack = lambert(tone(PALETTE.plaster, 0.82));
  k.box(wood, 1.2, 0.14, 1.0, -4.6, 0.07, -F - 1.0);
  for (const [x, y, ry] of [[-4.85, 0.29, 0.06], [-4.35, 0.29, -0.08], [-4.6, 0.59, 0.2]]) k.box(sack, 0.5, 0.3, 0.85, x, y, -F - 1.0, 0, ry);

  const colliders = ring(
    [
      { x: sx, z: sz, r: 0.3 },
      { x: W / 2 + 1.3, z: -1.8, r: 1.15 },
      { x: -4.6, z: -F - 1.0, r: 0.85 },
    ],
    -W / 2,
    W / 2,
    -F,
    F,
  );
  // Centred so the circle just clears the front wall's colliders and spans patio and lot.
  return { object: k.build(object), colliders, meet: { x: 0, z: F + 11.5, r: 11 } };
}

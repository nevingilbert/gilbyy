import * as THREE from "three";
import { Kit, lambert, pane, prism, ring, roof, tiledRoof, tone, type Circle } from "./garages";
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
 * Vegas's café (ADR 0023): a fifties diner, front facing +z. A long chrome box with round
 * ends, a band of windows right round it, a teal stripe over them and a red one under, a
 * vestibule at the door, and a sign on a pole whose neon comes up at night. Its paved lot in
 * front is free of colliders, for friends to meet on. Origin at ground level in the middle.
 */
export function buildDiner(windows: THREE.Material, glow: THREE.Material): ReturnType<typeof buildCoffeeShop> {
  const object = new THREE.Group();
  const k = new Kit();
  const DW = 15, DD = 7, DH = 4.2, DF = DD / 2, R = DD / 2;
  const chrome = lambert(PALETTE.vegas.chrome), flute = lambert(tone(PALETTE.vegas.chrome, 0.82)), teal = lambert(PALETTE.vegas.teal);
  const red = lambert(PALETTE.vegas.dinerRed), dark = lambert(PALETTE.doorDark);
  const straight = DW - 2 * R;
  // The body: a box between two half-round ends, chrome below the windows, fluted.
  k.box(chrome, straight, DH, DD, 0, DH / 2, 0);
  for (const s of [1, -1]) k.add(chrome, new THREE.CylinderGeometry(R, R, DH, 16, 1, false, s > 0 ? 0 : Math.PI, Math.PI).translate(0, DH / 2, 0), (s * straight) / 2, 0, 0);
  for (let y = 0.35; y < 1.6; y += 0.3) {
    for (const s of [1, -1]) k.box(flute, straight, 0.06, 0.04, 0, y, s * (DF + 0.02));
  }
  // The window band, the teal stripe over it and the red under, right round.
  const bandRound = (m: THREE.Material, h: number, y: number, out: number) => {
    for (const s of [1, -1]) k.box(m, straight, h, 0.06, 0, y, s * (DF + out));
    for (const s of [1, -1]) k.add(m, new THREE.CylinderGeometry(R + out, R + out, h, 16, 1, true, s > 0 ? 0 : Math.PI, Math.PI).translate(0, y, 0), (s * straight) / 2, 0, 0);
  };
  bandRound(windows, 1.3, 2.45, 0.03);
  bandRound(teal, 0.55, 3.45, 0.05);
  bandRound(red, 0.22, 1.7, 0.05);
  k.box(lambert(PALETTE.vegas.stucco[4]), straight + 0.4, 0.25, DD + 0.4, 0, DH + 0.12, 0);
  for (const s of [1, -1]) k.add(lambert(PALETTE.vegas.stucco[4]), new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.25, 16, 1, false, s > 0 ? 0 : Math.PI, Math.PI), (s * straight) / 2, DH + 0.12, 0);
  // The vestibule at the door, glass-fronted, a little roof over it.
  k.box(chrome, 3.2, 3.0, 1.6, 0, 1.5, DF + 0.8);
  pane(k.at(0, 1.3, DF + 1.62), windows, 1.4, 2.2, PALETTE.vegas.chrome);
  k.box(red, 3.8, 0.25, 2.2, 0, 3.1, DF + 0.9);
  k.box(dark, 3.2, 0.06, 2.4, 0, 0.03, DF + 2.2);
  // The sign: a tall pole, a red board with neon round it, and the star on top.
  const sign = k.at(-DW / 2 - 2.5, 0, DF + 3);
  sign.cyl(chrome, 0.18, 9, 0, 4.5, 0, 0, 0, 8);
  sign.box(red, 1.0, 3.2, 4.4, 0, 8.2, 0);
  sign.box(glow, 1.06, 0.18, 4.6, 0, 9.85, 0);
  sign.box(glow, 1.06, 0.18, 4.6, 0, 6.55, 0);
  for (const s of [1, -1]) sign.box(glow, 1.06, 3.3, 0.18, 0, 8.2, s * 2.3);
  for (let i = 0; i < 4; i++) sign.box(lambert(PALETTE.vegas.signGold), 0.2, 1.6, 0.2, 0, 11.1, 0, (i * Math.PI) / 4);
  // The lot out front, paved, its bays marked.
  const lot = lambert(PALETTE.city.asphalt);
  k.box(lot, 26, 0.12, 18, 0, 0.0, DF + 11);
  for (let x = -10.5; x <= 10.5; x += 3) k.box(lambert(PALETTE.runwayPaint), 0.12, 0.02, 4.5, x, 0.07, DF + 17);
  const colliders = ring([{ x: -DW / 2 - 2.5, z: DF + 3, r: 0.35 }], -DW / 2, DW / 2, -DF, DF + 1.6);
  return { object: k.build(object), colliders, meet: { x: 0, z: DF + 11, r: 9 } };
}

/**
 * A small roadside café, front facing +z. Origin at ground level in the middle of the building, which is 12 m by 9 m;
 * in front of it a flagged patio (to z ≈ 10) and then a gravel lot (to z = 25), both left free of colliders.
 */
export function buildCoffeeShop(windows: THREE.Material, glow: THREE.Material, lot = true): {
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

  // Gravel lot, with timber wheel stops facing the patio. On a city square there is none (ADR 0022).
  const lz0 = PATIO_END, lw = 24;
  if (lot) k.box(lambert(PALETTE.dirt[1]), lw, 0.3, LOT_END - lz0, 0, -0.13, (lz0 + LOT_END) / 2);
  if (lot) for (let x = -7.5; x <= 7.5; x += 3) k.box(wood, 1.6, 0.14, 0.22, x, 0.09, lz0 + 1.0);

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
  return { object: k.build(object), colliders, meet: lot ? { x: 0, z: F + 11.5, r: 11 } : { x: 0, z: F + 8, r: 8 } };
}

/**
 * Japan's café (ADR 0024): a teahouse by the lake, front facing +z. Dark cedar on a stone
 * footing under a deep roof of grey tiles, paper screens along the front that glow at night,
 * a curtain over the door and a veranda before it; out front two benches spread with red
 * cloth under red parasols, and a stone lantern by the path. Its gravel yard is free of
 * colliders, for friends to meet on. Origin at ground level in the middle.
 */
export function buildTeahouse(windows: THREE.Material, glow: THREE.Material): ReturnType<typeof buildCoffeeShop> {
  const object = new THREE.Group();
  const k = new Kit();
  const TW = 11, TD = 7.5, TF = TD / 2, TH = 3.55;
  const j = PALETTE.japan;
  const cedar = lambert(j.cedarWall), timber = lambert(j.timber), plaster = lambert(j.plaster), stone = lambert(j.stone);
  const red = lambert(j.vermilion), noren = lambert(j.noren), dark = lambert(PALETTE.doorDark);
  k.box(stone, TW + 0.8, 0.55, TD + 0.8, 0, 0.275, 0);
  k.box(cedar, TW, TH - 0.55, TD, 0, 0.55 + (TH - 0.55) / 2, 0);
  // Posts along the front, paper screens between them, the door in the middle with its curtain.
  const posts = [-TW / 2, -3.3, -1.1, 1.1, 3.3, TW / 2];
  for (const x of posts) k.box(timber, 0.26, TH - 0.55, 0.26, x, 0.55 + (TH - 0.55) / 2, TF + 0.02);
  for (let i = 0; i < posts.length - 1; i++) {
    const [a, b] = [posts[i], posts[i + 1]];
    const x = (a + b) / 2;
    if (Math.abs(x) < 0.5) {
      k.box(dark, b - a - 0.3, 2.3, 0.06, x, 0.55 + 1.15, TF + 0.02);
      k.box(noren, b - a - 0.2, 0.85, 0.05, x, 0.55 + 1.95, TF + 0.12);
      continue;
    }
    const w = b - a - 0.3;
    k.box(windows, w, 2.0, 0.06, x, 0.55 + 1.25, TF + 0.02);
    for (const y of [0.55 + 0.6, 0.55 + 1.25, 0.55 + 1.9]) k.box(timber, w, 0.05, 0.08, x, y, TF + 0.06);
    for (const dx of [-w / 4, 0, w / 4]) k.box(timber, 0.05, 2.0, 0.08, x + dx, 0.55 + 1.25, TF + 0.06);
  }
  // The veranda along the front.
  k.box(timber, TW + 1, 0.12, 1.4, 0, 0.6, TF + 0.7);
  for (const x of [-TW / 2, 0, TW / 2]) k.box(timber, 0.2, 0.55, 0.2, x, 0.27, TF + 1.3);
  // The roof: deep eaves, the ridge along the front, the gables plastered.
  const rk = k.at(0, 0, 0, Math.PI / 2);
  rk.add(plaster, prism([[TF, TH], [0, TH + 2.4], [-TF, TH]], TW), 0, 0, 0);
  tiledRoof(rk, TD, TW, TH, 2.4, 1.4);
  // Out front: benches spread with red cloth under red parasols.
  const shade = lambert(j.vermilion, THREE.DoubleSide);
  for (const s of [1, -1]) {
    const [bx, bz] = [s * 3.6, TF + 3.4];
    k.box(timber, 2.4, 0.08, 0.8, bx, 0.45, bz);
    for (const e of [1, -1]) k.box(timber, 0.1, 0.42, 0.7, bx + e * 1.0, 0.21, bz);
    k.box(red, 2.5, 0.04, 0.9, bx, 0.51, bz);
    k.cyl(dark, 0.04, 3.0, bx - s * 0.2, 1.5, bz - 0.7, 0, 0, 5);
    k.add(shade, new THREE.ConeGeometry(1.9, 0.6, 16, 1, true), bx - s * 0.2, 3.0, bz - 0.7);
  }
  // A stone lantern by the path, its light lit at night.
  const [lx, lz] = [-TW / 2 - 1.6, TF + 2.2];
  k.box(stone, 0.8, 0.3, 0.8, lx, 0.15, lz);
  k.cyl(stone, 0.16, 0.9, lx, 0.75, lz, 0, 0, 8);
  k.box(stone, 0.5, 0.45, 0.5, lx, 1.42, lz);
  k.box(glow, 0.3, 0.25, 0.52, lx, 1.42, lz);
  k.add(stone, new THREE.ConeGeometry(0.6, 0.38, 4).rotateY(Math.PI / 4), lx, 1.83, lz);
  // The gravel yard.
  k.box(lambert(j.town[0]), 22, 0.3, 16, 0, -0.13, TF + 9.4);
  const colliders = ring(
    [
      { x: lx, z: lz, r: 0.5 },
      ...[1, -1].map((s) => ({ x: s * 3.6, z: TF + 3.4, r: 1.2 })),
    ],
    -TW / 2,
    TW / 2,
    -TF,
    TF + 1.4,
  );
  return { object: k.build(object), colliders, meet: { x: 0, z: TF + 11, r: 8 } };
}

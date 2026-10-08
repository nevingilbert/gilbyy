import * as THREE from "three";
import { Kit, lambert, pane, prism, ring, roof, tone, type Circle } from "./garages";
import type { LandmarkKind } from "./landmarks";
import { PALETTE } from "./palette";

/**
 * The bank, the church, the schoolhouse and the casino (ADR 0012). Each has its origin at
 * ground level in the middle of the building and its front door facing +z.
 */
export type LandmarkModel = {
  object: THREE.Group;
  colliders: Circle[];
  /** Local z where the truck stops in front of the door, clear of every collider. */
  stopZ: number;
};

/** A string of warm bulbs from a to b, [x, y, z] each. */
function bulbs(k: Kit, glow: THREE.Material, a: readonly number[], b: readonly number[], n: number) {
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    k.add(glow, new THREE.IcosahedronGeometry(0.09, 0), a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }
}

/** A stone bank with a columned portico and a brass coin in the pediment. */
function buildBank(windows: THREE.Material): LandmarkModel {
  const [W, D, H, BASE] = [14, 10, 5.2, 0.5];
  const F = D / 2;
  /** The portico: this wide, this deep, its columns this tall. */
  const [PW, PD, COL] = [9.6, 3.4, 4.4];
  const k = new Kit();
  const stone = lambert(PALETTE.bankStone), shade = lambert(tone(PALETTE.bankStone, 0.82)), copper = lambert(PALETTE.bankCopper);
  const brass = lambert(PALETTE.brass), dark = lambert(PALETTE.doorDark);

  k.box(shade, W + 1.2, BASE, D + 1.2, 0, BASE / 2, 0);
  k.box(stone, W, H, D, 0, BASE + H / 2, 0);
  k.box(shade, W + 0.5, 0.35, D + 0.5, 0, BASE + H + 0.17, 0);
  k.box(stone, W, 0.5, D, 0, BASE + H + 0.6, 0);
  k.box(copper, W - 0.8, 0.3, D - 0.8, 0, BASE + H + 0.95, 0);

  // The portico: a floor, three steps down, four columns, and a pediment over them.
  k.box(shade, PW, BASE, PD, 0, BASE / 2, F + PD / 2);
  for (let i = 0; i < 3; i++) k.box(shade, PW, BASE - (i + 1) * 0.125, 0.45, 0, (BASE - (i + 1) * 0.125) / 2, F + PD + 0.22 + i * 0.45);
  for (const x of [-4.0, -1.5, 1.5, 4.0]) {
    k.cyl(stone, 0.36, COL, x, BASE + COL / 2, F + PD - 0.6, 0, 0, 10);
    for (const y of [BASE + 0.1, BASE + COL - 0.1]) k.box(shade, 0.95, 0.2, 0.95, x, y, F + PD - 0.6);
  }
  const top = BASE + COL;
  k.box(stone, PW, 0.6, PD, 0, top + 0.3, F + PD / 2);
  k.add(stone, prism([[-PW / 2 - 0.2, top + 0.6], [PW / 2 + 0.2, top + 0.6], [0, top + 2.4]], PD), 0, 0, F + PD / 2);
  roof(k.at(0, 0, F + PD / 2), copper, [[PW / 2 + 0.2, top + 0.6], [0, top + 2.4], [-PW / 2 - 0.2, top + 0.6]], PD + 0.3, 0.14, 0.3);
  k.cyl(brass, 0.6, 0.12, 0, top + 1.25, F + PD + 0.02, Math.PI / 2, 0, 16);
  k.cyl(lambert(tone(PALETTE.brass, 0.75)), 0.4, 0.12, 0, top + 1.25, F + PD + 0.05, Math.PI / 2, 0, 16);

  // A tall dark door with brass pulls; tall windows either side and down each flank.
  k.box(shade, 2.5, 3.5, 0.1, 0, BASE + 1.75, F + 0.03);
  k.box(dark, 2.1, 3.2, 0.1, 0, BASE + 1.6, F + 0.08);
  for (const s of [1, -1]) k.box(brass, 0.07, 0.7, 0.07, s * 0.16, BASE + 1.5, F + 0.16);
  for (const s of [1, -1]) pane(k.at(s * 5.4, BASE + 2.5, F), windows, 1.2, 2.6, tone(PALETTE.bankStone, 0.82));
  for (const s of [1, -1]) for (const z of [-3, 0, 3]) pane(k.at(s * (W / 2 + 0.01), BASE + 2.5, z, (s * Math.PI) / 2), windows, 1.2, 2.6, tone(PALETTE.bankStone, 0.82));

  const colliders = ring(ring([], -W / 2 - 0.6, W / 2 + 0.6, -F - 0.6, F + 0.6), -PW / 2, PW / 2, F + 0.6, F + PD + 1.4);
  return { object: k.build(new THREE.Group()), colliders, stopZ: F + PD + 8 };
}

/** A white clapboard church: a steep roof, a square tower with a spire, a few old headstones beside it. */
function buildChurch(windows: THREE.Material, glow: THREE.Material): LandmarkModel {
  const [W, D, H, RISE] = [8, 14, 4.6, 4.2];
  const F = D / 2;
  /** The tower: this square, this tall, standing proud of the front wall. */
  const [T, TH] = [3.2, 9.5];
  const front = F + T - 0.2;
  const tz = front - T / 2;
  const k = new Kit();
  const wall = lambert(PALETTE.churchWall), trim = lambert(tone(PALETTE.churchWall, 0.82)), slate = lambert(PALETTE.roofSlate);
  const dark = lambert(PALETTE.doorDark), door = lambert(PALETTE.churchDoor), brass = lambert(PALETTE.brass);

  k.box(lambert(PALETTE.concreteDark), W + 0.2, 0.4, D + 0.2, 0, 0.2, 0);
  k.box(wall, W, H, D, 0, H / 2, 0);
  const prof = [[W / 2, H], [0, H + RISE], [-W / 2, H]];
  k.add(wall, prism(prof, D), 0, 0, 0);
  roof(k, slate, prof, D + 0.8, 0.18, 0.5);
  for (const s of [1, -1])
    for (const z of [-4.8, -1.6, 1.6, 4.8]) pane(k.at(s * (W / 2 + 0.01), 2.5, z, (s * Math.PI) / 2), windows, 0.8, 2.4, tone(PALETTE.churchWall, 0.82));

  // The tower, its louvred belfry, the spire and a brass cross.
  k.box(wall, T, TH, T, 0, TH / 2, tz);
  k.box(trim, T + 0.4, 0.25, T + 0.4, 0, TH, tz);
  for (let i = 0; i < 4; i++) k.at(0, 0, tz, (i * Math.PI) / 2).box(dark, 1.2, 1.7, 0.08, 0, TH - 1.6, T / 2 + 0.01);
  k.add(slate, new THREE.ConeGeometry((T + 0.5) / Math.SQRT2, 5, 4), 0, TH + 2.6, tz, 0, Math.PI / 4);
  k.box(brass, 0.12, 1.3, 0.12, 0, TH + 5.6, tz);
  k.box(brass, 0.7, 0.12, 0.12, 0, TH + 5.85, tz);

  // A red door with a pointed head, two steps, a round window over it and a lantern beside it.
  k.box(lambert(PALETTE.concreteDark), 2.4, 0.3, 1.0, 0, 0.15, front + 0.5);
  k.box(lambert(PALETTE.concreteDark), 2.4, 0.15, 0.5, 0, 0.07, front + 1.25);
  k.box(door, 1.5, 2.5, 0.1, 0, 0.3 + 1.25, front + 0.03);
  k.add(door, prism([[-0.75, 2.8], [0.75, 2.8], [0, 3.6]], 0.1), 0, 0, front + 0.03);
  k.box(brass, 0.07, 0.3, 0.07, 0.5, 1.5, front + 0.1);
  k.cyl(trim, 0.78, 0.1, 0, 5.6, front + 0.02, Math.PI / 2, 0, 14);
  k.cyl(windows, 0.6, 0.1, 0, 5.6, front + 0.05, Math.PI / 2, 0, 14);
  k.box(dark, 0.06, 0.06, 0.4, 1.25, 2.7, front + 0.2);
  k.add(glow, new THREE.IcosahedronGeometry(0.14, 0), 1.25, 2.5, front + 0.38);

  // The churchyard, on the left as you face the door: headstones, none of them quite upright.
  const stones = [lambert(PALETTE.graveStone), lambert(tone(PALETTE.graveStone, 0.85))];
  const graves = [[-7.2, 4.6, 0.06], [-9.0, 4.2, -0.09], [-10.9, 4.9, 0.04], [-7.6, 1.2, -0.05], [-9.6, 0.8, 0.1], [-8.3, -2.4, 0.03], [-10.6, -2.0, -0.12]];
  graves.forEach(([x, z, lean], i) => {
    k.box(stones[i % 2], 0.6, 0.85, 0.16, x, 0.4, z, 0, 0, lean);
    if (i % 3 !== 1) k.cyl(stones[i % 2], 0.3, 0.16, x + Math.sin(lean) * -0.42, 0.82, z, Math.PI / 2, 0, 8);
  });

  const colliders = ring(ring([], -W / 2, W / 2, -F, F), -T / 2, T / 2, F, front + 0.4);
  for (const [x, z] of graves) colliders.push({ x, z, r: 0.35 });
  return { object: k.build(new THREE.Group()), colliders, stopZ: front + 8 };
}

/** A one-room brick schoolhouse with a bell on the roof, a flagpole and a chalkboard out front. */
function buildSchool(windows: THREE.Material): LandmarkModel {
  const [W, D, H, RISE] = [12, 8, 4.0, 2.4];
  const F = D / 2;
  const k = new Kit();
  const brick = lambert(PALETTE.schoolBrick), trim = lambert(PALETTE.trimCream), slate = lambert(PALETTE.roofSlate);
  const brass = lambert(PALETTE.brass), board = lambert(PALETTE.chalkboard), wood = lambert(PALETTE.timber);

  k.box(lambert(PALETTE.concrete), W + 0.15, 0.4, D + 0.15, 0, 0.2, 0);
  k.box(brick, W, H, D, 0, H / 2, 0);
  for (const z of [F + 0.03, -F - 0.03]) k.box(trim, W + 0.1, 0.22, 0.1, 0, H - 0.11, z);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, 0.24, H, 0.24, sx * (W / 2 - 0.05), H / 2, sz * (F - 0.05));
  // Gable roof, ridge along x.
  const prof = [[F, H], [0, H + RISE], [-F, H]];
  const rk = k.at(0, 0, 0, Math.PI / 2);
  rk.add(brick, prism(prof, W), 0, 0, 0);
  roof(rk, slate, prof, W + 0.8, 0.18, 0.5);
  for (const s of [1, -1]) roof(k.at(s * (W / 2 + 0.42), 0, 0, Math.PI / 2), trim, prof, 0.12, 0.22, 0.52);

  // The bell, in an open cupola astride the ridge.
  const cy = H + RISE - 0.35;
  k.box(trim, 1.6, 0.7, 1.6, 0, cy + 0.35, 0);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, 0.14, 1.2, 0.14, sx * 0.68, cy + 1.3, sz * 0.68);
  k.add(slate, new THREE.ConeGeometry(1.35, 1.0, 4), 0, cy + 2.4, 0, 0, Math.PI / 4);
  k.add(brass, new THREE.ConeGeometry(0.34, 0.5, 8), 0, cy + 1.25, 0);
  k.box(brass, 0.06, 0.4, 0.06, 0, cy + 1.7, 0);

  // Door in the middle with a light over it, two steps, and two tall windows either side.
  k.box(trim, 1.7, 3.1, 0.08, 0, 1.75, F + 0.04);
  k.box(board, 1.3, 2.3, 0.08, 0, 1.35, F + 0.08);
  pane(k.at(0, 2.85, F + 0.03), windows, 1.3, 0.45);
  k.box(brass, 0.06, 0.06, 0.12, 0.45, 1.3, F + 0.16);
  k.box(lambert(PALETTE.concrete), 2.4, 0.2, 1.2, 0, 0.1, F + 0.6);
  for (const z of [F, -F]) for (const x of [-4.6, -2.6, 2.6, 4.6]) pane(k.at(x, 2.2, z, z > 0 ? 0 : Math.PI), windows, 1.2, 1.9);
  for (const s of [1, -1]) pane(k.at(s * (W / 2 + 0.01), 2.2, 0, (s * Math.PI) / 2), windows, 1.6, 1.9);

  // A flagpole with a plain pennant, and the day's sums chalked up on a board.
  const [fx, fz] = [7.6, F + 4.5];
  k.cyl(lambert(PALETTE.chrome), 0.06, 7, fx, 3.5, fz, 0, 0, 6);
  k.add(lambert(PALETTE.barnRed, THREE.DoubleSide), prism([[0, 0.35], [1.3, 0], [0, -0.35]], 0.03), fx + 0.06, 6.5, fz);
  const [bx, bz] = [-6.6, F + 4.5];
  for (const s of [1, -1]) k.box(wood, 0.14, 2.3, 0.14, bx + s * 1.3, 1.15, bz);
  const sign = k.at(bx, 1.55, bz);
  sign.box(trim, 2.6, 1.5, 0.08, 0, 0, 0);
  sign.box(board, 2.4, 1.3, 0.1, 0, 0, 0.01);
  const chalk = lambert(PALETTE.trimCream);
  for (const r of [1, -1]) sign.box(chalk, 0.55, 0.09, 0.04, -0.75, 0, 0.07, 0, 0, (r * Math.PI) / 4);
  for (const r of [0, 1]) sign.box(chalk, 0.5, 0.09, 0.04, 0, 0, 0.07, 0, 0, (r * Math.PI) / 2);
  for (const y of [0.12, -0.12]) sign.box(chalk, 0.45, 0.09, 0.04, 0.75, y, 0.07);

  const colliders = ring([], -W / 2, W / 2, -F, F + 0.4);
  colliders.push({ x: fx, z: fz, r: 0.3 }, { x: bx - 1.3, z: bz, r: 0.3 }, { x: bx + 1.3, z: bz, r: 0.3 }, { x: bx, z: bz, r: 0.3 });
  return { object: k.build(new THREE.Group()), colliders, stopZ: F + 9 };
}

/** A plum-coloured casino: a marquee strung with bulbs, a red carpet, and a die left on the roof. */
function buildCasino(windows: THREE.Material, glow: THREE.Material): LandmarkModel {
  const [W, D, H] = [16, 11, 6.2];
  const F = D / 2;
  /** The marquee: this wide, this far out from the wall, its underside this high. */
  const [MW, MD, MY] = [10, 3.2, 3.3];
  const k = new Kit();
  const wall = lambert(PALETTE.casinoWall), deep = lambert(tone(PALETTE.casinoWall, 0.7)), gold = lambert(PALETTE.brass);
  const dark = lambert(PALETTE.doorDark), red = lambert(PALETTE.casinoCarpet), cream = lambert(PALETTE.dieWhite);

  k.box(deep, W + 0.15, 0.5, D + 0.15, 0, 0.25, 0);
  k.box(wall, W, H, D, 0, H / 2, 0);
  k.box(gold, W + 0.3, 0.22, D + 0.3, 0, H - 0.75, 0);
  k.box(deep, W - 0.7, 0.1, D - 0.7, 0, H + 0.05, 0);
  for (const s of [1, -1]) for (const z of [-2.5, 2.0]) pane(k.at(s * (W / 2 + 0.01), 2.4, z, (s * Math.PI) / 2), windows, 0.9, 2.6, PALETTE.brass);

  // The marquee on two brass posts, bulbs all round its edge.
  k.box(deep, MW, 0.5, MD, 0, MY + 0.25, F + MD / 2);
  k.box(gold, MW + 0.1, 0.12, MD + 0.1, 0, MY + 0.56, F + MD / 2);
  for (const s of [1, -1]) k.cyl(gold, 0.12, MY, s * (MW / 2 - 0.4), MY / 2, F + MD - 0.35, 0, 0, 8);
  bulbs(k, glow, [-MW / 2 + 0.2, MY - 0.06, F + MD + 0.02], [MW / 2 - 0.2, MY - 0.06, F + MD + 0.02], 16);
  for (const s of [1, -1]) bulbs(k, glow, [s * (MW / 2 + 0.02), MY - 0.06, F + 0.4], [s * (MW / 2 + 0.02), MY - 0.06, F + MD - 0.3], 4);

  // Over it, the sign: a diamond between two chips, ringed with more bulbs.
  const sign = k.at(0, MY + 1.75, F + 0.12);
  sign.box(gold, 6.4, 1.8, 0.1, 0, 0, 0);
  sign.box(dark, 6.1, 1.5, 0.14, 0, 0, 0);
  sign.box(red, 0.8, 0.8, 0.08, 0, 0, 0.1, 0, 0, Math.PI / 4);
  for (const s of [1, -1]) {
    sign.cyl(cream, 0.5, 0.08, s * 1.9, 0, 0.1, Math.PI / 2, 0, 14);
    sign.cyl(red, 0.36, 0.08, s * 1.9, 0, 0.12, Math.PI / 2, 0, 14);
    sign.cyl(cream, 0.2, 0.08, s * 1.9, 0, 0.14, Math.PI / 2, 0, 14);
  }
  for (const y of [0.83, -0.83]) bulbs(sign, glow, [-3.0, y, 0.12], [3.0, y, 0.12], 12);

  // Glass doors, a red carpet out to the edge of the marquee and beyond, brass posts along it.
  k.box(gold, 2.7, 2.9, 0.1, 0, 1.45, F + 0.03);
  for (const s of [1, -1]) pane(k.at(s * 0.63, 1.4, F + 0.03), windows, 1.1, 2.5, PALETTE.brass);
  k.box(red, 2.6, 0.05, MD + 3, 0, 0.03, F + (MD + 3) / 2);
  for (const s of [1, -1])
    for (const z of [F + MD + 0.6, F + MD + 2.6]) {
      k.cyl(gold, 0.05, 0.9, s * 1.6, 0.45, z, 0, 0, 6);
      k.add(gold, new THREE.IcosahedronGeometry(0.09, 0), s * 1.6, 0.95, z);
    }

  // The die on the roof, showing five, three and one.
  const S = 1.9;
  const die = k.at(4.6, H + 0.1, -1.2, 0.5);
  die.box(cream, S, S, S, 0, S / 2, 0);
  const pip = (x: number, y: number, z: number, rx: number, rz: number) => die.cyl(dark, 0.17, 0.04, x, y, z, rx, rz, 10);
  for (const [x, z] of [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) pip(x, S + 0.01, z, 0, 0);
  for (const d of [-0.5, 0, 0.5]) pip(d, S / 2 + d, S / 2 + 0.01, Math.PI / 2, 0);
  pip(S / 2 + 0.01, S / 2, 0, 0, Math.PI / 2);

  const colliders = ring([], -W / 2, W / 2, -F, F);
  for (const s of [1, -1]) colliders.push({ x: s * (MW / 2 - 0.4), z: F + MD - 0.35, r: 0.3 });
  return { object: k.build(new THREE.Group()), colliders, stopZ: F + MD + 8 };
}

export function buildLandmark(kind: LandmarkKind, windows: THREE.Material, glow: THREE.Material): LandmarkModel {
  return kind === "bank" ? buildBank(windows) : kind === "church" ? buildChurch(windows, glow) : kind === "school" ? buildSchool(windows) : buildCasino(windows, glow);
}

import * as THREE from "three";
import { drawnHeight } from "./city-buildings";
import type { CityLandmark } from "./city";
import { VSCALE } from "./city";
import { Kit, lambert, pane, prism, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";

/**
 * San Francisco's landmarks, low-poly (ADR 0022). Each is built about its own origin on
 * the ground, its front to +z, at the city's scale: big things shrunk across as the city
 * is, 1:2.5, and their heights as tall buildings' are (`drawnHeight`), so the skyline
 * stands to Twin Peaks as the real one does. Small things, like the Painted Ladies, are
 * full size. The windmills' sails turn.
 */

const C = PALETTE.city;
/** Real metres up, drawn. */
const up = (real: number) => drawnHeight(real, VSCALE);

type Built = { object: THREE.Group; colliders: Circle[]; update?: (time: number) => void };
type Build = (k: Kit, root: THREE.Group, windows: THREE.Material, lamps: THREE.Material) => Omit<Built, "object">;

/** A plinth under a building, down into the ground, so a slope never shows daylight beneath it. */
const plinth = (k: Kit, m: THREE.Material, w: number, d: number) => k.box(m, w, 6, d, 0, -2.8, 0);

/** A tapering shaft of n sides, from radius r0 at y0 to r1 at y1. */
const shaft = (k: Kit, m: THREE.Material, r0: number, r1: number, y0: number, y1: number, n: number, ry = 0) =>
  k.add(m, new THREE.CylinderGeometry(r1, r0, y1 - y0, n), 0, (y0 + y1) / 2, 0, 0, ry);

/** Bands round a box's walls every `every` metres, for floors of windows. */
function bands(k: Kit, m: THREE.Material, w: number, d: number, y0: number, y1: number, every: number, inset = 0.05) {
  for (let y = y0 + every; y < y1; y += every) k.box(m, w + inset * 2, every * 0.35, d + inset * 2, 0, y, 0);
}

const coitTower: Build = (k) => {
  const stone = lambert(C.stone);
  const H = up(64);
  // On a base as wide as the turning circle at the top of Telegraph Hill leaves room for (city.ts).
  plinth(k, stone, 10, 10);
  k.box(lambert(tone(C.stone, 0.9)), 10, 4, 10, 0, 2, 0);
  // The fluted column, and the crown of arched windows round its top.
  shaft(k, stone, 3.2, 3.0, 4, H - 4, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.box(lambert(tone(C.stone, 0.84)), 0.4, H - 9, 0.5, Math.sin(a) * 3.05, (H - 5) / 2 + 2, Math.cos(a) * 3.05, 0, a);
  }
  shaft(k, lambert(tone(C.stone, 0.95)), 3.4, 3.4, H - 4, H, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    k.box(lambert(PALETTE.void), 1.0, 2.0, 0.3, Math.sin(a) * 3.35, H - 2, Math.cos(a) * 3.35, 0, a);
  }
  shaft(k, stone, 3.0, 2.6, H, H + 0.8, 16);
  return { colliders: [] };
};

const transamerica: Build = (k, _root, windows) => {
  const quartz = lambert(C.quartz);
  const H = up(260);
  const B = 21;
  plinth(k, quartz, B + 4, B + 4);
  // The pyramid: four sides tapering to a point, its spire making the last third.
  k.add(quartz, new THREE.ConeGeometry(B * 0.72, H * 0.78, 4, 1, false, Math.PI / 4), 0, H * 0.39, 0);
  k.add(quartz, new THREE.ConeGeometry(B * 0.16, H * 0.3, 4, 1, false, Math.PI / 4), 0, H * 0.83, 0);
  // Its wings, the lift shafts and stairs that stand out of two sides from a third of the way up.
  for (const s of [1, -1]) k.add(quartz, prism([[0, 0], [2.6, 0], [0.6, H * 0.62]], 4.5), s * (B * 0.28), H * 0.28, 0, 0, s > 0 ? 0 : Math.PI);
  // Rows of windows: dark bands, narrowing as it rises.
  for (let y = 6; y < H * 0.7; y += 4.5) {
    const r = B * 0.72 * (1 - y / (H * 0.78)) * 0.71 + 0.12;
    k.box(lambert(C.glass), r * 2, 0.9, r * 2, 0, y, 0);
  }
  k.box(windows, 1.2, 1.2, 1.2, 0, H * 0.97, 0);
  return { colliders: [] };
};

const salesforce: Build = (k, _root, windows) => {
  const glass = lambert(C.paleGlass);
  const fin = lambert(C.trim[0]);
  const H = up(326);
  const B = 20;
  plinth(k, glass, B + 2, B + 2);
  // Rounded corners, tapering as it rises, and the open crown of its top.
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const y0 = (H * 0.9 * i) / steps;
    const y1 = (H * 0.9 * (i + 1)) / steps;
    const w = B * (1 - 0.18 * (i / steps));
    k.add(glass, new THREE.CylinderGeometry(w * 0.6, w * 0.6, y1 - y0, 8).scale(1, 1, 1), 0, (y0 + y1) / 2, 0, 0, Math.PI / 8);
    k.add(fin, new THREE.CylinderGeometry(w * 0.605, w * 0.605, 0.5, 8), 0, y1, 0, 0, Math.PI / 8);
  }
  const top = B * 0.82;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.box(fin, 0.5, H * 0.1, 0.5, Math.sin(a) * top * 0.48, H * 0.95, Math.cos(a) * top * 0.48);
  }
  k.box(windows, top * 0.6, 0.5, top * 0.6, 0, H * 0.99, 0);
  return { colliders: [] };
};

const bankOfAmerica: Build = (k) => {
  const granite = lambert(C.granite);
  const H = up(237);
  const B = 22;
  plinth(k, granite, B + 2, B + 2);
  // A dark tower of sawtooth bay windows, stepping back near the top.
  k.box(granite, B, H * 0.86, B, 0, H * 0.43, 0);
  k.box(granite, B * 0.8, H * 0.1, B * 0.8, 0, H * 0.91, 0);
  k.box(granite, B * 0.55, H * 0.04, B * 0.55, 0, H * 0.98, 0);
  for (let x = -B / 2 + 1; x < B / 2; x += 2) for (const s of [1, -1]) {
    k.box(lambert(tone(C.granite, 1.25)), 0.3, H * 0.86, 0.6, x, H * 0.43, s * (B / 2 + 0.2), 0, Math.PI / 4);
    k.box(lambert(tone(C.granite, 1.25)), 0.6, H * 0.86, 0.3, s * (B / 2 + 0.2), H * 0.43, x, 0, Math.PI / 4);
  }
  return { colliders: [] };
};

const ferryBuilding: Build = (k, _root, windows, lamps) => {
  const stone = lambert(C.adobe), roof = lambert(tone(PALETTE.roofSlate, 1.1)), trim = lambert(C.trim[1]);
  const L = 78, D = 12, H = 14;
  plinth(k, stone, D + 2, L + 2);
  k.box(stone, D, H, L, 0, H / 2, 0);
  // Arcades down the front, a hipped roof, and the clock tower in the middle.
  for (let z = -L / 2 + 3; z < L / 2 - 2; z += 4) {
    k.box(lambert(PALETTE.void), 0.3, 4.5, 2.6, D / 2 + 0.02, 3, z);
    pane(k.at(D / 2 + 0.04, 9, z, Math.PI / 2), windows, 2.2, 2.2, C.trim[1]);
  }
  k.add(roof, prism([[D / 2 + 0.6, 0], [0, 4], [-D / 2 - 0.6, 0]], L + 1), 0, H, 0);
  const T = up(75);
  const tw = k.at(0, 0, 0);
  tw.box(stone, 7.5, T * 0.72, 7.5, 0, T * 0.36, 0);
  tw.box(trim, 8.2, 1.2, 8.2, 0, T * 0.72, 0);
  tw.box(stone, 6.2, T * 0.14, 6.2, 0, T * 0.79, 0);
  // Clock faces, lit at night, on all four sides.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    tw.add(lamps, new THREE.CylinderGeometry(1.8, 1.8, 0.2, 16), Math.sin(a) * 3.8, T * 0.6, Math.cos(a) * 3.8, Math.PI / 2, a, 0);
  }
  tw.box(stone, 4.6, T * 0.08, 4.6, 0, T * 0.9, 0);
  shaft(tw, lambert(C.domeLead), 2.6, 0.3, T * 0.94, T + 4, 8);
  return { colliders: [] };
};

const cityHall: Build = (k, _root, windows) => {
  const stone = lambert(C.stone), lead = lambert(C.domeLead), gilt = lambert(C.gilt);
  const W = 48, D = 32, H = up(24);
  plinth(k, stone, W + 2, D + 2);
  k.box(stone, W, H, D, 0, H / 2, 0);
  bands(k, lambert(tone(C.stone, 0.88)), W, D, 0, H, 4.2, 0.08);
  // The colonnade along the front, and the dome over the middle: drum, dome, lantern.
  for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 3) k.cyl(lambert(C.trim[0]), 0.55, H - 4, x, H / 2 + 1, D / 2 + 1.2, 0, 0, 10);
  k.box(stone, W - 2, 1.2, 3, 0, H - 0.6, D / 2 + 1.2);
  // A tall drum ringed with columns, the dome, and a small lantern with its own gilt cap,
  // the spike on it reaching the real height, scaled.
  const top = up(94);
  const dome = H + 12;
  k.cyl(stone, 10, 12, 0, H + 6, 0, 0, 0, 20);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    k.cyl(lambert(C.trim[0]), 0.45, 11, Math.sin(a) * 10.3, H + 6, Math.cos(a) * 10.3, 0, 0, 8);
  }
  k.add(lead, new THREE.SphereGeometry(10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.6, 1), 0, dome, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.add(gilt, new THREE.TorusGeometry(10.05, 0.18, 4, 18, Math.PI / 2).scale(1, 1.6, 1), 0, dome, 0, 0, a, 0);
  }
  const lantern = dome + 16;
  k.cyl(stone, 2.4, 5, 0, lantern + 2.5, 0, 0, 0, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.cyl(lambert(C.trim[0]), 0.22, 4.6, Math.sin(a) * 2.5, lantern + 2.5, Math.cos(a) * 2.5, 0, 0, 6);
  }
  k.add(gilt, new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.2, 1), 0, lantern + 5, 0);
  const spike = Math.max(2, top - (lantern + 8));
  k.cyl(gilt, 0.25, spike, 0, lantern + 8 + spike / 2, 0, 0, 0, 6);
  k.add(gilt, new THREE.SphereGeometry(0.6, 8, 6), 0, top, 0);
  pane(k.at(0, H * 0.5, D / 2 + 0.05), windows, 3, 4, C.trim[0]);
  return { colliders: [] };
};

const graceCathedral: Build = (k, _root, windows) => {
  const stone = lambert(tone(C.stone, 0.95));
  const W = 16, L = 34, H = up(38);
  plinth(k, stone, W + 2, L + 2);
  k.box(stone, W, H * 0.62, L, 0, H * 0.31, 0);
  k.add(lambert(PALETTE.roofSlate), prism([[W / 2 + 0.4, 0], [0, H * 0.32], [-W / 2 - 0.4, 0]], L), 0, H * 0.62, 0);
  // Twin towers over the west front, and the rose window between them.
  for (const s of [1, -1]) {
    k.box(stone, 5.5, up(52), 5.5, s * 5.5, up(52) / 2, L / 2 - 2.5);
    k.add(lambert(tone(C.stone, 0.85)), new THREE.ConeGeometry(3.4, 4, 4, 1, false, Math.PI / 4), s * 5.5, up(52) + 2, L / 2 - 2.5);
  }
  k.add(windows, new THREE.CylinderGeometry(2.6, 2.6, 0.3, 16), 0, H * 0.45, L / 2 + 0.1, Math.PI / 2);
  return { colliders: [] };
};

const palaceOfFineArts: Build = (k) => {
  const ochre = lambert(C.ochre), terracotta = lambert(C.terracotta), pale = lambert(C.adobe);
  const R = 9, H = up(50);
  plinth(k, pale, 26, 26);
  // The rotunda: eight great columns round a drum, the dome over it.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.cyl(pale, 1.1, H * 0.55, Math.sin(a) * R, H * 0.275, Math.cos(a) * R, 0, 0, 10);
    k.box(ochre, 3, 3, 3, Math.sin(a) * R, H * 0.58, Math.cos(a) * R);
  }
  k.cyl(ochre, R + 1.5, H * 0.14, 0, H * 0.66, 0, 0, 0, 16);
  k.add(terracotta, new THREE.SphereGeometry(R + 1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), 0, H * 0.73, 0);
  // The colonnades curving away either side.
  for (const s of [1, -1]) {
    for (let i = 1; i <= 7; i++) {
      const a = s * (0.5 + i * 0.22);
      const x = Math.sin(a) * 30;
      const z = Math.cos(a) * 30 - 30;
      k.cyl(pale, 0.7, 9, x, 4.5, z, 0, 0, 8);
      k.box(ochre, 3.2, 1.3, 2, x, 9.6, z, 0, a);
    }
  }
  return { colliders: [] };
};

const sutroTower: Build = (k, _root, _windows, lamps) => {
  const red = lambert(C.mastRed), white = lambert(C.mastWhite);
  const H = up(298);
  const spread = 13;
  // Three legs splayed at the foot, meeting at the deck a third of the way up, then three masts above.
  const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 6);
  const waist = H * 0.36;
  for (const a of legs) {
    const foot = [Math.sin(a) * spread, 0, Math.cos(a) * spread];
    const knee = [Math.sin(a) * 4.5, waist, Math.cos(a) * 4.5];
    for (let j = 0; j < 6; j++) {
      const t0 = j / 6, t1 = (j + 1) / 6;
      const pa = foot.map((v, n) => v + (knee[n] - v) * t0);
      const pb = foot.map((v, n) => v + (knee[n] - v) * t1);
      k.strut(j % 2 ? red : white, pa, pb, 1.5);
    }
    for (let j = 0; j < 8; j++) {
      const y0 = waist + ((H - waist) * j) / 8, y1 = waist + ((H - waist) * (j + 1)) / 8;
      k.strut(j % 2 ? red : white, [Math.sin(a) * 4.5, y0, Math.cos(a) * 4.5], [Math.sin(a) * 4.5, y1, Math.cos(a) * 4.5], 1.1);
    }
    k.add(lamps, new THREE.SphereGeometry(0.7, 6, 4), Math.sin(a) * 4.5, H + 0.5, Math.cos(a) * 4.5);
  }
  // The cross-arms at the waist and higher up.
  for (const y of [waist, waist + (H - waist) * 0.55]) k.add(red, new THREE.CylinderGeometry(9, 9, 1.2, 3), 0, y, 0, 0, Math.PI / 6);
  return { colliders: legs.map((a) => ({ x: Math.sin(a) * spread, z: Math.cos(a) * spread, r: 1.4 })) };
};

const paintedLadies: Build = (k, _root, windows) => {
  // Queen Anne Victorians in a row along Steiner Street, their fronts to the park, each its
  // own colour, steep gables against the downtown skyline behind. There are seven; the
  // block, smaller than life as all the city's are, has room for four, full size (city.ts).
  const colours = C.ladies;
  const W = 6.3;
  const N = 4;
  for (let i = 0; i < N; i++) {
    const z = (i - (N - 1) / 2) * W;
    const body = lambert(colours[i]), trim = lambert(PALETTE.city.trim[i % 2]), accent = lambert(tone(colours[i], 0.7));
    const h = k.at(0, 0, z);
    h.box(body, 10, 9.5, W - 0.2, 0, 4.75, 0);
    h.box(body, 10, 6, W - 0.2, 0, -2.5, 0);
    h.add(lambert(PALETTE.roofSlate), prism([[W / 2, 0], [0, 4.2], [-W / 2, 0]], 10.4), 0, 9.5, 0, 0, Math.PI / 2);
    // The gable to the street, with its trim, a bay window under it, the stoop up to the door.
    h.add(body, prism([[W / 2 - 0.1, 0], [0, 4], [-W / 2 + 0.1, 0]], 0.3), 5.1, 9.5, 0, 0, Math.PI / 2);
    h.add(trim, prism([[W / 2, -0.15], [0, 4.2], [-W / 2, -0.15], [-W / 2 + 0.4, -0.15], [0, 3.7], [W / 2 - 0.4, -0.15]], 0.25), 5.3, 9.5, 0, 0, Math.PI / 2);
    h.box(body, 1.2, 7, 3.2, 5.5, 5, -0.8);
    for (const y of [3.2, 6.6]) pane(h.at(6.15, y, -0.8, Math.PI / 2), windows, 1.8, 1.8, PALETTE.city.trim[0]);
    pane(h.at(5.05, 6.6, 1.9, Math.PI / 2), windows, 0.9, 1.9, PALETTE.city.trim[0]);
    h.box(accent, 0.2, 2.4, 1.1, 5.06, 2.9, 1.9);
    for (let st = 0; st < 5; st++) h.box(lambert(PALETTE.city.trim[1]), 1.6 - st * 0.3, 0.3, 1.5, 5.8 + 0.8 - st * 0.15, 0.15 + st * 0.3, 1.9);
    h.box(trim, 1.6, 0.4, W, 5.2, 9.4, 0);
    // A turret on every other one.
    if (i % 3 === 1) {
      h.cyl(body, 1.4, 5, 4.8, 9.4, -W / 2 + 1.4, 0, 0, 8);
      h.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(1.7, 3.6, 8), 4.8, 13.7, -W / 2 + 1.4);
    }
  }
  return { colliders: [] };
};

const alcatraz: Build = (k, _root, windows, lamps) => {
  const concrete = lambert(tone(C.stone, 0.92)), dark = lambert(PALETTE.concreteDark);
  // The cellhouse along the top of the island, the lighthouse beside it, the water tower on its legs.
  k.box(concrete, 34, 10, 11, 0, 3, 0);
  bands(k, dark, 34, 11, -2, 8, 2.2, 0.06);
  k.add(lambert(PALETTE.roofSlate), prism([[6, 0], [0, 1.5], [-6, 0]], 34), 0, 8, 0, 0, Math.PI / 2);
  for (let x = -14; x <= 14; x += 4) pane(k.at(x, 5, 5.55), windows, 1.2, 1.8, C.stone);
  const lh = k.at(-20, 0, 2);
  lh.box(lambert(C.mastWhite), 2.4, up(26), 2.4, 0, up(26) / 2, 0);
  lh.box(lamps, 2.2, 1.6, 2.2, 0, up(26) + 0.8, 0);
  lh.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(1.8, 1.4, 8), 0, up(26) + 2.3, 0);
  const wt = k.at(16, -8, -14);
  for (const sx of [1, -1]) for (const sz of [1, -1]) wt.box(dark, 0.4, 14, 0.4, sx * 2.6, 7, sz * 2.6);
  wt.cyl(lambert(C.stone), 3.6, 5, 0, 16.5, 0, 0, 0, 12);
  wt.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(3.9, 1.6, 12), 0, 19.8, 0);
  return { colliders: [] };
};

const ghirardelli: Build = (k, _root, windows, lamps) => {
  const brick = lambert(C.brick[0]), dark = lambert(tone(C.brick[0], 0.8));
  // Down into the slope it stands on, so its low side never shows daylight beneath it.
  k.box(brick, 26, 18, 26, 0, 2, 0);
  bands(k, dark, 26, 26, -3, 11, 3.4, 0.08);
  // The clock tower at the corner, and the big sign on its frame across the top, lit after dark.
  const t = k.at(9, 0, 9);
  t.box(brick, 6, 26, 6, 0, 13, 0);
  t.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(4.6, 5, 4, 1, false, Math.PI / 4), 0, 28.5, 0);
  t.add(lamps, new THREE.CylinderGeometry(1.4, 1.4, 0.2, 14), 0, 21, 3.05, Math.PI / 2);
  for (let x = -10; x <= 10; x += 2.5) k.box(lamps, 1.6, 2.4, 0.3, x, 19, 12.5);
  k.box(dark, 24, 0.4, 0.4, 0, 17.6, 12.4);
  for (let x = -10; x <= 6; x += 4) pane(k.at(x, 6, 13.05), windows, 1.6, 2.4, C.trim[1]);
  return { colliders: [] };
};

const pier39: Build = (k, _root, windows, lamps) => {
  const wood = lambert(PALETTE.timber), boards = lambert(tone(PALETTE.timber, 1.2)), roof = lambert(PALETTE.roofRust);
  // The pier's deck out over the water, its two-storey timber shops, and the carousel.
  k.box(boards, 26, 1.2, 72, 0, 0.2, 0);
  for (let z = -30; z <= 30; z += 12) {
    for (const s of [1, -1]) {
      const b = k.at(s * 7, 0.8, z);
      b.box(wood, 8, 6.5, 9, 0, 3.25, 0);
      b.add(roof, prism([[4.4, 0], [0, 2.4], [-4.4, 0]], 9.6), 0, 6.5, 0);
      pane(b.at(-s * 4.05, 3, 0, (-s * Math.PI) / 2), windows, 3, 2.2, C.trim[1]);
    }
  }
  const c = k.at(0, 0.8, 30);
  c.cyl(lambert(C.trim[0]), 6, 0.6, 0, 0.3, 0, 0, 0, 16);
  c.add(lambert(C.lacquer), new THREE.ConeGeometry(6.6, 3, 16), 0, 6, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.cyl(lambert(C.gilt), 0.12, 4.5, Math.sin(a) * 5.5, 2.4, Math.cos(a) * 5.5, 0, 0, 6);
    c.add(lamps, new THREE.SphereGeometry(0.2, 6, 4), Math.sin(a) * 6.4, 4.4, Math.cos(a) * 6.4);
  }
  // The sea lions' floats, off its western side.
  for (let i = 0; i < 6; i++) k.box(lambert(tone(PALETTE.timber, 0.8)), 4, 0.5, 6, -22, 0.1, -20 + i * 7);
  return { colliders: [] };
};

const oraclePark: Build = (k, _root, _windows, lamps) => {
  const brick = lambert(C.brick[1]), seats = lambert(PALETTE.city.glass), grass = lambert(PALETTE.city.lawn[1]), steel = lambert(tone(PALETTE.roofTin, 0.7));
  // A horseshoe of stands round the field, open to the bay in right field. Its walls go down
  // below the ground, where they stand on the shore or in the water of the cove.
  const R = 40;
  k.cyl(grass, R - 10, 0.3, 0, 0.15, 0, 0, 0, 24);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 0.75 + (i / 25) * Math.PI * 1.5;
    const x = Math.sin(a) * R;
    const z = Math.cos(a) * R;
    k.box(brick, 9.6, 20, 6, x, 4, z, 0, a);
    k.box(seats, 9.4, 1.0, 7.5, Math.sin(a) * (R - 6), 9, Math.cos(a) * (R - 6), -0.5, a);
    if (i % 5 === 0) {
      k.box(steel, 0.8, 36, 0.8, x * 1.08, 12, z * 1.08);
      k.box(lamps, 5, 2.2, 0.6, x * 1.08, 30, z * 1.08, 0, a);
    }
  }
  // The clock tower at the end of the stands, within the round the city walls it in by
  // (city.ts), and out past left field the giant bottle and glove.
  const t = k.at(Math.sin(-Math.PI * 0.75) * (R + 1), 0, Math.cos(-Math.PI * 0.75) * (R + 1));
  t.box(brick, 6, 32, 6, 0, 10, 0);
  t.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(4.6, 5, 4, 1, false, Math.PI / 4), 0, 28.5, 0);
  const lf = k.at(Math.sin(Math.PI * 0.85) * (R - 4), 14, Math.cos(Math.PI * 0.85) * (R - 4));
  lf.cyl(lambert(C.lacquer), 2.2, 12, 0, 6, 0, 0, 0, 12);
  lf.cyl(lambert(C.lacquer), 1.0, 5, 0, 14.5, 0, 0, 0, 10);
  lf.add(lambert(PALETTE.timber), new THREE.SphereGeometry(4, 12, 8).scale(1, 1, 0.5), 9, 3, 0);
  return { colliders: [] };
};

const chinatownGate: Build = (k) => {
  const jade = lambert(C.jade), red = lambert(C.lacquer), stone = lambert(C.stone), gilt = lambert(C.gilt);
  // Three openings: the middle one over the road, a lower one over each pavement.
  const roofs = [[0, 7.2, 8.4], [-6.4, 5.4, 4.4], [6.4, 5.4, 4.4]] as const;
  for (const x of [-4.4, 4.4]) k.box(red, 1.2, 7.2, 1.2, x, 3.6, 0);
  for (const x of [-8.6, 8.6]) k.box(stone, 1.0, 5.4, 1.0, x, 2.7, 0);
  for (const [x, y, w] of roofs) {
    k.box(red, w, 1.0, 1.0, x, y - 0.8, 0);
    k.add(jade, prism([[w / 2 + 0.9, 0], [w / 2 + 0.5, 0.25], [0, 1.4], [-w / 2 - 0.5, 0.25], [-w / 2 - 0.9, 0]], 2.6), x, y, 0);
    k.box(gilt, 0.6, 0.6, 0.6, x, y + 1.6, 0);
  }
  return { colliders: [{ x: -4.4, z: 0, r: 0.8 }, { x: 4.4, z: 0, r: 0.8 }, { x: -8.6, z: 0, r: 0.7 }, { x: 8.6, z: 0, r: 0.7 }] };
};

const castroTheatre: Build = (k, _root, _windows, lamps) => {
  const stucco = lambert(C.adobe), red = lambert(C.lacquer);
  k.box(stucco, 14, 14, 3, 0, 7, -1.5);
  k.add(stucco, prism([[7, 0], [3, 3], [-3, 3], [-7, 0]], 3), 0, 14, -1.5);
  // The tall sign down the front, lit up and down its length after dark.
  k.box(red, 1.6, 9, 0.6, 0, 11, 0.4);
  for (let y = 7.5; y < 15; y += 1.4) k.box(lamps, 1.0, 0.8, 0.2, 0, y, 0.75);
  k.box(red, 9, 1.4, 1.6, 0, 4.4, 0.6);
  return { colliders: [] };
};

const missionDolores: Build = (k) => {
  const adobe = lambert(C.adobe), tiles = lambert(C.terracotta);
  // Its walls a little below the ground, which falls away along it.
  k.box(adobe, 9, 11, 21, 0, 3.5, 0);
  k.add(tiles, prism([[5, 0], [0, 3], [-5, 0]], 22), 0, 9, 0);
  // The front: six columns half sunk in the wall, a little bell gable over them.
  for (let x = -3.6; x <= 3.6; x += 1.44) k.cyl(adobe, 0.35, 8, x, 4, 10.6, 0, 0, 8);
  k.box(adobe, 9, 1.4, 1.2, 0, 9.2, 10.4);
  for (const x of [-2.4, 0, 2.4]) k.box(lambert(PALETTE.doorDark), 0.8, 1.1, 0.4, x, 10.6, 10.5);
  return { colliders: [] };
};

/** A windmill: tower, cap, and four sails that turn. */
const windmill = (dutch: boolean): Build => (k, root) => {
  const body = lambert(dutch ? PALETTE.boardsGrey : C.mastWhite), cap = lambert(PALETTE.roofSlate);
  const H = dutch ? 18 : 21;
  shaft(k, body, 4.2, 2.6, 0, H, 8);
  k.add(cap, new THREE.SphereGeometry(3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.3), 0, H, 0);
  const sails = new THREE.Group();
  sails.position.set(0, H - 0.5, 3.4);
  const sk = new Kit();
  const frame = lambert(PALETTE.timber), cloth = lambert(dutch ? PALETTE.city.trim[1] : PALETTE.city.trim[0], THREE.DoubleSide);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = sk.at(0, 0, 0);
    arm.box(frame, 0.4, 11, 0.3, Math.sin(a) * 5.5, Math.cos(a) * 5.5, 0, 0, 0, -a);
    arm.box(cloth, 1.8, 9, 0.08, Math.sin(a) * 5.8 + Math.cos(a) * 1.1, Math.cos(a) * 5.8 - Math.sin(a) * 1.1, 0.1, 0, 0, -a);
  }
  sk.cyl(frame, 0.6, 1, 0, 0, 0, Math.PI / 2, 0, 8);
  sk.build(sails);
  root.add(sails);
  return { colliders: [{ x: 0, z: 0, r: 4.2 }], update: (time) => void (sails.rotation.z = time * (dutch ? 0.35 : 0.28)) };
};

const conservatory: Build = (k, _root, windows) => {
  const white = lambert(C.mastWhite);
  // A white glasshouse: two long wings and a domed pavilion in the middle.
  for (const s of [1, -1]) {
    k.box(white, 10, 5, 8, s * 9, 2.5, 0);
    k.add(windows, new THREE.CylinderGeometry(4, 4, 10, 10, 1, false, 0, Math.PI).scale(1, 0.6, 1), s * 9, 5, 0, 0, 0, Math.PI / 2);
  }
  k.box(white, 9, 7, 9, 0, 3.5, 0);
  k.add(windows, new THREE.SphereGeometry(5.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), 0, 7, 0);
  k.add(white, new THREE.ConeGeometry(1, 2.5, 8), 0, 15.5, 0);
  return { colliders: [] };
};

const cliffHouse: Build = (k, _root, windows) => {
  const wall = lambert(C.stucco[3]);
  // Out on the edge of the cliff, its walls going down the rock to the foot of it.
  k.box(wall, 16, 19, 12, 0, -3.5, 0);
  for (let x = -6; x <= 6; x += 3) pane(k.at(x, 4.5, 6.05), windows, 2.2, 2, C.trim[0]);
  k.box(lambert(PALETTE.roofSlate), 16.6, 0.6, 12.6, 0, 6.2, 0);
  return { colliders: [] };
};

const legionOfHonor: Build = (k) => {
  const white = lambert(C.stone), roof = lambert(tone(PALETTE.roofSlate, 1.2));
  // A courtyard behind a row of columns, the museum round it.
  k.box(white, 30, 9, 8, 0, 4.5, -14);
  for (const s of [1, -1]) k.box(white, 7, 7, 26, s * 11.5, 3.5, 0);
  for (let x = -12; x <= 12; x += 2.4) k.cyl(white, 0.5, 7, x, 3.5, 12, 0, 0, 8);
  k.box(white, 30, 1.4, 3, 0, 7.5, 12);
  k.add(roof, prism([[16, 0], [0, 3], [-16, 0]], 9), 0, 9, -14);
  return { colliders: [] };
};

const fortPoint: Build = (k, _root, windows) => {
  const brick = lambert(C.brick[0]), dark = lambert(PALETTE.void);
  k.box(brick, 24, 14, 24, 0, 5, 0);
  // Three tiers of gun arches round its walls.
  for (const y of [2.4, 6.2, 10]) for (let x = -10; x <= 10; x += 3.3) for (const s of [1, -1]) {
    k.box(dark, 1.4, 2.0, 0.3, x, y, s * 12.05);
    k.box(dark, 0.3, 2.0, 1.4, s * 12.05, y, x);
  }
  k.box(lambert(tone(C.brick[0], 0.85)), 25, 1, 25, 0, 12.4, 0);
  pane(k.at(0, 13.6, 0), windows, 2, 1.2, C.trim[0]);
  return { colliders: [] };
};

const twinPeaks: Build = (k) => {
  // The viewpoint at the top: a low wall round the lookout.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 1.4 - Math.PI * 0.2;
    k.box(lambert(C.stone), 3.4, 0.8, 0.5, Math.sin(a) * 10, 0.4, Math.cos(a) * 10, 0, a + Math.PI / 2);
  }
  return { colliders: [] };
};

const mountDavidson: Build = (k) => {
  const concrete = lambert(C.stone);
  const H = up(31);
  k.box(concrete, 3.4, H, 3.4, 0, H / 2, 0);
  k.box(concrete, 12, 3.2, 3.4, 0, H * 0.72, 0);
  return { colliders: [{ x: 0, z: 0, r: 2.2 }] };
};

const BUILDERS: Partial<Record<CityLandmark["kind"], Build>> = {
  coitTower, transamerica, salesforce, bankOfAmerica, ferryBuilding, cityHall, graceCathedral, palaceOfFineArts, sutroTower,
  paintedLadies, alcatraz, ghirardelli, pier39, oraclePark, chinatownGate, castroTheatre, missionDolores,
  dutchWindmill: windmill(true), murphyWindmill: windmill(false), conservatory, cliffHouse, legionOfHonor, fortPoint, twinPeaks, mountDavidson,
};

/** A landmark the city knows how to draw, or null for one it doesn't. */
export function buildCityLandmark(kind: CityLandmark["kind"], windows: THREE.Material, lamps: THREE.Material): Built | null {
  const build = BUILDERS[kind];
  if (!build) return null;
  const object = new THREE.Group();
  const k = new Kit();
  const made = build(k, object, windows, lamps);
  k.build(object);
  return { object, ...made };
}

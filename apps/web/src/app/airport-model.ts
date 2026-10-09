import * as THREE from "three";
import { APRON, RUNWAY } from "./airport";
import { BOARD_REACH, BOARD_Z, PLANE } from "./flight";
import { Kit, lambert, pane, ring, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";

/**
 * An airstrip's fixed parts, in field space (airport.ts): the runway and its paint, the
 * apron behind the threshold, edge lights, a windsock, and a small terminal with a tower
 * cab on its roof and a carpet out to the apron. The same in every world. The plane is
 * plane-model.ts.
 */
export type AirportModel = {
  /** Origin at the threshold on the centreline, ground level; +z runs down the runway. */
  object: THREE.Group;
  /** Solid parts as circles in field space. */
  colliders: Circle[];
  /** Lamps, beacon and end lights: `night` is 0 by day and 1 at full night. */
  update(time: number, night: number): void;
};

/** Paving lies on level ground a few centimetres thick, so each layer is nudged toward the camera to sit cleanly on the one below. */
const paved = (color: string, layer: number) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2 * layer, polygonOffsetUnits: -2 * layer });

const lit = (color: string) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3, flatShading: true });

/** Where the terminal stands and which way it faces: beside the apron, looking across it. */
const TERMINAL = { x: -33, z: -36, ry: Math.PI / 2 } as const;
const WINDSOCK = { x: 32, z: -14 } as const;

/** Local (x, z) in a part turned by `ry` at (x0, z0), as field space. */
const turned = (x0: number, z0: number, ry: number) => (x: number, z: number) => ({
  x: x0 + x * Math.cos(ry) + z * Math.sin(ry),
  z: z0 - x * Math.sin(ry) + z * Math.cos(ry),
});

/** The runway, the apron and everything painted on them. */
function paving(k: Kit) {
  const apron = paved(PALETTE.apron, 1), tarmac = paved(PALETTE.tarmac, 2), patch = paved(PALETTE.tarmacPatch, 3);
  const paint = paved(PALETTE.runwayPaint, 4), yellow = paved(PALETTE.hazardYellow, 4);
  const [L, H] = [RUNWAY.length, RUNWAY.half];
  k.box(apron, APRON.half * 2, 0.03, APRON.back + APRON.front, 0, 0.015, (APRON.front - APRON.back) / 2);
  k.box(tarmac, H * 2, 0.04, L, 0, 0.02, L / 2);
  // Where the wheels come down and where they spin up, the surface is worn darker.
  k.box(patch, 9, 0.045, 60, 0, 0.0225, L - 70);
  k.box(patch, 7, 0.045, 34, 0, 0.0225, PLANE.stand + 20);
  const mark = (m: THREE.Material, w: number, d: number, x: number, z: number, ry = 0) => k.box(m, w, 0.05, d, x, 0.025, z, 0, ry);
  for (const s of [1, -1]) mark(paint, 0.4, L - 4, s * (H - 0.8), L / 2);
  for (let z = 36; z < L - 30; z += 24) mark(paint, 0.6, 12, 0, z);
  // Piano keys at each end, and two aiming blocks where the plane touches down.
  for (const z of [7, L - 7]) for (const x of [1.6, 4.4, 7.2, 10]) for (const s of [1, -1]) mark(paint, 1.6, 10, s * x, z);
  for (const s of [1, -1]) mark(paint, 3, 16, s * 5.5, L - 62);
  // The boarding box: where a truck waits behind the tail, with chevrons toward the ramp.
  const bz = BOARD_Z;
  for (const s of [1, -1]) mark(yellow, 0.25, BOARD_REACH + 2, s * 2.6, bz);
  for (const e of [1, -1]) mark(yellow, 5.45, 0.25, 0, bz + (e * (BOARD_REACH + 2)) / 2);
  for (const dz of [-2.2, 0.2, 2.6]) for (const s of [1, -1]) mark(yellow, 0.25, 2.3, s * 0.75, bz + dz, -s * 0.7);
  // A lead-in line from the back of the apron.
  mark(yellow, 0.25, APRON.back - 20, 0, -APRON.back + (APRON.back - 20) / 2 + 4);
}

/** Low lamps down both edges, green ones where the plane comes in and red ones at the end it stops. */
function lights(k: Kit, lamp: THREE.Material, green: THREE.Material, red: THREE.Material) {
  const post = lambert(PALETTE.rail);
  const one = (m: THREE.Material, x: number, z: number) => {
    k.cyl(post, 0.05, 0.4, x, 0.2, z, 0, 0, 5);
    k.box(m, 0.24, 0.16, 0.24, x, 0.46, z);
  };
  for (let z = 26; z <= RUNWAY.length - 26; z += 26) for (const s of [1, -1]) one(lamp, s * (RUNWAY.half + 1.4), z);
  for (let x = -RUNWAY.half + 1; x <= RUNWAY.half - 1; x += 4) one(green, x, RUNWAY.length + 1.5);
  for (const x of [-RUNWAY.half - 1.4, -RUNWAY.half + 1, RUNWAY.half - 1, RUNWAY.half + 1.4]) one(red, x, -1.5);
}

/** Tapering red and white bands drooping off a hoop on a pole. */
function windsock(k: Kit) {
  const steel = lambert(tone(PALETTE.roofTin, 0.6));
  k.box(lambert(PALETTE.concrete), 0.8, 0.2, 0.8, 0, 0.1, 0);
  k.cyl(steel, 0.07, 6.6, 0, 3.3, 0, 0, 0, 8);
  const droop = 0.25;
  k.add(steel, new THREE.TorusGeometry(0.36, 0.03, 4, 10), 0.25, 6.3, 0, 0, Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const [r0, d] = [0.36 - i * 0.045, 0.25 + (i + 0.5) * 0.44];
    const band = lambert(i % 2 ? PALETTE.barrierWhite : PALETTE.barrierRed, THREE.DoubleSide);
    k.add(band, new THREE.CylinderGeometry(r0 - 0.045, r0, 0.44, 10, 1, true), 0.25 + d * Math.cos(droop), 6.3 - d * Math.sin(droop), 0, 0, 0, -Math.PI / 2 - droop);
  }
}

/**
 * The terminal, front to +z: a low white block with a glass front under a deep canopy, a
 * glazed tower cab on one end of the roof, and a red carpet out from the door between
 * brass posts, with a trolley of bags waiting at the end of it.
 */
function terminal(k: Kit, glass: THREE.Material, beacon: THREE.Material): Circle[] {
  const [W, D, H] = [13, 7.5, 3.6];
  const F = D / 2;
  const wall = lambert(PALETTE.terminalWall), shade = lambert(tone(PALETTE.terminalWall, 0.84)), trim = lambert(PALETTE.terminalTrim);
  const gold = lambert(PALETTE.jetGold), dark = lambert(PALETTE.doorDark), red = lambert(PALETTE.casinoCarpet);

  k.box(lambert(PALETTE.concrete), W + 0.6, 0.3, D + 0.6, 0, 0.15, 0);
  k.box(wall, W, H, D, 0, 0.3 + H / 2, 0);
  k.box(trim, W + 0.1, 0.5, D + 0.1, 0, 0.3 + H - 0.25, 0);
  k.box(shade, W + 1.2, 0.22, D + 1.2, 0, 0.3 + H + 0.11, 0);
  // The canopy over the front, on two slim posts.
  k.box(shade, W + 1.2, 0.18, 3, 0, 0.3 + H + 0.02, F + 1.5);
  k.box(trim, W + 1.25, 0.3, 0.12, 0, 0.3 + H - 0.05, F + 3);
  for (const s of [1, -1]) k.cyl(lambert(PALETTE.chrome), 0.07, H, s * (W / 2 - 0.3), 0.3 + H / 2, F + 2.7, 0, 0, 6);
  // Glass along the front either side of the doors, and a window in each end.
  for (const x of [-4.6, -2.6, 2.6, 4.6]) pane(k.at(x, 2.1, F), glass, 1.7, 2.3, PALETTE.terminalTrim);
  for (const s of [1, -1]) pane(k.at(s * 0.62, 1.55, F), glass, 1.05, 2.4, PALETTE.jetGold);
  for (const s of [1, -1]) pane(k.at(s * (W / 2), 2.2, -0.4, (s * Math.PI) / 2), glass, 2.2, 1.4, PALETTE.terminalTrim);
  for (const s of [1, -1]) k.box(gold, 0.05, 0.6, 0.06, s * 0.14, 1.45, F + 0.17);

  // The tower cab: glazed all round, a flat cap, a mast with a beacon on it.
  const [tx, ty] = [W / 2 - 2.2, 0.3 + H + 0.22];
  const cab = k.at(tx, ty, -0.6);
  cab.box(wall, 3.4, 0.7, 3.4, 0, 0.35, 0);
  for (let i = 0; i < 4; i++) pane(cab.at(0, 1.55, 0, (i * Math.PI) / 2).at(0, 0, 1.6), glass, 2.9, 1.5, PALETTE.terminalTrim);
  cab.box(dark, 3.0, 1.6, 3.0, 0, 1.55, 0);
  cab.box(shade, 4.1, 0.2, 4.1, 0, 2.5, 0);
  cab.box(trim, 3.7, 0.16, 3.7, 0, 2.68, 0);
  cab.cyl(lambert(PALETTE.chrome), 0.05, 2.6, 1.2, 4.05, -1.2, 0, 0, 5);
  cab.box(dark, 0.9, 0.05, 0.05, 1.2, 4.9, -1.2);
  cab.add(beacon, new THREE.IcosahedronGeometry(0.2, 0), 1.2, 5.45, -1.2);

  // The red carpet, between brass posts joined by a rope, and the trolley at its end.
  const [CW, CL] = [2.2, 8.5];
  k.box(red, CW, 0.05, CL, 0, 0.325, F + 0.3 + CL / 2);
  for (const s of [1, -1]) {
    const posts = [F + 1.4, F + 4.4, F + 7.4];
    for (const z of posts) {
      k.cyl(gold, 0.05, 0.95, s * (CW / 2 + 0.3), 0.3 + 0.475, z, 0, 0, 6);
      k.add(gold, new THREE.IcosahedronGeometry(0.09, 0), s * (CW / 2 + 0.3), 1.3, z);
    }
    for (let i = 1; i < posts.length; i++) k.strut(red, [s * (CW / 2 + 0.3), 1.15, posts[i - 1]], [s * (CW / 2 + 0.3), 1.15, posts[i]], 0.05);
  }
  const cart = k.at(2.9, 0.3, F + CL + 0.4, 0.25);
  cart.box(gold, 1.8, 0.08, 1.0, 0, 0.42, 0);
  for (const sx of [1, -1]) for (const sz of [1, -1]) cart.cyl(dark, 0.14, 0.1, sx * 0.7, 0.14, sz * 0.42, Math.PI / 2, 0, 8);
  cart.box(gold, 0.05, 1.0, 0.05, -0.88, 0.92, 0.45);
  cart.box(gold, 0.05, 1.0, 0.05, -0.88, 0.92, -0.45);
  cart.box(gold, 0.05, 0.05, 0.95, -0.88, 1.42, 0);
  const bags: [number, number, number, number, number, number][] = [[0.75, 0.5, 0.5, -0.3, 0, 0], [0.6, 0.4, 0.45, 0.45, 0, 1], [0.55, 0.3, 0.4, -0.2, 0.5, 2]];
  for (const [w, h, d, x, y, c] of bags) cart.box(lambert(PALETTE.luggage[c]), w, h, d, x, 0.46 + y + h / 2, 0, 0, 0.1 * (c - 1));

  // Two fuel drums round the back corner.
  for (const [x, z, c] of [[-W / 2 - 0.9, -1.8, PALETTE.barrierRed], [-W / 2 - 1.0, -2.6, PALETTE.shipping[1]]] as const) {
    k.cyl(lambert(c), 0.3, 0.9, x, 0.45, z);
    for (const y of [0.3, 0.62]) k.cyl(lambert(tone(c, 0.7)), 0.315, 0.05, x, y, z);
  }

  const colliders = ring([], -W / 2 - 0.3, W / 2 + 0.3, -F - 0.3, F + 0.3);
  for (const s of [1, -1]) colliders.push({ x: s * (W / 2 - 0.3), z: F + 2.7, r: 0.3 });
  for (const s of [1, -1]) for (const z of [F + 1.4, F + 4.4, F + 7.4]) colliders.push({ x: s * (CW / 2 + 0.3), z, r: 0.25 });
  colliders.push({ x: 2.9, z: F + CL + 0.4, r: 1.0 }, { x: -W / 2 - 0.95, z: -2.2, r: 0.75 });
  return colliders;
}

/** `glass` and `lamp` are the scene's shared window and lamp materials, which come up after dark. */
export function buildAirport(glass: THREE.Material, lamp: THREE.Material): AirportModel {
  const k = new Kit();
  const green = lit(PALETTE.navGreen), red = lit(PALETTE.navRed), beacon = lit(PALETTE.headlight);
  paving(k);
  lights(k, lamp, green, red);
  windsock(k.at(WINDSOCK.x, 0, WINDSOCK.z, Math.PI * 0.8));
  const at = turned(TERMINAL.x, TERMINAL.z, TERMINAL.ry);
  const colliders: Circle[] = terminal(k.at(TERMINAL.x, 0, TERMINAL.z, TERMINAL.ry), glass, beacon).map((c) => ({ ...at(c.x, c.z), r: c.r }));
  colliders.push({ ...WINDSOCK, r: 0.5 });
  const object = k.build(new THREE.Group());
  // Flat paving doesn't need to be in the shadow map, and the paint is too thin to matter.
  object.traverse((o) => {
    if (o instanceof THREE.Mesh && (o.material as THREE.Material).polygonOffset) o.castShadow = false;
  });

  function update(time: number, night: number) {
    green.emissiveIntensity = red.emissiveIntensity = 0.35 + night * 2.2;
    // The beacon turns: a slow double flash, brighter after dark.
    const flash = Math.max(0, Math.sin(time * 2.1)) ** 6 + Math.max(0, Math.sin(time * 2.1 - 0.5)) ** 6;
    beacon.emissiveIntensity = 0.2 + flash * (1.2 + night * 3);
  }
  update(0, 0);
  return { object, colliders, update };
}

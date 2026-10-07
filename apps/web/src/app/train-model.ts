import * as THREE from "three";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";

export type TrainCarKind = "loco" | "boxcar" | "logs" | "tanker";

/** The loco's headlight in its local space, for the caller's spotlight. */
export const LOCO_LAMP = new THREE.Vector3(0, 3.45, 6.6);

const LENGTH: Record<TrainCarKind, number> = { loco: 14, boxcar: 12, logs: 12, tanker: 11 };
/** Top of the underframe, above rail top. */
const DECK = 1.3;
const WHEEL_R = 0.46;
/** Bogie centres sit this far in from each end; track.ts poses cars from the same points. */
const BOGIE = 1.8;

/** Underframe, two two-axle bogies on 1.5 m gauge, and couplers reaching into the gap between cars. */
function chassis(k: Kit, len: number) {
  const dark = lambert(PALETTE.doorDark), steel = lambert(PALETTE.rail);
  k.box(dark, 2.8, 0.3, len - 0.8, 0, DECK - 0.15, 0);
  for (const e of [1, -1]) {
    const bz = e * (len / 2 - BOGIE);
    for (const s of [1, -1]) k.box(dark, 0.12, 0.4, 2.6, s * 0.95, 0.6, bz);
    k.box(dark, 2.0, 0.25, 0.5, 0, 0.9, bz);
    for (const az of [-0.9, 0.9]) {
      k.cyl(steel, 0.08, 1.5, 0, WHEEL_R, bz + az, 0, Math.PI / 2, 6);
      for (const s of [1, -1]) k.cyl(steel, WHEEL_R, 0.14, s * 0.75, WHEEL_R, bz + az, 0, Math.PI / 2, 12);
    }
    k.box(dark, 3.0, 0.3, 0.2, 0, DECK - 0.2, e * (len / 2 - 0.4));
    k.box(dark, 0.3, 0.3, 0.85, 0, 0.95, e * (len / 2 + 0.12));
  }
}

/** A 60s–70s hood unit: short hood, cab in the front third, long hood behind, yellow rails. */
function loco(k: Kit, lamp: THREE.Material) {
  const body = lambert(PALETTE.locoBody), stripe = lambert(PALETTE.locoStripe), dark = lambert(PALETTE.doorDark);
  const seam = lambert(tone(PALETTE.locoBody, 0.72)), glass = lambert(PALETTE.carGlass);
  chassis(k, 14);
  k.box(dark, 3.0, 0.15, 13.2, 0, DECK + 0.075, 0);
  k.box(stripe, 3.04, 0.12, 13.2, 0, DECK - 0.05, 0);
  k.box(dark, 2.3, 0.85, 5.0, 0, 0.75, 0);
  // Long hood, cab, short hood; front is +z.
  k.box(body, 2.2, 2.3, 8.8, 0, 2.6, -2.0);
  k.box(body, 3.0, 2.7, 2.2, 0, 2.8, 3.5);
  k.box(seam, 3.2, 0.16, 2.5, 0, 4.23, 3.5);
  k.box(body, 2.2, 1.7, 1.9, 0, 2.3, 5.55);
  // The stripe band all the way round, hood door seams, cab glass.
  k.box(stripe, 2.24, 0.3, 8.8, 0, 2.5, -2.0);
  k.box(stripe, 3.04, 0.3, 2.2, 0, 2.5, 3.5);
  k.box(stripe, 2.24, 0.3, 1.94, 0, 2.5, 5.57);
  for (let z = -6.0; z < 2.2; z += 1.1) k.box(seam, 2.26, 1.9, 0.05, 0, 2.55, z);
  k.box(glass, 3.04, 0.75, 1.3, 0, 3.55, 3.6);
  for (const s of [1, -1]) k.box(glass, 0.9, 0.65, 0.06, s * 0.65, 3.6, 4.62);
  // Radiator fans, exhaust stack, brake blister, horn.
  for (const z of [-5.2, -3.9]) k.cyl(dark, 0.5, 0.12, 0, 3.81, z, 0, 0, 10);
  k.cyl(dark, 0.14, 0.45, 0, 3.97, -0.6, 0, 0, 8);
  k.box(seam, 1.8, 0.3, 1.8, 0, 3.9, -1.9);
  k.cyl(dark, 0.08, 0.4, 0.6, 4.42, 3.2, Math.PI / 2, 0, 6);
  // Handrails along the walkway and across the ends, and the pilots.
  for (const s of [1, -1]) {
    k.box(stripe, 0.05, 0.05, 12.8, s * 1.42, 2.45, 0);
    for (let z = -6.4; z <= 6.41; z += 1.6) k.box(stripe, 0.05, 1.0, 0.05, s * 1.42, 1.95, z);
    k.box(stripe, 2.9, 0.05, 0.05, 0, 2.45, s * 6.55);
    k.box(stripe, 2.9, 0.55, 0.25, 0, 0.95, s * 6.75);
  }
  // Headlight on the nose of the short hood.
  k.box(dark, 0.7, 0.6, 0.3, 0, 3.42, 6.35);
  k.add(lamp, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), LOCO_LAMP.x, LOCO_LAMP.y, 6.54, Math.PI / 2);
}

function boxcar(k: Kit, color: string) {
  const len = 12, m = lambert(color), d = lambert(tone(color, 0.75)), dark = lambert(PALETTE.doorDark);
  chassis(k, len);
  k.box(m, 3.0, 2.8, len - 0.8, 0, DECK + 1.4, 0);
  k.box(d, 3.1, 0.15, len - 0.7, 0, DECK + 2.875, 0);
  k.box(lambert(PALETTE.timber), 0.5, 0.06, len - 0.9, 0, DECK + 2.98, 0);
  for (let z = -len / 2 + 0.8; z < len / 2 - 0.5; z += 0.75) k.box(d, 3.06, 2.7, 0.08, 0, DECK + 1.4, z);
  // Sliding doors: a proud panel each side, top and bottom tracks, handles.
  k.box(lambert(tone(color, 0.9)), 3.12, 2.55, 2.4, 0, DECK + 1.35, 0);
  for (const y of [DECK + 0.06, DECK + 2.68]) k.box(dark, 3.16, 0.1, 2.9, 0, y, 0);
  k.box(dark, 3.16, 1.2, 0.06, 0, DECK + 1.3, 1.05);
  // End ladders.
  for (const e of [1, -1]) for (let y = DECK + 0.4; y < DECK + 2.6; y += 0.45) k.box(dark, 0.5, 0.04, 0.04, 1.1, y, e * (len / 2 - 0.37));
}

function logcar(k: Kit) {
  const len = 12, R = 0.34, dark = lambert(PALETTE.doorDark);
  const bark = [lambert(PALETTE.logWood), lambert(tone(PALETTE.logWood, 0.8))];
  const cut = lambert(new THREE.Color(PALETTE.logWood).lerp(new THREE.Color(PALETTE.plaster), 0.55));
  chassis(k, len);
  k.box(lambert(PALETTE.timber), 3.0, 0.16, len - 0.7, 0, DECK + 0.08, 0);
  for (const e of [1, -1]) k.box(dark, 3.0, 2.2, 0.2, 0, DECK + 1.25, e * (len / 2 - 0.45));
  for (const s of [1, -1]) for (let z = -4; z <= 4; z += 2) k.box(dark, 0.12, 1.9, 0.12, s * 1.45, DECK + 1.1, z);
  // A 4-3-2 stack, lengths and ends staggered so it doesn't look machined; cut ends paler.
  [4, 3, 2].forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.7, y = DECK + 0.16 + R + row * 0.6;
      const l = 9.2 + ((i + row) % 3) * 0.4, z = (((i * 7 + row * 3) % 5) - 2) * 0.12;
      k.cyl(bark[(i + row) % 2], R, l, x, y, z, Math.PI / 2, 0, 9);
      for (const e of [1, -1]) k.cyl(cut, R - 0.03, 0.04, x, y, z + e * (l / 2 + 0.01), Math.PI / 2, 0, 9);
    }
  });
}

function tanker(k: Kit) {
  const len = 11, R = 1.35, cy = DECK + 0.15 + R, top = cy + R;
  const m = lambert(PALETTE.tanker), d = lambert(tone(PALETTE.tanker, 0.6)), walk = lambert(PALETTE.timber);
  chassis(k, len);
  k.cyl(m, R, 8.6, 0, cy, 0, Math.PI / 2, 0, 16);
  for (const e of [1, -1]) k.add(m, new THREE.SphereGeometry(R, 16, 8).scale(1, 1, 0.4), 0, cy, e * 4.3);
  for (const z of [-2.8, 2.8]) k.cyl(d, R + 0.03, 0.12, 0, cy, z, Math.PI / 2, 0, 16);
  for (const z of [-3.5, 3.5]) k.box(d, 2.2, 0.5, 0.4, 0, DECK + 0.2, z);
  for (const s of [1, -1]) {
    k.box(walk, 0.45, 0.06, len - 1.0, s * 1.3, DECK + 0.03, 0);
    k.box(d, 0.05, 0.05, 8.0, s * 1.28, cy + 0.6, 0);
    k.box(lambert(PALETTE.hazardYellow), 2.74, 0.5, 0.5, 0, cy, s * 1.6, Math.PI / 4);
  }
  // Dome with a little railed platform round it.
  k.box(walk, 1.8, 0.06, 1.8, 0, top, 0);
  k.cyl(m, 0.55, 0.45, 0, top + 0.22, 0, 0, 0, 10);
  k.cyl(d, 0.6, 0.08, 0, top + 0.46, 0, 0, 0, 10);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) k.box(d, 0.05, 0.9, 0.05, sx * 0.85, top + 0.45, sz * 0.85);
    k.box(d, 1.75, 0.05, 0.05, 0, top + 0.9, sx * 0.85);
    k.box(d, 0.05, 0.05, 1.75, sx * 0.85, top + 0.9, 0);
  }
}

// Each kind is built once (per lamp material and boxcar colour) and cloned: clones share geometry and materials.
const built = new Map<string, THREE.Group>();
let boxcars = 0;

/**
 * One rail vehicle. Origin at rail-top level (y = 0 is the top of the rails), centred along its length,
 * facing +z. Successive boxcars cycle through the wagon colours.
 */
export function buildTrainCar(kind: TrainCarKind, lampMaterial: THREE.Material): { object: THREE.Group; length: number } {
  const colour = kind === "boxcar" ? boxcars++ % PALETTE.wagon.length : 0;
  const key = `${kind}/${colour}/${lampMaterial.uuid}`;
  let proto = built.get(key);
  if (!proto) {
    const k = new Kit();
    if (kind === "loco") loco(k, lampMaterial);
    else if (kind === "boxcar") boxcar(k, PALETTE.wagon[colour]);
    else if (kind === "logs") logcar(k);
    else tanker(k);
    built.set(key, (proto = k.build(new THREE.Group())));
  }
  return { object: proto.clone(), length: LENGTH[kind] };
}

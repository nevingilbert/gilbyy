import * as THREE from "three";
import { PLANE, RAMP_DOWN, RAMP_SHUT, type PlanePose } from "./flight";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";

/**
 * The plane that flies between worlds (ADR 0014): a chubby private jet with a truck-sized
 * hold. White with a gold line and a teal tail, swept wings with winglets, two engines
 * high on the rear fuselage under a T-tail, and under the tail a ramp that is the
 * fuselage's underside until it comes down. Its measurements are in flight.ts.
 *
 * Plane space: the origin is on the ground under the middle of the fuselage, +z is the
 * nose and +x the left wing.
 */
export type PlaneModel = {
  object: THREE.Group;
  /** Stands it at a pose from flight.ts. */
  pose(p: PlanePose): void;
  /** The ramp: 0 shut, 1 down. */
  setRamp(open: number): void;
  /** The wheels: 1 down, 0 folded away. */
  setGear(down: number): void;
  /** Wingtip lights and the beacon: `night` is 0 by day and 1 at full night. */
  update(time: number, night: number): void;
  dispose(): void;
};

const SIDES = 12;
type V3 = [number, number, number];
/** A slice of the fuselage: how wide, its centre's height, how tall above and below it, and a floor nothing dips under. */
type Station = { z: number; rx: number; cy: number; up: number; down: number; floor?: number };

/** Corner `k` of a slice. Corner 0 is just above the left side; they run over the top and back under. */
function corner(s: Station, k: number): V3 {
  const a = ((k + 0.5) * Math.PI * 2) / SIDES;
  const y = s.cy + Math.sin(a) * (Math.sin(a) > 0 ? s.up : s.down);
  return [Math.cos(a) * s.rx, Math.max(y, s.floor ?? -Infinity), s.z];
}

/** Four-cornered faces as a geometry the kit can merge. Each faces the way that sees its corners turn anticlockwise. */
function faces(quads: V3[][]) {
  const pos: number[] = [];
  for (const [a, b, c, d] of quads) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // Unused, but every other part in a kit has them, and parts only merge when they match.
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Skins the slices, one facet at a time. `skin` picks each facet's material, or null to leave a hole. */
function loft(k: Kit, stations: Station[], skin: (segment: number, facet: number) => THREE.Material | null) {
  const by = new Map<THREE.Material, V3[][]>();
  for (let i = 0; i + 1 < stations.length; i++) {
    for (let f = 0; f < SIDES; f++) {
      const m = skin(i, f);
      if (!m) continue;
      const quad = [corner(stations[i], f), corner(stations[i], f + 1), corner(stations[i + 1], f + 1), corner(stations[i + 1], f)];
      (by.get(m) ?? by.set(m, []).get(m)!).push(quad);
    }
  }
  for (const [m, quads] of by) k.add(m, faces(quads), 0, 0, 0);
}

/** A box with its corners moved: `f` maps each corner's signs to a point. Keep it increasing in each sign. */
function hexa(f: (sx: number, sy: number, sz: number) => V3) {
  const g = new THREE.BoxGeometry(2, 2, 2);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...f(Math.sign(p.getX(i)), Math.sign(p.getY(i)), Math.sign(p.getZ(i))));
  g.computeVertexNormals();
  return g;
}

/** The three facets along the bottom, where the ramp is; the five that are painted as the belly; the two sides. */
const UNDER = (f: number) => f >= 7 && f <= 9;
const BELLY = (f: number) => f >= 6 && f <= 10;
/** Half the fuselage's width along its flat sides. */
const SIDE = PLANE.radius * Math.cos(Math.PI / SIDES);

/** How high the shut ramp's top is at z: the line the tail's underside is cut to. */
const rampLine = (z: number) => PLANE.floor + (PLANE.hinge - z) * Math.tan(RAMP_SHUT);
const RAMP_END = PLANE.hinge - PLANE.ramp * Math.cos(RAMP_SHUT);

export function buildPlane(glass: THREE.Material): PlaneModel {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const k = new Kit();
  const white = lambert(PALETTE.jetWhite), belly = lambert(PALETTE.jetBelly), stripe = lambert(PALETTE.jetStripe), gold = lambert(PALETTE.jetGold);
  const cockpit = lambert(PALETTE.jetGlass), dark = lambert(PALETTE.jetIntake), chrome = lambert(PALETTE.chrome), tyre = lambert(PALETTE.tyre);
  const [R, C] = [PLANE.radius, PLANE.centre];
  const full = (z: number): Station => ({ z, rx: R, cy: C, up: R, down: R });

  // The cabin and the nose, which droops to a point. The cockpit's glass is four facets of the nose.
  const body: Station[] = [
    full(PLANE.hinge), full(7.5),
    { z: 9.5, rx: 2.3, cy: 2.95, up: 2.35, down: 2.35 },
    { z: 11.5, rx: 1.6, cy: 2.72, up: 1.78, down: 1.77 },
    { z: 12.9, rx: 0.8, cy: 2.52, up: 1.08, down: 1.07 },
    { z: 13.5, rx: 0.02, cy: 2.5, up: 0.03, down: 0.03 },
  ];
  loft(k, body, (i, f) => (i === 2 && (f === 0 || f === 1 || f === 3 || f === 4) ? cockpit : BELLY(f) ? belly : white));

  // The tail: the same tube cut off underneath along the ramp, then closed to a point behind it.
  const cut = (z: number, rx: number, up: number): Station => ({ z, rx, cy: C, up, down: R, floor: rampLine(z) });
  const tail: Station[] = [
    { z: -14, rx: 0.02, cy: 4.9, up: 0.03, down: 0.03 },
    { z: -13.3, rx: 1.4, cy: 4.72, up: 0.62, down: 0.55 },
    cut(RAMP_END, 2.25, 2.42), cut(-11.5, 2.35, 2.45), cut(-9, 2.5, 2.52), cut(-7, R, R), cut(PLANE.hinge, R, R),
  ];
  loft(k, tail, (i, f) => (i >= 2 && UNDER(f) ? null : BELLY(f) ? belly : white));
  // The sill under the hinge, closing the belly off below the hold's floor.
  const sill = [6, 7, 8, 9, 10, 11].map((c) => corner(full(PLANE.hinge), c));
  const edge = (a: V3, b: V3): [number, number] => [a[0] + ((b[0] - a[0]) * (PLANE.floor - a[1])) / (b[1] - a[1]), PLANE.floor];
  const shape = new THREE.Shape([edge(sill[0], sill[1]), ...sill.slice(1, 5).map(([x, y]) => [x, y] as [number, number]), edge(sill[5], sill[4])].map(([x, y]) => new THREE.Vector2(x, y)));
  k.add(belly, new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }), 0, 0, PLANE.hinge - 0.04);

  // The inside of the hold and of the tail over the ramp: dark walls facing inward, so the
  // open ramp shows a hold to drive into and not the sky through the far skin. It is one
  // room, with no wall between the two, so the truck is seen all the way in.
  {
    const [w, f, t, h, b] = [PLANE.holdHalf + 0.02, PLANE.floor, C + 1.75, PLANE.hinge, PLANE.bulkhead];
    const [r, wb, wt, yb, yt] = [RAMP_END + 0.1, 1.5, 0.9, rampLine(RAMP_END + 0.1), 5];
    k.add(lambert(PALETTE.void), faces([
      // The hold: bulkhead, left wall, right wall, roof.
      [[-w, f, b], [-w, t, b], [w, t, b], [w, f, b]],
      [[w, f, h], [w, f, b], [w, t, b], [w, t, h]],
      [[-w, f, b], [-w, f, h], [-w, t, h], [-w, t, b]],
      [[-w, t, h], [w, t, h], [w, t, b], [-w, t, b]],
      // The tail over the ramp, narrowing to its end: end wall, roof, left, right.
      [[-wb, yb, r], [wb, yb, r], [wt, yt, r], [-wt, yt, r]],
      [[-wt, yt, r], [wt, yt, r], [w, t, h], [-w, t, h]],
      [[wb, yb, r], [w, f, h], [w, t, h], [wt, yt, r]],
      [[-wb, yb, r], [-wt, yt, r], [-w, t, h], [-w, f, h]],
    ]), 0, 0, 0);
  }
  // The hold's floor, with tie-down rails.
  k.box(lambert(PALETTE.concreteDark), PLANE.holdHalf * 2, 0.04, PLANE.bulkhead - PLANE.hinge, 0, PLANE.floor + 0.02, (PLANE.bulkhead + PLANE.hinge) / 2);
  for (const s of [1, -1]) k.box(lambert(PALETTE.hazardYellow), 0.1, 0.05, PLANE.bulkhead - PLANE.hinge - 0.4, s * (PLANE.holdHalf - 0.2), PLANE.floor + 0.03, (PLANE.bulkhead + PLANE.hinge) / 2);

  // Cabin windows, lit after dark; under them a gold line over a teal band, nose to tail.
  for (const s of [1, -1]) {
    for (let z = -3.6; z <= 6.4; z += 1.65) k.box(glass, 0.05, 0.62, 0.5, s * (SIDE + 0.005), 3.3, z);
    k.box(gold, 0.04, 0.09, 15.5, s * (SIDE + 0.004), 2.76, -0.25);
    k.box(stripe, 0.04, 0.3, 15.5, s * (SIDE + 0.004), 2.52, -0.25);
  }

  // Wings: low, swept and tapered, tips up a little, each ending in a winglet.
  const [SPAN, ROOT, DIHEDRAL] = [PLANE.span / 2, 2.2, 0.95];
  for (const s of [1, -1]) {
    k.add(white, hexa((sx, sy, sz) => {
      const tip = sx * s > 0;
      const y = (tip ? 1.25 + DIHEDRAL : 1.25) + sy * (tip ? 0.09 : 0.27);
      return [s * (tip ? SPAN : ROOT), y, tip ? (sz > 0 ? -4.3 : -6.3) : sz > 0 ? 3.2 : -2.4];
    }), 0, 0, 0);
    // The winglet leans out and back; its outer face carries the tail's colour.
    k.add(white, hexa((sx, sy, sz) => {
      const top = sy > 0;
      return [s * (SPAN + (top ? 0.42 : 0) + sx * s * 0.07), 1.25 + DIHEDRAL + (top ? 1.7 : -0.08), top ? (sz > 0 ? -5.7 : -6.6) : sz > 0 ? -4.4 : -6.3];
    }), 0, 0, 0);
    k.add(stripe, hexa((sx, sy, sz) => {
      const top = sy > 0;
      return [s * (SPAN + (top ? 0.42 : 0.2) + (sx * s > 0 ? 0.085 : 0.06)), 1.25 + DIHEDRAL + (top ? 1.66 : 0.75), top ? (sz > 0 ? -5.75 : -6.55) : sz > 0 ? -5.0 : -6.42];
    }), 0, 0, 0);
  }
  // The fairing where the wings meet under the cabin; the wheels fold up into it.
  k.add(belly, hexa((sx, sy, sz) => [sx * (sy > 0 ? 2.7 : 2.2), sy > 0 ? 1.5 : 0.42, sz * (sy > 0 ? 4.4 : 3.6) + 0.3]), 0, 0, 0);

  // Engines: two nacelles on stub pylons, high on the rear fuselage.
  const [EX, EY, EZ, ER, EL] = [3.55, 4.85, -8.4, 0.98, 4.3];
  for (const s of [1, -1]) {
    k.cyl(white, ER, EL, s * EX, EY, EZ, Math.PI / 2, 0, 12);
    k.cyl(chrome, ER + 0.05, 0.3, s * EX, EY, EZ + EL / 2 - 0.1, Math.PI / 2, 0, 12);
    k.cyl(dark, ER - 0.14, 0.1, s * EX, EY, EZ + EL / 2 + 0.01, Math.PI / 2, 0, 12);
    k.add(dark, new THREE.ConeGeometry(0.42, 0.8, 8), s * EX, EY, EZ + EL / 2 + 0.3, Math.PI / 2);
    k.add(lambert(tone(PALETTE.jetIntake, 1.5)), new THREE.CylinderGeometry(ER - 0.06, 0.62, 0.9, 12), s * EX, EY, EZ - EL / 2 - 0.4, Math.PI / 2);
    k.cyl(dark, 0.58, 0.06, s * EX, EY, EZ - EL / 2 - 0.84, Math.PI / 2, 0, 12);
    k.box(stripe, 0.05, 0.5, EL - 1.2, s * (EX + ER * 0.98), EY, EZ);
    k.add(white, hexa((sx, sy, sz) => [s * (sx * s > 0 ? EX - ER + 0.1 : 1.5), EY + sy * 0.2, EZ + sz * (sx * s > 0 ? 1.2 : 1.7)]), 0, 0, 0);
  }

  // The T-tail: a swept fin in the tail's colour over a white root, and the tailplane on top of it.
  const [FB, FT] = [5.25, 10.2];
  k.add(white, hexa((sx, sy, sz) => {
    const top = sy > 0;
    return [sx * (top ? 0.15 : 0.22), top ? 6.6 : FB, top ? (sz > 0 ? -9.6 : -13.9) : sz > 0 ? -8.2 : -13.5];
  }), 0, 0, 0);
  k.add(stripe, hexa((sx, sy, sz) => {
    const top = sy > 0;
    return [sx * (top ? 0.1 : 0.15), top ? FT : 6.6, top ? (sz > 0 ? -12.6 : -15.0) : sz > 0 ? -9.6 : -13.9];
  }), 0, 0, 0);
  k.add(gold, hexa((sx, sy, sz) => [sx * 0.17, 6.6 + sy * 0.07, sz > 0 ? -9.55 : -13.95]), 0, 0, 0);
  for (const s of [1, -1]) {
    k.add(white, hexa((sx, sy, sz) => {
      const tip = sx * s > 0;
      return [s * (tip ? 4.9 : 0), FT + 0.05 + sy * (tip ? 0.05 : 0.11), tip ? (sz > 0 ? -14.7 : -15.9) : sz > 0 ? -12.3 : -15.1];
    }), 0, 0, 0);
  }
  k.add(stripe, new THREE.ConeGeometry(0.2, 1.3, 6), 0, FT + 0.06, -12.0, Math.PI / 2);

  k.build(root);

  // The ramp, hinged along the back of the hold's floor: a dark deck with treads over a belly-coloured skin.
  const ramp = new THREE.Group();
  ramp.position.set(0, PLANE.floor, PLANE.hinge);
  const rk = new Kit();
  const [W0, W1, L] = [SIDE * Math.SQRT1_2 * (R / SIDE) * 0.985, 1.57, PLANE.ramp];
  rk.add(belly, hexa((sx, sy, sz) => [sx * (sz < 0 ? W1 : W0), sy > 0 ? -0.03 : -0.15, sz < 0 ? -L : 0]), 0, 0, 0);
  rk.add(lambert(PALETTE.roofSlate), hexa((sx, sy, sz) => [sx * ((sz < 0 ? W1 : W0) - 0.04), sy > 0 ? 0 : -0.03, sz < 0 ? -L : 0]), 0, 0, 0);
  for (let d = 0.5; d < L - 0.2; d += 0.62) rk.box(dark, 2 * (W0 + ((W1 - W0) * d) / L) - 0.5, 0.025, 0.1, 0, 0.012, -d);
  for (const s of [1, -1]) rk.add(lambert(PALETTE.hazardYellow), hexa((sx, sy, sz) => [s * ((sz < 0 ? W1 : W0) - (sx * s > 0 ? 0.05 : 0.2)), sy > 0 ? 0.014 : 0, sz < 0 ? -L + 0.05 : -0.05]), 0, 0, 0);
  rk.build(ramp);
  root.add(ramp);

  // Wheels: a nose leg and two main legs, each a strut and a pair of tyres, folding back and up.
  const legs = [[0, 0.38, 9.8, 0.2], [2.25, 0.5, -0.9, 0.3], [-2.25, 0.5, -0.9, 0.3]].map(([x, r, z, gap]) => {
    const leg = new THREE.Group();
    const top = 1.1;
    leg.position.set(x, top, z);
    const lk = new Kit();
    lk.cyl(chrome, 0.09, top - r, 0, -(top - r) / 2, 0, 0, 0, 6);
    for (const s of [1, -1]) {
      lk.cyl(tyre, r, 0.22, s * gap, r - top, 0, 0, Math.PI / 2, 12);
      lk.cyl(lambert(PALETTE.rim), r * 0.5, 0.24, s * gap, r - top, 0, 0, Math.PI / 2, 8);
    }
    lk.build(leg);
    root.add(leg);
    return leg;
  });

  // Lights: red on the left tip and green on the right, a white one on the tail, a beacon on the roof.
  const glow = (color: string) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4, flatShading: true });
  const mats = { red: glow(PALETTE.navRed), green: glow(PALETTE.navGreen), white: glow(PALETTE.headlight), beacon: glow(PALETTE.navRed) };
  const lamp = (m: THREE.Material, x: number, y: number, z: number, size = 0.16) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), m);
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  lamp(mats.red, SPAN + 0.3, 1.25 + DIHEDRAL + 0.9, -5.3);
  lamp(mats.green, -SPAN - 0.3, 1.25 + DIHEDRAL + 0.9, -5.3);
  lamp(mats.white, 0, 4.9, -14.05, 0.14);
  lamp(mats.beacon, 0, C + R + 0.08, 1.5, 0.18);
  for (const s of [1, -1]) lamp(mats.white, s * 2.1, 1.0, 3.5, 0.2);

  /** How far behind the origin the main wheels are: the plane pitches about them, not about its middle. */
  const MAIN = 0.9;
  return {
    object: root,
    pose(p) {
      root.position.set(p.x, p.y + Math.sin(Math.max(0, p.pitch)) * MAIN, p.z);
      root.rotation.set(-p.pitch, p.heading, 0);
    },
    setRamp(open) {
      ramp.rotation.x = RAMP_SHUT - (RAMP_SHUT + RAMP_DOWN) * open;
    },
    setGear(down) {
      for (const leg of legs) {
        leg.visible = down > 0.04;
        leg.rotation.x = (1 - down) * 1.45;
        leg.scale.setScalar(0.35 + 0.65 * down);
      }
    },
    update(time, night) {
      mats.red.emissiveIntensity = mats.green.emissiveIntensity = 0.5 + night * 2.4;
      mats.white.emissiveIntensity = 0.4 + night * 2.6;
      mats.beacon.emissiveIntensity = 0.25 + Math.max(0, Math.sin(time * 4.2)) ** 8 * (1.5 + night * 3);
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}

import * as THREE from "three";
import { FERRY, type FerryPose } from "./ferry";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";

/**
 * The car ferry between the island and Las Vegas (ADR 0023): a short double-ended boat,
 * a dark blue hull with red below the waterline, the car deck open down the middle with a
 * ramp hinged at each end, and along its left side a cabin with the wheelhouse and the
 * funnel on top. Its measurements are in ferry.ts.
 *
 * Ferry space: the origin on the waterline under the middle of the hull, +z toward the
 * end that's at the causeway when it's tied up, +x to the left of that.
 */
export type FerryModel = {
  object: THREE.Group;
  pose(p: FerryPose): void;
  /** Each ramp, 0 up and 1 down, and how far above the deck the ground is that its foot comes down on. */
  setRamps(near: number, far: number, nearRise: number, farRise: number): void;
  /** The masthead light, which blinks at night: `night` is 0 by day and 1 at full night. */
  update(time: number, night: number): void;
};

/** A block whose ends are rectangles: (width, bottom, top) at z0 and at z1. */
function block(w0: number, b0: number, t0: number, z0: number, w1: number, b1: number, t1: number, z1: number) {
  const c = (w: number, y: number, z: number, sx: number) => [sx * (w / 2), y, z];
  const v = [
    c(w0, b0, z0, -1), c(w0, b0, z0, 1), c(w0, t0, z0, 1), c(w0, t0, z0, -1),
    c(w1, b1, z1, -1), c(w1, b1, z1, 1), c(w1, t1, z1, 1), c(w1, t1, z1, -1),
  ];
  // Six faces, each two triangles, wound to face outward whichever way z1 lies from z0.
  const flip = z1 < z0;
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const pos: number[] = [];
  for (const [a, b, cc, d] of quads) {
    const tri = flip ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d];
    for (const i of tri) pos.push(...v[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

export function buildFerry(windows: THREE.Material, lamps: THREE.Material): FerryModel {
  const object = new THREE.Group();
  const hull = new THREE.Group();
  object.add(hull);
  const k = new Kit();
  const { length: L, beam: B, deck: D, draught: T, lane, ramp: R } = FERRY;
  const half = L / 2;
  const blue = lambert(PALETTE.ferry.hull), red = lambert(PALETTE.ferry.bottom), deck = lambert(PALETTE.ferry.deck);
  const white = lambert(PALETTE.ferry.house), rail = lambert(PALETTE.ferry.rail), dark = lambert(PALETTE.doorDark);

  // The hull: straight sides amidships, each end drawn in and raked up, red to just over the waterline.
  const body = FERRY.body;
  k.box(blue, B, D + 0.3, body * 2, 0, D / 2 - 0.15 + 0.15, 0);
  k.box(red, B - 0.1, T + 0.25, body * 2, 0, -T / 2 + 0.12, 0);
  for (const s of [1, -1]) {
    k.add(blue, block(B, 0.1, D + 0.15, s * body, B * 0.8, 0.5, D + 0.15, s * half), 0, 0, 0);
    k.add(red, block(B - 0.1, -T, 0.25, s * body, B * 0.72, -0.4, 0.5, s * (half - 0.6)), 0, 0, 0);
  }
  // A white band round the top of the hull, and the bulwarks along both sides of the deck.
  for (const s of [1, -1]) {
    k.box(rail, 0.18, 0.9, body * 2 + 6, s * (B / 2 - 0.25), D + 0.6, 0);
    k.box(white, 0.06, 0.25, body * 2, s * (B / 2 + 0.01), D - 0.05, 0);
  }
  // The car deck, with its lane marked out.
  k.box(deck, B - 0.6, 0.12, L - 0.6, 0, D + 0.02, 0);
  for (const x of [-lane, lane]) for (let z = -half + 2; z < half - 2; z += 2.4) k.box(rail, 0.12, 0.02, 1.3, x, D + 0.09, z);

  // The cabin along the left, the wheelhouse on it, and the funnel behind that.
  const cx = (lane + 0.4 + B / 2 - 0.3) / 2;
  const cw = B / 2 - 0.3 - (lane + 0.4);
  k.box(white, cw, 2.5, 22, cx, D + 1.3, 0);
  for (let z = -9.5; z <= 9.6; z += 1.6) k.box(windows, 0.06, 0.8, 1.0, lane + 0.37, D + 1.7, z);
  for (let z = -9.5; z <= 9.6; z += 1.6) k.box(windows, 0.06, 0.8, 1.0, B / 2 - 0.27, D + 1.7, z);
  k.box(white, cw + 0.4, 0.2, 22.4, cx, D + 2.6, 0);
  const wy = D + 2.7;
  k.box(white, 3.6, 2.2, 4.4, cx - 0.4, wy + 1.1, 0);
  for (const s of [1, -1]) k.box(windows, 3.3, 0.8, 0.06, cx - 0.4, wy + 1.5, s * 2.21);
  for (const s of [1, -1]) k.box(windows, 0.06, 0.8, 3.8, cx - 0.4 + s * 1.81, wy + 1.5, 0);
  k.box(dark, 4.0, 0.2, 4.8, cx - 0.4, wy + 2.3, 0);
  k.cyl(lambert(PALETTE.ferry.funnel), 0.55, 2.2, cx + 0.3, wy + 1.1, 4.0, 0, 0, 10);
  k.cyl(dark, 0.57, 0.35, cx + 0.3, wy + 2.1, 4.0, 0, 0, 10);
  // A mast on the wheelhouse, with a radar bar.
  k.cyl(dark, 0.06, 2.4, cx - 0.4, wy + 3.5, 0, 0, 0, 6);
  k.box(dark, 1.4, 0.08, 0.2, cx - 0.4, wy + 3.9, 0);
  // Life rings along the cabin, and rails round its roof.
  const buoy = lambert(PALETTE.ferry.buoy);
  for (const z of [-8, -3, 5, 9]) k.add(buoy, new THREE.TorusGeometry(0.32, 0.08, 5, 10).rotateY(Math.PI / 2), B / 2 - 0.2, D + 1.9, z);
  for (const z of [-11, 11]) k.box(rail, cw + 0.4, 0.5, 0.05, cx, D + 2.95, z);
  k.build(hull);

  // The masthead light.
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lamps);
  light.position.set(cx - 0.4, wy + 4.75, 0);
  hull.add(light);

  // The ramps: a slab and its ribs each, hinged at an end of the deck.
  const ramps = [1, -1].map((s) => {
    const g = new THREE.Group();
    g.position.set(0, D, s * (half - 0.2));
    const rk = new Kit();
    const steel = lambert(PALETTE.ferry.ramp);
    rk.box(steel, lane * 2, 0.22, R, 0, 0, (s * R) / 2);
    for (let z = 0.5; z < R; z += 0.6) rk.box(lambert(tone(PALETTE.ferry.ramp, 0.8)), lane * 2 - 0.4, 0.06, 0.1, 0, 0.13, s * z);
    for (const x of [-lane, lane]) rk.box(rail, 0.12, 0.5, R, x, 0.3, (s * R) / 2);
    rk.build(g);
    hull.add(g);
    return { g, s };
  });

  return {
    object,
    pose(p) {
      object.position.set(p.x, p.y, p.z);
      object.rotation.set(-p.pitch, p.heading, p.roll, "YXZ");
    },
    setRamps(near, far, nearRise, farRise) {
      [near, far].forEach((t, i) => {
        const { g, s } = ramps[i];
        // Up, it stands nearly upright against the end of the deck; down, it rests on whatever is at its foot.
        const up = 1.35;
        const down = Math.atan2(i ? farRise : nearRise, R);
        const a = up + (down - up) * t;
        g.rotation.x = -s * a;
      });
    },
    update(time, night) {
      // The masthead light is the shared lamps' glow; at night it blinks slowly as well.
      light.visible = night < 0.2 || Math.sin(time * 1.6) > -0.6;
    },
  };
}

/**
 * A solid of stone along z: its top `w` either side of the middle at each sample's height,
 * its sides and end straight down to `bottom`. Samples go from the shore out.
 */
function stoneStrip(w: number, samples: [number, number][], bottom: number) {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 1; i < samples.length; i++) {
    const [z0, y0] = samples[i - 1];
    const [z1, y1] = samples[i];
    quad([-w, y0, z0], [-w, y1, z1], [w, y1, z1], [w, y0, z0]);
    quad([w, y0, z0], [w, y1, z1], [w, bottom, z1], [w, bottom, z0]);
    quad([-w, bottom, z0], [-w, bottom, z1], [-w, y1, z1], [-w, y0, z0]);
  }
  const [zEnd, yEnd] = samples[samples.length - 1];
  quad([-w, yEnd, zEnd], [-w, bottom, zEnd], [w, bottom, zEnd], [w, yEnd, zEnd]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The causeway (ADR 0023): its stone top, square-ended over the water, and its road, as the
 * physics has them (`causewayTop` in dock.ts); bollards along both edges of the road, lamps
 * at its end, and the box painted where a truck waits for the ferry. In dock space, its y
 * the road's height out over the water: the caller turns and places it. `rise` is the road's
 * height `lz` out along it, against that; `depth` how far down to build the stone.
 */
export function buildCausewayDressing(lamps: THREE.Material, length: number, half: number, top: number, waitAt: number, rise: (lz: number) => number, depth: number) {
  const object = new THREE.Group();
  const k = new Kit();
  const bollard = lambert(PALETTE.ferry.bollard), paint = lambert(PALETTE.runwayPaint);
  const samples: [number, number][] = [];
  for (let lz = 0; lz < length; lz += 2) samples.push([lz, rise(lz)]);
  samples.push([length, rise(length)]);
  k.add(lambert(PALETTE.ferry.stone[0]), stoneStrip(top, samples, -depth), 0, 0, 0);
  k.add(lambert(PALETTE.ferry.road), stoneStrip(half, samples.map(([z, y]) => [z, y + 0.03]), -0.2), 0, 0, 0);
  for (let z = 6; z < length; z += 8) for (const s of [1, -1]) k.cyl(bollard, 0.22, 0.75, s * (half + 0.6), rise(z) + 0.37, z, 0, 0, 8);
  // The waiting box, out near the end.
  for (const s of [1, -1]) k.box(paint, 0.2, 0.03, 9, s * 2.4, 0.05, waitAt);
  for (const z of [waitAt - 4.5, waitAt + 4.5]) k.box(paint, 5, 0.03, 0.2, 0, 0.05, z);
  // Two lamps at the end, a post each.
  for (const s of [1, -1]) {
    k.cyl(bollard, 0.08, 5.4, s * (half + 0.6), 2.7, length - 3, 0, 0, 6);
    k.box(bollard, 0.6, 0.12, 0.2, s * (half + 0.35), 5.35, length - 3);
  }
  k.build(object);
  for (const s of [1, -1]) {
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.18), lamps);
    bulb.position.set(s * (half + 0.2), 5.25, length - 3);
    object.add(bulb);
  }
  const colliders = [1, -1].map((s) => ({ x: s * (half + 0.6), z: length - 3, r: 0.25 }));
  for (let z = 6; z < length; z += 8) for (const s of [1, -1]) colliders.push({ x: s * (half + 0.6), z, r: 0.3 });
  return { object, colliders };
}

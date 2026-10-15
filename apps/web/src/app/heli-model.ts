import * as THREE from "three";
import { paved } from "./airport-model";
import { Kit, lambert } from "./garages";
import { HELI, PAD, type HeliPose, type Pad, type Vec } from "./heli";
import { PALETTE } from "./palette";

/**
 * The helicopter between Vegas and Japan (ADR 0024): a heavy-lift crane, orange and white.
 * A glazed cab hung low at the front, a long spine back from it with an open bay under it
 * for the cable, two engines on top, six main blades and a tail rotor that spin up and down
 * with the film, and long legs to stand on. Its measurements are in heli.ts.
 *
 * Helicopter space: the origin under the middle of the spine, at its belly, +z the nose,
 * +x the left side. The cable, its hook and the slings hang straight down whatever the
 * helicopter is doing, so they're drawn in world space, apart from it.
 */
export type HeliModel = {
  object: THREE.Group;
  /** The cable, the hook and the slings, in world space. */
  rigging: THREE.Group;
  pose(p: HeliPose): void;
  /** The hook at `hook`, and the slings from it to the four points a truck hangs by, if it's hooked. */
  rig(hook: Vec, corners: readonly THREE.Vector3[] | null): void;
  /** Turns the rotors on by `dt` seconds at `speed`, 0 stopped to 1 flying. */
  spin(speed: number, dt: number): void;
  /** The lamps on its tail and its belly. */
  update(time: number, night: number): void;
};

/** How high over the belly the main rotor turns. */
const MAST = 3.6;

export function buildHeli(): HeliModel {
  const object = new THREE.Group();
  const k = new Kit();
  const orange = lambert(PALETTE.heli.body), white = lambert(PALETTE.heli.white), glass = lambert(PALETTE.heli.glass);
  const dark = lambert(PALETTE.heli.rotor), leg = lambert(PALETTE.doorDark);

  // The cab: hung low at the front, glazed round the top and across a rounded nose.
  k.box(orange, 2.4, 2.6, 3.6, 0, 0.3, 7.6);
  k.box(glass, 2.46, 1.0, 2.7, 0, 1.0, 7.9);
  k.box(white, 2.46, 0.3, 3.62, 0, -0.35, 7.6);
  k.add(glass, new THREE.SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(0.92, 1, 0.75), 0, 0.3, 9.4);
  // The spine: a long beam back from the cab, its underside the belly the cable hangs from.
  k.box(orange, 1.7, 1.8, 13, 0, 0.9, -0.6);
  k.box(white, 1.74, 0.25, 13.02, 0, 0.2, -0.6);
  // Two engines on top, side by side, their exhausts at the back; the mast between them.
  for (const s of [1, -1]) {
    k.cyl(white, 0.55, 4.2, s * 0.78, 2.3, 1.2, Math.PI / 2, 0, 10);
    k.cyl(dark, 0.42, 0.12, s * 0.78, 2.3, -0.95, Math.PI / 2, 0, 10);
  }
  k.cyl(dark, 0.26, 1.2, 0, MAST - 0.6, 0, 0, 0, 8);
  // The tail boom, tapering back to a fin with a tailplane across it.
  k.add(orange, new THREE.CylinderGeometry(0.75, 0.38, 7.4, 8).rotateX(-Math.PI / 2), 0, 1.0, -10.6);
  k.box(orange, 0.25, 3.0, 2.0, 0, 2.3, -13.9, -0.3);
  k.box(white, 0.27, 0.5, 2.02, 0, 3.3, -14.2, -0.3);
  k.box(white, 3.0, 0.16, 0.9, 0, 1.1, -13.2);
  // The legs: long struts out to a wheel either side, and one under the nose.
  for (const s of [1, -1]) {
    const wheel = [s * 2.9, -HELI.belly + 0.45, -2.4];
    k.strut(leg, [s * 0.8, 0.1, -1.2], wheel, 0.18);
    k.strut(leg, [s * 0.8, 0.1, -3.8], wheel, 0.14);
    k.strut(leg, [s * 0.8, 1.2, -2.4], wheel, 0.12);
    k.cyl(dark, 0.45, 0.32, wheel[0], wheel[1], wheel[2], 0, Math.PI / 2, 10);
  }
  k.strut(leg, [0, -0.9, 7.0], [0, -HELI.belly + 0.35, 7.3], 0.16);
  k.cyl(dark, 0.35, 0.26, 0, -HELI.belly + 0.35, 7.3, 0, Math.PI / 2, 10);
  k.build(object);
  // A red light on the fin, a white one under the cab.
  const red = new THREE.MeshLambertMaterial({ color: PALETTE.navRed, emissive: PALETTE.navRed, emissiveIntensity: 0.4 });
  const belly = new THREE.MeshLambertMaterial({ color: PALETTE.jetWhite, emissive: PALETTE.jetWhite, emissiveIntensity: 0.4 });
  for (const [m, x, y, z] of [[red, 0, 3.75, -14.5], [belly, 0, -1.05, 8.2]] as const) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m);
    light.position.set(x, y, z);
    object.add(light);
  }

  // The main rotor: six blades on a hub, turning about the mast; a faint disc where they blur.
  const rotor = new THREE.Group();
  const rk = new Kit();
  rk.cyl(dark, 0.55, 0.4, 0, 0, 0, 0, 0, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rk.box(dark, 0.62, 0.08, HELI.rotor, Math.sin(a) * (HELI.rotor / 2), 0, Math.cos(a) * (HELI.rotor / 2), 0, a);
  }
  rk.build(rotor);
  rotor.position.set(0, MAST, 0);
  object.add(rotor);
  const blurMat = new THREE.MeshBasicMaterial({ color: PALETTE.heli.rotor, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(HELI.rotor, 40).rotateX(-Math.PI / 2), blurMat);
  blur.position.set(0, MAST, 0);
  blur.visible = false;
  object.add(blur);
  // The tail rotor, on the fin's left, turning across it.
  const tail = new THREE.Group();
  const tk = new Kit();
  for (let i = 0; i < 2; i++) tk.box(dark, 0.06, 3.0, 0.24, 0, 0, 0, (i * Math.PI) / 2, 0, 0);
  tk.build(tail);
  tail.position.set(0.32, 2.6, -14.0);
  object.add(tail);

  // The rigging: the cable from the belly to the hook, and four slings from the hook to a truck.
  const rigging = new THREE.Group();
  const points = new Float32Array(10 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: PALETTE.heli.cable }));
  lines.frustumCulled = false;
  rigging.add(lines);
  const hookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.3), lambert(PALETTE.heli.hook));
  hookMesh.castShadow = true;
  rigging.add(hookMesh);
  const top = new THREE.Vector3();

  let angle = 0;
  let tailAngle = 0;
  return {
    object,
    rigging,
    pose(p) {
      object.position.set(p.x, p.y, p.z);
      object.rotation.set(-p.pitch, p.heading, p.roll, "YXZ");
      object.updateMatrixWorld();
    },
    rig(hook, corners) {
      top.set(0, 0, 0).applyMatrix4(object.matrixWorld);
      const put = (i: number, x: number, y: number, z: number) => points.set([x, y, z], i * 3);
      put(0, top.x, top.y, top.z);
      put(1, hook.x, hook.y + 0.3, hook.z);
      corners?.forEach((c, i) => {
        put(2 + i * 2, hook.x, hook.y - 0.25, hook.z);
        put(3 + i * 2, c.x, c.y, c.z);
      });
      lineGeo.setDrawRange(0, corners ? 10 : 2);
      lineGeo.attributes.position.needsUpdate = true;
      hookMesh.position.set(hook.x, hook.y, hook.z);
      hookMesh.rotation.y = object.rotation.y;
    },
    spin(speed, dt) {
      angle += speed * 20 * dt;
      tailAngle += speed * 55 * dt;
      rotor.rotation.y = angle;
      tail.rotation.x = tailAngle;
      // Fast, the blades are a blur: the disc fades in as they go.
      blurMat.opacity = Math.max(0, speed - 0.45) * 0.26;
      blur.visible = blurMat.opacity > 0;
      rotor.visible = speed < 0.8;
    },
    update(time, night) {
      // The red light on the fin flashes; both glow brighter at night.
      red.emissiveIntensity = (0.4 + night * 2) * (Math.sin(time * 4) > 0.3 ? 1 : 0.15);
      belly.emissiveIntensity = 0.3 + night * 1.6;
    },
  };
}

/**
 * A pad's paving: the circle a truck waits on, painted with its ring and an H, and the
 * helicopter's own spot beside it. Pad space, laid flat on the levelled ground at the pad.
 */
export function buildPadMarks(p: Pad) {
  const k = new Kit();
  const slab = paved(PALETTE.heli.pad, 1), paint = paved(PALETTE.heli.padPaint, 2), yellow = paved(PALETTE.hazardYellow, 2);
  const disc = (m: THREE.Material, r0: number, r1: number, x: number, z: number) =>
    k.add(m, (r0 > 0 ? new THREE.RingGeometry(r0, r1, 48) : new THREE.CircleGeometry(r1, 48)).rotateX(-Math.PI / 2), x, 0.03, z);
  const s = { x: PAD.stand, z: 0 };
  disc(slab, 0, PAD.radius + 2, 0, 0);
  disc(slab, 0, 10, s.x, s.z);
  k.box(slab, PAD.stand - PAD.radius - 4, 0.02, 7, (PAD.stand + PAD.radius) / 2, 0.01, 0);
  disc(paint, PAD.radius - 0.7, PAD.radius, 0, 0);
  disc(yellow, 8.3, 8.8, s.x, s.z);
  // The H, along the way the helicopter comes in.
  for (const x of [2.6, -2.6]) k.box(paint, 1.2, 0.04, 8.5, x, 0.045, 0);
  k.box(paint, 4.0, 0.04, 1.2, 0, 0.045, 0);
  const group = k.build(new THREE.Group());
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  group.position.set(p.x, p.y, p.z);
  group.rotation.y = p.heading;
  return group;
}

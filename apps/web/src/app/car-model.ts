import * as THREE from "three";
import { PALETTE } from "./palette";
import { RIDE, TRACK, TRAVEL, WHEELBASE, wheelGround, type Car } from "./physics";
import type { Ground } from "./world";

const WHEEL_R = 0.42;
/** Wheel centre below the body centre when the suspension is at rest. */
const MOUNT_Y = WHEEL_R - RIDE;

/**
 * A boxy 60s–80s overlander built from primitives: red body, cream roof, roof rack
 * with luggage, spare on the back. Origin is the body centre; it faces +z.
 */
export function buildCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.rotation.order = "YXZ";

  const mat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const paint = mat(PALETTE.carBody);
  const roof = mat(PALETTE.carRoof);
  const glass = mat(PALETTE.carGlass);
  const trim = mat(PALETTE.carTrim);
  const lamp = mat(PALETTE.headlight, { emissive: PALETTE.headlight, emissiveIntensity: 0.6 });

  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };

  // Lower body, bonnet and cabin.
  box(paint, 1.9, 0.78, 4.3, 0, -0.12, 0);
  box(paint, 1.84, 0.18, 1.5, 0, 0.33, 1.35);
  box(paint, 1.84, 0.82, 2.7, 0, 0.66, -0.55);
  box(roof, 1.88, 0.08, 2.74, 0, 1.11, -0.55);
  // Glass bands: windscreen, sides, rear.
  box(glass, 1.66, 0.52, 0.06, 0, 0.72, 0.8);
  box(glass, 1.86, 0.48, 2.3, 0, 0.74, -0.6);
  box(glass, 1.6, 0.46, 0.06, 0, 0.74, -1.91);
  // Bumpers, bull bar, arches.
  box(trim, 2.0, 0.22, 0.2, 0, -0.4, 2.2);
  box(trim, 2.0, 0.22, 0.2, 0, -0.4, -2.2);
  box(trim, 1.2, 0.5, 0.08, 0, -0.06, 2.26);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) box(trim, 0.12, 0.2, 1.1, sx * 0.97, -0.24, sz * (WHEELBASE / 2));
    box(lamp, 0.3, 0.2, 0.06, sx * 0.62, 0.05, 2.17);
  }
  // Snorkel.
  box(trim, 0.12, 1.0, 0.12, 0.98, 0.55, 0.65);
  // Roof rack and luggage.
  box(trim, 1.7, 0.06, 2.3, 0, 1.25, -0.55);
  box(new THREE.MeshLambertMaterial({ color: PALETTE.luggage[0], flatShading: true }), 0.8, 0.4, 0.9, -0.38, 1.48, -0.05);
  box(new THREE.MeshLambertMaterial({ color: PALETTE.luggage[1], flatShading: true }), 0.7, 0.34, 0.8, 0.4, 1.45, -0.25);
  box(new THREE.MeshLambertMaterial({ color: PALETTE.luggage[2], flatShading: true }), 1.4, 0.3, 0.55, 0, 1.43, -1.25);
  // Spare wheel on the back door.
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), mat(PALETTE.tyre));
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 0.25, -2.3);
  spare.castShadow = true;
  body.add(spare);

  // Wheels hang off the root, not the body, so they can follow the ground on their own.
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.34, 14);
  tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.36, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const tyreMat = mat(PALETTE.tyre);
  const rimMat = mat(PALETTE.rim);
  const wheels = [
    [TRACK / 2, WHEELBASE / 2],
    [-TRACK / 2, WHEELBASE / 2],
    [TRACK / 2, -WHEELBASE / 2],
    [-TRACK / 2, -WHEELBASE / 2],
  ].map(([x, z]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, MOUNT_Y, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(rimGeo, rimMat));
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, x, z };
  });

  let rolled = 0;

  /** Poses the model from the physics state. `dt` is the frame time, for wheel spin. */
  function update(car: Car, ground: Ground, dt: number) {
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(-car.pitch, car.heading, car.roll);
    rolled += (car.speed * dt) / WHEEL_R;

    const under = wheelGround(car, ground);
    wheels.forEach((w, i) => {
      // Where the body would put this wheel at rest, versus where the ground is.
      const mount = car.y + MOUNT_Y + Math.sin(car.pitch) * w.z + Math.sin(car.roll) * w.x;
      const reach = under[i] + WHEEL_R - mount;
      w.pivot.position.y = MOUNT_Y + (car.grounded ? Math.max(-TRAVEL, Math.min(0.3, reach)) : -TRAVEL * 0.8);
      w.pivot.rotation.y = i < 2 ? car.steer : 0;
      w.spin.rotation.x = rolled;
    });
  }

  return { object: root, update };
}

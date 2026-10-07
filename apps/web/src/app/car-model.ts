import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";
import { RIDE, TRACK, TRAVEL, WHEELBASE, wheelGround, type Car, type CarSpec } from "./physics";
import { lightsOf, paintOf, snorkelOf, tyresOf, type Loadout, type Tyre } from "./upgrades";
import type { Ground } from "./world";

/** A tyre, with chunky lugs round the tread for the off-road sets. Axle along x. */
function tyreGeometry(t: Tyre) {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(t.radius, t.radius, t.width, t.lugs ? 10 : 14).deleteAttribute("uv")];
  for (let i = 0; i < t.lugs; i++) {
    const lug = new THREE.BoxGeometry(0.07, t.width * 0.92, t.radius * 0.3).deleteAttribute("uv");
    parts.push(lug.translate(t.radius, 0, 0).rotateY((i / t.lugs) * Math.PI * 2));
  }
  return mergeGeometries(parts).rotateZ(Math.PI / 2);
}

/** Half the distance between the wheels: wider and bigger tyres push them outward. */
const stance = (t: Tyre) => TRACK / 2 + (t.width - 0.34) / 2 + (t.radius - 0.42) * 0.6;

/**
 * A boxy 60s–80s overlander built from primitives: body, cream roof, roof rack with
 * luggage, spare on the back. Origin is the body centre; it faces +z. Everything a
 * garage can change — paint, tyres, lights, snorkel — is swapped by setLoadout.
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
  const lamp = mat(PALETTE.headlight, { emissive: PALETTE.headlight, emissiveIntensity: 0.4 });

  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
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
  // Roof rack and luggage.
  box(trim, 1.7, 0.06, 2.3, 0, 1.25, -0.55);
  box(mat(PALETTE.luggage[0]), 0.8, 0.4, 0.9, -0.38, 1.48, -0.05);
  box(mat(PALETTE.luggage[1]), 0.7, 0.34, 0.8, 0.4, 1.45, -0.25);
  box(mat(PALETTE.luggage[2]), 1.4, 0.3, 0.55, 0, 1.43, -1.25);
  // Spare wheel on the back door.
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), mat(PALETTE.tyre));
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 0.25, -2.3);
  spare.castShadow = true;
  body.add(spare);

  // Optional parts, shown or hidden by the loadout.
  const snorkel = new THREE.Group();
  box(trim, 0.12, 1.0, 0.12, 0.98, 0.55, 0.65, snorkel);
  box(trim, 0.2, 0.14, 0.26, 0.98, 1.1, 0.72, snorkel);
  body.add(snorkel);

  const fogLamps = new THREE.Group();
  for (const sx of [1, -1]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateX(Math.PI / 2), lamp);
    f.position.set(sx * 0.45, -0.4, 2.33);
    fogLamps.add(f);
  }
  body.add(fogLamps);

  const bar = new THREE.Group();
  box(mat(PALETTE.lightBar), 1.5, 0.16, 0.16, 0, 1.37, 0.62, bar);
  box(lamp, 1.36, 0.1, 0.04, 0, 1.37, 0.71, bar);
  body.add(bar);

  const ditch = new THREE.Group();
  for (const sx of [1, -1]) box(lamp, 0.14, 0.14, 0.1, sx * 0.9, 1.08, 0.84, ditch);
  body.add(ditch);

  // Two beams: low (headlights and driving lamps) and high (the bar). No shadows; too costly.
  const beam = (y: number, z: number) => {
    const light = new THREE.SpotLight(PALETTE.headlight, 0, 40, 0.45, 0.5, 1.6);
    light.position.set(0, y, z);
    light.target.position.set(0, y - 2.2, z + 20);
    body.add(light, light.target);
    return light;
  };
  const low = beam(0.05, 2.3);
  const high = beam(1.4, 0.8);

  // Wheels hang off the root, not the body, so they can follow the ground on their own.
  const tyreMat = mat(PALETTE.tyre);
  const rimMat = mat(PALETTE.rim);
  const wheels = [
    [TRACK / 2, WHEELBASE / 2],
    [-TRACK / 2, WHEELBASE / 2],
    [TRACK / 2, -WHEELBASE / 2],
    [-TRACK / 2, -WHEELBASE / 2],
  ].map(([x, z]) => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(undefined, tyreMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(undefined, rimMat);
    spin.add(tyre, rim);
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, tyre, rim, x, z };
  });

  let fitted = tyresOf({ paint: "", tyres: "", lights: "", snorkel: "" });
  let lights = lightsOf({ paint: "", tyres: "", lights: "", snorkel: "" });
  let mountY = 0;
  let glow = 0;

  function setLoadout(l: Loadout) {
    paint.color.set(paintOf(l).color);
    snorkel.visible = snorkelOf(l).fitted;
    lights = lightsOf(l);
    fogLamps.visible = lights.fogLamps;
    bar.visible = lights.bar;
    ditch.visible = lights.ditch;
    const t = tyresOf(l);
    if (t !== fitted || !wheels[0].tyre.geometry.getAttribute("position")) {
      fitted = t;
      const tyreGeo = tyreGeometry(t);
      const rimGeo = new THREE.CylinderGeometry(t.radius * 0.52, t.radius * 0.52, t.width + 0.02, 8).rotateZ(Math.PI / 2);
      for (const w of wheels) {
        w.tyre.geometry = tyreGeo;
        w.rim.geometry = rimGeo;
      }
    }
    // Wheel centre below the body centre at rest; bigger tyres lift the body, not sink the wheels.
    mountY = t.radius - (RIDE + t.lift);
    setLights(glow);
  }

  /** 0 = daylight (lamps barely glowing), 1 = full night (beams at full power). */
  function setLights(level: number) {
    glow = level;
    lamp.emissiveIntensity = 0.4 + level * 2.2;
    low.intensity = level * 260 * lights.power;
    low.distance = lights.reach * 1.4;
    low.angle = lights.spread;
    high.intensity = lights.bar ? level * 420 * lights.power : 0;
    high.distance = lights.reach * 1.8;
    high.angle = lights.spread * 0.8;
  }

  let rolled = 0;

  /** Poses the model from the physics state. `dt` is the frame time, for wheel spin. */
  function update(car: Car, ground: Ground, dt: number, spec: CarSpec) {
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(-car.pitch, car.heading, car.roll);
    rolled += (car.speed * dt) / fitted.radius;

    const under = wheelGround(car, ground, spec);
    wheels.forEach((w, i) => {
      // Where the body would put this wheel at rest, versus where the ground is.
      const mount = car.y + mountY + Math.sin(car.pitch) * w.z + Math.sin(car.roll) * w.x;
      const reach = under[i] + fitted.radius - mount;
      w.pivot.position.set(Math.sign(w.x) * stance(fitted), mountY + (car.grounded ? Math.max(-TRAVEL, Math.min(0.3, reach)) : -TRAVEL * 0.8), w.z);
      w.pivot.rotation.y = i < 2 ? car.steer : 0;
      w.spin.rotation.x = rolled;
    });
  }

  /** Rests the model level on flat ground at the origin, for the garage showroom. */
  function park() {
    root.position.set(0, RIDE + fitted.lift, 0);
    root.rotation.set(0, 0, 0);
    for (const w of wheels) {
      w.pivot.position.set(Math.sign(w.x) * stance(fitted), mountY, w.z);
      w.pivot.rotation.y = 0;
    }
  }

  return { object: root, update, setLoadout, setLights, park };
}

export type CarModel = ReturnType<typeof buildCar>;

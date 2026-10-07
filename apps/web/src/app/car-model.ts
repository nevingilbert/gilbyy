import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";
import { wheelGround, type Car, type CarSpec } from "./physics";
import { lightsOf, paintColour, snorkelOf, tyresOf, type Loadout } from "./shop";
import { buildVehicleBody } from "./vehicle-models";
import { vehicleById, type VehicleId } from "./vehicles";
import type { Ground } from "./world";

/** A tyre, with chunky lugs round the tread for the off-road sets. Axle along x. */
function tyreGeometry(radius: number, width: number, lugs: number) {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(radius, radius, width, lugs ? 10 : 14).deleteAttribute("uv")];
  for (let i = 0; i < lugs; i++) {
    const lug = new THREE.BoxGeometry(0.07, width * 0.92, radius * 0.3).deleteAttribute("uv");
    parts.push(lug.translate(radius, 0, 0).rotateY((i / lugs) * Math.PI * 2));
  }
  return mergeGeometries(parts).rotateZ(Math.PI / 2);
}

/**
 * One of the rigs from vehicles.ts, ready to drive: its body from vehicle-models.ts,
 * plus wheels, paint, extras and headlight beams that follow the fitted loadout.
 * Origin is the body centre; it faces +z. Used for your truck, other players', and the
 * one in the garage showroom.
 */
export function buildCar(vehicle: VehicleId) {
  const v = vehicleById(vehicle);
  const root = new THREE.Group();
  root.rotation.order = "YXZ";

  const paint = new THREE.MeshLambertMaterial({ color: PALETTE.paint[v.factoryPaint], flatShading: true });
  const lamp = new THREE.MeshLambertMaterial({ color: PALETTE.headlight, emissive: PALETTE.headlight, emissiveIntensity: 0.4, flatShading: true });
  const parts = buildVehicleBody(v, { paint, lamp });
  root.add(parts.body);

  // Two beams: low (headlights and driving lamps) and high (the bar). No shadows; too costly.
  const beam = (at: THREE.Vector3) => {
    const light = new THREE.SpotLight(PALETTE.headlight, 0, 40, 0.45, 0.5, 1.6);
    light.position.copy(at);
    light.target.position.set(at.x, at.y - 2.2, at.z + 20);
    parts.body.add(light, light.target);
    return light;
  };
  const low = beam(parts.beams.low);
  const high = beam(parts.beams.high);

  // Wheels hang off the root, not the body, so they can follow the ground on their own.
  const tyreMat = new THREE.MeshLambertMaterial({ color: PALETTE.tyre, flatShading: true });
  const rimMat = new THREE.MeshLambertMaterial({ color: PALETTE.rim, flatShading: true });
  const wheels = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ].map(([sx, sz]) => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(undefined, tyreMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(undefined, rimMat);
    spin.add(tyre, rim);
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, tyre, rim, sx, z: (sz * v.wheelbase) / 2 };
  });

  let radius = v.wheelRadius;
  let stance = v.track / 2;
  let mountY = v.wheelRadius - v.ride;
  let fittedTyres = "";
  let lights = lightsOf({ paint: "", tyres: "", lights: "", snorkel: "", winter: "" });
  let glow = 0;

  function setLoadout(l: Loadout) {
    paint.color.set(paintColour(vehicle, l));
    parts.extras.snorkel.visible = snorkelOf(l).fitted;
    lights = lightsOf(l);
    parts.extras.fogLamps.visible = lights.fogLamps;
    parts.extras.lightBar.visible = lights.bar;
    parts.extras.ditchLights.visible = lights.ditch;
    const t = tyresOf(l);
    radius = v.wheelRadius + t.radiusAdd;
    stance = v.track / 2 + (t.width - 0.32) / 2 + t.radiusAdd * 0.6;
    // Bigger tyres and their lift raise the body; the wheels hang that much lower under it.
    mountY = v.wheelRadius - v.ride - t.lift;
    if (t.id !== fittedTyres) {
      fittedTyres = t.id;
      const tyreGeo = tyreGeometry(radius, t.width, t.lugs);
      const rimGeo = new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, t.width + 0.02, 8).rotateZ(Math.PI / 2);
      for (const w of wheels) {
        w.tyre.geometry.dispose();
        w.rim.geometry.dispose();
        w.tyre.geometry = tyreGeo;
        w.rim.geometry = rimGeo;
      }
    }
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
    rolled += (car.speed * dt) / radius;

    const under = wheelGround(car, ground, spec);
    wheels.forEach((w, i) => {
      // Where the body would put this wheel at rest, versus where the ground is.
      const mount = car.y + mountY + Math.sin(car.pitch) * w.z + Math.sin(car.roll) * w.sx * stance;
      const reach = under[i] + radius - mount;
      // The arches clear the tyres by about 0.1 m, so that's as far as a wheel tucks up.
      const droop = car.grounded ? Math.max(-spec.travel, Math.min(0.1, reach)) : -spec.travel * 0.8;
      w.pivot.position.set(w.sx * stance, mountY + droop, w.z);
      w.pivot.rotation.y = i < 2 ? car.steer : 0;
      w.spin.rotation.x = rolled;
    });
  }

  /** Rests the model level on flat ground at the origin, for the garage showroom. */
  function park(spec: CarSpec) {
    root.position.set(0, spec.ride, 0);
    root.rotation.set(0, 0, 0);
    for (const w of wheels) {
      w.pivot.position.set(w.sx * stance, mountY, w.z);
      w.pivot.rotation.y = 0;
    }
  }

  function dispose() {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of [paint, lamp, tyreMat, rimMat]) m.dispose();
  }

  return { object: root, vehicle, top: parts.top, update, setLoadout, setLights, park, dispose };
}

export type CarModel = ReturnType<typeof buildCar>;

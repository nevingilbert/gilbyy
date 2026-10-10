import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";
import { wheelGround, type Car, type CarSpec } from "./physics";
import { STOCK_LOADOUT, lightsOf, paintColour, snorkelOf, tyresOf, winchOf, winterOf, type Loadout } from "./shop";
import { TOW_LOADOUT, TOW_RIG } from "./tow";
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

/** A winch for the front bumper (ADR 0021): a cradle, a drum of cable between two cheeks, and a hook. Faces +z from its mount. */
function buildWinch(dark: THREE.Material, cable: THREE.Material, hook: THREE.Material) {
  const winch = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    winch.add(mesh);
  };
  add(new THREE.BoxGeometry(0.66, 0.07, 0.3), dark, 0, 0, 0.11);
  add(new THREE.CylinderGeometry(0.085, 0.085, 0.34, 8).rotateZ(Math.PI / 2), cable, 0, 0.125, 0.11);
  for (const side of [1, -1]) add(new THREE.BoxGeometry(0.05, 0.24, 0.24), dark, side * 0.2, 0.125, 0.11);
  add(new THREE.BoxGeometry(0.3, 0.09, 0.04), dark, 0, 0.1, 0.27);
  add(new THREE.BoxGeometry(0.07, 0.11, 0.07), hook, 0, 0.07, 0.31);
  return winch;
}

/**
 * Snow chains for a tyre: a ring of steel down each sidewall and ten cross chains over
 * the tread between them, standing just proud of the tread and its lugs. Axle along x.
 */
function chainGeometry(radius: number, width: number, lugs: number) {
  const out = radius * (lugs ? 1.15 : 1) + 0.015;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(new THREE.TorusGeometry(out - 0.04, 0.018, 4, 20).deleteAttribute("uv").rotateX(Math.PI / 2).translate(0, (side * width) / 2, 0));
  }
  for (let i = 0; i < 10; i++) {
    const cross = new THREE.BoxGeometry(0.035, width + 0.04, 0.05).deleteAttribute("uv");
    parts.push(cross.translate(out, 0, 0).rotateY((i / 10) * Math.PI * 2));
  }
  return mergeGeometries(parts).rotateZ(Math.PI / 2);
}

/**
 * Cartier chains: the same rings and cross chains, cast twice as heavy in gold, with a
 * stone standing on every cross chain and ten more set round each sidewall. Three groups,
 * for a material each: the gold, then the stones in two sets that twinkle out of step.
 */
function jewelledChainGeometry(radius: number, width: number, lugs: number) {
  const out = radius * (lugs ? 1.15 : 1) + 0.02;
  const turn = (i: number) => (i / 10) * Math.PI * 2;
  const gold: THREE.BufferGeometry[] = [];
  const stones: THREE.BufferGeometry[][] = [[], []];
  for (const side of [-1, 1]) {
    const y = (side * width) / 2;
    gold.push(new THREE.TorusGeometry(out - 0.04, 0.03, 5, 20).deleteAttribute("uv").rotateX(Math.PI / 2).translate(0, y, 0));
    for (let i = 0; i < 10; i++) {
      // Between the cross chains, and proud of the sidewall, so they show from beside the truck.
      const stone = new THREE.OctahedronGeometry(0.04).deleteAttribute("uv");
      stones[i % 2].push(stone.translate(out - 0.04, y + side * 0.03, 0).rotateY(turn(i + 0.5)));
    }
  }
  for (let i = 0; i < 10; i++) {
    const cross = new THREE.BoxGeometry(0.06, width + 0.06, 0.08).deleteAttribute("uv");
    gold.push(cross.translate(out, 0, 0).rotateY(turn(i)));
    const stone = new THREE.OctahedronGeometry(0.045).deleteAttribute("uv");
    stones[(i + 1) % 2].push(stone.translate(out + 0.03, 0, 0).rotateY(turn(i)));
  }
  // The stones have no index, so the gold gives its up to be merged with them.
  return mergeGeometries([mergeGeometries(gold).toNonIndexed(), mergeGeometries(stones[0]), mergeGeometries(stones[1])], true).rotateZ(Math.PI / 2);
}

/** A glint off a stone: three thin spikes crossed, so it's a star from wherever it's seen. A metre across; scale to suit. */
function starGeometry() {
  const spike = (x: number, y: number, z: number) => new THREE.OctahedronGeometry(0.5).deleteAttribute("uv").scale(x, y, z);
  return mergeGeometries([spike(1, 0.14, 0.14), spike(0.14, 1, 0.14), spike(0.14, 0.14, 1)]);
}
/** How long one glint lasts, in seconds, and how far across it gets, in metres. */
const GLINT_SECONDS = 0.45;
const GLINT_SIZE = 0.95;

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

  // The winch bolts on ahead of the bumper, at about axle height. Hidden until one is fitted.
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.bumperBlack, flatShading: true });
  const cable = new THREE.MeshLambertMaterial({ color: PALETTE.cable, flatShading: true });
  const hook = new THREE.MeshLambertMaterial({ color: PALETTE.winchHook, flatShading: true });
  const winch = buildWinch(dark, cable, hook);
  winch.position.set(0, v.wheelRadius - v.ride + 0.16, v.length / 2 - 0.06);
  winch.visible = false;
  parts.body.add(winch);

  // Wheels hang off the root, not the body, so they can follow the ground on their own.
  const tyreMat = new THREE.MeshLambertMaterial({ color: PALETTE.tyre, flatShading: true });
  const rimMat = new THREE.MeshLambertMaterial({ color: PALETTE.rim, flatShading: true });
  const chainMat = new THREE.MeshLambertMaterial({ color: PALETTE.chains, flatShading: true });
  // Cartier chains shine, unlike anything else on the truck: their facets catch the sun
  // as the wheels turn, and they glow a little of their own so they show at night too.
  const goldMat = new THREE.MeshPhongMaterial({
    color: PALETTE.chainGold, emissive: PALETTE.chainGold, emissiveIntensity: 0.3, specular: PALETTE.chainStone, shininess: 80, flatShading: true,
  });
  const stoneMats = [0, 1].map(
    () => new THREE.MeshPhongMaterial({ color: PALETTE.chainStone, emissive: PALETTE.chainStone, emissiveIntensity: 0.25, specular: PALETTE.chainStone, shininess: 120, flatShading: true }),
  );
  // Unlit, so a glint is as bright at midnight as at noon.
  const starMat = new THREE.MeshBasicMaterial({ color: PALETTE.chainStone });
  const starGeo = starGeometry();
  const wheels = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ].map(([sx, sz]) => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(undefined, tyreMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(undefined, rimMat);
    // On the spin group, so the chains turn with the tyre.
    const chains = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(undefined, chainMat);
    chains.visible = false;
    spin.add(tyre, rim, chains);
    // Beside the wheel rather than on it: it stays put while the tyre turns under it.
    const star = new THREE.Mesh(starGeo, starMat);
    star.visible = false;
    pivot.add(spin, star);
    root.add(pivot);
    // `flash` is how far into its glint this wheel is; below zero, how long until the next.
    return { pivot, spin, tyre, rim, chains, star, flash: -Math.random(), sx, z: (sz * v.wheelbase) / 2 };
  });

  let radius = v.wheelRadius;
  let stance = v.track / 2;
  let mountY = v.wheelRadius - v.ride;
  let tread = 0.32;
  let fittedTyres = "";
  let fittedChains = "";
  let jewelled = false;
  let twinkle = 0;
  let lights = lightsOf(STOCK_LOADOUT);
  let glow = 0;

  function setLoadout(l: Loadout) {
    paint.color.set(paintColour(vehicle, l));
    parts.extras.snorkel.visible = snorkelOf(l).fitted;
    winch.visible = winchOf(l).fitted;
    lights = lightsOf(l);
    parts.extras.fogLamps.visible = lights.fogLamps;
    parts.extras.lightBar.visible = lights.bar;
    parts.extras.ditchLights.visible = lights.ditch;
    const t = tyresOf(l);
    radius = v.wheelRadius + t.radiusAdd;
    tread = t.width;
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
    // Chains are cut to the tyre, so a new set of either means a new set of chains.
    const chain = winterOf(l);
    const set = `${t.id}:${chain.id}`;
    if (chain.fitted && set !== fittedChains) {
      fittedChains = set;
      const chainGeo = (chain.jewelled ? jewelledChainGeometry : chainGeometry)(radius, t.width, t.lugs);
      for (const w of wheels) {
        w.chains.geometry.dispose();
        w.chains.geometry = chainGeo;
        w.chains.material = chain.jewelled ? [goldMat, ...stoneMats] : chainMat;
      }
    }
    jewelled = chain.fitted && chain.jewelled;
    for (const w of wheels) {
      w.chains.visible = chain.fitted;
      if (!jewelled) w.star.visible = false;
    }
    setLights(glow);
  }

  /**
   * Cartier chains catch the light. The stones twinkle, each set flashing briefly at its
   * own pace, and now and then one throws a glint: a star that swells and is gone, off
   * the outer face of each wheel in turn. Its own call for the showroom, where the truck
   * stands still; `update` makes it too.
   */
  function glint(dt: number) {
    if (!jewelled) return;
    twinkle += dt;
    stoneMats[0].emissiveIntensity = 0.25 + 2 * Math.max(0, Math.sin(twinkle * 5.3)) ** 6;
    stoneMats[1].emissiveIntensity = 0.25 + 2 * Math.max(0, Math.sin(twinkle * 7.1 + 2)) ** 6;
    for (const w of wheels) {
      w.flash += dt;
      if (w.flash > GLINT_SECONDS) {
        // The next one after a pause, from somewhere else round the tyre.
        w.flash = -(0.15 + Math.random() * 0.7);
        const round = Math.random() * Math.PI * 2;
        const r = radius * (0.6 + Math.random() * 0.45);
        w.star.position.set(w.sx * (tread / 2 + 0.14), Math.cos(round) * r, Math.sin(round) * r);
      }
      w.star.visible = w.flash > 0;
      if (!w.star.visible) continue;
      w.star.scale.setScalar(Math.sin((w.flash / GLINT_SECONDS) * Math.PI) * GLINT_SIZE);
      w.star.rotation.x += dt * 3;
    }
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
    // Hung up on a rock, the wheels turn with the throttle and the truck doesn't.
    rolled += ((car.stuck ? car.stuck.spin : car.speed) * dt) / radius;
    glint(dt);

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
    for (const m of [paint, lamp, tyreMat, rimMat, chainMat, goldMat, ...stoneMats, starMat, dark, cable, hook]) m.dispose();
  }

  return { object: root, vehicle, top: parts.top, update, setLoadout, setLights, glint, park, dispose };
}

export type CarModel = ReturnType<typeof buildCar>;

/**
 * BBB's tow truck (ADR 0021): the little pickup in white with a winch on its bumper, a
 * recovery boom over the bed and an amber lamp turning on the roof. It can be faded, for
 * coming into sight and going out of it.
 */
export function buildTowTruck() {
  const model = buildCar(TOW_RIG);
  model.setLoadout(TOW_LOADOUT);
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.bumperBlack, flatShading: true });
  const lamp = new THREE.MeshLambertMaterial({ color: PALETTE.beacon, emissive: PALETTE.beacon, emissiveIntensity: 1, flatShading: true });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, tilt = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = tilt;
    mesh.castShadow = true;
    model.object.add(mesh);
  };
  const v = vehicleById(TOW_RIG);
  // The boom leans back over the tailgate from a post behind the cab.
  add(new THREE.BoxGeometry(0.12, 0.12, 1.5), dark, 0, model.top - 0.3, -v.length / 2 + 0.95, 0.5);
  add(new THREE.BoxGeometry(0.9, 0.5, 0.1), dark, 0, model.top - 0.45, -0.55);
  add(new THREE.BoxGeometry(0.4, 0.12, 0.16), lamp, 0, model.top + 0.06, 0.35);
  let shown = 1;
  return {
    ...model,
    /** The roof lamp turns: bright and dim about twice a second. */
    blink: (time: number) => void (lamp.emissiveIntensity = 0.35 + 2.2 * Math.max(0, Math.sin(time * 12))),
    /** 1 is solid; less, and it's on its way into or out of sight. */
    setFade(fade: number) {
      if (fade === shown) return;
      shown = fade;
      model.object.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of [o.material].flat()) {
          m.transparent = fade < 1;
          m.opacity = fade;
        }
      });
    },
  };
}

export type TowTruck = ReturnType<typeof buildTowTruck>;

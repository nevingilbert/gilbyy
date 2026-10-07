import * as THREE from "three";
import { buildCar } from "./car-model";
import { hourAt, skyAt } from "./daylight";
import { buildGarage, type GarageModel } from "./garages";
import { PALETTE } from "./palette";
import type { Car, CarSpec } from "./physics";
import { buildRailway } from "./railway";
import { buildBushes, buildRocks, buildTrees } from "./scenery";
import { buildShowroom } from "./showroom";
import { buildSky } from "./sky";
import { buildGrass, buildTerrainMesh, buildWaterMesh, makeSurface } from "./terrain-mesh";
import type { Loadout } from "./upgrades";
import type { Obstacle, SiteStyle, World } from "./world";

const SHADOW_SPAN = 55;
const FAR = 2600;

/** A garage as the game sees it: where to stop, where to drive in, which way it faces. */
export type Garage = {
  style: SiteStyle;
  /** Where the truck waits in front of the door, and its heading when it leaves. */
  approach: { x: number; z: number };
  inside: { x: number; z: number };
  /** Facing out of the door. Driving in means facing the opposite way. */
  heading: number;
  sink: number;
};

function placeGarages(world: World, windows: THREE.Material) {
  const group = new THREE.Group();
  const models: GarageModel[] = [];
  const garages: Garage[] = [];
  const colliders: Obstacle[] = [];
  for (const site of world.sites) {
    const model = buildGarage(site.style, windows);
    model.object.position.set(site.x, site.y, site.z);
    model.object.rotation.y = site.rot;
    group.add(model.object);
    models.push(model);
    const cos = Math.cos(site.rot);
    const sin = Math.sin(site.rot);
    // Local (x, z) → world, for a group rotated by `rot` about y.
    const at = (x: number, z: number) => ({ x: site.x + x * cos + z * sin, z: site.z - x * sin + z * cos });
    for (const c of model.colliders) colliders.push({ ...at(c.x, c.z), r: c.r, h: Infinity });
    garages.push({ style: site.style, approach: at(0, model.approachZ), inside: at(0, model.insideZ), heading: site.rot, sink: model.sink });
  }
  world.addObstacles(colliders);
  return { group, models, garages };
}

export function createView(canvas: HTMLCanvasElement, world: World, loadout: Loadout) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.fog);
  const fog = new THREE.FogExp2(PALETTE.fog, 0.0016);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, FAR);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.5);
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: 900,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.3;
  sun.shadow.radius = 2.5;
  scene.add(hemi, sun, sun.target);

  // Shared glowing materials: lit windows on the buildings, lamps on the train.
  const windows = new THREE.MeshLambertMaterial({ color: PALETTE.windowGlow, emissive: PALETTE.windowGlow, emissiveIntensity: 0.1 });
  const lamps = new THREE.MeshLambertMaterial({ color: PALETTE.headlight, emissive: PALETTE.headlight, emissiveIntensity: 0.4 });

  const sky = buildSky(FAR * 0.92);
  const surface = makeSurface(world);
  const grass = buildGrass(world, surface);
  const water = buildWaterMesh(world);
  const railway = buildRailway(world, lamps);
  const sites = placeGarages(world, windows);
  scene.add(
    sky.object, buildTerrainMesh(world, surface), grass.object, water.object,
    buildTrees(world.trees), buildBushes(world.bushes), buildRocks(world.rocks),
    railway.object, sites.group,
  );

  const car = buildCar();
  car.setLoadout(loadout);
  scene.add(car.object);
  const showroom = buildShowroom();

  // Chase camera: high and behind, like Over the Hill's, easing after the car.
  let camYaw = NaN;
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const want = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  let night = 0;
  let hour = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    showroom.resize(w, h);
  }

  /** One frame of the world. `time` is seconds of game time, which drives the day and the train. */
  function render(state: Car, dt: number, time: number, spec: CarSpec) {
    hour = hourAt(time);
    const daylight = skyAt(hour);
    night = daylight.night;
    sky.apply(daylight, scene, fog, hemi, sun);
    car.setLights(night);
    windows.emissiveIntensity = 0.1 + night * 1.6;
    lamps.emissiveIntensity = 0.4 + night * 2.2;

    car.update(state, world, dt, spec);
    grass.update(state.x, state.z, time);
    water.update(time);
    railway.update(time, dt, night);

    const ease = (rate: number) => 1 - Math.exp(-rate * dt);
    if (Number.isNaN(camYaw)) camYaw = state.heading;
    let dy = state.heading - camYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * ease(2.2);

    const dist = 11.5 + Math.abs(state.speed) * 0.1;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    want.set(state.x - fx * dist, state.y + 8.5 + Math.abs(state.speed) * 0.05, state.z - fz * dist);
    want.y = Math.max(want.y, world.height(want.x, want.z) + 2.5);
    if (camPos.lengthSq() === 0) camPos.copy(want);
    else camPos.lerp(want, ease(4));
    camera.position.copy(camPos);
    look.set(state.x + fx * 4, state.y + 0.4, state.z + fz * 4);
    camera.lookAt(look);

    // The shadow box follows the car; snapping it to texels stops it shimmering.
    const texel = (SHADOW_SPAN * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(state.x / texel) * texel;
    const tz = Math.round(state.z / texel) * texel;
    lightDir.set(...daylight.lightDir);
    sun.target.position.set(tx, state.y, tz);
    sun.position.set(tx, state.y, tz).addScaledVector(lightDir, 400);
    sun.target.updateMatrixWorld();

    sky.object.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function setLoadout(l: Loadout) {
    car.setLoadout(l);
    showroom.setLoadout(l);
  }

  function dispose() {
    for (const s of [scene]) {
      s.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of [o.material].flat()) m.dispose();
        }
      });
    }
    renderer.dispose();
  }

  resize();
  return {
    render,
    renderShowroom: (dt: number, turn: number) => showroom.render(renderer, dt, turn),
    openShowroom: (style: SiteStyle, l: Loadout) => showroom.open(style, l),
    setLoadout,
    setDoor: (i: number, open: number) => sites.models[i]?.setDoor(open),
    garages: sites.garages,
    trainCars: () => railway.cars(),
    hour: () => hour,
    resize,
    dispose,
  };
}

export type View = ReturnType<typeof createView>;

import * as THREE from "three";
import { buildCampCentre, buildCampGate, buildTentSite, mergeByMaterial } from "./campground-model";
import { buildCar, type CarModel } from "./car-model";
import { buildCoffeeShop } from "./coffee-shop-model";
import { hourAt, skyAt } from "./daylight";
import { buildGarage, type Circle, type GarageModel } from "./garages";
import { buildFinishArch, buildGate, buildStartArch, type GateState } from "./mission-models";
import { PALETTE } from "./palette";
import type { Car, CarSpec } from "./physics";
import { buildRailway } from "./railway";
import { createRemotes } from "./remote";
import { buildBushes, buildRocks, buildTrees } from "./scenery";
import type { Loadout } from "./shop";
import { buildShowroom } from "./showroom";
import { buildSky } from "./sky";
import { buildGrass, buildTerrainMesh, buildWaterMesh, makeSurface } from "./terrain-mesh";
import type { VehicleId } from "./vehicles";
import { CAFE, CAMP, CAMP_CENTRE, CAMP_GATE, campPitches, sampleGrid, type Obstacle, type SiteStyle, type World } from "./world";

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

/** Puts a model on the ground at (x, z) turned by `rot`, and its colliders into the world. */
function placer(world: World, group: THREE.Group, colliders: Obstacle[]) {
  return (object: THREE.Object3D, circles: readonly Circle[], x: number, z: number, rot: number, y = world.height(x, z)) => {
    object.position.set(x, y, z);
    object.rotation.y = rot;
    group.add(object);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Local (x, z) → world, for a group rotated by `rot` about y.
    const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    for (const c of circles) colliders.push({ ...at(c.x, c.z), r: c.r, h: Infinity });
    return at;
  };
}

function placeGarages(world: World, windows: THREE.Material) {
  const group = new THREE.Group();
  const models: GarageModel[] = [];
  const garages: Garage[] = [];
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  for (const site of world.sites) {
    const model = buildGarage(site.style, windows);
    const at = place(model.object, model.colliders, site.x, site.z, site.rot, site.y);
    models.push(model);
    garages.push({ style: site.style, approach: at(0, model.approachZ), inside: at(0, model.insideZ), heading: site.rot, sink: model.sink });
  }
  world.addObstacles(colliders);
  return { group, models, garages };
}

/** The campground (thirty pitches, the fire pit, the gate) and the café down the road. */
function placeCamp(world: World, windows: THREE.Material, glow: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  // Thirty pitches share their materials, so they bake down to a handful of meshes.
  const pitches = new THREE.Group();
  const pitch = placer(world, pitches, colliders);
  for (const p of campPitches()) {
    const site = buildTentSite(p.index, glow);
    // Pitches sit on the levelled camp; their bays line up with the spawn points in terrain.ts.
    pitch(site.object, site.colliders, p.parking.x - site.parking.x, p.parking.z - site.parking.z, 0);
  }
  group.add(mergeByMaterial(pitches));
  const centre = buildCampCentre(glow);
  place(centre.object, centre.colliders, CAMP_CENTRE.x, CAMP_CENTRE.z, 0);
  const gate = buildCampGate();
  // The arch spans the road east out of camp, which runs along x.
  place(gate.object, gate.colliders, CAMP_GATE.x + 24, CAMP_GATE.z, Math.PI / 2);
  const cafe = buildCoffeeShop(windows, glow);
  const at = place(cafe.object, cafe.colliders, CAFE.x, CAFE.z, CAFE.rot);
  world.addObstacles(colliders);
  return { group, cafe: { ...at(cafe.meet.x, cafe.meet.z), r: cafe.meet.r } };
}

/**
 * Every mission's start arch, gates and finish. Gates have no colliders, so a clipped
 * flag never stops you; the arches do. A loop that finishes where it began reuses that gate.
 */
function placeMissions(world: World, glow: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  const courses = world.missions.map((m) => {
    const arch = buildStartArch(glow);
    place(arch.object, arch.colliders, m.start.x, m.start.z, m.start.heading);
    const last = m.gates.length - 1;
    const end = m.gates[last];
    const loops = m.gates.slice(0, last).findIndex((g) => Math.hypot(g.x - end.x, g.z - end.z) < 5);
    const gates = m.gates.map((g, i) => {
      if (i === last && loops >= 0) return null;
      const model = buildGate(g.width);
      place(model.object, [], g.x, g.z, g.heading);
      return model;
    });
    if (loops < 0) {
      const finish = buildFinishArch(glow);
      // Just past the last gate, so the banner frames it as you come through.
      place(finish.object, finish.colliders, end.x + Math.sin(end.heading) * 6, end.z + Math.cos(end.heading) * 6, end.heading);
    }
    return { gates, loops, last };
  });
  world.addObstacles(colliders);

  /** Shows the run in progress: `next` is the gate to go through, or -1 when nothing's running. */
  function show(mission: number, next: number, time: number) {
    courses.forEach((c, k) => {
      const running = k === mission;
      c.gates.forEach((g, i) => {
        if (!g) return;
        let state: GateState = "ahead";
        if (running) {
          // A loop's first gate is also its finish: it lights again for the last leg.
          const passed = i < next && !(i === c.loops && next === c.last);
          state = i === next || (i === c.loops && next === c.last) ? "next" : passed ? "done" : "ahead";
        }
        g.setState(state, time);
      });
    });
  }
  show(-1, 0, 0);
  return { group, show };
}

/** The opening shot: how far back from the camp and how high it hangs, how fast it drifts in, and how long the glide down to the truck takes. */
const GLIDE_BACK = 120;
const GLIDE_UP = 46;
const HOVER_DRIFT = 5;
const GLIDE_TIME = 3.4;

export function createView(canvas: HTMLCanvasElement, world: World, vehicle: VehicleId, loadout: Loadout) {
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

  // Shared glowing materials: lit windows, lamps on the train, embers and lanterns.
  const windows = new THREE.MeshLambertMaterial({ color: PALETTE.windowGlow, emissive: PALETTE.windowGlow, emissiveIntensity: 0.1 });
  const lamps = new THREE.MeshLambertMaterial({ color: PALETTE.headlight, emissive: PALETTE.headlight, emissiveIntensity: 0.4 });
  const embers = new THREE.MeshLambertMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.6 });

  const sky = buildSky(FAR * 0.92);
  const surface = makeSurface(world);
  const grass = buildGrass(world, surface);
  const water = buildWaterMesh(world);
  const railway = buildRailway(world, lamps);
  const sites = placeGarages(world, windows);
  const camp = placeCamp(world, windows, embers);
  const courses = placeMissions(world, lamps);
  scene.add(
    sky.object, buildTerrainMesh(world, surface), grass.object, water.object,
    buildTrees(world.trees, (x, z) => sampleGrid(world.snow, x, z)), buildBushes(world.bushes), buildRocks(world.rocks),
    railway.object, sites.group, camp.group, courses.group,
  );

  let car: CarModel = buildCar(vehicle);
  car.setLoadout(loadout);
  scene.add(car.object);
  const remotes = createRemotes(scene, world);
  const showroom = buildShowroom();

  // Chase camera: high and behind, like Over the Hill's, easing after the car.
  let camYaw = NaN;
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const want = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let night = 0;
  let hour = 0;
  let orbit = 0;
  // The opening. The camera hangs high over the camp, drifting in, with the truck not yet
  // shown, until the game knows which tent the truck is at; then it glides down to it.
  // `hover` and `glide` are seconds into each, or -1.
  const aim = new THREE.Vector3();
  const glideFrom = new THREE.Vector3();
  const aimFrom = new THREE.Vector3();
  let hover = -1;
  let glide = -1;
  const hang = () => {
    const ground = world.height(CAMP.x, CAMP.z);
    camPos.set(CAMP.x, ground + GLIDE_UP, CAMP.z - GLIDE_BACK + hover * HOVER_DRIFT);
    aim.set(CAMP.x, ground, CAMP.z + 30);
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    showroom.resize(w, h);
  }

  /**
   * One frame of the world. `time` is seconds of game time, which drives the day and the
   * train. `circling` swings the camera slowly round the parked truck, for picking a rig.
   */
  function render(state: Car, dt: number, time: number, spec: CarSpec, circling = false) {
    hour = hourAt(time);
    const daylight = skyAt(hour);
    night = daylight.night;
    sky.apply(daylight, scene, fog, hemi, sun);
    car.setLights(night);
    windows.emissiveIntensity = 0.1 + night * 1.6;
    lamps.emissiveIntensity = 0.4 + night * 2.2;
    embers.emissiveIntensity = 0.6 + night * 1.8 + Math.sin(time * 7) * 0.15;

    car.update(state, world, dt, spec);
    remotes.update(dt, performance.now() / 1000, night);
    grass.update(state.x, state.z, time);
    water.update(time);
    railway.update(time, dt, night);

    const ease = (rate: number) => 1 - Math.exp(-rate * dt);
    if (Number.isNaN(camYaw)) camYaw = state.heading;
    /** Puts the camera at `want` looking at `look`: along the opening glide while that lasts, easing after the truck otherwise. */
    const follow = (rate: number) => {
      if (glide >= 0) {
        glide += dt;
        const k = Math.min(1, glide / GLIDE_TIME);
        const eased = k * k * (3 - 2 * k);
        camPos.lerpVectors(glideFrom, want, eased);
        aim.lerpVectors(aimFrom, look, eased);
        if (k >= 1) glide = -1;
      } else {
        if (camPos.lengthSq() === 0) camPos.copy(want);
        else camPos.lerp(want, ease(rate));
        aim.copy(look);
      }
      camera.position.copy(camPos);
      camera.lookAt(aim);
    };
    car.object.visible = hover < 0;
    if (hover >= 0) {
      hover += dt;
      hang();
      camera.position.copy(camPos);
      camera.lookAt(aim);
    } else if (circling) {
      orbit += dt * 0.25;
      const a = state.heading + Math.PI * 0.8 + Math.sin(orbit) * 0.9;
      want.set(state.x + Math.sin(a) * 9, state.y + 3.2, state.z + Math.cos(a) * 9);
      look.set(state.x, state.y + 0.4, state.z);
      follow(2);
      camYaw = state.heading;
    } else {
      let dy = state.heading - camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      camYaw += dy * ease(2.2);
      const dist = 11.5 + Math.abs(state.speed) * 0.1;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      want.set(state.x - fx * dist, state.y + 8.5 + Math.abs(state.speed) * 0.05, state.z - fz * dist);
      want.y = Math.max(want.y, world.height(want.x, want.z) + 2.5);
      look.set(state.x + fx * 4, state.y + 0.4, state.z + fz * 4);
      follow(4);
    }

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

  /** Swaps the rig (a new body) or just refits it. */
  function setRig(v: VehicleId, l: Loadout) {
    if (v !== car.vehicle) {
      scene.remove(car.object);
      car.dispose();
      car = buildCar(v);
      scene.add(car.object);
    }
    car.setLoadout(l);
    car.setLights(night);
  }

  /** A world point on screen, in CSS pixels; null when behind the camera or off-screen. */
  function project(x: number, y: number, z: number) {
    projected.set(x, y, z).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) return null;
    return {
      x: ((projected.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - projected.y) / 2) * canvas.clientHeight,
      far: camera.position.distanceTo(new THREE.Vector3(x, y, z)),
    };
  }

  function dispose() {
    remotes.dispose();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
    showroom.dispose();
    renderer.dispose();
  }

  resize();
  return {
    render,
    /** Puts the camera straight where it belongs on the next frame, for when the truck was moved, not driven. */
    cut: () => {
      camPos.set(0, 0, 0);
      camYaw = NaN;
      hover = glide = -1;
    },
    /** Starts the opening shot: high over the camp, the truck not shown yet. */
    flyIn: () => {
      hover = 0;
      glide = -1;
      hang();
    },
    /** The truck is where it belongs: show it, and bring the camera down to it. */
    land: () => {
      if (hover < 0) return;
      hover = -1;
      glideFrom.copy(camPos);
      aimFrom.copy(aim);
      glide = 0;
      camYaw = NaN;
    },
    renderShowroom: (dt: number, turn: number) => showroom.render(renderer, dt, turn),
    openShowroom: (style: SiteStyle, v: VehicleId, l: Loadout) => showroom.open(style, v, l),
    /** Tries a rig or part on the truck in the showroom without fitting it. */
    previewShowroom: (v: VehicleId, l: Loadout) => showroom.setRig(v, l),
    setRig,
    setDoor: (i: number, open: number) => sites.models[i]?.setDoor(open),
    showRun: courses.show,
    garages: sites.garages,
    cafe: camp.cafe,
    remotes,
    trainCars: () => railway.cars(),
    hour: () => hour,
    carTop: () => car.top,
    project,
    resize,
    dispose,
  };
}

export type View = ReturnType<typeof createView>;

import * as THREE from "three";
import { buildAirport } from "./airport-model";
import { buildWildlife } from "./animal-models";
import { buildCampCentre, buildCampGate, buildTentSite, mergeByMaterial } from "./campground-model";
import { buildCar, type CarModel } from "./car-model";
import { buildCoffeeShop } from "./coffee-shop-model";
import { hourAt, skyAt } from "./daylight";
import { standPose, type Frame } from "./flight";
import { buildLandmark } from "./landmark-models";
import { buildGarage, isShared, type Circle, type GarageModel } from "./garages";
import { islandFire } from "./island";
import { buildFinishArch, buildGate, buildStartArch, type GateState } from "./mission-models";
import { PALETTE } from "./palette";
import { LOOK_UP, cameraAt, easeOrbit, orbitFrom, type Orbit } from "./photo";
import type { Car, CarSpec } from "./physics";
import { buildPlane } from "./plane-model";
import { buildRailway } from "./railway";
import { rampPoint } from "./ramp";
import { buildRamp } from "./ramp-model";
import { createRemotes } from "./remote";
import { buildBushes, buildClouds, buildRocks, buildTrees } from "./scenery";
import type { Loadout } from "./shop";
import { buildShowroom } from "./showroom";
import { buildSky } from "./sky";
import { buildGrass, buildTerrainMesh, buildWaterMesh, makeSurface } from "./terrain-mesh";
import { TRAIN_SPEED } from "./track";
import type { VehicleId } from "./vehicles";
import type { Threat } from "./wildlife";
import { CAMP_CENTRE, CAMP_GATE, sampleGrid, type Ground, type Obstacle, type SiteStyle, type World } from "./world";

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

/** One frame of the flight's film (flight.ts), and the ground the truck stands on in it: the ramp and the hold as well as the apron. */
export type Film = { frame: Frame; ground: Ground };

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

/** The ground's height along local x of a model placed at (x, z) turned by `rot`, relative to its origin. */
function across(world: World, x: number, z: number, rot: number) {
  const y = world.height(x, z);
  return (lx: number) => world.height(x + lx * Math.cos(rot), z - lx * Math.sin(rot)) - y;
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

/**
 * The camp: thirty pitches and a fire. In the valley, also the gate and the café down the
 * road; on the island the pitches are a row on the beach and the fire is further down it.
 */
function placeCamp(world: World, windows: THREE.Material, glow: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  // Thirty pitches share their materials, so they bake down to a handful of meshes.
  const pitches = new THREE.Group();
  const pitch = placer(world, pitches, colliders);
  for (const p of world.pitches) {
    const site = buildTentSite(p.index, glow, world.id === "island" ? PALETTE.wetSand : undefined);
    // Each stands on the levelled camp, turned so its bay is where terrain.ts or island.ts put it.
    pitch(site.object, site.colliders, p.x, p.z, p.rot);
  }
  group.add(mergeByMaterial(pitches));
  const centre = buildCampCentre(glow);
  const shop = buildCoffeeShop(windows, glow);
  const meet = place(shop.object, shop.colliders, world.cafe.x, world.cafe.z, world.cafe.rot);
  const cafe = { ...meet(shop.meet.x, shop.meet.z), r: shop.meet.r };
  if (world.id === "valley") {
    place(centre.object, centre.colliders, CAMP_CENTRE.x, CAMP_CENTRE.z, 0);
    // The arch spans the road east out of camp, which runs along x. It stands outside the levelled camp, where the
    // ground falls away across the road.
    const [gx, gz, rot] = [CAMP_GATE.x + 24, CAMP_GATE.z, Math.PI / 2];
    const gate = buildCampGate(across(world, gx, gz, rot));
    place(gate.object, gate.colliders, gx, gz, rot);
  } else {
    const fire = islandFire(world);
    place(centre.object, centre.colliders, fire.x, fire.z, world.camp.heading);
  }
  world.addObstacles(colliders);
  return { group, cafe };
}

/** The bank, the church, the schoolhouse and the casino, and where to stop in front of each (ADR 0012). */
function placeLandmarks(world: World, windows: THREE.Material, glow: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  const doors = world.landmarks.map((l) => {
    const model = buildLandmark(l.kind, windows, glow);
    return { kind: l.kind, ...place(model.object, model.colliders, l.x, l.z, l.rot, l.y)(0, model.stopZ) };
  });
  world.addObstacles(colliders);
  return { group, doors };
}

/** The airstrip's runway, lights and terminal (ADR 0014). The plane is the view's, not the world's. */
function placeAirport(world: World, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const model = buildAirport(windows, lamps);
  const a = world.airport;
  placer(world, group, colliders)(model.object, model.colliders, a.x, a.z, a.heading, a.y);
  world.addObstacles(colliders);
  return { group, update: model.update };
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
    // Courses cross open country, so each post stands on its own ground.
    const arch = buildStartArch(glow, across(world, m.start.x, m.start.z, m.start.heading));
    place(arch.object, arch.colliders, m.start.x, m.start.z, m.start.heading);
    const last = m.gates.length - 1;
    const end = m.gates[last];
    const loops = m.gates.slice(0, last).findIndex((g) => Math.hypot(g.x - end.x, g.z - end.z) < 5);
    const gates = m.gates.map((g, i) => {
      if (i === last && loops >= 0) return null;
      const model = buildGate(g.width, across(world, g.x, g.z, g.heading));
      place(model.object, [], g.x, g.z, g.heading);
      return model;
    });
    if (loops < 0) {
      // Just past the last gate, so the banner frames it as you come through.
      const [fx, fz] = [end.x + Math.sin(end.heading) * 6, end.z + Math.cos(end.heading) * 6];
      const finish = buildFinishArch(glow, across(world, fx, fz, end.heading));
      place(finish.object, finish.colliders, fx, fz, end.heading);
    }
    const ramp = m.ramp;
    if (ramp) {
      // Built from the ground the physics drives on, the deck included; its fence and the boards under its lip are the world's (world.ts).
      const y = world.height(ramp.x, ramp.z);
      const surface = (u: number, w: number) => world.height(rampPoint(ramp, u, w).x, rampPoint(ramp, u, w).z) - y;
      place(buildRamp(surface), [], ramp.x, ramp.z, ramp.heading, y);
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
/** How fast the plane's ramp shuts by itself once a flight is over, per second. */
const RAMP_SHUTS = 0.6;

export function createView(canvas: HTMLCanvasElement, first: World, vehicle: VehicleId, loadout: Loadout) {
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
  const kept = new Set<THREE.Material>([windows, lamps, embers]);

  const sky = buildSky(FAR * 0.92);
  scene.add(sky.object);

  /**
   * Everything that belongs to one world: its ground, what grows and stands on it, and
   * the other players in it. A flight takes one down and puts another up (`setWorld`).
   */
  function stageFor(world: World) {
    const group = new THREE.Group();
    const surface = makeSurface(world);
    const grass = buildGrass(world, surface);
    const water = buildWaterMesh(world);
    const railway = world.track.xs.length ? buildRailway(world, lamps) : null;
    const sites = placeGarages(world, windows);
    const camp = placeCamp(world, windows, embers);
    const courses = placeMissions(world, lamps);
    const landmarks = placeLandmarks(world, windows, embers);
    const airport = placeAirport(world, windows, lamps);
    const wildlife = buildWildlife(world);
    group.add(
      buildTerrainMesh(world, surface), grass.object, water.object,
      buildTrees(world.trees, (x, z) => sampleGrid(world.snow, x, z)),
      buildBushes(world.bushes, world.id === "island" ? PALETTE.fern : PALETTE.bush), buildRocks(world.rocks),
      sites.group, camp.group, courses.group, landmarks.group, airport.group, wildlife.object,
    );
    if (railway) group.add(railway.object);
    scene.add(group);
    const remotes = createRemotes(scene, world);

    /** Gives back the graphics memory. Materials shared with what outlives this world are left alone. */
    function dispose() {
      remotes.dispose();
      scene.remove(group);
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) if (!kept.has(m) && !isShared(m)) m.dispose();
      });
    }
    return { world, grass, water, railway, sites, camp, courses, landmarks, airport, wildlife, remotes, dispose };
  }

  let world = first;
  let stage = stageFor(world);

  let car: CarModel = buildCar(vehicle);
  car.setLoadout(loadout);
  scene.add(car.object);
  const showroom = buildShowroom();

  // The plane stands on the airstrip of whichever world this is, until a flight moves it.
  const plane = buildPlane(windows);
  scene.add(plane.object);
  const clouds = buildClouds();
  scene.add(clouds);
  let rampOpen = 0;
  const park = () => {
    plane.pose(standPose(world.airport));
    plane.setGear(1);
  };
  park();

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
  /** Which shot of the film the camera is on, so a new one is a cut. */
  let shot = -1;
  // The opening. The camera hangs high over the camp, drifting in, with the truck not yet
  // shown, until the game knows which tent the truck is at; then it glides down to it.
  // `hover` and `glide` are seconds into each, or -1.
  const aim = new THREE.Vector3();
  const glideFrom = new THREE.Vector3();
  const aimFrom = new THREE.Vector3();
  let hover = -1;
  let glide = -1;
  // Photo mode: the orbit the camera is on, easing after the one asked for, and where it
  // was when last drawn, so a picture that isn't moving isn't drawn again.
  let shown: Orbit | null = null;
  const centre = new THREE.Vector3();
  const drawnAt = new THREE.Vector3();
  const drawnAim = new THREE.Vector3();
  /** The canvas was cleared (it was resized), so the still picture has to be drawn again. */
  let stale = true;
  const hang = () => {
    // Behind the camp, looking the way it looks: south down the valley, or out to sea from the beach.
    const { x, z, heading } = world.camp;
    const [dx, dz] = [Math.sin(heading), Math.cos(heading)];
    const ground = world.height(x, z);
    const back = GLIDE_BACK - hover * HOVER_DRIFT;
    camPos.set(x - dx * back, ground + GLIDE_UP, z - dz * back);
    aim.set(x + dx * 30, ground, z + dz * 30);
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    showroom.resize(w, h);
    stale = true;
  }

  /**
   * One frame of the world. `time` is seconds of game time, which drives the day and the
   * train. `circling` swings the camera slowly round the parked truck, for picking a rig.
   * During a flight, `film` is the frame to show: it places the plane and directs the camera.
   */
  function render(state: Car, dt: number, time: number, spec: CarSpec, circling = false, film: Film | null = null) {
    hour = hourAt(time);
    const daylight = skyAt(hour);
    night = daylight.night;
    sky.apply(daylight, scene, fog, hemi, sun);
    car.setLights(night);
    windows.emissiveIntensity = 0.1 + night * 1.6;
    lamps.emissiveIntensity = 0.4 + night * 2.2;
    embers.emissiveIntensity = 0.6 + night * 1.8 + Math.sin(time * 7) * 0.15;

    car.update(state, film?.ground ?? world, dt, spec);
    stage.remotes.update(dt, performance.now() / 1000, night);
    stage.grass.update(state.x, state.z, time);
    stage.water.update(time);
    stage.railway?.update(time, dt, night);
    stage.airport.update(time, night);
    // The animals keep out of the way of every truck and the train.
    const threats: Threat[] = [{ x: state.x, z: state.z, speed: state.speed, heading: state.heading }];
    for (const p of stage.remotes.positions()) threats.push(p);
    for (const c of stage.railway?.cars() ?? []) threats.push({ x: c.x, z: c.z, speed: TRAIN_SPEED, heading: c.yaw });
    stage.wildlife.update(dt, time, threats, state);

    // The plane: where the film has it, or on its stand with the ramp coming shut behind the truck.
    if (film) {
      plane.pose(film.frame.plane);
      plane.setGear(film.frame.gear);
      rampOpen = film.frame.ramp;
      if (film.frame.cruising && !clouds.visible) {
        // Laid along the way it's flying, a little ahead, once: the plane moves through them.
        const p = film.frame.plane;
        clouds.position.set(p.x + Math.sin(p.heading) * 160, p.y, p.z + Math.cos(p.heading) * 160);
        clouds.rotation.y = p.heading;
      }
    } else rampOpen = Math.max(0, rampOpen - dt * RAMP_SHUTS);
    clouds.visible = Boolean(film?.frame.cruising);
    plane.setRamp(rampOpen);
    plane.update(time, night);

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
    car.object.visible = hover < 0 && (!film || film.frame.truck !== null);
    if (film) {
      const c = film.frame.camera;
      look.set(c.to.x, c.to.y, c.to.z);
      // A phone held upright sees a narrow slice, so where there's room the camera stands further back.
      const back = c.wide ? Math.min(2.4, Math.max(1, 1.25 / camera.aspect)) : 1;
      want.set(c.from.x, c.from.y, c.from.z).sub(look).multiplyScalar(back).add(look);
      // A new shot is a cut. Within one the camera is where the film says, unless it's easing in.
      if (c.shot !== shot || c.ease === 0 || camPos.lengthSq() === 0) {
        camPos.copy(want);
        aim.copy(look);
      } else {
        camPos.lerp(want, ease(c.ease));
        aim.lerp(look, ease(c.ease));
      }
      shot = c.shot;
      camera.position.copy(camPos);
      camera.lookAt(aim);
      // Afterwards the chase camera picks up from here, behind the truck wherever it's facing.
      camYaw = NaN;
    } else if (hover >= 0) {
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
    if (!film) shot = -1;

    // The shadow box follows the car, or the plane while it's the one to watch; snapping
    // it to texels stops it shimmering.
    const focus = film ? film.frame.plane : state;
    const texel = (SHADOW_SPAN * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(focus.x / texel) * texel;
    const tz = Math.round(focus.z / texel) * texel;
    lightDir.set(...daylight.lightDir);
    sun.target.position.set(tx, focus.y, tz);
    sun.position.set(tx, focus.y, tz).addScaledVector(lightDir, 400);
    sun.target.updateMatrixWorld();

    sky.object.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  /** Photo mode begins: the camera goes on an orbit round the truck from where it is now. That orbit is returned to steer from. */
  function photoStart(state: Car): Orbit {
    centre.set(state.x, state.y + LOOK_UP, state.z);
    shown = orbitFrom(camera.position, centre);
    glide = -1;
    stale = true;
    return shown;
  }

  /**
   * One frame of photo mode. Nothing in the world moves, not the sun, the train, the
   * animals or the grass: only the camera, easing toward `want` round the truck. Drawn
   * only while the camera is moving, since the picture is otherwise the same.
   */
  function photo(state: Car, want: Orbit, dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    centre.set(state.x, state.y + LOOK_UP, state.z);
    shown = easeOrbit(shown ?? want, want, k);
    const at = cameraAt(shown, centre, (x, z) => Math.max(world.height(x, z), world.waterAt(x, z)));
    camPos.set(at.x, at.y, at.z);
    // From where the chase camera was looking, a little ahead of the truck, to the truck.
    aim.lerp(centre, k);
    if (!stale && camPos.distanceToSquared(drawnAt) < 1e-6 && aim.distanceToSquared(drawnAim) < 1e-6) return;
    stale = false;
    drawnAt.copy(camPos);
    drawnAim.copy(aim);
    camera.position.copy(camPos);
    camera.lookAt(aim);
    sky.object.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  /** Draws the picture as it is now and hands back the canvas, to be read at once, before the browser clears it. */
  function snap() {
    renderer.render(scene, camera);
    return canvas;
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

  /** Takes this world down and puts another up, the plane on its airstrip. The camera starts over. */
  function setWorld(next: World) {
    stage.dispose();
    world = next;
    stage = stageFor(world);
    park();
    rampOpen = 0;
    camPos.set(0, 0, 0);
    camYaw = NaN;
    hover = glide = -1;
    shot = -1;
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
    stage.remotes.dispose();
    plane.dispose();
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
    setWorld,
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
    photoStart,
    photo,
    snap,
    renderShowroom: (dt: number, turn: number) => showroom.render(renderer, dt, turn),
    openShowroom: (style: SiteStyle, v: VehicleId, l: Loadout) => showroom.open(style, v, l),
    /** Tries a rig or part on the truck in the showroom without fitting it. */
    previewShowroom: (v: VehicleId, l: Loadout) => showroom.setRig(v, l),
    setRig,
    setDoor: (i: number, open: number) => stage.sites.models[i]?.setDoor(open),
    showRun: (mission: number, next: number, time: number) => stage.courses.show(mission, next, time),
    /** These belong to the world that's up, so they are asked for each time rather than kept. */
    get garages() {
      return stage.sites.garages;
    },
    /** Where friends meet. Only the valley has one. */
    get cafe() {
      return stage.camp.cafe;
    },
    get landmarks() {
      return stage.landmarks.doors;
    },
    get remotes() {
      return stage.remotes;
    },
    trainCars: () => stage.railway?.cars() ?? [],
    hour: () => hour,
    /** The colour the distance fades to just now, as CSS: what a cloud looks like from inside. */
    haze: () => fog.color.getStyle(),
    carTop: () => car.top,
    project,
    resize,
    dispose,
  };
}

export type View = ReturnType<typeof createView>;

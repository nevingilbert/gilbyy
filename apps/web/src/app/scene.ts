import * as THREE from "three";
import { buildAirport } from "./airport-model";
import { buildWildlife } from "./animal-models";
import { buildCampCentre, buildCampGate, buildTentSite, mergeByMaterial } from "./campground-model";
import { buildCar, buildTowTruck, createBeamPool, type BeamPool, type CarModel, type TowTruck } from "./car-model";
import { buildCoffeeShop, buildDiner, buildTeahouse } from "./coffee-shop-model";
import { hourAt, skyAt } from "./daylight";
import { PIER, dockBoard, fromDock, pierTop } from "./dock";
import { FERRY, mooredPose, type FerryFrame } from "./ferry";
import { buildCausewayDressing, buildFerry } from "./ferry-model";
import { standPose, type Frame } from "./flight";
import { hookOf, parked, type HeliFrame } from "./heli";
import { buildHeli, buildPadMarks } from "./heli-model";
import { buildLandmark } from "./landmark-models";
import { buildGarage, isShared, type Circle, type GarageModel } from "./garages";
import { islandFire } from "./island";
import { buildFinishArch, buildGate, buildStartArch, type GateState } from "./mission-models";
import { PALETTE } from "./palette";
import { LOOK_UP, cameraAt, easeOrbit, orbitFrom, type Orbit } from "./photo";
import type { Car, CarSpec } from "./physics";
import { buildPlane } from "./plane-model";
import { buildRailway } from "./railway";
import { courseGround } from "./missions";
import { rampPoint } from "./ramp";
import { buildRamp } from "./ramp-model";
import { createRemotes } from "./remote";
import { buildBushes, buildClouds, buildRocks, buildTrees } from "./scenery";
import type { CityWorld } from "./city";
import { buildCityLandmark } from "./city-landmarks";
import { buildCableCars } from "./cable-car-model";
import { deckPoint } from "./city-bridges";
import { buildBuildings, buildClosure, buildCrookedLane, buildDeck, buildFogBank, kerbTexture, type CityUniforms } from "./city-model";
import { carsOn } from "./rail";
import type { TrainFrame } from "./rail-trip";
import { buildCityStation, buildPoints, buildPortal, buildRailLine, buildStationTrain, buildValleyStation } from "./station-model";
import { snorkelOf, specFor, type Loadout } from "./shop";
import { buildBubbles } from "./bubbles";
import { buildColliderView } from "./colliders-view";
import { buildShowroom } from "./showroom";
import { buildSky } from "./sky";
import { buildGrass, buildTerrainMesh, buildWaterMesh, makeSurface } from "./terrain-mesh";
import { CONSIST, trainMotion } from "./track";
import { vehicleById, type VehicleId } from "./vehicles";
import type { VegasWorld } from "./vegas";
import { buildVegasTown } from "./vegas-model";
import type { JapanWorld } from "./japan";
import { buildJapanTown } from "./japan-model";
import { TOW_SPEC } from "./tow";
import type { Threat } from "./wildlife";
import { cableEnds } from "./winch";
import { CAMP_CENTRE, CAMP_GATE, sampleGrid, type Ground, type Obstacle, type SiteStyle, type World } from "./world";

const SHADOW_SPAN = 55;
const FAR = 2600;
/**
 * San Francisco's air is clearer than the valley's haze, so its skyline carries across it
 * from Twin Peaks, and the camera sees further to match (ADR 0022). The desert's is
 * clearer too, so the Strip stands up across the basin from the canyon's rim (ADR 0023).
 */
const CITY_AIR = 0.32;
const CITY_FAR = 3800;
const VEGAS_AIR = 0.45;
/** Japan's spring air is clear enough to see the mountain across the lake from the camp (ADR 0024). */
const JAPAN_AIR = 0.6;
/** How thick the air is in a world, against the valley's, and how far the camera sees in it. */
const airOf = (w: World) => (w.id === "city" ? CITY_AIR : w.id === "vegas" ? VEGAS_AIR : w.id === "japan" ? JAPAN_AIR : 1);
const farOf = (w: World) => (w.id === "city" || w.id === "vegas" || w.id === "japan" ? CITY_FAR : FAR);

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

/** A winch cable between two trucks, by player id; null is the player's own (ADR 0021). */
export type Rope = { from: string | null; to: string | null };

/** One of BBB's tow trucks to draw (ADR 0021): where it stands, how solid, and whose truck its cable is on (null is the player's own). */
export type TowDrawn = { car: Car; fade: number; cableTo?: string | null };

/** A camera set down somewhere to watch something other than the player's truck. */
export type Shot = { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } };

/**
 * One frame of a film, and the ground the truck stands on in it: the plane's (flight.ts),
 * where that's its ramp and hold as well as the apron; the train's (rail-trip.ts), where
 * it's the flat wagon and its ramp (ADR 0022); the ferry's (ferry.ts), its car deck and
 * ramps as well as the causeway (ADR 0023); or the helicopter's (heli.ts), where it's just
 * the pad, when the truck isn't hanging under it (ADR 0024).
 */
export type Film =
  | { way: "plane"; frame: Frame; ground: Ground }
  | { way: "train"; frame: TrainFrame; ground: Ground }
  | { way: "boat"; frame: FerryFrame; ground: Ground }
  | { way: "heli"; frame: HeliFrame; ground: Ground };

/**
 * Gives back the graphics memory of everything under `object`: each mesh's geometry, an
 * instanced mesh's own buffers (where its instances stand, and their colours), and every
 * material `keep` doesn't claim, with its textures, which a material's own dispose leaves
 * alone. Geometry in `keptGeometry` is drawn by something else as well, so it stays.
 */
export function release(object: THREE.Object3D, keep: (m: THREE.Material) => boolean, keptGeometry: ReadonlySet<THREE.BufferGeometry> = new Set()) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!keptGeometry.has(o.geometry)) o.geometry.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
    for (const m of [o.material].flat()) {
      if (keep(m)) continue;
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

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

/**
 * The ground's height along local x of a model placed at (x, z) turned by `rot`, relative
 * to its origin: on the surface `y` high, where a bridge crosses over, or the higher one.
 */
function across(world: World, x: number, z: number, rot: number, y = world.height(x, z)) {
  return (lx: number) => world.height(x + lx * Math.cos(rot), z - lx * Math.sin(rot), y + 1) - y;
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
  const city = (world as Partial<CityWorld>).city;
  const vegas = (world as Partial<VegasWorld>).vegas;
  const japan = (world as Partial<JapanWorld>).japan;
  // On Washington Square the café has no gravel lot: the square is its patio. In Vegas it's a
  // diner, and in Japan a teahouse.
  const shop = vegas ? buildDiner(windows, glow) : japan ? buildTeahouse(windows, glow) : buildCoffeeShop(windows, glow, !city);
  const meet = place(shop.object, shop.colliders, world.cafe.x, world.cafe.z, world.cafe.rot);
  const cafe = { ...meet(shop.meet.x, shop.meet.z), r: shop.meet.r };
  if (city) place(centre.object, centre.colliders, city.fire.x, city.fire.z, world.camp.heading);
  else if (vegas) place(centre.object, centre.colliders, vegas.fire.x, vegas.fire.z, world.camp.heading);
  else if (japan) place(centre.object, centre.colliders, japan.fire.x, japan.fire.z, world.camp.heading);
  else if (world.id === "valley") {
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

/** The airstrip's runway, lights and terminal (ADR 0014), where there is one. The plane is the view's, not the world's. */
function placeAirport(world: World, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  const a = world.airport;
  if (!a) return { group, update: () => {} };
  const colliders: Obstacle[] = [];
  const model = buildAirport(windows, lamps);
  placer(world, group, colliders)(model.object, model.colliders, a.x, a.z, a.heading, a.y);
  world.addObstacles(colliders);
  return { group, update: model.update };
}

/**
 * The station, where there is one (ADR 0022): in the valley, the platform and house, the
 * branch out to the mountains with its points, and the tunnel's mouth; in the city, Fourth
 * and King and its line out to the tunnel under Potrero Hill.
 */
function placeStation(world: World, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  const st = world.station;
  if (!st) return { group, setPoints: () => {} };
  const colliders: Obstacle[] = [];
  const city = world.id === "city";
  const built = city ? buildCityStation(st, windows, lamps) : buildValleyStation(st, windows, lamps);
  group.add(built.object);
  for (const c of built.colliders) colliders.push({ ...c, h: Infinity });
  // The valley's loop is drawn with the railway; from the points on, and the city's whole line, here.
  group.add(buildRailLine(st.line, st.points ?? -2, st.portal + 40));
  group.add(buildPortal(st.line, st.portal, city ? PALETTE.city.stone : PALETTE.concrete));
  let setPoints: (t: number) => void = () => {};
  if (st.points !== null) {
    const points = buildPoints(st.line, st.points, st.side);
    group.add(points.object);
    for (const c of points.colliders) colliders.push({ ...c, h: Infinity });
    setPoints = points.set;
  }
  world.addObstacles(colliders);
  return { group, setPoints };
}

/** The causeway's bollards and lamps, where there's a dock (ADR 0023). The causeway is the ground's; the ferry is the view's. */
function placeDock(world: World, lamps: THREE.Material) {
  const group = new THREE.Group();
  const d = world.dock;
  if (!d) return group;
  const colliders: Obstacle[] = [];
  const board = dockBoard(d);
  const wait = Math.hypot(board.x - d.x, board.z - d.z);
  const built = buildCausewayDressing(lamps, PIER.length, PIER.half, PIER.top, wait, (lz) => pierTop(d, lz) - d.y, d.y - d.water + 6);
  placer(world, group, colliders)(built.object, built.colliders, d.x, d.z, d.heading, d.y);
  world.addObstacles(colliders);
  return group;
}

/**
 * San Francisco's own (ADR 0022): its buildings, its two bridges and its landmarks. The
 * street map is the terrain's, painted in its shader.
 */
function placeCity(world: CityWorld, windows: THREE.Material, lamps: THREE.Material, uniforms: CityUniforms) {
  const group = new THREE.Group();
  const buildings = buildBuildings(world.city.buildings, uniforms);
  group.add(buildings.object, buildBushes(world.city.flowers, PALETTE.city.flowers), buildCrookedLane(world.city.crooked.lane, (x, z) => world.height(x, z)));
  for (const d of world.city.decks) group.add(buildDeck(d, lamps));
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  const turning: ((time: number) => void)[] = [];
  for (const l of world.city.landmarks) {
    const built = buildCityLandmark(l.kind, windows, lamps);
    if (!built) continue;
    place(built.object, built.colliders, l.x, l.z, l.rot, l.y);
    if (built.update) turning.push(built.update);
  }
  // Where a bridge runs on off the edge of the world, toward Oakland, the road is closed.
  for (const d of world.city.decks) {
    const i = d.xs.findIndex((x, k) => Math.max(Math.abs(x), Math.abs(d.zs[k])) > world.limit - 10);
    if (i < 0) continue;
    const p = deckPoint(d, d.s[i]);
    const closure = buildClosure(d.half * 2, lamps);
    const at = place(closure.object, [], p.x, p.z, Math.atan2(p.fx, p.fz), p.y);
    // Solid on the deck, not to anything passing under it.
    for (const c of closure.colliders) colliders.push({ ...at(c.x, c.z), r: c.r, h: Infinity, bottom: p.y - 1.5 });
  }
  world.addObstacles(colliders);
  // The cable cars up Powell and over Russian Hill on Hyde, and the fog in through the Gate.
  const cables = buildCableCars(world.city.cable, (x, z) => world.height(x, z), windows, lamps);
  const fog = buildFogBank();
  group.add(cables.object, fog.object);
  return {
    group,
    /** `density` is the haze's, which says how far out the houses are drawn. */
    update(camera: THREE.Vector3, density: number, time: number, hour: number) {
      buildings.cull(camera, density);
      for (const t of turning) t(time);
      cables.update(time);
      fog.update(hour, time);
    },
    cull: buildings.cull,
    cableCars: cables.cars,
  };
}

/**
 * Every mission's start arch, gates and finish. Gates have no colliders, so a clipped
 * flag never stops you; the arches do. A loop that finishes where it began reuses that gate,
 * and one that comes home to its start arch finishes under it.
 */
function placeMissions(world: World, glow: THREE.Material) {
  const group = new THREE.Group();
  const colliders: Obstacle[] = [];
  const place = placer(world, group, colliders);
  const courses = world.missions.map((m) => {
    // Courses cross open country, so each post stands on its own ground: under a bridge
    // the course runs beneath, not up on its deck.
    const surface = courseGround((x, z, above) => world.height(x, z, above), m);
    const arch = buildStartArch(glow, across(world, m.start.x, m.start.z, m.start.heading, surface.start));
    place(arch.object, arch.colliders, m.start.x, m.start.z, m.start.heading, surface.start);
    const last = m.gates.length - 1;
    const end = m.gates[last];
    const loops = m.gates.slice(0, last).findIndex((g) => Math.hypot(g.x - end.x, g.z - end.z) < 5);
    const gates = m.gates.map((g, i) => {
      if (i === last && loops >= 0) return null;
      const model = buildGate(g.width, across(world, g.x, g.z, g.heading, surface.gates[i]));
      place(model.object, [], g.x, g.z, g.heading, surface.gates[i]);
      return model;
    });
    // A loop that comes home to its own start arch finishes under it: a second arch just
    // past it would stand in the way of the start.
    const home = Math.hypot(end.x - m.start.x, end.z - m.start.z) < 8;
    if (loops < 0 && !home) {
      // Just past the last gate, so the banner frames it as you come through.
      const [fx, fz] = [end.x + Math.sin(end.heading) * 6, end.z + Math.cos(end.heading) * 6];
      const y = world.height(fx, fz, surface.gates[last] + 1);
      const finish = buildFinishArch(glow, across(world, fx, fz, end.heading, y));
      place(finish.object, finish.colliders, fx, fz, end.heading, y);
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
  // The real lights are the same all session: the sky, the sun, the truck's two beams and
  // the train's lamp. Every lit material is compiled for how many there are, so one coming or
  // going would recompile them all at once. So other trucks have no beams (car-model.ts), and
  // the train's lamp stays in the scene in every world, dark where there's no train.
  const trainLamp = new THREE.SpotLight(PALETTE.headlight, 0, 120, 0.5, 0.6, 1.6);
  scene.add(trainLamp, trainLamp.target);

  // Shared glowing materials: lit windows, lamps on the train, embers and lanterns.
  const windows = new THREE.MeshLambertMaterial({ color: PALETTE.windowGlow, emissive: PALETTE.windowGlow, emissiveIntensity: 0.1 });
  const lamps = new THREE.MeshLambertMaterial({ color: PALETTE.headlight, emissive: PALETTE.headlight, emissiveIntensity: 0.4 });
  const embers = new THREE.MeshLambertMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.6 });
  const kept = new Set<THREE.Material>([windows, lamps, embers]);
  /** Geometry a world's models share with what outlives it: the valley's train is built from the same cars as the station's (train-model.ts). */
  const keptGeometry = new Set<THREE.BufferGeometry>();

  const sky = buildSky(FAR * 0.92);
  scene.add(sky.object);
  // The city's buildings: the night for their windows, and where the camera and the truck are for the cut-away.
  const cityUniforms: CityUniforms = { night: { value: 0 }, camera: { value: new THREE.Vector3() }, truck: { value: new THREE.Vector3() } };

  /**
   * Everything that belongs to one world: its ground, what grows and stands on it, and
   * the other players in it. A flight takes one down and puts another up (`setWorld`).
   */
  function stageFor(world: World) {
    const group = new THREE.Group();
    const surface = makeSurface(world);
    const city = (world as Partial<CityWorld>).city ? (world as CityWorld) : null;
    const vegas = (world as Partial<VegasWorld>).vegas ? (world as VegasWorld) : null;
    const japan = (world as Partial<JapanWorld>).japan ? (world as JapanWorld) : null;
    const streets = city ? kerbTexture(city.city.kerb) : vegas ? kerbTexture(vegas.vegas.kerb) : japan ? kerbTexture(japan.japan.kerb) : null;
    const terrain = buildTerrainMesh(world, surface, streets);
    const grass = buildGrass(world, surface);
    const water = buildWaterMesh(world);
    const railway = world.track.xs.length ? buildRailway(world, lamps, trainLamp) : null;
    const sites = placeGarages(world, windows);
    const camp = placeCamp(world, windows, embers);
    const courses = placeMissions(world, lamps);
    const landmarks = placeLandmarks(world, windows, embers);
    const airport = placeAirport(world, windows, lamps);
    const station = placeStation(world, windows, lamps);
    const town = city ? placeCity(city, windows, lamps, cityUniforms) : null;
    const strip = vegas ? buildVegasTown(vegas, windows, lamps) : null;
    const nippon = japan ? buildJapanTown(japan, windows, lamps) : null;
    const dock = placeDock(world, lamps);
    const pad = world.pad ? buildPadMarks(world.pad) : null;
    const wildlife = buildWildlife(world);
    const bushTones =
      world.id === "island" ? PALETTE.fern
      : world.id === "city" ? PALETTE.city.lawn
      : world.id === "vegas" ? PALETTE.vegas.creosote
      : world.id === "japan" ? PALETTE.japan.shrub
      : PALETTE.bush;
    group.add(
      terrain.object, grass.object, water.object,
      buildTrees(world.trees, (x, z) => sampleGrid(world.snow, x, z)),
      buildBushes(world.bushes, bushTones), buildRocks(world.rocks),
      sites.group, camp.group, courses.group, landmarks.group, airport.group, station.group, dock, wildlife.object,
    );
    if (railway) group.add(railway.object);
    if (town) group.add(town.group);
    if (strip) group.add(strip.object);
    if (nippon) group.add(nippon.object);
    if (pad) group.add(pad);
    scene.add(group);
    const remotes = createRemotes(scene, world);

    /** Gives back the graphics memory. What's shared with what outlives this world is left alone. */
    function dispose() {
      remotes.dispose();
      scene.remove(group);
      streets?.dispose();
      release(group, (m) => kept.has(m) || isShared(m), keptGeometry);
    }
    return { world, terrain, grass, water, railway, sites, camp, courses, landmarks, airport, station, town, strip, nippon, wildlife, remotes, dispose };
  }

  let world = first;
  let stage = stageFor(world);
  /** How far the camera sees in a world, with the sky's dome just inside that. */
  const fitView = (w: World) => {
    const far = farOf(w);
    camera.far = far;
    camera.updateProjectionMatrix();
    sky.object.scale.setScalar(far / FAR);
  };
  fitView(world);

  let car: CarModel = buildCar(vehicle);
  car.setLoadout(loadout);
  scene.add(car.object);
  // Bubbles behind the truck where only its snorkel lets it go: as deep as it could go without one.
  const bubbles = buildBubbles();
  scene.add(bubbles.object);
  const snorkelled = { on: false, dry: 0 };
  const fitBubbles = (v: VehicleId, l: Loadout) => {
    snorkelled.on = snorkelOf(l).fitted;
    snorkelled.dry = specFor(v, { ...l, snorkel: "none" }).wade;
  };
  fitBubbles(vehicle, loadout);
  // The dev panel's collider view (development builds only): hidden unless it's asked for.
  const colliders = buildColliderView();
  scene.add(colliders.object);
  const showroom = buildShowroom();

  // The plane stands on the airstrip of whichever world this is, until a flight moves it.
  const plane = buildPlane(windows);
  scene.add(plane.object);
  const clouds = buildClouds();
  scene.add(clouds);
  let rampOpen = 0;
  const park = () => {
    plane.object.visible = Boolean(world.airport);
    if (world.airport) plane.pose(standPose(world.airport));
    plane.setGear(1);
  };
  park();

  // The station's own train (ADR 0022): the one the film shows, and at Fourth and King the
  // one that always stands at the platform, the way the plane always stands on its stand.
  const stationTrain = buildStationTrain(lamps, CONSIST.map((c) => c.kind));
  scene.add(stationTrain.object);
  stationTrain.object.traverse((o) => {
    if (o instanceof THREE.Mesh) keptGeometry.add(o.geometry);
  });
  const standTrain = () => {
    const st = world.station;
    stationTrain.object.visible = Boolean(st && world.id === "city");
    if (st && world.id === "city") stationTrain.pose(carsOn(st.line, st.head, st.facing), 0);
  };
  standTrain();

  // The ferry (ADR 0023): tied up at the dock of whichever world has one, riding the water
  // there, the island's tide and all, until a crossing takes it.
  const ferry = buildFerry(windows, lamps);
  scene.add(ferry.object);
  const moor = () => {
    const d = world.dock;
    ferry.object.visible = Boolean(d);
    if (!d) return;
    const berth = fromDock(d, 0, PIER.length + FERRY.gap + FERRY.length / 2);
    ferry.pose(mooredPose(d, world.waterAt(berth.x, berth.z)));
    ferry.setRamps(0, 0, 0, 0);
  };
  moor();

  // The helicopter (ADR 0024): standing beside the pad of whichever world has one, rotors
  // still, its hook wound in, until a trip takes it.
  const heli = buildHeli();
  scene.add(heli.object, heli.rigging);
  const standHeli = () => {
    const p = world.pad;
    heli.object.visible = heli.rigging.visible = Boolean(p);
    if (!p) return;
    const pose = parked(p, (x, z) => world.height(x, z));
    heli.pose(pose);
    heli.rig(hookOf(pose, 0), null);
    heli.spin(0, 0);
  };
  standHeli();
  /** Where the slings come down to on the truck: its roof's corners, just outside them. */
  const slingAt = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const slingCorners = () => {
    const v = vehicleById(car.vehicle);
    car.object.updateMatrixWorld();
    slingAt.forEach((c, i) => {
      const [sx, sz] = [i % 2 ? 1 : -1, i < 2 ? 1 : -1];
      c.set(sx * (v.width / 2 + 0.05), v.height - v.ride + 0.05, sz * v.length * 0.36).applyMatrix4(car.object.matrixWorld);
    });
    return slingAt;
  };
  /** The ground for the truck's own wheels: the deck it's on or the ground under it, by how high it already is. */
  let underTruck = 0;
  const truckGround: Ground = {
    height: (x, z) => world.height(x, z, underTruck),
    waterAt: (x, z) => world.waterAt(x, z),
    slipAt: (x, z) => world.slipAt(x, z),
    obstaclesNear: (x, z) => world.obstaclesNear(x, z),
    get limit() {
      return world.limit;
    },
  };

  // Winch cables: a thin rod each, stretched between two trucks while one pulls the other off a rock.
  const cableMat = new THREE.MeshLambertMaterial({ color: PALETTE.cable });
  const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  const cables: THREE.Mesh[] = [];
  let ropes: Rope[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const span = new THREE.Vector3();
  // BBB's tow trucks: models are made as they're needed and kept for the next call-out.
  const towTrucks: TowTruck[] = [];
  let tows: TowDrawn[] = [];
  /** Something for the chase camera to turn and look at past the truck, such as a tow truck driving in. */
  let facing: { x: number; z: number } | null = null;
  // Other trucks' headlights: a few real beams, lent each frame to the nearest of them
  // (car-model.ts). Made the first time another truck is drawn, so single player, which
  // never has one, doesn't pay for them; that once, the lit materials compile again.
  let beamPool: BeamPool | null = null;
  const others: { model: CarModel; fade: number }[] = [];
  function lendBeams(night: number) {
    others.length = 0;
    for (const model of stage.remotes.models()) others.push({ model, fade: 1 });
    tows.forEach((t, i) => void (towTrucks[i] && others.push({ model: towTrucks[i], fade: t.fade })));
    if (!beamPool && !others.length) return;
    beamPool ??= createBeamPool(scene);
    beamPool.lend(others, camera.position, night);
  }

  function drawTows(dt: number, time: number, night: number) {
    tows.forEach((t, i) => {
      let model = towTrucks[i];
      if (!model) {
        model = buildTowTruck();
        scene.add(model.object);
        towTrucks.push(model);
      }
      model.object.visible = t.fade > 0;
      model.setFade(t.fade);
      model.update(t.car, world, dt, TOW_SPEC);
      model.setLights(night);
      model.blink(time);
    });
    for (let i = tows.length; i < towTrucks.length; i++) towTrucks[i].object.visible = false;
  }

  /** Lays each cable from the winch to the stuck truck, as the two are drawn this frame. */
  function drawCables(mine: Car, spec: CarSpec) {
    const truck = (id: string | null) => (id === null ? { car: mine, spec } : stage.remotes.truck(id));
    const pairs = [
      ...ropes.map((rope) => [truck(rope.from), truck(rope.to)] as const),
      ...tows.filter((t) => t.cableTo !== undefined).map((t) => [{ car: t.car, spec: TOW_SPEC }, truck(t.cableTo ?? null)] as const),
    ];
    let used = 0;
    for (const [a, b] of pairs) {
      if (!a || !b) continue;
      const { from, to } = cableEnds(a.car, a.spec, b.car, b.spec);
      let mesh = cables[used];
      if (!mesh) {
        mesh = new THREE.Mesh(cableGeo, cableMat);
        scene.add(mesh);
        cables.push(mesh);
      }
      used++;
      span.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const length = span.length();
      mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      mesh.quaternion.setFromUnitVectors(up, span.divideScalar(length || 1));
      mesh.scale.set(1, length, 1);
      mesh.visible = true;
    }
    for (let i = used; i < cables.length; i++) cables[i].visible = false;
  }

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
  /** Whether the last frame was the train's film, so the station's train goes back to standing when it ends. */
  let wasRiding = false;
  /** And the helicopter's, so it goes back to its stand. */
  let wasLifting = false;
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
  function render(state: Car, dt: number, time: number, spec: CarSpec, circling = false, film: Film | null = null, watch: Shot | null = null) {
    hour = hourAt(time);
    const daylight = skyAt(hour);
    night = daylight.night;
    sky.apply(daylight, scene, fog, hemi, sun);
    fog.density *= airOf(world);
    car.setLights(night);
    windows.emissiveIntensity = 0.1 + night * 1.6;
    lamps.emissiveIntensity = 0.4 + night * 2.2;
    embers.emissiveIntensity = 0.6 + night * 1.8 + Math.sin(time * 7) * 0.15;

    underTruck = state.y - spec.ride - 0.5;
    car.update(state, film?.ground ?? truckGround, dt, spec);
    // Its exhaust under water deeper than it could ford without its snorkel: it bubbles, up
    // from just behind the back bumper, where the exhaust comes out.
    const water = world.waterAt(state.x, state.z);
    const back = vehicleById(car.vehicle).length * 0.5 + 0.5;
    const bubbling = snorkelled.on && !film && hover < 0 && water - world.height(state.x, state.z) > snorkelled.dry;
    bubbles.update(dt, bubbling ? {
      x: state.x - Math.sin(state.heading) * back, z: state.z - Math.cos(state.heading) * back, water,
      rate: 16 + Math.min(1, Math.abs(state.speed) / 6) * 24,
    } : null);
    if (colliders.object.visible) colliders.update(world, state.x, state.z);
    stage.remotes.update(dt, performance.now() / 1000, night);
    drawTows(dt, time, night);
    lendBeams(night);
    drawCables(state, spec);
    stage.grass.update(state.x, state.z, time);
    stage.water.update(time);
    if (world.sea) {
      // The tide: the sea is one level sheet, wherever it's asked for.
      const sea = world.waterAt(0, 0);
      stage.water.setSea(sea);
      stage.terrain.setSea(sea);
    }
    stage.railway?.update(time, dt, night);
    stage.airport.update(time, night);
    // The animals keep out of the way of every truck and the train.
    const threats: Threat[] = [{ x: state.x, z: state.z, speed: state.speed, heading: state.heading }];
    for (const p of stage.remotes.positions()) threats.push(p);
    const trainSpeed = world.track.xs.length ? trainMotion(world.track, time).speed : 0;
    for (const c of stage.railway?.cars() ?? []) threats.push({ x: c.x, z: c.z, speed: trainSpeed, heading: c.yaw });
    stage.wildlife.update(dt, time, threats, state);

    // The plane: where the film has it, or on its stand with the ramp coming shut behind the truck.
    const flight = film?.way === "plane" ? film.frame : null;
    if (flight) {
      plane.pose(flight.plane);
      plane.setGear(flight.gear);
      rampOpen = flight.ramp;
      if (flight.cruising && !clouds.visible) {
        // Laid along the way it's flying, a little ahead, once: the plane moves through them.
        const p = flight.plane;
        clouds.position.set(p.x + Math.sin(p.heading) * 160, p.y, p.z + Math.cos(p.heading) * 160);
        clouds.rotation.y = p.heading;
      }
    } else rampOpen = Math.max(0, rampOpen - dt * RAMP_SHUTS);
    clouds.visible = Boolean(flight?.cruising);
    plane.setRamp(rampOpen);
    plane.update(time, night);

    // The train's film (ADR 0022): its own train where the film has it, the points as the
    // film sets them, and in the valley the timetable's train put away while it plays.
    const ride = film?.way === "train" ? film.frame : null;
    if (ride) {
      stationTrain.object.visible = true;
      stationTrain.pose(ride.cars, ride.ramp);
      stage.station.setPoints(ride.points);
    } else if (wasRiding) {
      standTrain();
      stage.station.setPoints(0);
    }
    wasRiding = Boolean(ride);
    stage.railway?.showTrain(!ride);
    stage.town?.update(camera.position, fog.density, time, hour);
    stage.strip?.update(time, night);
    stage.nippon?.update(time);
    cityUniforms.night.value = night;

    // The ferry: where the film has it, its ramps as the film sets them, or tied up.
    const crossing = film?.way === "boat" ? film.frame : null;
    const d = world.dock;
    if (crossing && d) {
      ferry.object.visible = true;
      ferry.pose(crossing.ferry);
      const edge = fromDock(d, 0, PIER.length - 1);
      ferry.setRamps(crossing.ramps[0], crossing.ramps[1], world.height(edge.x, edge.z) - (crossing.ferry.y + FERRY.deck), 0);
    } else moor();
    ferry.update(time, night);

    // The helicopter: where the film has it, its rotors and its cable as the film sets them,
    // the slings down to the truck while it's hooked; or standing by its pad.
    const lift = film?.way === "heli" ? film.frame : null;
    if (lift) {
      heli.object.visible = heli.rigging.visible = true;
      heli.pose(lift.heli);
      heli.spin(lift.rotor, dt);
      heli.rig(hookOf(lift.heli, lift.cable), lift.slung && lift.truck ? slingCorners() : null);
    } else if (wasLifting) standHeli();
    wasLifting = Boolean(lift);
    heli.update(time, night);

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
    // Hidden, its beams stay in the scene, dark: the lights mustn't come and go (see `trainLamp`).
    car.show(hover < 0 && (!film || film.frame.truck !== null));
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
    } else if (watch) {
      // Set down where it's told, turning to follow what it's watching.
      camPos.set(watch.from.x, watch.from.y, watch.from.z);
      aim.set(watch.to.x, watch.to.y, watch.to.z);
      camera.position.copy(camPos);
      camera.lookAt(aim);
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
      // Behind the truck, looking where it's going; or round to one side, to look past it at something.
      const toward = facing ? Math.atan2(facing.x - state.x, facing.z - state.z) : state.heading;
      let dy = toward - camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      camYaw += dy * ease(2.2);
      const dist = 11.5 + Math.abs(state.speed) * 0.1;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      want.set(state.x - fx * dist, state.y + 8.5 + Math.abs(state.speed) * 0.05, state.z - fz * dist);
      // Clear of the ground, or of the deck the truck is on: not of a bridge high over it.
      want.y = Math.max(want.y, world.height(want.x, want.z, state.y - 2) + 2.5);
      look.set(state.x + fx * 4, state.y + 0.4, state.z + fz * 4);
      follow(4);
    }
    if (!film) shot = -1;

    // The shadow box follows the car, or the plane while it's the one to watch; snapping
    // it to texels stops it shimmering.
    const focus = flight ? flight.plane : ride ? ride.camera.to : crossing ? crossing.camera.to : lift ? lift.camera.to : watch ? watch.to : state;
    const texel = (SHADOW_SPAN * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(focus.x / texel) * texel;
    const tz = Math.round(focus.z / texel) * texel;
    lightDir.set(...daylight.lightDir);
    sun.target.position.set(tx, focus.y, tz);
    sun.position.set(tx, focus.y, tz).addScaledVector(lightDir, 400);
    sun.target.updateMatrixWorld();

    cityUniforms.camera.value.copy(camera.position);
    cityUniforms.truck.value.set(state.x, state.y + 0.6, state.z);
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
    // The floor is what the truck's own wheels stand on: under a bridge it's the ground, not the deck over it.
    const at = cameraAt(shown, centre, (x, z) => Math.max(truckGround.height(x, z), world.waterAt(x, z)));
    camPos.set(at.x, at.y, at.z);
    // From where the chase camera was looking, a little ahead of the truck, to the truck.
    aim.lerp(centre, k);
    if (!stale && camPos.distanceToSquared(drawnAt) < 1e-6 && aim.distanceToSquared(drawnAim) < 1e-6) return;
    stale = false;
    drawnAt.copy(camPos);
    drawnAim.copy(aim);
    camera.position.copy(camPos);
    camera.lookAt(aim);
    cityUniforms.camera.value.copy(camera.position);
    cityUniforms.truck.value.set(state.x, state.y + 0.6, state.z);
    // Only what's drawn changes with the camera: the cars, the sails and the fog stay where they stopped.
    stage.town?.cull(camera.position, fog.density);
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
    fitBubbles(v, l);
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
    // Dark until a train in the new world, if there is one, takes it.
    trainLamp.intensity = 0;
    world = next;
    stage = stageFor(world);
    fitView(world);
    park();
    standTrain();
    moor();
    standHeli();
    wasRiding = false;
    wasLifting = false;
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
    /** The dev panel's collider view: what a truck runs into round it, drawn. */
    showColliders: (on: boolean) => colliders.show(on),
    setDoor: (i: number, open: number) => stage.sites.models[i]?.setDoor(open),
    showRun: (mission: number, next: number, time: number) => stage.courses.show(mission, next, time),
    /** Which trucks have a winch cable between them just now. */
    setRopes: (list: Rope[]) => void (ropes = list),
    /** BBB's tow trucks to draw this frame. */
    setTows: (list: TowDrawn[]) => void (tows = list),
    /** Turns the chase camera to look past the truck at something, until it's given null. */
    face: (at: { x: number; z: number } | null) => void (facing = at),
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
    /** San Francisco's cable cars where they are just now; none anywhere else. */
    cableCars: () => stage.town?.cableCars() ?? [],
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

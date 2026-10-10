import * as THREE from "three";
import { PALETTE } from "./palette";
import { buildCar, type CarModel } from "./car-model";
import { specFor, type Loadout } from "./shop";
import { vehicleById, type VehicleId } from "./vehicles";
import type { SiteStyle } from "./world";

/** The inside of every garage: walls dressed per style, a bench, and your truck in the middle. */
const WALLS: Record<SiteStyle, { wall: string; floor: string }> = {
  workshop: { wall: PALETTE.plaster, floor: PALETTE.concrete },
  barn: { wall: PALETTE.barnRed, floor: PALETTE.timber },
  bunker: { wall: PALETTE.concreteDark, floor: PALETTE.concrete },
  quonset: { wall: PALETTE.corrugated, floor: PALETTE.concrete },
  cabin: { wall: PALETTE.logWood, floor: PALETTE.timber },
  container: { wall: PALETTE.shipping[1], floor: PALETTE.concreteDark },
  hangar: { wall: PALETTE.roofTin, floor: PALETTE.concrete },
  ranch: { wall: PALETTE.timber, floor: PALETTE.timber },
  shack: { wall: PALETTE.bamboo, floor: PALETTE.wetSand },
  outpost: { wall: PALETTE.driftwood, floor: PALETTE.wetSand },
  lodge: { wall: PALETTE.logWood, floor: PALETTE.timber },
};

export const GARAGE_NAMES: Record<SiteStyle, string> = {
  workshop: "The Roadside Workshop",
  barn: "The Red Barn",
  bunker: "The Bunker",
  quonset: "The Quonset Hut",
  cabin: "The Log Cabin",
  container: "The Container Yard",
  hangar: "The Airstrip Hangar",
  ranch: "The Ranch",
  shack: "The Beach Shack",
  outpost: "The Dune Outpost",
  lodge: "The Jungle Lodge",
};

export function buildShowroom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.void);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 80);

  const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const wallMat = lambert(PALETTE.plaster);
  const floorMat = lambert(PALETTE.concrete);
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // A room 14 wide, 16 deep, 5 high, open toward the camera's side.
  box(floorMat, 14, 0.2, 16, 0, -0.1, 0);
  box(wallMat, 14, 5, 0.3, 0, 2.5, -8);
  box(wallMat, 0.3, 5, 16, -7, 2.5, 0);
  box(wallMat, 0.3, 5, 16, 7, 2.5, 0);
  box(wallMat, 14, 0.3, 16, 0, 5.1, 0);
  // Workbench, pegboard, a stack of tyres, a drum, a hanging lamp.
  const wood = lambert(PALETTE.timber);
  box(wood, 4, 0.12, 1, -3.5, 1, -7.3);
  for (const x of [-5.3, -1.7]) box(wood, 0.12, 1, 0.9, x, 0.5, -7.3);
  box(lambert(PALETTE.boardsGrey), 4.2, 1.6, 0.05, -3.5, 2.3, -7.8);
  const tools = lambert(PALETTE.carTrim);
  for (let i = 0; i < 6; i++) box(tools, 0.12, 0.5 + (i % 3) * 0.15, 0.06, -5.1 + i * 0.7, 2.3, -7.74);
  const tyre = lambert(PALETTE.tyre);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 12), tyre);
    t.position.set(5.6, 0.16 + i * 0.33, -6.4);
    t.castShadow = true;
    scene.add(t);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), lambert(PALETTE.shipping[0]));
  drum.position.set(5.4, 0.45, -4.8);
  scene.add(drum);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.4, 10, 1, true), lambert(PALETTE.lightBar));
  shade.position.set(0, 4.3, 0);
  scene.add(shade);

  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
  const bulb = new THREE.PointLight(PALETTE.windowGlow, 60, 18, 1.6);
  bulb.position.set(0, 4, 0);
  bulb.castShadow = true;
  bulb.shadow.mapSize.set(1024, 1024);
  scene.add(bulb);
  const fill = new THREE.DirectionalLight(PALETTE.sunLight, 1.2);
  fill.position.set(6, 8, 10);
  scene.add(fill);

  let car: CarModel | null = null;
  let sweep = 0;
  let offset = 0;
  let style: SiteStyle = "workshop";

  function open(s: SiteStyle, vehicle: VehicleId, loadout: Loadout) {
    style = s;
    wallMat.color.set(WALLS[style].wall);
    floorMat.color.set(WALLS[style].floor);
    setRig(vehicle, loadout);
  }

  /** The truck on the floor: rebuilt for a different rig, refitted for different parts. */
  function setRig(vehicle: VehicleId, l: Loadout) {
    if (car?.vehicle !== vehicle) {
      if (car) {
        scene.remove(car.object);
        car.dispose();
      }
      car = buildCar(vehicle);
      scene.add(car.object);
    }
    car.setLoadout(l);
    car.setLights(0.85);
    car.park(specFor(vehicle, l));
  }

  /**
   * The camera drifts back and forth across the open front of the room; `turn` nudges it
   * (dragging or the arrow keys). It never swings round behind a wall.
   */
  function render(renderer: THREE.WebGLRenderer, dt: number, turn: number) {
    sweep += dt * 0.15;
    offset = Math.max(-0.85, Math.min(0.85, offset + turn));
    const angle = Math.max(-0.85, Math.min(0.85, Math.sin(sweep) * 0.6 + offset));
    // Stand back further for the long pickups.
    const r = 4.6 + (car ? vehicleById(car.vehicle).length : 4.5) * 0.85;
    camera.position.set(Math.sin(angle) * r, 3.2, Math.cos(angle) * r);
    camera.lookAt(0, 0.9, 0);
    car?.glint(dt);
    renderer.render(scene, camera);
  }

  /** Frames the truck beside the menu: to its left on wide screens, above it on phones. */
  function resize(w: number, h: number) {
    camera.aspect = w / Math.max(1, h);
    if (w >= 640) camera.setViewOffset(w, h, w * 0.15, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
  }

  return { open, setRig, render, resize, dispose };
}

import * as THREE from "three";
import { buildCrossing } from "./crossing-model";
import { PALETTE } from "./palette";
import { tiled } from "./scenery";
import { crossingClosed, trackPoint, trainCars, type TrainCar } from "./track";
import { LOCO_LAMP, buildTrainCar } from "./train-model";
import type { Obstacle, Track, World } from "./world";

/**
 * Everything on the railway: rails, sleepers, ballast, timber trestles where it crosses
 * the rivers, the level crossings with their dirt roads, and the train itself.
 */
const GAUGE = 1.5;

type Frame = { x: number; y: number; z: number; lx: number; lz: number };

/** Position and left-pointing unit vector at every track point. */
function frames(track: Track): Frame[] {
  const n = track.xs.length;
  return track.xs.map((x, i) => {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const tx = track.xs[b] - track.xs[a];
    const tz = track.zs[b] - track.zs[a];
    const l = Math.hypot(tx, tz) || 1;
    // Left of travel, matching the truck's convention: (cos h, −sin h) for heading h.
    return { x, y: track.ys[i], z: track.zs[i], lx: tz / l, lz: -tx / l };
  });
}

/** A box-section ribbon (top and both sides) following the loop, offset sideways. */
function ribbon(fr: Frame[], offset: number, width: number, top: number, bottom: number, keep: (i: number) => boolean) {
  const pos: number[] = [];
  const n = fr.length;
  for (let i = 0; i < n; i++) {
    if (!keep(i) || !keep((i + 1) % n)) continue;
    const a = fr[i];
    const b = fr[(i + 1) % n];
    const corner = (f: Frame, side: number, y: number) => [f.x + f.lx * (offset + side * width / 2), f.y + y, f.z + f.lz * (offset + side * width / 2)];
    const [al, ar, bl, br] = [corner(a, 1, top), corner(a, -1, top), corner(b, 1, top), corner(b, -1, top)];
    const [alb, arb, blb, brb] = [corner(a, 1, bottom), corner(a, -1, bottom), corner(b, 1, bottom), corner(b, -1, bottom)];
    // Top, then the left and right faces, each as two triangles.
    pos.push(...al, ...bl, ...ar, ...ar, ...bl, ...br);
    pos.push(...alb, ...blb, ...al, ...al, ...blb, ...bl);
    pos.push(...ar, ...br, ...arb, ...arb, ...br, ...brb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function onBridge(track: Track, s: number) {
  return track.bridges.some(([a, b]) => s >= a && s <= b);
}

/** A strip of dirt road draped over the terrain, for each level crossing. */
function buildRoads(world: World) {
  const { track } = world;
  const pos: number[] = [];
  for (const s of track.crossings) {
    const p = trackPoint(track, s);
    const q = trackPoint(track, s + 5);
    const tl = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    // Road runs at right angles to the rails.
    const rx = (q.z - p.z) / tl;
    const rz = -(q.x - p.x) / tl;
    const half = 2.6;
    for (let d = -45; d < 45; d += 3) {
      const at = (dd: number, side: number) => {
        const x = p.x + rx * dd - rz * side * half;
        const z = p.z + rz * dd + rx * side * half;
        return [x, world.height(x, z) + 0.07, z];
      };
      const [a, b, c, e] = [at(d, -1), at(d, 1), at(d + 3, -1), at(d + 3, 1)];
      pos.push(...a, ...c, ...b, ...b, ...c, ...e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: PALETTE.dirt[0], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildRailway(world: World, lampMaterial: THREE.MeshLambertMaterial) {
  const { track } = world;
  const fr = frames(track);
  const spacing = track.length / fr.length;
  const group = new THREE.Group();
  const bridged = (i: number) => onBridge(track, i * spacing);

  const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const railMat = lambert(PALETTE.rail);
  const ballastMat = lambert(PALETTE.ballast);
  const timberMat = lambert(PALETTE.timber);

  // Ballast on the ground; a timber deck on the bridges.
  const ballast = new THREE.Mesh(ribbon(fr, 0, 3.6, -0.28, -0.42, (i) => !bridged(i)), ballastMat);
  ballast.receiveShadow = true;
  const deck = new THREE.Mesh(ribbon(fr, 0, 4.2, -0.28, -0.7, bridged), timberMat);
  deck.castShadow = deck.receiveShadow = true;
  group.add(ballast, deck);
  for (const side of [1, -1]) {
    const rail = new THREE.Mesh(ribbon(fr, (side * GAUGE) / 2, 0.12, 0, -0.16, () => true), railMat);
    rail.receiveShadow = true;
    const guard = new THREE.Mesh(ribbon(fr, side * 2.05, 0.1, 0.9, 0.78, bridged), timberMat);
    group.add(rail, guard);
  }

  // Sleepers every metre, and trestle legs every ten down to the ground under a bridge.
  const sleepers: { x: number; z: number; y: number; yaw: number }[] = [];
  const legs: { x: number; z: number; y: number; yaw: number; h: number }[] = [];
  for (let s = 0; s < track.length; s += 1) {
    const p = trackPoint(track, s);
    const q = trackPoint(track, s + 1);
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    sleepers.push({ x: p.x, z: p.z, y: p.y - 0.22, yaw });
    if (onBridge(track, s) && Math.round(s) % 10 === 0) {
      for (const side of [1, -1]) {
        const lx = Math.cos(yaw) * side * 1.7;
        const lz = -Math.sin(yaw) * side * 1.7;
        const ground = world.height(p.x + lx, p.z + lz);
        if (p.y - 0.7 - ground > 0.5) legs.push({ x: p.x + lx, z: p.z + lz, y: (p.y - 0.7 + ground) / 2 - 1, yaw, h: p.y - 0.7 - ground + 2 });
      }
    }
  }
  const sleeperColour = new THREE.Color(PALETTE.sleeper);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  // White materials, so each instance's colour comes through as-is.
  const tinted = new THREE.MeshLambertMaterial({ flatShading: true });
  group.add(tiled(sleepers, new THREE.BoxGeometry(2.5, 0.14, 0.24), tinted, (sl, mm, c) => {
    mm.compose(v.set(sl.x, sl.y, sl.z), q.setFromAxisAngle(up, sl.yaw), one);
    c.copy(sleeperColour);
  }));
  const timberColour = new THREE.Color(PALETTE.timber);
  group.add(tiled(legs, new THREE.BoxGeometry(0.35, 1, 0.35), tinted, (leg, mm, c) => {
    mm.compose(v.set(leg.x, leg.y, leg.z), q.setFromAxisAngle(up, leg.yaw), new THREE.Vector3(1, leg.h, 1));
    c.copy(timberColour);
  }));

  group.add(buildRoads(world));

  // Level crossings.
  const signal = new THREE.MeshLambertMaterial({ color: PALETTE.signalRed, emissive: PALETTE.signalRed, emissiveIntensity: 0 });
  const crossings = track.crossings.map((s) => {
    const p = trackPoint(track, s);
    const nx = trackPoint(track, s + 2);
    const model = buildCrossing(signal);
    model.object.position.set(p.x, world.height(p.x, p.z), p.z);
    model.object.rotation.y = Math.atan2(nx.x - p.x, nx.z - p.z);
    group.add(model.object);
    return { s, model, down: 0 };
  });
  const crossingColliders: Obstacle[] = [];
  for (const c of crossings) {
    const o = c.model.object;
    for (const col of c.model.colliders) {
      const cos = Math.cos(o.rotation.y);
      const sin = Math.sin(o.rotation.y);
      crossingColliders.push({ x: o.position.x + col.x * cos + col.z * sin, z: o.position.z - col.x * sin + col.z * cos, r: col.r, h: Infinity });
    }
  }
  world.addObstacles(crossingColliders);

  // The train, and a lamp on the front that matters after dark.
  const cars = trainCars(track, 0).map((c) => {
    const built = buildTrainCar(c.kind, lampMaterial);
    built.object.rotation.order = "YXZ";
    group.add(built.object);
    return built;
  });
  const lamp = new THREE.SpotLight(PALETTE.headlight, 0, 120, 0.5, 0.6, 1.6);
  lamp.position.copy(LOCO_LAMP);
  lamp.target.position.set(LOCO_LAMP.x, LOCO_LAMP.y - 3, LOCO_LAMP.z + 30);
  cars[0].object.add(lamp, lamp.target);

  let poses: TrainCar[] = [];

  function update(time: number, dt: number, night: number) {
    poses = trainCars(track, time);
    poses.forEach((p, i) => {
      cars[i].object.position.set(p.x, p.y, p.z);
      cars[i].object.rotation.set(-p.pitch, p.yaw, 0);
    });
    lamp.intensity = night * 900;
    for (const c of crossings) {
      const closed = crossingClosed(track, c.s, time);
      c.down += Math.sign((closed ? 1 : 0) - c.down) * Math.min(Math.abs((closed ? 1 : 0) - c.down), dt * 0.7);
      c.model.update(c.down, closed, time);
    }
  }

  return { object: group, update, cars: () => poses };
}

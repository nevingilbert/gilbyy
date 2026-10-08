import * as THREE from "three";
import { buildCrossing } from "./crossing-model";
import { Kit } from "./garages";
import { PALETTE } from "./palette";
import { tiled } from "./scenery";
import {
  ABUTMENT_HALF, DECK_UNDERSIDE, GUARD_LENGTH, POST_SET, POST_SIDE,
  bridgeEnds, crossingClosed, trackFrame, trackPoint, trainCars, trestleLegs, type BridgeEnd, type TrainCar,
} from "./track";
import { LOCO_LAMP, buildTrainCar } from "./train-model";
import type { Obstacle, Track, World } from "./world";

/**
 * Everything on the railway: rails, sleepers, ballast, timber trestles on concrete
 * abutments where it crosses the rivers, the level crossings with their dirt roads, and
 * the train itself.
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

/**
 * A box-section ribbon following the loop, offset sideways, over the segments `keep` picks.
 * Closed top to bottom, so it casts a full shadow (the shadow pass draws back faces) and
 * the deck is solid seen from under a bridge.
 */
function ribbon(fr: Frame[], offset: number, width: number, top: number, bottom: number, keep: (i: number) => boolean) {
  const pos: number[] = [];
  const n = fr.length;
  for (let i = 0; i < n; i++) {
    if (!keep(i)) continue;
    const a = fr[i];
    const b = fr[(i + 1) % n];
    const corner = (f: Frame, side: number, y: number) => [f.x + f.lx * (offset + side * width / 2), f.y + y, f.z + f.lz * (offset + side * width / 2)];
    const [al, ar, bl, br] = [corner(a, 1, top), corner(a, -1, top), corner(b, 1, top), corner(b, -1, top)];
    const [alb, arb, blb, brb] = [corner(a, 1, bottom), corner(a, -1, bottom), corner(b, 1, bottom), corner(b, -1, bottom)];
    // Top, left, right and bottom, each as two triangles wound to face outward.
    pos.push(...al, ...ar, ...bl, ...ar, ...br, ...bl);
    pos.push(...alb, ...al, ...blb, ...al, ...bl, ...blb);
    pos.push(...ar, ...arb, ...br, ...arb, ...brb, ...br);
    pos.push(...alb, ...blb, ...arb, ...arb, ...blb, ...brb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function onBridge(track: Track, s: number) {
  return track.bridges.some(([a, b]) => s >= a && s <= b);
}

/** Dirt strips draped over the terrain: one across each level crossing, and the camp's roads. */
function buildRoads(world: World) {
  const { track } = world;
  const pos: number[] = [];
  const strip = (ax: number, az: number, bx: number, bz: number, half: number) => {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const at = (d: number, side: number) => {
      const x = ax + ux * d - uz * side * half;
      const z = az + uz * d + ux * side * half;
      return [x, world.height(x, z) + 0.07, z];
    };
    // Overlap the ends a little so joined segments leave no gap at the corner.
    for (let d = -half; d < len + half; d += 3) {
      const [a, b, c, e] = [at(d, -1), at(d, 1), at(d + 3, -1), at(d + 3, 1)];
      pos.push(...a, ...b, ...c, ...b, ...e, ...c);
    }
  };
  for (const s of track.crossings) {
    const p = trackPoint(track, s);
    const q = trackPoint(track, s + 5);
    const tl = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    // Road runs at right angles to the rails.
    const rx = (q.z - p.z) / tl;
    const rz = -(q.x - p.x) / tl;
    strip(p.x - rx * 45, p.z - rz * 45, p.x + rx * 45, p.z + rz * 45, 2.6);
  }
  for (const road of world.roads) {
    for (let i = 1; i < road.xs.length; i++) strip(road.xs[i - 1], road.zs[i - 1], road.xs[i], road.zs[i], 2.8);
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

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/**
 * Across the guard, where its pyramids stand: between the rails, low enough for the axles
 * (0.38 m up) to clear; outside them, a little taller, under the loco's fuel tank (0.33 m).
 */
const TEETH_INSIDE = [-0.45, 0, 0.45];
const TEETH_OUTSIDE = [1.05, 1.5, 1.95, 2.4];

/**
 * One end of a bridge. A concrete abutment under the deck from the bank out to where a
 * truck fits beneath it, a post with a no-vehicles sign either side at its head, and a
 * trespass guard across the approach: rows of low pyramids, between and beside the rails,
 * that the train rolls over and a truck can't.
 */
function bridgeEnd(kit: Kit, world: World, end: BridgeEnd, spacing: number, mats: Record<"body" | "cap" | "guard" | "ring" | "face", THREE.Material>) {
  const { track } = world;
  // From under the last stretch of deck before the bank, out to the face, and down below the lowest ground under it.
  const from = end.bank - end.dir * spacing;
  const a = trackPoint(track, from);
  const b = trackPoint(track, end.deep);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  let low = Infinity;
  for (let k = 0; k <= 10; k++) {
    const f = trackFrame(track, from + ((end.deep - from) * k) / 10);
    for (const side of [-1, 0, 1]) low = Math.min(low, world.height(f.x + f.lx * side * ABUTMENT_HALF, f.z + f.lz * side * ABUTMENT_HALF));
  }
  const top = (a.y + b.y) / 2 - DECK_UNDERSIDE;
  const tall = top - low + 1.5;
  // Tilted to the grade, so the deck sits on it all the way along.
  const pitch = -Math.atan2(b.y - a.y, len);
  const slab = kit.at((a.x + b.x) / 2, top, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z));
  slab.box(mats.body, ABUTMENT_HALF * 2, tall, len, 0, -tall / 2, 0, pitch);
  slab.box(mats.cap, ABUTMENT_HALF * 2 + 0.3, 0.4, len + 0.3, 0, -0.2, 0, pitch);

  // The guard and the posts, facing the approach: local +z runs out onto the bridge.
  const f = trackFrame(track, end.bank);
  const head = kit.at(f.x, f.y, f.z, Math.atan2(f.fx * end.dir, f.fz * end.dir));
  for (let z = -GUARD_LENGTH + 0.25; z < 0; z += 0.5) {
    // Square pyramids standing on the deck (0.28 m below the rail tops), their bases square to the rails.
    for (const x of TEETH_INSIDE) head.add(mats.guard, new THREE.ConeGeometry(0.25, 0.43, 4), x, -0.065, z, 0, Math.PI / 4);
    for (const x of TEETH_OUTSIDE) for (const s of [1, -1]) head.add(mats.guard, new THREE.ConeGeometry(0.25, 0.53, 4), s * x, -0.015, z, 0, Math.PI / 4);
  }
  for (const s of [1, -1]) {
    const post = head.at(s * POST_SIDE, 0, POST_SET);
    post.box(mats.cap, 0.5, 2.1, 0.5, 0, 0.35, 0);
    post.box(mats.body, 0.6, 0.16, 0.6, 0, 1.45, 0);
    post.cyl(mats.ring, 0.3, 0.04, 0, 0.95, -0.27, Math.PI / 2, 0, 16);
    post.cyl(mats.face, 0.22, 0.04, 0, 0.95, -0.29, Math.PI / 2, 0, 16);
  }
}

export function buildRailway(world: World, lampMaterial: THREE.MeshLambertMaterial) {
  const { track } = world;
  const fr = frames(track);
  const spacing = track.length / fr.length;
  const group = new THREE.Group();
  const n = fr.length;
  const bridged = (i: number) => onBridge(track, (i % n) * spacing);

  const railMat = lambert(PALETTE.rail);
  const ballastMat = lambert(PALETTE.ballast);
  const timberMat = lambert(PALETTE.timber);

  // Ballast on the ground; a timber deck on the bridges, from the last stretch before each.
  const ballast = new THREE.Mesh(ribbon(fr, 0, 3.6, -0.28, -0.42, (i) => !bridged(i) && !bridged(i + 1)), ballastMat);
  ballast.receiveShadow = true;
  const deck = new THREE.Mesh(ribbon(fr, 0, 4.2, -0.28, -DECK_UNDERSIDE, (i) => bridged(i) || bridged(i + 1)), timberMat);
  deck.castShadow = deck.receiveShadow = true;
  group.add(ballast, deck);
  for (const side of [1, -1]) {
    const rail = new THREE.Mesh(ribbon(fr, (side * GAUGE) / 2, 0.12, 0, -0.16, () => true), railMat);
    rail.receiveShadow = true;
    const guard = new THREE.Mesh(ribbon(fr, side * 2.05, 0.1, 0.9, 0.78, (i) => bridged(i) && bridged(i + 1)), timberMat);
    group.add(rail, guard);
  }

  // Sleepers every metre.
  const sleepers: { x: number; z: number; y: number; yaw: number }[] = [];
  for (let s = 0; s < track.length; s += 1) {
    const p = trackPoint(track, s);
    const q = trackPoint(track, s + 1);
    sleepers.push({ x: p.x, z: p.z, y: p.y - 0.22, yaw: Math.atan2(q.x - p.x, q.z - p.z) });
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
  // Trestle legs every ten metres between the abutments, set two metres into the ground.
  const ends = bridgeEnds(track, world.height);
  const timberColour = new THREE.Color(PALETTE.timber);
  group.add(tiled(trestleLegs(track, world.height, ends), new THREE.BoxGeometry(0.35, 1, 0.35), tinted, (leg, mm, c) => {
    mm.compose(v.set(leg.x, (leg.top + leg.ground) / 2 - 1, leg.z), q.setFromAxisAngle(up, leg.yaw), new THREE.Vector3(1, leg.top - leg.ground + 2, 1));
    c.copy(timberColour);
  }));
  const abutments = new Kit();
  const mats = {
    body: lambert(PALETTE.concreteDark), cap: lambert(PALETTE.concrete), guard: lambert(PALETTE.rail),
    ring: lambert(PALETTE.barrierRed), face: lambert(PALETTE.barrierWhite),
  };
  for (const end of ends) bridgeEnd(abutments, world, end, spacing, mats);
  abutments.build(group);

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

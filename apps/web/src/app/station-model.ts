import * as THREE from "three";
import { Kit, lambert, pane, prism, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";
import { lineFrame, linePoint, type RailLine } from "./rail";
import type { Station } from "./station";
import { tiled } from "./scenery";
import { buildTrainCar, setWagonRamp } from "./train-model";
import type { TrainCar } from "./track";

/**
 * Drawing the stations (ADR 0022): rails along a line that ends, the points where the
 * valley's branch leaves its loop, the mouth of a tunnel, the platforms and the buildings,
 * and a train of its own for the film and for Fourth and King, where one always stands.
 */

const GAUGE = 1.5;

/** A box-section ribbon along a line, offset sideways, from `a` to `b` along it. */
function ribbon(line: RailLine, a: number, b: number, offset: number, width: number, top: number, bottom: number) {
  const pos: number[] = [];
  const step = 2.5;
  for (let s = a; s < b; s += step) {
    const p = lineFrame(line, s);
    const q = lineFrame(line, Math.min(b, s + step));
    const corner = (f: typeof p, side: number, y: number) => [f.x + f.lx * (offset + (side * width) / 2), f.y + y, f.z + f.lz * (offset + (side * width) / 2)];
    const [al, ar, bl, br] = [corner(p, 1, top), corner(p, -1, top), corner(q, 1, top), corner(q, -1, top)];
    const [alb, arb, blb, brb] = [corner(p, 1, bottom), corner(p, -1, bottom), corner(q, 1, bottom), corner(q, -1, bottom)];
    pos.push(...al, ...ar, ...bl, ...ar, ...br, ...bl);
    pos.push(...alb, ...al, ...blb, ...al, ...bl, ...blb);
    pos.push(...ar, ...arb, ...br, ...arb, ...brb, ...br);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Rails, sleepers and ballast along a line from `a` to `b`. */
export function buildRailLine(line: RailLine, a: number, b: number) {
  const group = new THREE.Group();
  const ballast = new THREE.Mesh(ribbon(line, a, b, 0, 3.6, -0.28, -0.6), lambert(PALETTE.ballast));
  ballast.receiveShadow = true;
  group.add(ballast);
  for (const side of [1, -1]) {
    const rail = new THREE.Mesh(ribbon(line, a, b, (side * GAUGE) / 2, 0.12, 0, -0.16), lambert(PALETTE.rail));
    rail.receiveShadow = true;
    group.add(rail);
  }
  const sleepers: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let s = a; s < b; s += 1) {
    const f = lineFrame(line, s);
    sleepers.push({ x: f.x, y: f.y - 0.22, z: f.z, yaw: Math.atan2(f.fx, f.fz) });
  }
  const q = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sleeperColour = new THREE.Color(PALETTE.sleeper);
  group.add(tiled(sleepers, new THREE.BoxGeometry(2.5, 0.14, 0.24), new THREE.MeshLambertMaterial({ flatShading: true }), (sl, m, c) => {
    m.compose(v.set(sl.x, sl.y, sl.z), q.setFromAxisAngle(upAxis, sl.yaw), one);
    c.copy(sleeperColour);
  }));
  return group;
}

/**
 * The points where the branch leaves the loop: the two switch blades, which slide across to
 * send a train one way or the other, and the lever box beside them. `set(t)`: 0 for the
 * loop, 1 for the branch.
 */
export function buildPoints(line: RailLine, at: number, side: 1 | -1) {
  const group = new THREE.Group();
  const f = lineFrame(line, at - 6);
  const k = new Kit();
  // The lever box, out on the far side from the branch.
  const box = k.at(f.x + f.lx * side * 3.4, f.y - 0.3, f.z + f.lz * side * 3.4, Math.atan2(f.fx, f.fz));
  box.box(lambert(PALETTE.concrete), 1.2, 0.3, 1.0, 0, 0.15, 0);
  box.box(lambert(PALETTE.locoBody), 0.7, 0.9, 0.6, 0, 0.75, 0);
  box.box(lambert(PALETTE.barrierWhite), 0.08, 1.4, 0.08, 0, 1.6, 0);
  k.build(group);
  const blades = [1, -1].map((s) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 7), lambert(tone(PALETTE.rail, 1.25)));
    m.position.set(0, -0.06, 3.5);
    g.add(m);
    g.position.set(f.x + f.lx * s * (GAUGE / 2 - 0.08), f.y, f.z + f.lz * s * (GAUGE / 2 - 0.08));
    g.rotation.y = Math.atan2(f.fx, f.fz);
    group.add(g);
    return { g, s };
  });
  const yaw = Math.atan2(f.fx, f.fz);
  // The blades pivot at their heels and swing a few centimetres toward the branch's side.
  const set = (t: number) => blades.forEach(({ g }) => (g.rotation.y = yaw - side * 0.012 * t));
  set(0);
  return { object: group, set, colliders: [{ x: f.x + f.lx * side * 3.4, z: f.z + f.lz * side * 3.4, r: 0.8 }] as Circle[] };
}

/** The tunnel's mouth: a stone face across the cutting, an arch, and the dark inside it. */
export function buildPortal(line: RailLine, at: number, stone: string = PALETTE.concrete) {
  const f = lineFrame(line, at);
  const group = new THREE.Group();
  const k = new Kit();
  const face = lambert(stone), dark = lambert(PALETTE.void, THREE.BackSide), trim = lambert(tone(stone, 0.85));
  const W = 3.4, H = 6.6;
  const p = k.at(f.x, f.y - 0.4, f.z, Math.atan2(f.fx, f.fz));
  // A wall across the line with an arched hole, wings back into the cutting's sides.
  const s = new THREE.Shape([new THREE.Vector2(-16, -2), new THREE.Vector2(16, -2), new THREE.Vector2(16, 12), new THREE.Vector2(-16, 12)]);
  const hole = new THREE.Path();
  hole.moveTo(-W, -2).lineTo(W, -2).lineTo(W, H - W).absarc(0, H - W, W, 0, Math.PI, false).lineTo(-W, -2);
  s.holes.push(hole);
  p.add(face, prism(s, 1.6), 0, 0, -0.8, 0, Math.PI, 0);
  for (const sd of [1, -1]) p.box(face, 1.6, 12, 14, sd * 16, 5, -6, 0, -sd * 0.35);
  // A keystone, a cornice, and the dark tube going in.
  p.box(trim, 1.2, 1.4, 1.8, 0, H + 0.2, 0);
  p.box(trim, 33, 0.8, 2.2, 0, 12, 0);
  p.box(dark, W * 2, H + 1, 60, 0, (H - 1) / 2, 30);
  // And just inside, the dark itself: the hill's ground comes down into the tube behind it, and a train goes into it.
  p.box(lambert(PALETTE.void), W * 2, H + 1, 0.1, 0, (H - 1) / 2, 1.8);
  k.build(group);
  return group;
}

/**
 * The valley's station: a timber house with a canopy over the platform, a raised platform
 * the length of the train, two lamps and a bench, and the road out to it from the camp.
 */
export function buildValleyStation(st: Station, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  const k = new Kit();
  const colliders: Circle[] = [];
  const [a, b] = st.platform;
  // The platform: a slab beside the track, its edge a hand's width from the train.
  group.add(new THREE.Mesh(ribbon(st.line, a, b, st.side * 4.3, 4.2, 0.9, -1.2), lambert(PALETTE.concrete)));
  group.add(new THREE.Mesh(ribbon(st.line, a, b, st.side * 2.35, 0.3, 0.92, 0.85), lambert(PALETTE.hazardYellow)));
  for (let s = a; s <= b; s += 3) {
    const f = lineFrame(st.line, s);
    colliders.push({ x: f.x + f.lx * st.side * 4.3, z: f.z + f.lz * st.side * 4.3, r: 2.1 });
  }
  // The house, its front to the yard, its back to the platform.
  const h = k.at(st.x, linePoint(st.line, (a + b) / 2).y - 0.4, st.z, st.rot);
  const wall = lambert(PALETTE.plaster), wood = lambert(PALETTE.timber), roof = lambert(PALETTE.roofSlate);
  h.box(wall, 14, 4.2, 7, 0, 2.1, 0);
  h.add(roof, prism([[3.9, 0], [0, 2.6], [-3.9, 0]], 15.2), 0, 4.2, 0, 0, Math.PI / 2);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) pane(h.at(x, 2.2, 3.55), windows, 1.2, 1.4, PALETTE.timber);
  h.box(lambert(PALETTE.doorDark), 1.4, 2.4, 0.1, 0, 1.2, 3.55);
  // A blank board over the door, and the canopy along the platform side.
  h.box(lambert(PALETTE.trimCream), 4.8, 0.8, 0.1, 0, 4.8, 3.65);
  h.box(lambert(PALETTE.barnRed), 4.4, 0.55, 0.12, 0, 4.8, 3.7);
  h.box(wood, 14, 0.2, 10, 0, 4.0, -8.5);
  for (const x of [-6, -2, 2, 6]) h.box(wood, 0.25, 3.8, 0.25, x, 1.9, -13);
  h.box(roof, 15, 0.15, 10.6, 0, 4.15, -8.5, 0.12);
  colliders.push({ x: st.x, z: st.z, r: 5.4 }, { x: st.x + Math.sin(st.rot + Math.PI / 2) * 5, z: st.z + Math.cos(st.rot + Math.PI / 2) * 5, r: 3.6 }, { x: st.x - Math.sin(st.rot + Math.PI / 2) * 5, z: st.z - Math.cos(st.rot + Math.PI / 2) * 5, r: 3.6 });
  // Two lamps on the platform.
  for (const s of [a + 15, b - 15]) {
    const f = lineFrame(st.line, s);
    const x = f.x + f.lx * st.side * 5.6;
    const z = f.z + f.lz * st.side * 5.6;
    k.box(lambert(PALETTE.doorDark), 0.15, 4, 0.15, x, f.y + 2.9, z);
    k.box(lamps, 0.5, 0.4, 0.5, x, f.y + 4.9, z);
  }
  k.build(group);
  return { object: group, colliders };
}

/**
 * Fourth and King: a long low terminal of glass and concrete across the end of the yard,
 * the platform beside the track with its canopy, and the buffers at the end.
 */
export function buildCityStation(st: Station, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  const k = new Kit();
  const colliders: Circle[] = [];
  const [a, b] = st.platform;
  group.add(new THREE.Mesh(ribbon(st.line, a, b, st.side * 4.6, 4.8, 0.9, -1.2), lambert(PALETTE.concrete)));
  group.add(new THREE.Mesh(ribbon(st.line, a, b, st.side * 2.35, 0.3, 0.92, 0.85), lambert(PALETTE.hazardYellow)));
  for (let s = a + 4; s <= b; s += 3) {
    const f = lineFrame(st.line, s);
    colliders.push({ x: f.x + f.lx * st.side * 4.6, z: f.z + f.lz * st.side * 4.6, r: 2.3 });
  }
  // The canopy: a roof on posts the length of the platform.
  for (let s = a + 6; s < b - 4; s += 8) {
    const f = lineFrame(st.line, s);
    const x = f.x + f.lx * st.side * 5.6;
    const z = f.z + f.lz * st.side * 5.6;
    k.box(lambert(PALETTE.concreteDark), 0.3, 4.6, 0.3, x, f.y + 3.2, z);
    k.box(lambert(PALETTE.city.paleGlass), 6.4, 0.2, 8.2, f.x + f.lx * st.side * 4.6, f.y + 5.5, f.z + f.lz * st.side * 4.6, 0, Math.atan2(f.fx, f.fz));
    k.box(lamps, 0.6, 0.15, 0.6, x - f.lx * st.side * 1.2, f.y + 5.35, z - f.lz * st.side * 1.2);
  }
  // The buffers at the end of the line.
  const e = lineFrame(st.line, -1.5);
  const bk = k.at(e.x, e.y, e.z, Math.atan2(e.fx, e.fz));
  bk.box(lambert(PALETTE.locoBody), 3, 1.2, 1.4, 0, 0.6, 0);
  for (const s of [1, -1]) bk.cyl(lambert(PALETTE.rail), 0.25, 0.8, s * 0.9, 0.9, 0.9, Math.PI / 2, 0, 8);
  // The terminal: long and low, glass to the street, its roof flat over a deep overhang.
  const t = k.at(st.x, e.y - 0.4, st.z, st.rot);
  const wall = lambert(PALETTE.city.stone), glass = lambert(PALETTE.city.glass);
  t.box(wall, 26, 7, 12, 0, 3.5, 0);
  t.box(glass, 22, 4.6, 0.2, 0, 3.0, 6.05);
  for (let x = -10; x <= 10; x += 2.5) t.box(wall, 0.3, 4.8, 0.3, x, 3.0, 6.15);
  for (let x = -9; x <= 9; x += 3) pane(t.at(x, 3, 6.2), windows, 2, 2.6, PALETTE.city.stone);
  // To the trains, a row of high windows over the doors; at each end, two more.
  for (let x = -10.5; x <= 10.5; x += 3.5) pane(t.at(x, 4.6, -6.05, Math.PI), windows, 2.2, 1.4, PALETTE.city.stone);
  for (const x of [-7, 0, 7]) t.box(lambert(PALETTE.doorDark), 2.4, 2.6, 0.1, x, 1.3, -6.05);
  for (const s of [1, -1]) for (const z of [-2.5, 2.5]) pane(t.at(s * 13.05, 3.6, z, (s * Math.PI) / 2), windows, 2.2, 2.2, PALETTE.city.stone);
  t.box(lambert(PALETTE.concreteDark), 30, 0.6, 16, 0, 7.3, 1.5);
  t.box(lambert(PALETTE.city.coachStripe), 10, 1.2, 0.2, 0, 8.4, 6.4);
  colliders.push(...[-9, -3, 3, 9].map((x) => ({ x: st.x + Math.cos(st.rot) * x, z: st.z - Math.sin(st.rot) * x, r: 6 })));
  k.build(group);
  return { object: group, colliders };
}

/**
 * A train of the station's own: for the film, and at Fourth and King to stand at the
 * platform. `pose` puts each car where the film (or the timetable) says.
 */
export function buildStationTrain(lamps: THREE.Material, kinds: readonly TrainCar["kind"][]) {
  const group = new THREE.Group();
  const cars = kinds.map((kind) => {
    const built = buildTrainCar(kind, lamps);
    built.object.rotation.order = "YXZ";
    group.add(built.object);
    return built.object;
  });
  return {
    object: group,
    pose(list: TrainCar[], ramp: number) {
      list.forEach((p, i) => {
        const car = cars[i];
        if (!car) return;
        car.position.set(p.x, p.y, p.z);
        car.rotation.set(-p.pitch, p.yaw, 0);
      });
      const wagon = cars[cars.length - 1];
      if (wagon) setWagonRamp(wagon, ramp);
    },
  };
}

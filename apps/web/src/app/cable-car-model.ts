import * as THREE from "three";
import { CABLE_CAR, CABLE_CARS, cableCars, cablePoint, laneAt, type CableCar, type CableLine } from "./cable-car";
import { Kit, lambert, pane } from "./garages";
import { PALETTE } from "./palette";

/**
 * The cable cars and their track (ADR 0022). A car is a Powell car, single-ended: an open
 * grip section at the front with benches facing out to the street and the gripman's lever,
 * a closed saloon behind with its windows, a little open platform at the back; maroon
 * below, cream above, under a clerestory roof, a lamp at each end. The track is two rails
 * either side of the cable's slot, in each lane, coming in to the middle at each end.
 * Local +z is the car's front; its wheels on the street at y = 0.
 */
const C = PALETTE.city;

function buildCar(windows: THREE.Material, lamps: THREE.Material) {
  const k = new Kit();
  const maroon = lambert(C.cableMaroon), cream = lambert(C.cableCream), roof = lambert(C.cableRoof);
  const wood = lambert(C.cableWood), dark = lambert(PALETTE.doorDark), brass = lambert(PALETTE.brass);
  const { length: L, width: W } = CABLE_CAR;
  const front = L / 2, back = -L / 2, saloon: [number, number] = [-L / 2 + 0.9, 0.7];
  // Underneath: the frame, two trucks of small wheels, the floor.
  k.box(dark, W - 0.6, 0.32, L - 0.8, 0, 0.5, 0);
  for (const z of [-2.4, 2.4]) {
    for (const s of [1, -1]) for (const dz of [-0.55, 0.55]) k.cyl(dark, 0.3, 0.14, s * 0.62, 0.3, z + dz, 0, Math.PI / 2, 10);
  }
  k.box(wood, W, 0.12, L, 0, 0.75, 0);
  k.box(maroon, W + 0.04, 0.28, L, 0, 0.6, 0);
  // The saloon: maroon to the waist, cream round the windows, the doors at its front end.
  const [s0, s1] = saloon;
  const len = s1 - s0, mid = (s0 + s1) / 2;
  k.box(maroon, W, 0.8, len, 0, 1.21, mid);
  k.box(cream, W, 1.15, len, 0, 2.18, mid);
  for (const side of [1, -1]) {
    for (let z = s0 + 0.55; z < s1 - 0.3; z += 0.95) pane(k.at(side * (W / 2 + 0.01), 2.15, z, (side * Math.PI) / 2), windows, 0.7, 0.8, C.cableCream);
  }
  k.box(dark, W - 0.5, 1.9, 0.06, 0, 1.75, s1 + 0.02);
  // The open grip section: benches down both sides facing out, posts holding the roof up, a dash at the front.
  for (const side of [1, -1]) {
    k.box(wood, 0.5, 0.1, front - s1 - 0.4, side * (W / 2 - 0.35), 1.25, (front + s1) / 2 - 0.1);
    k.box(wood, 0.08, 0.5, front - s1 - 0.4, side * (W / 2 - 0.12), 1.5, (front + s1) / 2 - 0.1);
    k.box(maroon, 0.5, 0.45, front - s1 - 0.4, side * (W / 2 - 0.35), 1.0, (front + s1) / 2 - 0.1);
    for (let z = s1 + 0.4; z <= front - 0.2; z += 1.1) k.cyl(brass, 0.035, 1.75, side * (W / 2 - 0.08), 1.75 + 0.06, z, 0, 0, 6);
  }
  k.box(maroon, W, 0.75, 0.12, 0, 1.2, front - 0.06);
  k.box(cream, W, 0.2, 0.13, 0, 1.68, front - 0.06);
  k.cyl(dark, 0.04, 1.5, 0, 1.5, s1 + 1.1, 0, 0, 6);
  k.box(brass, 0.1, 0.1, 0.1, 0, 2.25, s1 + 1.1);
  // The little platform at the back.
  k.box(maroon, W, 0.75, 0.1, 0, 1.2, back + 0.05);
  for (const side of [1, -1]) k.cyl(brass, 0.035, 1.75, side * (W / 2 - 0.08), 1.81, back + 0.25, 0, 0, 6);
  // The roof, with its clerestory down the middle and a destination box at each end.
  k.box(roof, W + 0.24, 0.14, L + 0.2, 0, 2.86, 0);
  k.box(cream, W - 1.0, 0.3, L - 0.8, 0, 3.07, 0);
  k.box(roof, W - 0.8, 0.08, L - 0.6, 0, 3.26, 0);
  for (const end of [1, -1]) {
    k.box(cream, 1.2, 0.36, 0.12, 0, 3.0, end * (L / 2 - 0.05));
    k.box(dark, 1.0, 0.2, 0.02, 0, 3.0, end * (L / 2 + 0.02));
    k.cyl(lamps, 0.13, 0.08, 0, 1.45, end * (L / 2 + 0.02), Math.PI / 2, 0, 10);
  }
  const g = new THREE.Group();
  k.build(g);
  return g;
}

/** The rails, each side of the slot, in both lanes, laid over the street the whole way. */
function buildTrack(line: CableLine, ground: (x: number, z: number) => number) {
  const flat = (color: string) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  const steel = flat(PALETTE.rail);
  const slot = flat(C.cableSlot);
  const strips: { m: THREE.Material; off: number; w: number }[] = [
    { m: slot, off: 0, w: 0.06 },
    { m: steel, off: 0.55, w: 0.08 },
    { m: steel, off: -0.55, w: 0.08 },
  ];
  const group = new THREE.Group();
  for (const { m, off, w } of strips) {
    const pos: number[] = [];
    for (const lane of [1, -1]) {
      let last: number[] | null = null;
      for (let s = 0; s <= line.length; s += 1) {
        const p = cablePoint(line, s);
        const o = laneAt(line, s) * lane;
        // Across: to the line's right for the lane going up it, its left for the lane coming back.
        const at = (d: number) => {
          const x = p.x - p.fz * (o + d * lane);
          const z = p.z + p.fx * (o + d * lane);
          return [x, ground(x, z) + 0.03, z];
        };
        const pair = [...at(off - w / 2), ...at(off + w / 2)];
        if (last) pos.push(...last.slice(0, 3), ...pair.slice(0, 3), ...last.slice(3), ...last.slice(3), ...pair.slice(0, 3), ...pair.slice(3));
        last = pair;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** The line's track and its cars; `update` puts each car where the timetable has it. */
export function buildCableCars(line: CableLine, ground: (x: number, z: number) => number, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  group.add(buildTrack(line, ground));
  const cars = Array.from({ length: CABLE_CARS }, () => {
    const g = buildCar(windows, lamps);
    g.rotation.order = "YXZ";
    group.add(g);
    return g;
  });
  let poses: CableCar[] = [];
  return {
    object: group,
    update(time: number) {
      poses = cableCars(line, ground, time);
      poses.forEach((p, i) => {
        cars[i].position.set(p.x, p.y, p.z);
        cars[i].rotation.set(-p.pitch, p.yaw, 0);
      });
    },
    cars: () => poses,
  };
}

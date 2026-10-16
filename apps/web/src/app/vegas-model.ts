import * as THREE from "three";
import { Kit, lambert } from "./garages";
import { PALETTE } from "./palette";
import {
  CANOPY, CROSS, EIFFEL, GRID, KOVAL_X, MARQUEE_KINDS, SKYLINE_TOWERS, SPHERE, STRAT, STRIP_X, WHEEL,
  marqueeAt, resortFrame, type Resort, type VegasWorld,
} from "./vegas";

/**
 * Drawing Las Vegas (ADR 0023): the Strip's resorts, each after a famous one but none by
 * name; the Sphere and Fremont Street's canopy, screens that play by themselves; the
 * Welcome sign; the street circuit's kerbs and grid; lamps down the Strip. By day it's
 * stucco, glass and gold under the haze; by night the neon comes up, the one place in the
 * game that glows. Everything solid here is solid in vegas.ts already.
 */

export type Neon = THREE.MeshLambertMaterial[];
type Built = { object: THREE.Group; update?: (time: number, night: number) => void };
/** Builds one resort in its own space: the origin on its lot's ground, its front toward +z, `fw` and `fd` half its frontage and depth. */
type Build = (k: Kit, root: THREE.Group, fw: number, fd: number, kit: { windows: THREE.Material; lamps: THREE.Material; neon: Neon; r: Resort }) => Built["update"] | void;

/**
 * The town's walls and glass, each in its own colour, which at night they glow with a
 * little: lit from below, the way the Strip is. Its own materials, not the kit's shared
 * ones, so nothing in another world lights up with it. Made afresh for each town built.
 */
let litMats = new Map<string, THREE.MeshLambertMaterial>();
function lit(colour: string) {
  let m = litMats.get(colour);
  if (!m) litMats.set(colour, (m = new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 0, flatShading: true })));
  return m;
}
const stucco = (i: number) => lit(PALETTE.vegas.stucco[i % PALETTE.vegas.stucco.length]);

/** A marquee at a resort's front: a tall blade on two legs, its face one big light in a neon colour, a band of bulbs under it. */
function marquee(k: Kit, neon: Neon, i: number, x: number, z: number) {
  const dark = lambert(PALETTE.vegas.checker);
  for (const s of [1, -1]) k.box(dark, 0.6, 9, 0.6, x + s * 1.6, 4.5, z);
  k.box(dark, 4.6, 12.4, 1.1, x, 15, z);
  k.box(neon[i % neon.length], 4.0, 11.6, 1.2, x, 15, z);
  k.box(neon[(i + 3) % neon.length], 4.6, 1.1, 1.3, x, 9.6, z);
  k.box(lambert(PALETTE.vegas.signGold), 5.2, 0.6, 1.4, x, 21.4, z);
}

/** A slab of hotel: walls, rows of lit windows on its front and back, a parapet. */
function slab(k: Kit, wall: THREE.Material, windows: THREE.Material, w: number, h: number, d: number, x: number, z: number, floors = 3.2) {
  k.box(wall, w, h, d, x, h / 2, z);
  for (let y = 4; y < h - 2; y += floors) {
    for (const s of [1, -1]) k.box(windows, w - 2, 1.2, 0.1, x, y, z + s * (d / 2 + 0.03));
  }
  k.box(wall, w + 0.6, 0.8, d + 0.6, x, h + 0.4, z);
}

/** A row of neon letters' worth of light: a lit band across a front, in one of the neon colours. */
const band = (k: Kit, neon: Neon, i: number, w: number, h: number, x: number, y: number, z: number) => k.box(neon[i % neon.length], w, h, 0.25, x, y, z);

/** The pyramid: black glass, a sphinx before it, and at night a beam of light straight up from its point. */
const pyramid: Build = (k, root, fw, fd, { neon }) => {
  const base = Math.min(fw, fd) * 1.6;
  const h = base * 0.62;
  const geo = new THREE.ConeGeometry(base / Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4).translate(0, h / 2, 0);
  k.add(lambert(PALETTE.vegas.blackGlass), geo, 0, 0, -fd + base / 2 + 4);
  // The sphinx: a crouching body, paws, a head in a striped headdress.
  const sand = lit(PALETTE.vegas.stucco[3]);
  const sx = k.at(0, 0, fd - 8);
  sx.box(sand, 7, 6, 18, 0, 3, -2);
  for (const s of [1, -1]) sx.box(sand, 2.2, 1.6, 7, s * 2.4, 0.8, 9);
  sx.box(sand, 5.2, 6.4, 5, 0, 9, 5);
  sx.box(lambert(PALETTE.vegas.signBlue), 7, 5, 3.5, 0, 9.4, 3.2);
  sx.box(sand, 3.4, 3.6, 1.4, 0, 8.8, 7.6);
  // The obelisk.
  k.add(lit(PALETTE.vegas.stucco[1]), new THREE.CylinderGeometry(0.5, 2, 26, 4).rotateY(Math.PI / 4).translate(0, 13, 0), fw - 14, 0, fd - 6);
  const beamMat = new THREE.MeshBasicMaterial({ color: PALETTE.vegas.spray, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 900, 8, 1, true).translate(0, 450 + h, 0), beamMat);
  beam.position.z = -fd + base / 2 + 4;
  root.add(beam);
  band(k, neon, 1, base * 0.5, 0.6, 0, 8, -fd + base / 2 + 4 + base / 2 - 4.5);
  return (_time, night) => {
    beam.visible = night > 0.3;
    beamMat.opacity = Math.max(0, night - 0.3) * 0.5;
  };
};

/** The castle: white walls, round towers with red, blue and gold cones, and two hotel wings behind. */
const castle: Build = (k, _root, fw, fd, { windows, neon }) => {
  const white = stucco(4);
  k.box(white, fw * 1.4, 14, 18, 0, 7, fd - 14);
  for (let x = -fw * 0.7; x <= fw * 0.7 + 0.1; x += 3) k.box(white, 1.5, 1.6, 18.4, x, 14.8, fd - 14);
  const turrets = PALETTE.vegas.turrets.map((c) => lambert(c));
  [-0.7, -0.35, 0, 0.35, 0.7].forEach((f, i) => {
    const h = i === 2 ? 34 : 22 + (i % 2) * 6;
    k.cyl(white, 3.4, h, f * fw, h / 2, fd - 6, 0, 0, 12);
    k.add(turrets[i % 3], new THREE.ConeGeometry(4.2, 9, 12).translate(0, h + 4.5, 0), f * fw, 0, fd - 6);
  });
  for (const s of [1, -1]) slab(k, white, windows, 22, 46, 60, s * fw * 0.5, -fd * 0.35);
  band(k, neon, 0, fw * 0.8, 1.2, 0, 11, fd - 4.9);
};

/** The skyline: a cluster of thin towers, one stepped to a mast and one with a pointed crown, the statue at its corner. */
const skyline: Build = (k, _root, fw, fd, { windows, neon }) => {
  for (const [fx, fz, h, c] of SKYLINE_TOWERS) slab(k, stucco(c), windows, 12, h, 12, fx * fw, fz * fd, 3.4);
  // The stepped one, its mast; the pointed one, its crown.
  const tallest = k.at(0.25 * fw, 86, -0.35 * fd);
  tallest.box(stucco(2), 8, 6, 8, 0, 3, 0);
  tallest.box(stucco(2), 5, 5, 5, 0, 8.5, 0);
  tallest.cyl(lambert(PALETTE.vegas.chrome), 0.4, 14, 0, 18, 0, 0, 0, 6);
  k.add(lambert(PALETTE.vegas.chrome), new THREE.ConeGeometry(5, 14, 8).translate(0, 7, 0), -0.2 * fw, 70.8, -0.5 * fd);
  // The statue, green, an arm up with the torch, on a stone pedestal at the front corner.
  const st = k.at(fw - 8, 0, fd - 8);
  const green = lit(PALETTE.vegas.greenGlass);
  st.box(stucco(1), 7, 8, 7, 0, 4, 0);
  st.add(green, new THREE.CylinderGeometry(1.4, 2.4, 12, 8).translate(0, 14, 0), 0, 0, 0);
  st.box(green, 1.6, 2, 1.6, 0, 21, 0);
  st.box(green, 0.7, 6, 0.7, 1.4, 22, 0);
  st.add(neon[2], new THREE.ConeGeometry(0.7, 1.6, 6).translate(0, 25.6, 0), 1.4, 0, 0);
  band(k, neon, 4, fw * 1.2, 1, 0, 10, fd - 2);
};

/** Glass towers, slanted and set off one another. */
const glass: Build = (k, _root, fw, fd, { neon }) => {
  const blue = lit(PALETTE.vegas.blueGlass);
  const add = (w: number, h: number, d: number, x: number, z: number, lean: number) => {
    const geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (p.getY(i) / h) * lean);
    geo.computeVertexNormals();
    k.add(blue, geo, x, 0, z);
  };
  add(20, 92, 26, -fw * 0.4, -fd * 0.2, 6);
  add(18, 74, 22, fw * 0.45, -fd * 0.3, -5);
  add(16, 56, 18, 0, fd * 0.3, 3);
  band(k, neon, 1, 16, 0.6, 0, 55, fd * 0.3 + 9.1);
};

/** The fountains' hotel: a long, gently curved stucco block with a tiled roof; its lake is the pool in front, where the jets play. */
const fountains: Build = (k, root, fw, fd, { windows, r }) => {
  const wall = stucco(1);
  const roof = lambert(PALETTE.city.terracotta);
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.11;
    const x = Math.sin(a) * 120;
    const z = -Math.cos(a) * 120 + 120 - fd * 0.2;
    const seg = k.at(x, 0, z, -a);
    slab(seg, wall, windows, 26, 56 - Math.abs(i) * 4, 18, 0, 0);
    seg.add(roof, new THREE.ConeGeometry(15, 6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.7).translate(0, 59 - Math.abs(i) * 4, 0), 0, 0, 0);
  }
  // The jets, in a row down the lake, rising and falling in waves; higher and lit by night.
  const pool = (root.userData.pool as { near: number; far: number; across: number; y: number } | undefined) ?? { near: fd + 12, far: fd + 128, across: 70, y: 0 };
  const count = 25;
  const sprayMat = new THREE.MeshLambertMaterial({ color: PALETTE.vegas.spray, emissive: PALETTE.vegas.spray, emissiveIntensity: 0.1, transparent: true, opacity: 0.75 });
  const jets = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 1, 6, 1, true).translate(0, 0.5, 0), sprayMat, count);
  const m = new THREE.Matrix4();
  const lane = (pool.near + pool.far) / 2;
  root.add(jets);
  return (time, night) => {
    for (let i = 0; i < count; i++) {
      const x = -pool.across + (i * pool.across * 2) / (count - 1);
      const h = (6 + night * 14) * (0.55 + 0.45 * Math.sin(time * 1.3 - i * 0.45)) * (0.6 + 0.4 * Math.sin(time * 0.31 + i * 0.2));
      m.makeScale(1, Math.max(0.2, h), 1).setPosition(x, pool.y - r.y, lane);
      jets.setMatrixAt(i, m);
    }
    jets.instanceMatrix.needsUpdate = true;
    sprayMat.emissiveIntensity = 0.1 + night * 1.2;
  };
};

/** The palace: a colonnade along the front, a dome behind it, and the hotel tower over all. */
const palace: Build = (k, _root, fw, fd, { windows, neon }) => {
  const wall = stucco(4);
  const col = stucco(0);
  k.box(wall, fw * 1.6, 12, 16, 0, 6, fd - 12);
  for (let x = -fw * 0.78; x <= fw * 0.78 + 0.1; x += 4) k.cyl(col, 0.8, 12, x, 6, fd - 3.2, 0, 0, 8);
  k.box(wall, fw * 1.6 + 2, 1.6, 20, 0, 12.8, fd - 10);
  k.add(wall, new THREE.ConeGeometry(fw * 0.8, 6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.2).translate(0, 16.6, 0), 0, 0, fd - 3);
  k.cyl(wall, 13, 16, -fw * 0.4, 8, -fd * 0.1, 0, 0, 16);
  k.add(lambert(PALETTE.city.domeLead), new THREE.SphereGeometry(13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), -fw * 0.4, 16, -fd * 0.1);
  slab(k, wall, windows, 40, 64, 22, fw * 0.25, -fd * 0.45);
  k.box(lit(PALETTE.vegas.goldGlass), 42, 3, 24, fw * 0.25, 66, -fd * 0.45);
  band(k, neon, 2, fw, 0.9, 0, 9, fd - 4.1);
};

/** The volcano: a rock mound in a lagoon before a three-winged gold tower; at night it erupts now and again. */
const volcano: Build = (k, root, fw, fd, { windows }) => {
  const rock = lambert(PALETTE.vegas.volcano);
  const cone = new THREE.ConeGeometry(16, 18, 9, 3);
  const p = cone.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 8.9 || y < -8.9) continue;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const s = 1 + 0.18 * Math.sin(a * 5 + y);
    p.setXYZ(i, p.getX(i) * s, y, p.getZ(i) * s);
  }
  cone.computeVertexNormals();
  k.add(rock, cone.translate(0, 9, 0), 0, 0, fd - 18);
  k.box(lambert(PALETTE.vegas.pool), fw * 1.6, 0.3, 12, 0, 0.15, fd - 4);
  const gold = lit(PALETTE.vegas.goldGlass);
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const wing = k.at(0, 0, -fd * 0.35, a);
    slab(wing, gold, windows, 12, 70, 14, 0, 14);
  }
  k.cyl(gold, 9, 74, 0, 37, -fd * 0.35, 0, 0, 6);
  const lava = new THREE.MeshLambertMaterial({ color: PALETTE.vegas.neon[4], emissive: PALETTE.vegas.neon[4], emissiveIntensity: 0.2 });
  const crater = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3, 9).translate(0, 18.4, 0), lava);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 7, 1, true).translate(0, 7, 0), lava);
  crater.position.z = plume.position.z = fd - 18;
  plume.position.y = 18;
  root.add(crater, plume);
  return (time, night) => {
    const cycle = time % 75;
    const erupting = night > 0.4 && cycle < 9;
    plume.visible = erupting;
    plume.scale.y = erupting ? 0.6 + 0.4 * Math.sin(cycle * 5) ** 2 : 1;
    lava.emissiveIntensity = 0.2 + night * (erupting ? 2.6 + Math.sin(time * 23) * 0.4 : 0.6);
  };
};

/** The big top: a striped tent the size of a casino, before a plain hotel slab. */
const bigtop: Build = (k, _root, fw, fd, { windows, neon }) => {
  const [red, white] = PALETTE.vegas.bigtop.map((c) => lambert(c));
  const R = Math.min(fw, fd) * 0.65;
  for (let i = 0; i < 16; i++) {
    const seg = new THREE.ConeGeometry(R, 26, 16, 1, false, (i * Math.PI) / 8, Math.PI / 8).translate(0, 13 + 8, 0);
    k.add(i % 2 ? red : white, seg, 0, 0, fd * 0.25);
  }
  k.cyl(white, R, 8, 0, 4, fd * 0.25, 0, 0, 16);
  k.cyl(lambert(PALETTE.vegas.signGold), 0.4, 6, 0, 37, fd * 0.25, 0, 0, 6);
  slab(k, stucco(2), windows, fw * 1.2, 50, 16, 0, -fd * 0.7);
  band(k, neon, 0, R * 1.6, 1.2, 0, 7, fd * 0.25 + R + 0.2);
};

/** The green tower: two crossing slabs of green glass, a gold lion on a plinth at the corner. */
const lion: Build = (k, _root, fw, fd, { windows, neon }) => {
  const green = lit(PALETTE.vegas.greenGlass);
  slab(k, green, windows, fw * 1.4, 72, 20, 0, -fd * 0.3);
  slab(k, green, windows, 20, 72, fd * 1.2, 0, -fd * 0.2);
  k.box(stucco(4), fw * 1.8, 12, 30, 0, 6, fd - 18);
  const gold = lit(PALETTE.vegas.goldGlass);
  const ln = k.at(fw - 14, 0, fd - 6, -0.6);
  ln.box(stucco(1), 12, 10, 12, 0, 5, 0);
  ln.box(gold, 5, 6, 12, 0, 13, -1);
  ln.box(gold, 6.4, 7.4, 6, 0, 17, 5);
  for (const s of [1, -1]) ln.box(gold, 1.6, 6, 1.8, s * 1.6, 13, 5);
  band(k, neon, 3, fw * 1.4, 1.1, 0, 10, fd - 2.9);
};

/** A tall plain hotel with a neon crown. */
const slabResort: Build = (k, _root, fw, fd, { windows, neon, r }) => {
  const wall = stucco(Math.floor(r.tone * 5));
  slab(k, wall, windows, fw * 1.3, 66, 22, 0, -fd * 0.3);
  k.box(wall, fw * 1.8, 12, 26, 0, 6, fd - 15);
  band(k, neon, 5, fw * 1.3, 2.2, 0, 64, -fd * 0.3 + 11.2);
  band(k, neon, 0, fw * 1.6, 1.1, 0, 10, fd - 1.9);
};

/** The half-size Eiffel tower before a cream hotel with a mansard roof, and the striped balloon sign. */
const eiffel: Build = (k, root, fw, fd, { windows, lamps, r }) => {
  const wall = stucco(0);
  slab(k, wall, windows, fw * 1.4, 48, 30, 0, -fd * 0.2);
  k.add(lambert(PALETTE.roofSlate), new THREE.ConeGeometry(fw, 8, 4).rotateY(Math.PI / 4).scale(1.4, 1, 0.4).translate(0, 52, 0), 0, 0, -fd * 0.2);
  // The tower stands where vegas.ts put its legs: EIFFEL.dx west of the hotel's middle, toward the Strip.
  const iron = lit(PALETTE.vegas.iron);
  const t = new Kit();
  const H = EIFFEL.height;
  const S = EIFFEL.spread;
  const at = (y: number) => S * Math.pow(1 - y / H, 1.8) + 0.6;
  for (const sx of [1, -1]) for (const sz of [1, -1]) for (let y = 0; y < H * 0.92; y += 6) t.strut(iron, [sx * at(y), y, sz * at(y)], [sx * at(y + 6), y + 6, sz * at(y + 6)], Math.max(0.35, 1.6 * (1 - y / H)));
  for (const y of [H * 0.18, H * 0.48]) t.box(iron, at(y) * 2 + 2, 1.4, at(y) * 2 + 2, 0, y, 0);
  t.cyl(iron, 0.3, 10, 0, H * 0.92 + 5, 0, 0, 0, 6);
  // Its lights, up the corners.
  for (const sx of [1, -1]) for (const sz of [1, -1]) for (let y = 4; y < H * 0.9; y += 9) t.box(lamps, 0.4, 0.4, 0.4, sx * at(y), y, sz * at(y));
  const tower = new THREE.Group();
  t.build(tower);
  // In the resort's own space, the tower's offset along world x is along local z (the resort faces the Strip, to the west).
  tower.position.set(0, 0, -EIFFEL.dx);
  root.add(tower);
  // The balloon sign at the front.
  const stripes = [lambert(PALETTE.vegas.signBlue), lambert(PALETTE.vegas.signGold), lambert(PALETTE.vegas.signRed)];
  for (let i = 0; i < 12; i++) k.add(stripes[i % 3], new THREE.SphereGeometry(7, 12, 8, (i * Math.PI) / 6, Math.PI / 6).translate(0, 22, 0), fw * 0.6, 0, fd - 6);
  k.box(stucco(3), 2, 15, 2, fw * 0.6, 7.5, fd - 6);
  void r;
};

/** The wheel: a white rim on spokes, glass cabins round it, turning once every five minutes. */
const wheel: Build = (k, root, _fw, _fd, { windows }) => {
  const white = lit(PALETTE.vegas.wheel);
  // The legs: an A-frame each side of the wheel's plane, which runs along the resort's frontage.
  for (const s of [1, -1]) {
    for (const f of [1, -1]) k.strut(white, [f * WHEEL.feet, 0, s * 6], [0, WHEEL.axle, s * 2], 1.4);
  }
  k.cyl(white, 1.4, 10, 0, WHEEL.axle, 0, Math.PI / 2, 0, 10);
  const rim = new THREE.Group();
  const rk = new Kit();
  rk.add(white, new THREE.TorusGeometry(WHEEL.radius, 0.9, 6, 48), 0, 0, 0);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    rk.strut(white, [0, 0, 0], [Math.cos(a) * WHEEL.radius, Math.sin(a) * WHEEL.radius, 0], 0.15);
  }
  rk.build(rim);
  rim.position.set(0, WHEEL.axle, 0);
  root.add(rim);
  const cabins = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 10, 6).scale(1.5, 1, 1), windows, 28);
  root.add(cabins);
  const m = new THREE.Matrix4();
  return (time) => {
    const turn = (time / 300) * Math.PI * 2;
    rim.rotation.z = turn;
    for (let i = 0; i < 28; i++) {
      const a = turn + (i / 28) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * (WHEEL.radius + 2.4), WHEEL.axle + Math.sin(a) * (WHEEL.radius + 2.4), 0);
      cabins.setMatrixAt(i, m);
    }
    cabins.instanceMatrix.needsUpdate = true;
  };
};

/** The bell tower and the palace front with its arches, a canal before them, the hotel tower behind. */
const venice: Build = (k, _root, fw, fd, { windows, neon }) => {
  const pink = lambert(PALETTE.city.houses[0]);
  const brick = lambert(PALETTE.city.brick[0]);
  k.box(pink, fw * 1.1, 16, 14, -fw * 0.25, 8, fd - 16);
  for (let x = -fw * 0.25 - fw * 0.5; x <= -fw * 0.25 + fw * 0.5; x += 4.2) {
    k.box(stucco(0), 0.9, 6, 0.6, x, 3, fd - 8.6);
  }
  const ct = k.at(fw * 0.62, 0, fd - 14);
  ct.box(brick, 8, 60, 8, 0, 30, 0);
  ct.box(stucco(0), 9, 6, 9, 0, 63, 0);
  ct.add(lambert(PALETTE.city.domeLead), new THREE.ConeGeometry(6, 14, 4).rotateY(Math.PI / 4).translate(0, 73, 0), 0, 0, 0);
  k.box(lambert(PALETTE.vegas.pool), fw * 1.7, 0.25, 7, 0, 0.12, fd - 3.5);
  slab(k, stucco(1), windows, fw * 1.6, 70, 22, 0, -fd * 0.45);
  band(k, neon, 2, fw * 1.6, 1.8, 0, 68, -fd * 0.45 + 11.2);
};

/** The bronze tower: a gentle curve of bronze glass, dark at the top. */
const bronze: Build = (k, _root, fw, fd, { neon }) => {
  const mat = lit(PALETTE.vegas.bronze);
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.13;
    const seg = k.at(Math.sin(a) * 90, 0, -Math.cos(a) * 90 + 90 - fd * 0.2, -a);
    seg.box(mat, 12.5, 96 - Math.abs(i) * 3, 20, 0, (96 - Math.abs(i) * 3) / 2, 0);
  }
  k.box(stucco(4), fw * 1.7, 12, 26, 0, 6, fd - 14);
  band(k, neon, 2, fw * 1.2, 1.2, 0, 10, fd - 0.9);
};

/** The tower at the north end: a shaft on three buttresses, a pod of windows high up with a ring of lights, a mast over it. */
const strat: Build = (k, _root, fw, fd, { windows, lamps, neon }) => {
  const conc = lit(PALETTE.vegas.tower);
  // The casino fills the resort's box; the tower rises out of it, near its front.
  slab(k, stucco(2), windows, fw * 1.6, 26, fd * 1.4, 0, -fd * 0.1);
  const H = STRAT.height;
  const tower = k.at(0, 0, fd - STRAT.inset);
  tower.add(conc, new THREE.CylinderGeometry(STRAT.shaft * 0.55, STRAT.shaft, H, 10).translate(0, H / 2, 0), 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    tower.strut(conc, [Math.cos(a) * STRAT.shaft * 1.6, 26, Math.sin(a) * STRAT.shaft * 1.6], [Math.cos(a) * 3, H * 0.45, Math.sin(a) * 3], 2.6);
  }
  tower.cyl(conc, 14, 10, 0, H - 2, 0, 0, 0, 16);
  tower.cyl(windows, 14.2, 4, 0, H - 2, 0, 0, 0, 16);
  tower.cyl(conc, 11, 6, 0, H + 6, 0, 0, 0, 16);
  tower.cyl(neon[1], 14.6, 0.6, 0, H - 6.8, 0, 0, 0, 16);
  tower.cyl(conc, 0.8, 34, 0, H + 26, 0, 0, 0, 6);
  tower.box(lamps, 1, 1, 1, 0, H + 43, 0);
};

/** A downtown casino: a block with a whole front of signs and bulbs, a different colour each. */
const downtown: Build = (k, root, fw, fd, { windows, neon, r }) => {
  const i = Math.floor(r.tone * 97);
  const h = 14 + (i % 4) * 7;
  k.box(stucco(i), fw * 2 - 4, h, fd * 2 - 4, 0, h / 2, 0);
  for (let y = 5; y < h - 2; y += 3.5) k.box(windows, fw * 2 - 7, 1.2, 0.1, 0, y, fd - 1.95);
  // Its sign: a tall blade, and a band of lights along the front over the pavement.
  band(k, neon, i, fw * 1.8, 2.4, 0, 6.5, fd - 1.6);
  band(k, neon, i + 2, fw * 1.8, 0.4, 0, 4.5, fd - 1.6);
  k.box(neon[(i + 1) % neon.length], 2.6, h * 0.9, 0.6, fw - 6, h * 0.55 + 2, fd - 0.8);
  // One of them has the waving cowboy on its corner.
  if (r.x === -530 && r.z < CROSS.fremont) return cowboy(root, fw, fd, neon);
};

/** The waving cowboy: a cut-out in neon outline over a casino's corner, his arm going back and forth. */
function cowboy(root: THREE.Group, fw: number, fd: number, neon: Neon): (time: number, night: number) => void {
  const g = new THREE.Group();
  const k = new Kit();
  const skin = lambert(PALETTE.vegas.stucco[1]);
  const shirt = lambert(PALETTE.vegas.signRed);
  const jeans = lambert(PALETTE.vegas.signBlue);
  const hat = lambert(PALETTE.vegas.chrome);
  k.box(jeans, 4, 9, 1, 0, 4.5, 0);
  k.box(shirt, 5, 7, 1.1, 0, 12.5, 0);
  k.box(skin, 3, 3.4, 1, 0, 17.8, 0);
  k.box(hat, 6.4, 0.6, 1.2, 0, 19.7, 0);
  k.box(hat, 3.4, 2.2, 1.2, 0, 21, 0);
  k.box(shirt, 1.4, 6, 1, -3.2, 12, 0);
  // Neon round his edge.
  for (const [w, h, x, y] of [[0.3, 21.5, -2.7, 10.7], [0.3, 21.5, 2.7, 10.7], [6.6, 0.3, 0, 22.3]] as const) k.box(neon[1], w, h, 1.3, x, y, 0);
  k.build(g);
  const arm = new THREE.Group();
  const ak = new Kit();
  ak.box(shirt, 1.4, 6, 1, 0, 3, 0);
  ak.box(skin, 1.6, 1.8, 1, 0, 6.6, 0);
  ak.box(neon[2], 0.3, 7.5, 1.3, 0.85, 3.5, 0);
  ak.build(arm);
  arm.position.set(3.2, 14.5, 0);
  g.add(arm);
  g.position.set(fw - 10, 22, fd - 1);
  root.add(g);
  return (time) => {
    arm.rotation.z = -0.4 + Math.sin(time * 1.6) * 0.5;
  };
}

/** The Sphere: a ball the size of a stadium, its whole skin a screen. Its pictures are drawn in its shader. */
function sphere(r: Resort): Built {
  const object = new THREE.Group();
  const radius = r.hw * SPHERE.size;
  const sunk = radius * SPHERE.sunk;
  const time = { value: 0 };
  const night = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.vegas.sphere });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDir;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDir = normalize(position);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDir;\nuniform float uTime;\nuniform float uNight;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // An eye that looks about, then the earth turning, then the eye again; each a minute.
        float t = uTime;
        float phase = mod(t, 120.0);
        float mixEye = smoothstep(56.0, 60.0, phase) * (1.0 - smoothstep(116.0, 120.0, phase));
        vec3 look = normalize(vec3(-1.0 + 0.35 * sin(t * 0.21), 0.15 + 0.2 * sin(t * 0.13), 0.4 * sin(t * 0.17)));
        float d = acos(clamp(dot(vDir, look), -1.0, 1.0));
        vec3 eye = vec3(0.95, 0.93, 0.9);
        eye = mix(vec3(0.15, 0.55, 0.6), eye, smoothstep(0.42, 0.46, d));
        eye = mix(vec3(0.02), eye, smoothstep(0.18, 0.21, d));
        eye = mix(vec3(1.0), eye, smoothstep(0.03, 0.06, acos(clamp(dot(vDir, normalize(look + vec3(0.1, 0.12, 0.0))), -1.0, 1.0))));
        float blink = step(0.97, fract(t * 0.07));
        eye = mix(eye, vec3(0.75, 0.55, 0.45), blink * step(abs(vDir.y), 1.0));
        float lon = atan(vDir.z, vDir.x) + t * 0.05;
        float lat = asin(clamp(vDir.y, -1.0, 1.0));
        float land = sin(lon * 3.0) * cos(lat * 4.0) + 0.6 * sin(lon * 7.0 + lat * 5.0) + 0.3 * sin(lon * 13.0 - lat * 9.0);
        vec3 earth = mix(vec3(0.08, 0.25, 0.6), vec3(0.25, 0.55, 0.25), smoothstep(0.4, 0.5, land));
        earth = mix(earth, vec3(0.95), smoothstep(1.15, 1.3, abs(lat)));
        vec3 picture = mix(earth, eye, mixEye);
        totalEmissiveRadiance = picture * (0.55 + 1.3 * uNight);`,
      );
  };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  ball.position.y = radius - sunk;
  ball.castShadow = ball.receiveShadow = true;
  object.add(ball);
  return {
    object,
    update(t, n) {
      time.value = t;
      night.value = n;
    },
  };
}


const BUILDERS: Partial<Record<Resort["kind"], Build>> = {
  pyramid, castle, skyline, glass, fountains, palace, volcano, bigtop, lion, slab: slabResort, eiffel, wheel, venice, bronze, strat, downtown,
};

/** Fremont Street's canopy: a barrel vault on columns, its underside one long screen of moving colour. */
function canopy(world: VegasWorld): Built {
  const object = new THREE.Group();
  const c = world.vegas.canopy;
  const L = c.x1 - c.x0;
  const R = CANOPY.half;
  const legs = CANOPY.height - R;
  const k = new Kit();
  const steel = lambert(PALETTE.vegas.chrome);
  for (let x = c.x0; x <= c.x1 + 0.1; x += 25) for (const s of [1, -1]) k.cyl(steel, 0.7, legs, x - (c.x0 + c.x1) / 2, legs / 2, s * R, 0, 0, 8);
  for (const s of [1, -1]) k.box(steel, L, 0.6, 0.8, 0, legs, s * R);
  k.build(object);
  const time = { value: 0 };
  const night = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.vegas.sphere, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vScreen;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvScreen = vec2(position.x, atan(position.z, position.y));");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vScreen;\nuniform float uTime;\nuniform float uNight;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float u = vScreen.x / 40.0 - uTime * 0.12;
        vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + u + 0.15 * sin(vScreen.y * 3.0 + uTime * 0.4)));
        float stripes = 0.6 + 0.4 * step(0.5, fract(vScreen.x / 6.0 + uTime * 0.6));
        totalEmissiveRadiance = hue * stripes * (0.15 + 1.6 * uNight);`,
      );
  };
  // Half a cylinder laid along the street, its open side down.
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), mat);
  vault.position.y = legs;
  object.add(vault);
  object.position.set((c.x0 + c.x1) / 2, c.y, c.z);
  return {
    object,
    update(t, n) {
      time.value = t;
      night.value = n;
    },
  };
}

/** The Welcome sign: a white diamond on two posts, its letters painted once onto a canvas, its bulbs lit at night. */
function welcomeSign(world: VegasWorld, lamps: THREE.Material): Built {
  const object = new THREE.Group();
  const W = 512;
  const H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = PALETTE.vegas.signWhite;
    g.beginPath();
    g.moveTo(W / 2, 4);
    g.lineTo(W - 4, H / 2);
    g.lineTo(W / 2, H - 4);
    g.lineTo(4, H / 2);
    g.closePath();
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = PALETTE.vegas.signGold;
    g.stroke();
    // A row of silver dollars, a letter on each.
    "WELCOME".split("").forEach((ch, i) => {
      const x = W / 2 + (i - 3) * 42;
      g.fillStyle = PALETTE.vegas.chrome;
      g.beginPath();
      g.arc(x, 112, 19, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PALETTE.vegas.signRed;
      g.font = "bold 26px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(ch, x, 113);
    });
    g.fillStyle = PALETTE.vegas.signBlue;
    g.font = "italic bold 30px serif";
    g.fillText("to Fabulous", W / 2, 158);
    g.fillStyle = PALETTE.vegas.signRed;
    g.font = "bold 62px sans-serif";
    g.fillText("LAS VEGAS", W / 2, 214);
    g.fillStyle = PALETTE.vegas.signBlue;
    g.font = "bold 30px sans-serif";
    g.fillText("NEVADA", W / 2, 268);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.05 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.3), face);
  // Its back is a plain white diamond, not the letters backwards.
  const diamond = new THREE.Shape([new THREE.Vector2(0, 3.15), new THREE.Vector2(4.5, 0), new THREE.Vector2(0, -3.15), new THREE.Vector2(-4.5, 0)]);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(diamond), lambert(PALETTE.vegas.signWhite));
  back.rotation.y = Math.PI;
  board.position.set(0, 7.3, 0.06);
  back.position.set(0, 7.3, -0.06);
  const k = new Kit();
  const post = lambert(PALETTE.vegas.signWhite);
  for (const s of [1, -1]) k.box(post, 0.5, 5, 0.5, s * 1.6, 2.5, 0);
  // The star on top: a red eight-pointed burst.
  for (let i = 0; i < 4; i++) k.box(lambert(PALETTE.vegas.signRed), 0.28, 2.6, 0.2, 0, 11.4, 0, 0, 0, (i * Math.PI) / 4);
  k.build(object);
  // Bulbs round the edge.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a);
    const y = Math.sin(a);
    const d = 1 / (Math.abs(x) / 4.5 + Math.abs(y) / 3.15);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lamps);
    bulb.position.set(x * d * 0.97, 7.3 + y * d * 0.97, 0);
    object.add(bulb);
  }
  object.add(board, back);
  const s = world.vegas.sign;
  object.position.set(s.x, s.y, s.z);
  // It faces the way in from the south: those arriving read it.
  object.rotation.y = 0;
  return { object, update: (_t, n) => void (face.emissiveIntensity = 0.05 + n * 0.55) };
}

/** The street circuit's dressing: red and white kerbs round its corners, the grid's boxes and the start line, and the start lights' gantry. */
function circuitDressing(world: VegasWorld, lamps: THREE.Material): THREE.Group {
  const object = new THREE.Group();
  const k = new Kit();
  const ground = (x: number, z: number) => world.height(x, z);
  const [red, white] = [lambert(PALETTE.vegas.kerbRed), lambert(PALETTE.vegas.kerbWhite)];
  const line = world.vegas.circuit;
  // Kerbs on the inside of each corner: where the line turns, alternating blocks along it.
  for (let i = 1; i < line.length - 1; i++) {
    const a = line[i - 1];
    const b = line[i];
    const c = line[i + 1];
    const turn = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
    const t = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(t) < 0.05) continue;
    const heading = Math.atan2(c.x - a.x, c.z - a.z);
    const side = t > 0 ? 1 : -1;
    for (const off of [5.5, -5.5]) {
      const x = b.x + Math.cos(heading) * off * side;
      const z = b.z - Math.sin(heading) * off * side;
      k.box(i % 2 ? red : white, 1.4, 0.12, 4.5, x, ground(x, z) + 0.05, z, 0, heading);
    }
  }
  // The start line across Koval, and the grid's boxes behind it, two by two.
  const y = ground(GRID.x, GRID.z) + 0.03;
  for (let i = -6; i < 6; i++) k.box(i & 1 ? white : lambert(PALETTE.vegas.checker), 1.2, 0.04, 1.2, GRID.x + i * 1.2 + 0.6, y, GRID.z);
  for (let row = 1; row <= 5; row++) {
    for (const s of [1, -1]) {
      const gz = GRID.z + row * 8;
      k.box(white, 3, 0.04, 0.25, KOVAL_X + s * 3.2, y, gz);
      for (const e of [1, -1]) k.box(white, 0.2, 0.04, 1.2, KOVAL_X + s * 3.2 + e * 1.4, y, gz + 0.5);
    }
  }
  // The gantry: two legs either side of the road and the light box over it.
  const dark = lambert(PALETTE.vegas.checker);
  for (const s of [1, -1]) k.box(dark, 0.5, 7, 0.5, KOVAL_X + s * 8, y + 3.5, GRID.z - 2);
  k.box(dark, 16.5, 1.2, 0.8, KOVAL_X, y + 7, GRID.z - 2);
  for (let i = 0; i < 5; i++) k.box(lamps, 0.6, 0.6, 0.2, KOVAL_X - 3 + i * 1.5, y + 7, GRID.z - 2.45);
  k.build(object);
  return object;
}

/** Lamps down both sides of the Strip, on tall posts with a curved arm. */
function stripLamps(world: VegasWorld, lamps: THREE.Material): THREE.Group {
  const object = new THREE.Group();
  const k = new Kit();
  const pole = lambert(PALETTE.vegas.chrome);
  for (let z = 1080; z > CROSS.fremont + 20; z -= 48) {
    if (Object.values(CROSS).some((c) => Math.abs(z - c) < 16)) continue;
    for (const s of [1, -1]) {
      const x = STRIP_X + s * 12.3;
      const y = world.height(x, z);
      k.cyl(pole, 0.15, 10, x, y + 5, z, 0, 0, 6);
      k.box(pole, 2.6, 0.18, 0.18, x - s * 1.2, y + 10, z);
      k.box(lamps, 0.9, 0.25, 0.5, x - s * 2.4, y + 9.85, z);
    }
  }
  k.build(object);
  return object;
}

/**
 * One resort, placed on its lot and facing its street (`resortFrame`): the Strip's from
 * either side, downtown's Fremont Street from either side. What a truck runs into on it is
 * `resortMasses` in vegas.ts, which has the same numbers.
 */
export function buildResort(r: Resort, pool: VegasWorld["vegas"]["pool"], mats: { windows: THREE.Material; lamps: THREE.Material; neon: Neon }): Built | null {
  if (r.kind === "sphere") {
    const built = sphere(r);
    built.object.position.set(r.x, r.y, r.z);
    return built;
  }
  const build = BUILDERS[r.kind];
  if (!build) return null;
  const { rot, fw, fd } = resortFrame(r);
  const root = new THREE.Group();
  if (r.kind === "fountains") {
    // Where the pool is in the resort's own space: along its front, between it and the Strip.
    root.userData.pool = { near: pool.x0 - r.x, far: pool.x1 - r.x, across: (pool.z1 - pool.z0) / 2 - 6, y: pool.y };
  }
  const k = new Kit();
  const update = build(k, root, fw, fd, { ...mats, r });
  // A marquee at the front corner of every resort on the Strip, inside its lot.
  if (MARQUEE_KINDS.has(r.kind)) {
    const m = marqueeAt(r);
    marquee(k, mats.neon, Math.floor(r.tone * 60), m.x, m.z);
  }
  k.build(root);
  root.position.set(r.x, r.y, r.z);
  root.rotation.y = rot;
  return { object: root, update: update ?? undefined };
}

/** Everything in Vegas the renderer draws over its ground: resorts, screens, the sign, the circuit, lamps. */
export function buildVegasTown(world: VegasWorld, windows: THREE.Material, lamps: THREE.Material) {
  const group = new THREE.Group();
  litMats = new Map();
  const neon: Neon = PALETTE.vegas.neon.map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 }));
  const updates: NonNullable<Built["update"]>[] = [];
  for (const r of world.vegas.resorts) {
    const built = buildResort(r, world.vegas.pool, { windows, lamps, neon });
    if (!built) continue;
    group.add(built.object);
    if (built.update) updates.push(built.update);
  }
  const screens = [canopy(world), welcomeSign(world, lamps)];
  for (const s of screens) {
    group.add(s.object);
    if (s.update) updates.push(s.update);
  }
  group.add(circuitDressing(world, lamps), stripLamps(world, lamps));
  const walls = [...litMats.values()];
  return {
    object: group,
    update(time: number, night: number) {
      for (const m of neon) m.emissiveIntensity = 0.25 + night * 2.2;
      for (const m of walls) m.emissiveIntensity = night * 0.34;
      for (const u of updates) u(time, night);
    },
  };
}


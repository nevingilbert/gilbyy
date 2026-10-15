import * as THREE from "three";
import { Kit, lambert, prism, roof, tone } from "./garages";
import type { Feature, House, JapanWorld } from "./japan";
import { makeRandom } from "./noise";
import { PALETTE } from "./palette";

/**
 * What's built in Japan (ADR 0024), drawn: the harbour town's houses, two storeys of dark
 * timber and pale plaster under grey tiles, their paper screens lit at night; the pagoda on
 * its hill; the red gate standing in the lake; the hot spring's stones and its steam; the
 * fishing boats riding off the harbour; and the stone lanterns along the shore.
 */
export function buildJapanTown(world: JapanWorld, windows: THREE.Material, lamps: THREE.Material) {
  const object = new THREE.Group();
  const k = new Kit();
  const m = materials();
  for (const h of world.japan.houses) house(k, m, windows, h);
  const boats: { boat: THREE.Group; f: Feature; phase: number }[] = [];
  let steam: Steam | null = null;
  for (const f of world.japan.features) {
    if (f.kind === "pagoda") pagoda(k.at(f.x, f.y, f.z, f.rot), m);
    else if (f.kind === "torii") torii(k.at(f.x, f.y, f.z, f.rot), m);
    else if (f.kind === "lantern") lantern(k.at(f.x, f.y, f.z, f.rot), m, lamps);
    else if (f.kind === "onsen") {
      onsen(k.at(f.x, f.y, f.z, f.rot), m);
      steam = buildSteam(f);
      object.add(steam.object);
    } else if (f.kind === "boat") {
      const boat = new THREE.Group();
      fishingBoat(new Kit(), m, windows).build(boat);
      boat.position.set(f.x, f.y, f.z);
      boat.rotation.y = f.rot;
      object.add(boat);
      boats.push({ boat, f, phase: boats.length * 1.7 });
    }
  }
  k.build(object);
  return {
    object,
    /** The boats riding the swell, the steam rising off the spring. */
    update(time: number) {
      for (const { boat, f, phase } of boats) {
        boat.position.y = f.y + Math.sin(time * 0.8 + phase) * 0.12;
        boat.rotation.z = Math.sin(time * 0.6 + phase) * 0.035;
        boat.rotation.x = Math.sin(time * 0.5 + phase * 1.3) * 0.02;
      }
      steam?.update(time);
    },
  };
}

type Materials = ReturnType<typeof materials>;

function materials() {
  const j = PALETTE.japan;
  return {
    tile: lambert(j.tile),
    tileDark: lambert(tone(j.tile, 0.82)),
    plaster: lambert(j.plaster),
    timber: lambert(j.timber),
    cedar: lambert(j.cedarWall),
    lattice: lambert(tone(j.timber, 0.75)),
    dark: lambert(PALETTE.doorDark),
    noren: lambert(j.noren),
    stone: lambert(j.stone),
    stoneDark: lambert(tone(j.stone, 0.78)),
    vermilion: lambert(j.vermilion),
    black: lambert(j.gateBlack),
    hull: lambert(j.boatHull),
    onsen: new THREE.MeshPhongMaterial({ color: j.onsen, specular: PALETTE.waterSpecular, shininess: 70, transparent: true, opacity: 0.85 }),
    stripe: lambert(j.boatStripe),
  };
}

/**
 * A town house: a timber ground floor with a lattice front and a curtain over the door, a
 * little tiled roof over the street, an upper floor of plaster or timber with a lit screen,
 * and a gable roof along the street. Its front faces local +z.
 */
function house(root: Kit, m: Materials, windows: THREE.Material, h: House) {
  const k = root.at(h.x, h.y, h.z, h.rot);
  const { w, d } = h;
  const ground = 3.1;
  const rise = Math.min(2.6, d * 0.24);
  const eaves = h.h - rise;
  const upper = h.tone < 0.55 ? m.plaster : m.cedar;
  const tiles = h.tone < 0.3 || h.tone > 0.8 ? m.tileDark : m.tile;
  // A stone footing, deep enough to meet the ground where it slopes.
  k.box(m.stoneDark, w + 0.3, 1.6, d + 0.3, 0, -0.55, 0);
  k.box(m.cedar, w, ground, d, 0, ground / 2 + 0.25, 0);
  // The lattice: dark behind, slats across the front, and the curtain over the door.
  k.box(m.dark, w - 1.4, 2.3, 0.06, 0, 1.55, d / 2 + 0.01);
  for (let x = -w / 2 + 0.95; x < w / 2 - 0.8; x += 0.55) k.box(m.lattice, 0.09, 2.3, 0.08, x, 1.55, d / 2 + 0.06);
  const door = (h.tone - 0.5) * (w - 4);
  k.box(m.noren, 1.7, 0.75, 0.05, door, 2.35, d / 2 + 0.14);
  // The little roof over the street.
  k.box(tiles, w + 0.5, 0.16, 1.5, 0, ground + 0.45, d / 2 + 0.55, 0.32);
  // The upper floor, set back a little, its screen lit at night.
  const top = eaves - ground - 0.25;
  k.box(upper, w - 0.2, top, d - 0.8, 0, ground + 0.25 + top / 2, -0.2);
  k.box(windows, Math.min(w * 0.55, 6), Math.min(1.1, top * 0.55), 0.06, 0, ground + 0.25 + top * 0.55, d / 2 - 0.58);
  for (let x = -2; x <= 2; x += 1) k.box(m.lattice, 0.06, Math.min(1.1, top * 0.55), 0.09, x * Math.min(w * 0.11, 1.2), ground + 0.25 + top * 0.55, d / 2 - 0.55);
  // The gable roof, its ridge along the street; the gables filled in.
  const r = k.at(0, 0, -0.2, Math.PI / 2);
  const dd = d - 0.8;
  r.add(upper, prism([[dd / 2, eaves], [0, eaves + rise], [-dd / 2, eaves]], w - 0.2), 0, 0, 0);
  roof(r, tiles, [[dd / 2 + 0.7, eaves - 0.2], [0, eaves + rise], [-dd / 2 - 0.7, eaves - 0.2]], w + 0.9, 0.22, 0.05);
  r.box(tiles, 0.45, 0.36, w + 1.1, 0, eaves + rise + 0.16, 0);
}

/** A square frustum, for the pagoda's roofs: `bottom` and `top` its half-widths. */
const frustum = (bottom: number, top: number, height: number) =>
  new THREE.CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, height, 4, 1).rotateY(Math.PI / 4);

/** The five-storey pagoda: vermilion storeys narrowing upward under wide grey roofs, and a bronze spire of rings. */
function pagoda(k: Kit, m: Materials) {
  k.box(m.stone, 13, 1.2, 13, 0, 0.3, 0);
  k.box(m.stoneDark, 14, 0.3, 14, 0, -0.15, 0);
  let y = 0.9;
  for (let i = 0; i < 5; i++) {
    const w = 7.2 - i * 0.8;
    const h = i === 0 ? 4.2 : 3.2;
    k.box(m.vermilion, w, h, w, 0, y + h / 2, 0);
    // White plaster between the posts, and the bracket band under the eaves.
    for (const s of [1, -1]) {
      k.box(m.plaster, w * 0.42, h * 0.55, 0.06, 0, y + h * 0.45, s * (w / 2 + 0.01));
      k.box(m.plaster, 0.06, h * 0.55, w * 0.42, s * (w / 2 + 0.01), y + h * 0.45, 0);
    }
    k.box(m.plaster, w + 0.5, 0.5, w + 0.5, 0, y + h - 0.1, 0);
    const next = i < 4 ? (7.2 - (i + 1) * 0.8) / 2 : 0.7;
    k.add(m.tile, frustum(w / 2 + 2.5, next, 1.3), 0, y + h + 0.6, 0);
    k.add(m.tileDark, frustum(w / 2 + 2.6, w / 2 + 2.5, 0.22), 0, y + h - 0.04, 0);
    y += h + 1.2;
  }
  // The spire: a pole, nine rings, and a flame at the top.
  k.cyl(m.black, 0.2, 9.5, 0, y + 4.6, 0, 0, 0, 8);
  k.box(m.black, 1.3, 0.6, 1.3, 0, y + 0.2, 0);
  for (let i = 0; i < 9; i++) k.cyl(m.black, 0.55, 0.14, 0, y + 1.2 + i * 0.55, 0, 0, 0, 10);
  k.add(m.black, new THREE.ConeGeometry(0.45, 1.4, 6), 0, y + 7.2, 0);
  k.add(m.black, new THREE.SphereGeometry(0.3, 8, 6), 0, y + 9.5, 0);
}

/**
 * The great gate standing in the lake: two vermilion pillars, each braced by two smaller
 * legs, a black lintel turned up at its ends, and a tie beam under it. Pillars at local x = ±6.
 */
function torii(k: Kit, m: Materials) {
  for (const s of [1, -1]) {
    k.cyl(m.vermilion, 0.75, 16, s * 6, 5, 0, 0, 0, 12);
    // Black where the pillars meet the water, and the legs that brace them.
    k.cyl(m.black, 0.8, 1.6, s * 6, 0.2, 0, 0, 0, 12);
    for (const t of [1, -1]) {
      k.cyl(m.vermilion, 0.42, 10, s * 6, 2.5, t * 3.2, 0, 0, 10);
      k.cyl(m.black, 0.46, 1.4, s * 6, 0.2, t * 3.2, 0, 0, 10);
    }
    k.box(m.vermilion, 0.5, 0.55, 6.4, s * 6, 6.8, 0);
    k.box(m.vermilion, 0.5, 0.45, 6.4, s * 6, 4.6, 0);
  }
  k.box(m.vermilion, 16, 0.75, 0.65, 0, 10, 0);
  k.box(m.vermilion, 0.9, 2.1, 0.5, 0, 11.4, 0);
  k.box(m.black, 0.75, 1.4, 0.56, 0, 11.4, 0);
  k.box(m.vermilion, 17, 0.7, 0.9, 0, 12.6, 0);
  // The lintel: flat in the middle, its ends swept up.
  k.box(m.black, 12, 0.9, 1.15, 0, 13.4, 0);
  for (const s of [1, -1]) k.box(m.black, 4.6, 0.9, 1.15, s * 8.1, 13.62, 0, 0, 0, s * 0.1);
}

/** A stone lantern: a footing, a post, the light box, a wide cap and a jewel on top. */
function lantern(k: Kit, m: Materials, lamps: THREE.Material) {
  k.box(m.stone, 0.9, 0.3, 0.9, 0, 0.15, 0);
  k.cyl(m.stone, 0.18, 1.0, 0, 0.8, 0, 0, 0, 8);
  k.box(m.stone, 0.75, 0.15, 0.75, 0, 1.35, 0);
  k.box(m.stone, 0.56, 0.5, 0.56, 0, 1.68, 0);
  for (let i = 0; i < 4; i++) k.box(lamps, 0.26, 0.26, 0.05, Math.sin((i * Math.PI) / 2) * 0.29, 1.68, Math.cos((i * Math.PI) / 2) * 0.29, 0, (i * Math.PI) / 2);
  k.add(m.stone, new THREE.ConeGeometry(0.66, 0.4, 4).rotateY(Math.PI / 4), 0, 2.12, 0);
  k.add(m.stone, new THREE.SphereGeometry(0.13, 8, 6), 0, 2.4, 0);
}

/** The hot spring: its water, a ring of stones round it, a little roofed shelter beside it. */
function onsen(k: Kit, m: Materials) {
  const rand = makeRandom(77);
  const R = 11.4;
  k.add(m.onsen, new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2), 0, 0.02, 0);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const s = 0.7 + rand() * 0.6;
    k.add(i % 3 ? m.stone : m.stoneDark, new THREE.DodecahedronGeometry(s, 0).scale(1.2, 0.7, 1), Math.cos(a) * R, 0.1, Math.sin(a) * R, rand(), rand() * 3, 0);
  }
  // The shelter on the uphill side: four posts, a tiled roof, a bench.
  const sh = k.at(0, 0, -R - 5);
  for (const [x, z] of [[-2.5, -1.6], [2.5, -1.6], [-2.5, 1.6], [2.5, 1.6]]) sh.box(m.timber, 0.25, 2.8, 0.25, x, 1.4, z);
  roof(sh, m.tile, [[3.6, 2.7], [0, 3.8], [-3.6, 2.7]], 4.6, 0.18, 0.05);
  sh.box(m.timber, 4, 0.12, 0.8, 0, 0.5, -1.2);
}

type Steam = { object: THREE.Group; update(time: number): void };

/** Puffs of steam off the hot spring, each rising, swelling and fading, over and over. */
function buildSteam(f: Feature): Steam {
  const object = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const rand = makeRandom(31);
  const puffs = Array.from({ length: 12 }, (_, i) => {
    const mat = new THREE.MeshLambertMaterial({ color: PALETTE.japan.steam, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const a = rand() * Math.PI * 2;
    const r = rand() * 8;
    object.add(mesh);
    return { mesh, mat, x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, offset: i / 12, drift: rand() * 2 - 1 };
  });
  return {
    object,
    update(time) {
      for (const p of puffs) {
        const u = (time * 0.12 + p.offset) % 1;
        p.mesh.position.set(p.x + p.drift * u * 3, f.y + 0.4 + u * 7, p.z + u * 2);
        p.mesh.scale.setScalar(0.7 + u * 2);
        p.mat.opacity = 0.34 * Math.sin(u * Math.PI);
      }
    },
  };
}

/** A small fishing boat: a white hull with a blue stripe, a raised bow, a wheelhouse and a mast. Bow to +z. */
function fishingBoat(k: Kit, m: Materials, windows: THREE.Material) {
  k.box(m.hull, 2.8, 1.3, 7.5, 0, 0.05, -0.4);
  // The bow: a wedge, its plan a triangle.
  k.add(m.hull, prism([[-1.4, 0], [1.4, 0], [0, 2.6]], 1.3).rotateX(Math.PI / 2), 0, 0.05, 3.35);
  k.box(m.stripe, 2.86, 0.22, 7.5, 0, 0.45, -0.4);
  k.box(m.hull, 1.8, 1.5, 2.2, 0, 1.45, -1.2);
  k.box(windows, 1.6, 0.45, 0.06, 0, 1.8, -0.08);
  k.box(m.tileDark, 2.0, 0.12, 2.5, 0, 2.25, -1.2);
  k.cyl(m.timber, 0.07, 3.4, 0, 3.3, -1.6, 0, 0, 6);
  k.box(m.timber, 1.2, 0.06, 0.06, 0, 4.2, -1.6);
  return k;
}

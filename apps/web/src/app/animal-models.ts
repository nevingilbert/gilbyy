import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette";
import { painted } from "./scenery";
import { SPECIES, placeHerds, speciesIn, stepWildlife, type Animal, type SpeciesId, type Threat } from "./wildlife";
import type { World } from "./world";

/**
 * The animals as low-poly bodies (ADR 0015): faceted lumps and sticks in a few flat
 * colours, like the trees. Each species is cut into the parts that move (a head, legs,
 * wings) and each part is one instanced mesh, so a whole herd is a handful of draw calls.
 * wildlife.ts says where every animal is and what it's doing; this poses the parts.
 *
 * Built in metres facing +z, feet at y = 0. A crab is built facing +x, because it goes sideways.
 */
const A = PALETTE.animal;
type V3 = readonly [number, number, number];

/** What a part does: stays put, nods with the head, swings like a leg, or beats like a wing. */
type Joint = "body" | "head" | "antlers" | "leg" | "wing";
type Part = {
  joint: Joint;
  geometry: THREE.BufferGeometry;
  /** Where its joint is on the body. The part's own geometry is built about that point. */
  at: V3;
  /** A leg: where in the stride it is, walking and running. */
  walk?: number;
  run?: number;
  /** A wing: 1 for the left (+x), −1 for the right. */
  side?: 1 | -1;
};
/** How a body moves as a whole: legs and a bob, hops, a scuttle, wings or a swim. */
type Gait = "hoof" | "hop" | "scuttle" | "wing" | "swim";
type Body = { parts: Part[]; gait: Gait; /** Drawn this much bigger than life, so a small animal can be made out from the truck. */ size: number };

const c = (hex: string) => new THREE.Color(hex);
const merge = (...parts: THREE.BufferGeometry[]) => mergeGeometries(parts);

/** A faceted lump: a stretched icosahedron, turned by `rot` (x, y, z) before it's put at `at`. */
function lump(size: V3, at: V3, hex: string, rot: V3 = [0, 0, 0], detail = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail).scale(...size);
  g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  return painted(g.translate(...at), c(hex));
}

function block(size: V3, at: V3, hex: string, rot: V3 = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(...size);
  g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  return painted(g.translate(...at), c(hex));
}

/** A stick from `a` to `b`, `r` thick. */
function stick(r: number, a: V3, b: V3, hex: string, tip = r) {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const g = new THREE.CylinderGeometry(tip, r, dir.length(), 5).translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return painted(g.translate(from.x, from.y, from.z), c(hex));
}

/** A cone pointing along +z. */
function spike(r: number, len: number, at: V3, hex: string, sides = 5) {
  return painted(new THREE.ConeGeometry(r, len, sides).rotateX(Math.PI / 2).translate(...at), c(hex));
}

/** Both of a pair: the same piece at +x and mirrored to −x. */
const pair = (make: (side: 1 | -1) => THREE.BufferGeometry) => [make(1), make(-1)];

/** Four legs: front ones at `front`, hind ones at `hind` (the left one of each). Walking they go in diagonal pairs; running, a gallop. */
function legs(front: V3, hind: V3, foreleg: (side: 1 | -1) => THREE.BufferGeometry, hindleg: (side: 1 | -1) => THREE.BufferGeometry): Part[] {
  return [
    { joint: "leg", geometry: foreleg(1), at: front, walk: 0, run: 0 },
    { joint: "leg", geometry: foreleg(-1), at: [-front[0], front[1], front[2]], walk: Math.PI, run: 0.5 },
    { joint: "leg", geometry: hindleg(1), at: hind, walk: Math.PI, run: Math.PI },
    { joint: "leg", geometry: hindleg(-1), at: [-hind[0], hind[1], hind[2]], walk: 0, run: Math.PI + 0.5 },
  ];
}

/** A red deer: russet-grey, a pale rump, and antlers on the stags. */
function deer(): Body {
  const body = merge(
    lump([0.27, 0.3, 0.68], [0, 1, 0], A.deerCoat),
    lump([0.25, 0.29, 0.3], [0, 0.98, 0.38], A.deerCoat),
    lump([0.2, 0.12, 0.45], [0, 0.82, 0], A.deerPale),
    lump([0.2, 0.22, 0.1], [0, 1.03, -0.64], A.deerPale),
    block([0.08, 0.14, 0.05], [0, 1.12, -0.72], A.hoof),
  );
  const head = merge(
    lump([0.14, 0.18, 0.16], [0, 0.08, 0.03], A.deerCoat),
    stick(0.1, [0, 0, 0], [0, 0.48, 0.3], A.deerCoat, 0.08),
    lump([0.1, 0.11, 0.18], [0, 0.5, 0.38], A.deerCoat),
    block([0.1, 0.09, 0.14], [0, 0.46, 0.55], A.deerCoat),
    lump([0.045, 0.04, 0.03], [0, 0.47, 0.62], A.hoof),
    ...pair((s) => lump([0.035, 0.1, 0.05], [s * 0.11, 0.6, 0.33], A.deerCoat, [0, 0, -s * 0.7])),
    ...pair((s) => lump([0.022, 0.022, 0.022], [s * 0.085, 0.53, 0.44], A.eye)),
  );
  const antlers = merge(
    ...pair((s) => stick(0.025, [s * 0.05, 0.58, 0.36], [s * 0.18, 0.95, 0.25], A.antler)),
    ...pair((s) => stick(0.022, [s * 0.18, 0.95, 0.25], [s * 0.22, 1.2, 0.1], A.antler, 0.012)),
    ...pair((s) => stick(0.018, [s * 0.13, 0.82, 0.29], [s * 0.12, 0.98, 0.45], A.antler, 0.01)),
    ...pair((s) => stick(0.018, [s * 0.2, 1.07, 0.18], [s * 0.3, 1.22, 0.25], A.antler, 0.01)),
  );
  const fore = () => merge(lump([0.08, 0.18, 0.1], [0, -0.1, 0], A.deerCoat), stick(0.04, [0, -0.8, 0], [0, 0, 0], A.hoof, 0.045), block([0.06, 0.06, 0.08], [0, -0.82, 0.01], A.hoof));
  const hind = () => merge(lump([0.1, 0.22, 0.14], [0, -0.12, 0], A.deerCoat), stick(0.035, [0, -0.84, -0.02], [0, 0, 0], A.hoof, 0.05), block([0.06, 0.06, 0.08], [0, -0.86, -0.01], A.hoof));
  return {
    gait: "hoof",
    size: 1,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.98, 0.55] },
      { joint: "antlers", geometry: antlers, at: [0, 0.98, 0.55] },
      ...legs([0.13, 0.85, 0.4], [0.13, 0.88, -0.45], fore, hind),
    ],
  };
}

/** A reindeer: stockier and lower, grey-brown with a pale neck, white socks, and big antlers on all of them. */
function reindeer(): Body {
  const body = merge(
    lump([0.3, 0.32, 0.66], [0, 0.92, 0], A.reindeerCoat),
    lump([0.26, 0.3, 0.28], [0, 0.9, 0.38], A.reindeerPale),
    lump([0.22, 0.14, 0.42], [0, 0.72, -0.02], A.reindeerPale),
    block([0.1, 0.1, 0.06], [0, 1.02, -0.66], A.reindeerPale),
  );
  const head = merge(
    stick(0.12, [0, 0, 0], [0, 0.36, 0.32], A.reindeerPale, 0.09),
    lump([0.13, 0.17, 0.16], [0, 0.02, 0.06], A.reindeerPale),
    lump([0.11, 0.12, 0.2], [0, 0.4, 0.42], A.reindeerCoat),
    block([0.11, 0.1, 0.14], [0, 0.36, 0.6], A.reindeerCoat),
    lump([0.05, 0.045, 0.03], [0, 0.37, 0.67], A.hoof),
    ...pair((s) => lump([0.03, 0.08, 0.045], [s * 0.12, 0.5, 0.36], A.reindeerCoat, [0, 0, -s * 0.9])),
    ...pair((s) => lump([0.022, 0.022, 0.022], [s * 0.095, 0.44, 0.48], A.eye)),
  );
  // Each beam sweeps up and back, then curls forward, with a brow tine down over the face.
  const antlers = merge(
    ...pair((s) => stick(0.03, [s * 0.06, 0.48, 0.4], [s * 0.24, 0.9, 0.18], A.antler)),
    ...pair((s) => stick(0.026, [s * 0.24, 0.9, 0.18], [s * 0.3, 1.2, 0.28], A.antler)),
    ...pair((s) => stick(0.022, [s * 0.3, 1.2, 0.28], [s * 0.2, 1.36, 0.48], A.antler, 0.012)),
    ...pair((s) => stick(0.02, [s * 0.1, 0.6, 0.36], [s * 0.04, 0.66, 0.62], A.antler, 0.01)),
    ...pair((s) => stick(0.018, [s * 0.27, 1.05, 0.22], [s * 0.4, 1.2, 0.12], A.antler, 0.01)),
    ...pair((s) => stick(0.016, [s * 0.29, 1.25, 0.32], [s * 0.42, 1.38, 0.38], A.antler, 0.008)),
  );
  const leg = (thigh: number) => merge(
    lump([0.1, thigh, 0.13], [0, -0.1, 0], A.reindeerCoat),
    stick(0.045, [0, -0.72, 0], [0, 0, 0], A.reindeerCoat, 0.055),
    block([0.08, 0.1, 0.1], [0, -0.7, 0.01], A.reindeerPale),
  );
  return {
    gait: "hoof",
    size: 1,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.94, 0.5] },
      { joint: "antlers", geometry: antlers, at: [0, 0.94, 0.5] },
      ...legs([0.14, 0.74, 0.38], [0.14, 0.76, -0.42], () => leg(0.18), () => leg(0.24)),
    ],
  };
}

/** A brown hare: long ears, big hind feet, a white scut that shows as it bounds away. */
function hare(): Body {
  const body = merge(
    lump([0.12, 0.14, 0.22], [0, 0.24, 0.02], A.hareCoat),
    lump([0.13, 0.15, 0.14], [0, 0.25, -0.1], A.hareCoat),
    lump([0.1, 0.07, 0.15], [0, 0.17, 0.02], A.hareTail),
    lump([0.05, 0.05, 0.045], [0, 0.3, -0.24], A.hareTail),
  );
  const head = merge(
    lump([0.07, 0.075, 0.1], [0, 0.06, 0.06], A.hareCoat),
    ...pair((s) => lump([0.026, 0.12, 0.014], [s * 0.035, 0.2, -0.01], A.hareCoat, [-0.35, 0, -s * 0.15])),
    ...pair((s) => lump([0.02, 0.03, 0.012], [s * 0.045, 0.3, -0.05], A.eye, [-0.35, 0, -s * 0.15])),
    ...pair((s) => lump([0.016, 0.016, 0.016], [s * 0.055, 0.08, 0.1], A.eye)),
  );
  const fore = merge(...pair((s) => stick(0.02, [s * 0.05, -0.17, 0.02], [s * 0.05, 0, 0], A.hareCoat, 0.022)));
  const hind = merge(
    ...pair((s) => lump([0.05, 0.1, 0.09], [s * 0.08, -0.05, 0], A.hareCoat)),
    ...pair((s) => block([0.04, 0.03, 0.15], [s * 0.08, -0.18, 0.04], A.hareCoat)),
  );
  return {
    gait: "hop",
    size: 1.25,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.3, 0.16] },
      // Front feet together and hind feet together: a hare bounds.
      { joint: "leg", geometry: fore, at: [0, 0.18, 0.13], walk: 0, run: 0 },
      { joint: "leg", geometry: hind, at: [0, 0.2, -0.1], walk: Math.PI, run: Math.PI },
    ],
  };
}

/** A wild boar: a dark wedge, high at the shoulder, with a bristled back and a pale snout. */
function boar(): Body {
  const body = merge(
    lump([0.26, 0.28, 0.5], [0, 0.55, -0.05], A.boarCoat),
    lump([0.27, 0.33, 0.3], [0, 0.6, 0.22], A.boarCoat),
    block([0.07, 0.09, 0.62], [0, 0.88, 0.04], A.boarBristle, [0.12, 0, 0]),
    stick(0.02, [0, 0.62, -0.52], [0, 0.4, -0.6], A.boarBristle, 0.012),
  );
  const head = merge(
    spike(0.2, 0.5, [0, -0.08, 0.2], A.boarCoat),
    block([0.14, 0.12, 0.05], [0, -0.12, 0.45], A.boarSnout),
    ...pair((s) => spike(0.018, 0.08, [s * 0.075, -0.1, 0.4], A.tusk, 4)),
    ...pair((s) => lump([0.05, 0.08, 0.03], [s * 0.1, 0.12, 0.06], A.boarBristle, [0, 0, -s * 0.4])),
    ...pair((s) => lump([0.02, 0.02, 0.02], [s * 0.09, 0.0, 0.2], A.eye)),
  );
  const fore = () => stick(0.045, [0, -0.44, 0], [0, 0, 0], A.boarBristle, 0.06);
  const hind = () => merge(lump([0.09, 0.16, 0.13], [0, -0.06, 0], A.boarCoat), stick(0.04, [0, -0.44, 0], [0, 0, 0], A.boarBristle, 0.05));
  return {
    gait: "hoof",
    size: 1,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.6, 0.45] },
      ...legs([0.12, 0.42, 0.25], [0.12, 0.42, -0.3], fore, hind),
    ],
  };
}

/** A land crab, bigger than most: a red shell on six legs, two claws held up front (along +x). */
function crab(): Body {
  const body = merge(
    lump([0.2, 0.09, 0.24], [0, 0.17, 0], A.crabShell),
    ...pair((s) => stick(0.03, [0.15, 0.14, s * 0.1], [0.27, 0.15, s * 0.13], A.crabClaw)),
    ...pair((s) => lump([0.08, 0.055, 0.06], [0.32, 0.16, s * 0.13], A.crabClaw, [0, s * 0.3, 0])),
    ...pair((s) => stick(0.012, [0.15, 0.22, s * 0.05], [0.18, 0.29, s * 0.06], A.crabLeg)),
    ...pair((s) => lump([0.022, 0.022, 0.022], [0.18, 0.3, s * 0.06], A.eye)),
    ...[0.08, -0.03, -0.13].flatMap((x) =>
      pair((s) => merge(stick(0.02, [x, 0.15, s * 0.18], [x - 0.03, 0.21, s * 0.32], A.crabLeg), stick(0.016, [x - 0.03, 0.21, s * 0.32], [x - 0.06, 0, s * 0.42], A.crabLeg, 0.008))),
    ),
  );
  return { gait: "scuttle", size: 1, parts: [{ joint: "body", geometry: body, at: [0, 0, 0] }] };
}

/** A bird's wing along +x from its root, for the left; mirrored for the right. Bands from the root out. */
function wing(side: 1 | -1, bands: { span: number; chord: number; hex: string }[]) {
  let x = 0;
  return merge(
    ...bands.map((b) => {
      const g = block([b.span, 0.022, b.chord], [side * (x + b.span / 2), 0, -x * 0.12], b.hex);
      x += b.span;
      return g;
    }),
  );
}

function wings(at: V3, bands: { span: number; chord: number; hex: string }[]): Part[] {
  return [
    { joint: "wing", geometry: wing(1, bands), at, side: 1 },
    { joint: "wing", geometry: wing(-1, bands), at: [-at[0], at[1], at[2]], side: -1 },
  ];
}

/** A herring gull: white, grey-backed with black tips, a yellow bill. */
function gull(): Body {
  const body = merge(
    lump([0.11, 0.11, 0.26], [0, 0.22, 0], A.gullWhite),
    block([0.13, 0.03, 0.12], [0, 0.25, -0.27], A.gullWing),
    ...pair((s) => stick(0.012, [s * 0.04, 0, 0.03], [s * 0.04, 0.15, 0.02], A.bill)),
  );
  const head = merge(
    lump([0.075, 0.075, 0.085], [0, 0.07, 0.05], A.gullWhite),
    spike(0.022, 0.1, [0, 0.06, 0.17], A.bill, 4),
    ...pair((s) => lump([0.014, 0.014, 0.014], [s * 0.055, 0.09, 0.08], A.eye)),
  );
  return {
    gait: "wing",
    size: 1.15,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.26, 0.15] },
      ...wings([0.08, 0.27, 0.03], [{ span: 0.34, chord: 0.2, hex: A.gullWing }, { span: 0.2, chord: 0.13, hex: A.gullTip }]),
    ],
  };
}

/** A mallard, sitting on the water: brown, a green head, an orange bill. */
function duck(): Body {
  const body = merge(
    lump([0.14, 0.11, 0.25], [0, 0.08, 0], A.duckBody),
    block([0.1, 0.04, 0.09], [0, 0.14, -0.25], A.duckHead, [-0.3, 0, 0]),
  );
  const head = merge(
    stick(0.045, [0, 0, 0], [0, 0.11, 0.04], A.duckHead, 0.04),
    lump([0.07, 0.075, 0.08], [0, 0.13, 0.06], A.duckHead),
    block([0.05, 0.025, 0.08], [0, 0.11, 0.15], A.bill),
    ...pair((s) => lump([0.013, 0.013, 0.013], [s * 0.055, 0.15, 0.08], A.eye)),
  );
  return {
    gait: "wing",
    size: 1.25,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      { joint: "head", geometry: head, at: [0, 0.12, 0.15] },
      ...wings([0.07, 0.15, 0.03], [{ span: 0.18, chord: 0.17, hex: A.duckWing }, { span: 0.14, chord: 0.12, hex: A.duckBody }]),
    ],
  };
}

/** A scarlet macaw: red, with wings banded yellow and blue, and a long tail. */
function macaw(): Body {
  const body = merge(
    lump([0.09, 0.09, 0.22], [0, 0, 0], A.macawRed),
    lump([0.075, 0.075, 0.08], [0, 0.05, 0.19], A.macawRed),
    ...pair((s) => lump([0.03, 0.035, 0.03], [s * 0.05, 0.05, 0.21], A.macawFace)),
    spike(0.035, 0.08, [0, 0.03, 0.28], A.macawFace, 4),
    block([0.07, 0.02, 0.46], [0, -0.01, -0.38], A.macawRed),
    block([0.07, 0.021, 0.12], [0, -0.01, -0.66], A.macawBlue),
  );
  return {
    gait: "wing",
    size: 1.4,
    parts: [
      { joint: "body", geometry: body, at: [0, 0, 0] },
      ...wings([0.07, 0.03, 0.02], [
        { span: 0.16, chord: 0.2, hex: A.macawRed },
        { span: 0.14, chord: 0.18, hex: A.macawYellow },
        { span: 0.2, chord: 0.15, hex: A.macawBlue },
      ]),
    ],
  };
}

/** A bottlenose dolphin: grey above, pale below, a beak, a fin and flukes. */
function dolphin(): Body {
  const body = new THREE.IcosahedronGeometry(1, 1).scale(0.3, 0.3, 1.1);
  // Darker on the back, pale on the belly, split along the flank.
  const pos = body.getAttribute("position");
  const back = c(A.dolphinBack);
  const belly = c(A.dolphinBelly);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set((pos.getY(i) > -0.08 ? back : belly).toArray(), i * 3);
  body.setAttribute("color", new THREE.BufferAttribute(col, 3));
  body.deleteAttribute("uv");
  const fin = new THREE.ConeGeometry(0.2, 0.36, 4).scale(1, 1, 0.22).rotateY(Math.PI / 2).rotateX(-0.55);
  const geometry = merge(
    body,
    spike(0.08, 0.3, [0, -0.06, 1.2], A.dolphinBack),
    lump([0.13, 0.15, 0.42], [0, 0.02, -0.9], A.dolphinBack),
    painted(fin.translate(0, 0.38, -0.08), c(A.dolphinBack)),
    ...pair((s) => block([0.36, 0.035, 0.16], [s * 0.18, 0, -1.28], A.dolphinBack, [0, -s * 0.45, 0])),
    ...pair((s) => block([0.28, 0.03, 0.12], [s * 0.3, -0.14, 0.4], A.dolphinBack, [0, -s * 0.5, -s * 0.4])),
  );
  return { gait: "swim", size: 1, parts: [{ joint: "body", geometry, at: [0, 0, 0] }] };
}

const BODIES: Record<SpeciesId, () => Body> = { deer, hare, reindeer, duck, crab, gull, boar, macaw, dolphin };

/** Only some deer are stags; every reindeer has antlers. */
const antlered = (a: Animal) => a.species !== "deer" || a.tone < 0.35;

/** Every herd in the world, at home, as a group to add to the scene; `update` moves them on and draws them. */
export function buildWildlife(world: World) {
  const herds = placeHerds(world);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  const white = new THREE.Color(1, 1, 1);
  const kinds = speciesIn(world.id).map((id) => {
    const body = BODIES[id]();
    const mine = herds.filter((h) => h.species === id);
    const total = Math.max(1, mine.reduce((n, h) => n + h.animals.length, 0));
    const meshes = body.parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, material, total);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Set now, so the material is built to take a colour per animal.
      for (let i = 0; i < total; i++) mesh.setColorAt(i, white);
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // They move, so a bounding sphere would always be stale; there are never many drawn.
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    return { id, body, herds: mine, meshes };
  });

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const none = new THREE.Matrix4().makeScale(0, 0, 0);
  const pos = new THREE.Vector3();
  const at = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, "YXZ");
  const k3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const tint = new THREE.Color();

  /** Writes one animal's parts into slot `i` of its species' meshes. */
  function pose(body: Body, meshes: THREE.InstancedMesh[], a: Animal, i: number) {
    const sp = SPECIES[a.species];
    const k = a.scale * body.size;
    // How much it's walking, from standing to a walk, and how much running, from a walk to flat out.
    const moving = Math.min(1, a.speed / Math.max(0.3, sp.walk || 1));
    const running = Math.min(1, Math.max(0, (a.speed - sp.walk * 1.5) / (sp.run * 0.5)));
    let lift = 0;
    let rock = 0;
    let roll = 0;
    if (body.gait === "hoof") {
      // A nod at a walk; at a gallop the body rises and pitches with each bound.
      lift = Math.abs(Math.sin(a.stride)) * 0.03 * moving + running * Math.max(0, Math.sin(a.stride)) * 0.16;
      rock = running * Math.sin(a.stride + 0.6) * 0.1;
    } else if (body.gait === "hop") {
      lift = moving * Math.max(0, Math.sin(a.stride)) * 0.28;
      rock = moving * Math.cos(a.stride) * 0.25;
    } else if (body.gait === "scuttle") {
      lift = 0.025 * moving * Math.abs(Math.sin(a.stride * 2)) - a.tuck * 0.32;
      roll = 0.08 * moving * Math.sin(a.stride);
    } else if (body.gait === "swim") rock = Math.sin(a.stride) * 0.05;
    base.compose(pos.set(a.x, a.y + lift * k, a.z), q.setFromEuler(e.set(-(a.pitch + rock), a.heading, roll)), k3.setScalar(k));
    body.parts.forEach((p, n) => {
      s3.set(1, 1, 1);
      if (p.joint === "head" || p.joint === "antlers") turn.setFromAxisAngle(X, a.head * sp.drop);
      else if (p.joint === "leg") {
        const phase = (p.walk ?? 0) + ((p.run ?? 0) - (p.walk ?? 0)) * running;
        turn.setFromAxisAngle(X, Math.sin(a.stride + phase) * moving * (0.38 + 0.45 * running));
      } else if (p.joint === "wing") {
        // Folded at rest, beating in flight, held out in a glide.
        const beat = a.state === "fly" ? Math.sin(a.stride) * 0.85 + 0.1 : a.state === "land" ? 0.12 : -0.15;
        turn.setFromAxisAngle(Z, (p.side ?? 1) * beat * (0.3 + 0.7 * a.tuck));
        s3.set(0.3 + 0.7 * a.tuck, 1, 1);
      } else turn.identity();
      local.compose(at.set(...p.at), turn, s3);
      out.multiplyMatrices(base, local);
      meshes[n].setMatrixAt(i, p.joint === "antlers" && !antlered(a) ? none : out);
      meshes[n].setColorAt(i, tint.setScalar(0.88 + a.tone * 0.2));
    });
  }

  /**
   * Moves the animals near `near` (the truck) on by `dt`, away from `threats`, and draws
   * those within sight of it.
   */
  function update(dt: number, time: number, threats: readonly Threat[], near: { x: number; z: number }) {
    stepWildlife(world, herds, threats, near, dt, time);
    for (const kind of kinds) {
      const see = SPECIES[kind.id].see;
      let n = 0;
      for (const h of kind.herds) {
        if (!h.active) continue;
        for (const a of h.animals) if (Math.hypot(a.x - near.x, a.z - near.z) < see) pose(kind.body, kind.meshes, a, n++);
      }
      for (const mesh of kind.meshes) {
        mesh.count = n;
        mesh.visible = n > 0;
        if (!n) continue;
        // Only the slots in use go up to the graphics card.
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.clearUpdateRanges();
          mesh.instanceColor.addUpdateRange(0, n * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  return { object: group, herds, update };
}

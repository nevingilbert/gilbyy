import * as THREE from "three";
import { Kit, lambert, prism, tone, type Circle } from "./garages";
import { PALETTE } from "./palette";

export type GateState = "next" | "ahead" | "done" | "hidden";

const POST_X = 4;
const TOP = 5.4;
const BANNER_W = 5;
const BANNER_H = 1.1;
/** Banner centre: its lower edge sits at 3.8 m, well over the truck's roof rack. */
const BANNER_Y = TOP - 1.05;

/** Little triangles on a sagging line between the posts, under the banner. */
function bunting(k: Kit, colors: readonly THREE.ColorRepresentation[]) {
  const line = lambert(PALETTE.doorDark), n = 14, y = 3.75, sag = 0.35;
  const at = (f: number) => [-POST_X + 0.2 + f * (2 * POST_X - 0.4), y - sag * 4 * f * (1 - f), 0.12];
  for (let i = 0; i < n; i++) {
    const [a, b] = [at(i / n), at((i + 1) / n)];
    k.strut(line, a, b, 0.015);
    if (i > 0) k.add(lambert(colors[i % colors.length]), prism([[-0.17, 0], [0.17, 0], [0, -0.36]], 0.02), a[0], a[1], a[2]);
  }
}

/** Two posts at x = ±4 on concrete footings, a beam over the top, knee braces, a lantern on each post. */
function arch(glow: THREE.Material, banner: (k: Kit) => void) {
  const object = new THREE.Group();
  const k = new Kit();
  const wood = lambert(PALETTE.timber), dark = lambert(tone(PALETTE.timber, 0.72)), iron = lambert(PALETTE.doorDark);
  for (const s of [1, -1]) {
    const x = s * POST_X;
    k.box(lambert(PALETTE.concrete), 0.8, 0.35, 0.8, x, 0.17, 0);
    k.box(wood, 0.4, TOP, 0.4, x, TOP / 2, 0);
    for (const y of [0.6, TOP - 0.7]) k.box(dark, 0.46, 0.12, 0.46, x, y, 0);
    k.strut(dark, [x - s * 0.2, TOP - 1.2, 0], [x - s * 1.25, TOP - 0.38, 0], 0.18);
    k.box(iron, 0.5, 0.08, 0.5, x, TOP + 0.04, 0);
    k.box(glow, 0.26, 0.34, 0.26, x, TOP + 0.25, 0);
    k.add(iron, new THREE.ConeGeometry(0.3, 0.24, 4), x, TOP + 0.54, 0, 0, Math.PI / 4);
  }
  k.box(wood, 2 * POST_X + 1.4, 0.4, 0.44, 0, TOP - 0.2, 0);
  // The banner's ties up to the beam.
  for (const s of [1, -1]) k.strut(iron, [s * (BANNER_W / 2 - 0.2), BANNER_Y + BANNER_H / 2, 0], [s * (BANNER_W / 2 - 0.2), TOP - 0.4, 0], 0.03);
  banner(k);
  return { object: k.build(object), colliders: [{ x: -POST_X, z: 0, r: 0.5 }, { x: POST_X, z: 0, r: 0.5 }] as Circle[] };
}

/** A timber start arch with a banner, spanning an 8 m opening across local x, posts at x = ±4. Origin at the centre of the opening. */
export function buildStartArch(glow: THREE.Material): { object: THREE.Group; colliders: Circle[] } {
  return arch(glow, (k) => {
    const cream = lambert(PALETTE.trimCream);
    k.box(lambert(PALETTE.banner), BANNER_W, BANNER_H, 0.04, 0, BANNER_Y, 0);
    for (const e of [1, -1]) k.box(cream, BANNER_W, 0.1, 0.06, 0, BANNER_Y + e * (BANNER_H / 2 - 0.12), 0);
    bunting(k, [PALETTE.banner, PALETTE.trimCream, PALETTE.hazardYellow]);
  });
}

/** A finish arch, same size, with a chequered banner (alternating barrierWhite / doorDark squares). */
export function buildFinishArch(glow: THREE.Material): { object: THREE.Group; colliders: Circle[] } {
  return arch(glow, (k) => {
    const squares = [lambert(PALETTE.barrierWhite), lambert(PALETTE.doorDark)];
    const [cols, rows] = [9, 2], s = BANNER_W / cols;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) k.box(squares[(i + j) % 2], s, BANNER_H / rows, 0.04, -BANNER_W / 2 + s * (i + 0.5), BANNER_Y + BANNER_H / 2 - (BANNER_H / rows) * (j + 0.5), 0);
    bunting(k, [PALETTE.barrierWhite, PALETTE.doorDark]);
  });
}

const POLE = 4.2;
const LOOK: Record<Exclude<GateState, "hidden">, { color: THREE.Color; glow: number }> = {
  next: { color: new THREE.Color(PALETTE.flagNext), glow: 0.6 },
  ahead: { color: new THREE.Color(PALETTE.flag), glow: 0.3 },
  done: { color: new THREE.Color(PALETTE.flagDone), glow: 0.1 },
};

/** A gate: two tall slim posts at x = ±width/2 with pennant flags. Origin at the gate centre; you drive through along z. */
export function buildGate(width: number): {
  object: THREE.Group;
  colliders: Circle[];
  /** next: flags PALETTE.flagNext and gently pulsing/waving using `time`; ahead: PALETTE.flag; done: PALETTE.flagDone; hidden: invisible. Must be cheap per frame. */
  setState(state: GateState, time: number): void;
} {
  const object = new THREE.Group();
  const k = new Kit();
  // This gate's own: its state never shows on another gate.
  const flag = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  const pole = lambert(PALETTE.barrierWhite), dark = lambert(PALETTE.doorDark);
  const half = width / 2;
  // Each pennant is two hinged pieces, so the tip can lag the root as it waves.
  const flags: { root: THREE.Object3D; tip: THREE.Object3D; phase: number }[] = [];
  for (const s of [1, -1]) {
    const x = s * half;
    k.cyl(dark, 0.17, 0.3, x, 0.15, 0, 0, 0, 6);
    k.cyl(pole, 0.07, POLE, x, POLE / 2, 0, 0, 0, 6);
    k.cyl(flag, 0.09, 0.6, x, 1.3, 0, 0, 0, 6);
    k.add(flag, new THREE.IcosahedronGeometry(0.14, 0), x, POLE + 0.08, 0);
    const root = new THREE.Group();
    root.position.set(x, POLE - 0.55, 0);
    const tip = new THREE.Group();
    tip.position.x = s * 0.8;
    const a = new THREE.Mesh(prism([[0, 0.45], [s * 0.8, 0.27], [s * 0.8, -0.27], [0, -0.45]], 0.03), flag);
    const b = new THREE.Mesh(prism([[0, 0.27], [s * 0.8, 0], [0, -0.27]], 0.03), flag);
    a.castShadow = b.castShadow = true;
    tip.add(b);
    root.add(a, tip);
    object.add(root);
    flags.push({ root, tip, phase: s });
  }
  k.build(object);

  let current: GateState | null = null;
  function setState(state: GateState, time: number) {
    if (state !== current) {
      current = state;
      object.visible = state !== "hidden";
      if (state === "hidden") return;
      const look = LOOK[state];
      flag.color.copy(look.color);
      flag.emissive.copy(look.color);
      flag.emissiveIntensity = look.glow;
      for (const f of flags) f.root.rotation.y = f.tip.rotation.y = 0;
    }
    if (state !== "next") return;
    flag.emissiveIntensity = LOOK.next.glow + 0.3 * Math.sin(time * 3.2);
    for (const f of flags) {
      f.root.rotation.y = 0.22 * Math.sin(time * 2.4 + f.phase);
      f.tip.rotation.y = 0.4 * Math.sin(time * 2.4 + f.phase - 1.2);
    }
  }
  setState("ahead", 0);

  return { object, colliders: [{ x: -half, z: 0, r: 0.25 }, { x: half, z: 0, r: 0.25 }], setState };
}

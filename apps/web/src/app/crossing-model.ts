import * as THREE from "three";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";

const ARM = 5.5;
const PIVOT_Y = 1.15;
/** Lamp glow while lit: bright enough to read as on in full daylight. */
const LIT = 2.2;

/**
 * A level crossing: the railway runs along local z, the dirt track along local x. Origin at the track centre on
 * the ground. Two half barriers on opposite corners, each closing the lane that approaches it, so between them
 * they close the road. The rails are the caller's; this adds the planking between and beside them.
 */
export function buildCrossing(signalMaterial: THREE.MeshLambertMaterial): {
  object: THREE.Group;
  /** down: 0 = arms raised (vertical), 1 = arms lowered (horizontal). flash: whether the lights are flashing. time: seconds, for the flash phase. */
  update(down: number, flash: boolean, time: number): void;
  colliders: { x: number; z: number; r: number }[];
} {
  const object = new THREE.Group();
  const k = new Kit();
  // The two lamps of a pair alternate, so each gets its own material; both barriers share the pair.
  const lamps = [0, 1].map(() => {
    const m = signalMaterial.clone();
    m.color.copy(tone(PALETTE.signalRed, 0.35));
    m.emissive.set(PALETTE.signalRed);
    m.emissiveIntensity = 0;
    return m;
  });
  const white = lambert(PALETTE.barrierWhite), red = lambert(PALETTE.barrierRed), dark = lambert(PALETTE.doorDark);

  // Planks across the road width, between and beside the rails (which sit at x = ±0.75).
  const boards = [lambert(PALETTE.sleeper), lambert(PALETTE.timber), lambert(tone(PALETTE.timber, 0.8))];
  [-1.64, -1.32, -1.0, -0.48, -0.16, 0.16, 0.48, 1.0, 1.32, 1.64].forEach((x, i) =>
    k.box(boards[i % 3], 0.3, 0.12, 6 - (i % 2) * 0.3, x, 0.1, ((i % 3) - 1) * 0.08),
  );

  // Each assembly is built facing traffic from its local -x, with the arm lowering toward local -z.
  const pivots = (
    [
      [-4, 4.5, 0],
      [4, -4.5, Math.PI],
    ] as const
  ).map(([x, z, ry]) => {
    const a = k.at(x, 0, z, ry);
    a.box(lambert(PALETTE.concrete), 0.7, 0.16, 0.7, 0, 0.08, 0);
    a.box(white, 0.34, 1.2, 0.34, 0, 0.6, 0);
    a.box(red, 0.38, 0.12, 0.38, 0, 1.2, 0);
    // Signal mast behind the post: crossbuck on top, a pair of lamps on black targets below it.
    a.cyl(lambert(PALETTE.roofTin), 0.07, 3.9, 0, 1.95, 0.5, 0, 0, 8);
    for (const r of [1, -1]) a.box(white, 0.04, 0.24, 1.7, r > 0 ? -0.1 : -0.13, 3.55, 0.5, (r * Math.PI) / 4);
    a.box(dark, 0.08, 0.08, 1.1, -0.06, 2.45, 0.5);
    lamps.forEach((lamp, i) => {
      const lz = 0.5 + (i ? 0.42 : -0.42);
      a.cyl(dark, 0.3, 0.05, -0.12, 2.45, lz, 0, Math.PI / 2, 12);
      a.cyl(lamp, 0.14, 0.08, -0.17, 2.45, lz, 0, Math.PI / 2, 10);
      a.box(dark, 0.22, 0.05, 0.34, -0.25, 2.62, lz);
    });
    a.box(dark, 0.3, 0.45, 0.25, 0, 0.4, 0.75);

    // The arm: striped, pointing up from the pivot when raised, a counterweight on the short end.
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    object.add(g);
    const ak = new Kit();
    const seg = ARM / 10;
    for (let i = 0; i < 10; i++) ak.box(i % 2 ? red : white, 0.1, seg, 0.14, 0, 0.2 + seg * (i + 0.5), 0);
    ak.box(dark, 0.12, 1.0, 0.1, 0, -0.3, 0);
    ak.box(lambert(PALETTE.concreteDark), 0.3, 0.45, 0.3, 0, -0.75, 0);
    ak.cyl(dark, 0.12, 0.25, -0.05, 0, 0, 0, Math.PI / 2, 8);
    const pivot = ak.build(new THREE.Group());
    pivot.position.set(0.34, PIVOT_Y, 0);
    g.add(pivot);
    return pivot;
  });
  k.build(object);

  return {
    object,
    update(down, flash, time) {
      for (const p of pivots) p.rotation.x = (-down * Math.PI) / 2;
      // Swap twice a second; the bit trick keeps negative times in phase too.
      const phase = Math.floor(time * 2) & 1;
      lamps[0].emissiveIntensity = flash && phase === 0 ? LIT : 0;
      lamps[1].emissiveIntensity = flash && phase === 1 ? LIT : 0;
    },
    // The posts (and the mast just behind each).
    colliders: [
      { x: -4, z: 4.75, r: 0.55 },
      { x: 4, z: -4.75, r: 0.55 },
    ],
  };
}

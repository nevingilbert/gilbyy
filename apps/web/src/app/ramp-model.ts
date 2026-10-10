import * as THREE from "three";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";
import { FENCE, RAMP, fencePosts } from "./ramp";

type P = readonly [number, number, number];

/**
 * Flat panels gathered into one geometry, with the attributes a box has so a kit can merge
 * them. Every panel of the ramp is seen from above, so each is wound to face upward.
 */
class Panels {
  private at: number[] = [];
  /** Corners in order round the panel. */
  quad(a: P, b: P, c: P, d: P) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  tri(a: P, b: P, c: P) {
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    this.at.push(...a, ...(up < 0 ? [...c, ...b] : [...b, ...c]));
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.at, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((this.at.length / 3) * 2), 2));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * The jump (ramp.ts): a boarded timber ramp with a curved deck, a kerb down each edge, a
 * yellow board across the lip and a rail fence along both sides. Origin at the middle of
 * its low edge, at ground level; you drive up it along +z.
 *
 * `surface(u, w)` is how high the ground stands `u` up the ramp and `w` to the left of its
 * middle, the deck included, relative to the origin. It is the same thing the physics
 * asks, so the boards are exactly where the wheels roll.
 */
export function buildRamp(surface: (u: number, w: number) => number): THREE.Group {
  const k = new Kit();
  const { length, width, back, side } = RAMP;
  const half = width / 2;
  const planks = [lambert(PALETTE.timber), lambert(tone(PALETTE.timber, 0.86))];
  const boards = lambert(tone(PALETTE.timber, 0.6));
  const beam = lambert(tone(PALETTE.timber, 0.72));
  const at = (u: number, w: number, lift = 0): P => [w, surface(u, w) + lift, u];
  // Boards that reach the ground go a little into it, so no edge shows a gap on a slope.
  const foot = (u: number, w: number) => at(u, w, -0.35);

  // The deck, a plank to the metre, and the boarded sides under it.
  const deck = [new Panels(), new Panels()];
  const sides = new Panels();
  for (let u = 0; u < length; u++) {
    deck[u % 2].quad(at(u, half), at(u + 1, half), at(u + 1, -half), at(u, -half));
    for (const s of [1, -1]) sides.quad(at(u, s * half), foot(u, s * (half + side)), foot(u + 1, s * (half + side)), at(u + 1, s * half));
  }
  // The back, under the lip, and the two corners where it meets the sides.
  sides.quad(at(length, -half), foot(length + back, -half), foot(length + back, half), at(length, half));
  for (const s of [1, -1]) sides.quad(at(length, s * half), foot(length, s * (half + side)), foot(length + back, s * (half + side)), foot(length + back, s * half));
  deck.forEach((p, i) => k.add(planks[i], p.build(), 0, 0, 0));
  k.add(boards, sides.build(), 0, 0, 0);

  // A kerb down each edge of the deck, a sill where the wheels roll on, and the board across the lip.
  for (const s of [1, -1]) for (let u = 0; u < length; u++) k.strut(beam, at(u, s * (half - 0.09), 0.08), at(u + 1, s * (half - 0.09), 0.08), 0.18);
  k.strut(beam, at(0.12, half, 0.02), at(0.12, -half, 0.02), 0.2);
  k.strut(lambert(PALETTE.hazardYellow), at(length - 0.1, half, 0.05), at(length - 0.1, -half, 0.05), 0.2);

  // The fence: a post every metre and a half, and two rails.
  const us = fencePosts();
  for (const s of [1, -1]) {
    const w = s * FENCE.out;
    us.forEach((u, i) => {
      const [, y] = at(u, w);
      k.box(beam, 0.16, FENCE.height + 0.4, 0.16, w, y + (FENCE.height - 0.4) / 2, u);
      if (i > 0) for (const h of [0.5, 1.02]) k.strut(planks[0], at(us[i - 1], w, h), at(u, w, h), 0.09);
    });
  }
  return k.build(new THREE.Group());
}

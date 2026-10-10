/**
 * A timber ramp to jump off. It isn't in the height grid, which is too coarse for one:
 * its deck is added on top of the ground wherever something asks how high the ground is,
 * so the physics and the model (ramp-model.ts) read the same shape. Pure, no three.js.
 */
export type Ramp = {
  /** The middle of its low edge, where the wheels roll on. */
  x: number;
  z: number;
  /** The way you drive up it. 0 faces +z, like a truck's heading. */
  heading: number;
};

/**
 * Sized by driving it (ramp.test.ts): a starter rig is in the air for a little over a
 * second and the quickest for nearly a second and a half, and all of them come down
 * within 35 m of the lip.
 */
export const RAMP = {
  length: 18,
  width: 7,
  height: 4,
  /** The deck curves up: level where the wheels roll on, steepest at the lip. */
  curve: 1.8,
  /** How far the boarded back and sides lean out at the bottom, so nothing is a sheer wall. */
  back: 2.4,
  side: 1.6,
} as const;

/** A fence down each side keeps trucks off the boarded sides: from this far up the ramp, this far out from its middle. */
export const FENCE = { from: 6, out: RAMP.width / 2 + RAMP.side + 0.3, spacing: 1.5, height: 1.2 } as const;

/** Where a point is against a ramp: `u` metres up it from its low edge, `w` to the left of its middle. */
export function rampLocal(r: Ramp, x: number, z: number) {
  const fx = Math.sin(r.heading);
  const fz = Math.cos(r.heading);
  return { u: (x - r.x) * fx + (z - r.z) * fz, w: (x - r.x) * fz - (z - r.z) * fx };
}

/** The point `u` up a ramp and `w` to the left of its middle. */
export function rampPoint(r: Ramp, u: number, w: number) {
  const fx = Math.sin(r.heading);
  const fz = Math.cos(r.heading);
  return { x: r.x + fx * u + fz * w, z: r.z + fz * u - fx * w };
}

/** How far the ramp's surface stands above the ground, `u` up it and `w` off its middle. */
export function deckLift(u: number, w: number) {
  const { length, width, height, curve, back, side } = RAMP;
  if (u <= 0 || u >= length + back) return 0;
  const out = Math.abs(w) - width / 2;
  if (out >= side) return 0;
  const top = u <= length ? height * Math.pow(u / length, curve) : height * (1 - (u - length) / back);
  return out <= 0 ? top : top * (1 - out / side);
}

/** How far the highest of `ramps` lifts the ground at (x, z); 0 away from them all. */
export function rampLift(ramps: readonly Ramp[], x: number, z: number) {
  let lift = 0;
  for (const r of ramps) {
    // Nothing of a ramp is further than this from its low edge.
    if (Math.abs(x - r.x) > 26 || Math.abs(z - r.z) > 26) continue;
    const { u, w } = rampLocal(r, x, z);
    lift = Math.max(lift, deckLift(u, w));
  }
  return lift;
}

/**
 * The ground a ramp stands on is levelled first (world.ts), so its deck is level from side
 * to side whatever the meadow does: this box round its footprint, flat for `flat` metres
 * beyond it (more than a grid cell's diagonal) and blended back over `blend`.
 */
export const PAD = { flat: 15, blend: 24 } as const;
export function rampPad(r: Ramp) {
  const corners = [-2, RAMP.length + RAMP.back + 2].flatMap((u) => [1, -1].map((s) => rampPoint(r, u, s * (RAMP.width / 2 + RAMP.side))));
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** Where the fence posts stand: `u` up the ramp, on both sides. */
export function fencePosts() {
  const us: number[] = [];
  for (let u: number = FENCE.from; u <= RAMP.length + RAMP.back + 0.01; u += FENCE.spacing) us.push(u);
  return us;
}

/**
 * What a truck can't drive through: the fence posts down each side, and the boards under
 * the lip. The boards have a `top`, a metre up, so only a truck on the ground behind the
 * ramp is stopped by them: one on the deck, or leaving it, is above them and passes over.
 * `ground` is the ground without the ramp.
 */
export function rampObstacles(r: Ramp, ground: (x: number, z: number) => number) {
  const out: { x: number; z: number; r: number; h: number; top?: number }[] = [];
  for (const u of fencePosts()) for (const side of [1, -1]) out.push({ ...rampPoint(r, u, side * FENCE.out), r: 0.35, h: FENCE.height });
  for (let w = -RAMP.width / 2; w <= RAMP.width / 2 + 0.01; w += 1.4) {
    const p = rampPoint(r, RAMP.length + RAMP.back / 2, w);
    out.push({ ...p, r: 0.7, h: 1, top: ground(p.x, p.z) + 1 });
  }
  return out;
}

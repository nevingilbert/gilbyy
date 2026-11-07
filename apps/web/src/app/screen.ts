/**
 * The camera's view for the shape of the screen. Pure; no three.js.
 *
 * The camera's field of view is vertical, so a screen held upright (a phone, or an iPhone
 * Duo open, 669 by 951 points) would see a narrower slice of the world the narrower it is.
 * Upright, the view opens up until it's as wide across as a square screen's, so the road
 * ahead and its sides stay in frame; it stops at `MAX_FOV` before the edges stretch. Wider
 * than tall, it's the game's 48 degrees, as it always was.
 */

/** The vertical field of view, in degrees, on a screen as wide as it is tall or wider. */
export const BASE_FOV = 48;
/** As far as an upright screen opens it, in degrees. */
export const MAX_FOV = 66;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The vertical field of view, in degrees, for a screen `aspect` (width over height). */
export function fovFor(aspect: number): number {
  if (!(aspect > 0) || aspect >= 1) return BASE_FOV;
  const fov = 2 * deg(Math.atan(Math.tan(rad(BASE_FOV / 2)) / aspect));
  return Math.min(MAX_FOV, fov);
}

/**
 * How much further back a film's wide shot stands (ADR 0014), so it takes in about what it
 * would across a screen 1.25 wide at the base view. 1 when the screen is that wide already.
 */
export function wideShotBack(aspect: number, fov = fovFor(aspect)): number {
  const across = Math.tan(rad(fov / 2)) * Math.max(aspect, 1e-3);
  const want = Math.tan(rad(BASE_FOV / 2)) * 1.25;
  return Math.min(2.4, Math.max(1, want / across));
}

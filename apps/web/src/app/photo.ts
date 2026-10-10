/**
 * Photo mode (ADR 0018): the world stands still and the camera goes round the truck to
 * take a picture. Pure, so where the camera may go is tested without a page.
 *
 * The camera is held as an orbit about a point in the middle of the truck: `yaw` is the
 * way it looks across the ground (a heading, so 0 looks along +z), `pitch` how far it
 * looks down, and `dist` how far it is from that point, in metres.
 */
export type Orbit = { yaw: number; pitch: number; dist: number };
type Point = { x: number; y: number; z: number };

/** How far over the truck's origin the camera looks: about the middle of the body. */
export const LOOK_UP = 0.5;
/** Close enough to fill the picture with the longest rig without going inside it; far enough for the valley around it. */
export const NEAREST = 4.5;
export const FURTHEST = 60;
/** From a little below the truck, looking up at it against the sky, to nearly straight down. */
export const LOWEST = -0.25;
export const HIGHEST = 1.45;
/** The camera never goes nearer the ground, or the water, than this. */
export const CLEARANCE = 0.6;
/** Radians the camera goes round for a pixel dragged, and for a second of an arrow key held. */
export const DRAG_TURN = 0.006;
export const KEY_TURN = 1.4;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Keeps an orbit within reach: never under the ground's level by much, never inside the truck, never far off. */
export function clampOrbit(o: Orbit): Orbit {
  return {
    yaw: wrap(o.yaw),
    pitch: Math.max(LOWEST, Math.min(HIGHEST, o.pitch)),
    dist: Math.max(NEAREST, Math.min(FURTHEST, o.dist)),
  };
}

/** The orbit with the camera at `camera`, looking at `centre`: where photo mode starts, so the picture doesn't jump. */
export function orbitFrom(camera: Point, centre: Point): Orbit {
  const dx = centre.x - camera.x;
  const dz = centre.z - camera.z;
  const across = Math.hypot(dx, dz);
  const up = camera.y - centre.y;
  return clampOrbit({ yaw: Math.atan2(dx, dz), pitch: Math.atan2(up, across), dist: Math.hypot(across, up) });
}

/**
 * Moves the camera round by a drag of (`dx`, `dy`) pixels. The truck turns with the
 * finger, like a turntable: dragging right takes the camera round to its left, and
 * dragging down lifts it.
 */
export function dragOrbit(o: Orbit, dx: number, dy: number): Orbit {
  return clampOrbit({ yaw: o.yaw - dx * DRAG_TURN, pitch: o.pitch + dy * DRAG_TURN, dist: o.dist });
}

/** Further off by `factor` (above 1), or nearer (below 1). */
export function zoomOrbit(o: Orbit, factor: number): Orbit {
  return clampOrbit({ ...o, dist: o.dist * factor });
}

/** A step of `k` (0–1) of the way from one orbit to another, round the short way. */
export function easeOrbit(from: Orbit, to: Orbit, k: number): Orbit {
  return {
    yaw: wrap(from.yaw + wrap(to.yaw - from.yaw) * k),
    pitch: from.pitch + (to.pitch - from.pitch) * k,
    dist: from.dist + (to.dist - from.dist) * k,
  };
}

/**
 * Where the camera stands on an orbit about `centre`. `floor` is the height of the ground
 * or the water, whichever is higher; where the orbit would go under it, the camera stays
 * `CLEARANCE` above it and looks down a little more steeply instead.
 */
export function cameraAt(o: Orbit, centre: Point, floor: (x: number, z: number) => number): Point {
  const across = Math.cos(o.pitch) * o.dist;
  const x = centre.x - Math.sin(o.yaw) * across;
  const z = centre.z - Math.cos(o.yaw) * across;
  return { x, y: Math.max(centre.y + Math.sin(o.pitch) * o.dist, floor(x, z) + CLEARANCE), z };
}

/** What a picture is called when it's saved: when it was taken, local time. */
export function photoName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `gilbyy-${day}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}.png`;
}

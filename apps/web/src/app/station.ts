/**
 * The railway stations (ADR 0022): the valley's, on the west side of its loop with a branch
 * off past the platform to a tunnel into the mountains; and San Francisco's, the terminal
 * at Fourth and King, its line out past Sixteenth Street into the tunnel under Potrero Hill.
 * The train between them goes through one tunnel and out of the other.
 *
 * Each station is described the same way, by the line a departing train takes: from behind
 * the platform, past it, over the points if there are any, through the tunnel's mouth and
 * on into the dark. Pure, no three.js.
 */
import { FLAT_FROM_HEAD, lineFrame, lineThrough, type RailLine } from "./rail";
import { CONSIST, TRAIN_LENGTH, trackFrame, trackPoint } from "./track";
import type { Track } from "./terrain";

export type Spot = { x: number; z: number; heading: number };

export type Station = {
  /** Where the station's building stands, and which way its front faces. */
  x: number;
  z: number;
  rot: number;
  /** The way out: from behind the platform, past it, over the points, through the tunnel's mouth and on. */
  line: RailLine;
  /** Where the front of a train standing to leave is along `line`, and which way it faces: +1 toward the tunnel. */
  head: number;
  facing: 1 | -1;
  /** Where an arriving train's front stops. It comes in from the tunnel facing −1. */
  arrive: number;
  /** Where along `line` the branch leaves the loop, for the valley's; null for a station with no points. */
  points: number | null;
  /** Where along `line` the tunnel's mouth is. */
  portal: number;
  /** The platform, from and to along `line`, and which side of the track it's on: +1 to the left of the way out. */
  platform: [number, number];
  side: 1 | -1;
  /** Where a truck waits to board, beside the flat wagon; and where it's left after a trip. */
  board: Spot;
  leave: Spot;
};

/** How far the valley's train has gone round its loop where it stops, and where the branch leaves past the platform. */
export const VALLEY_STOP = 6700;
const POINTS_PAST = 110;
/** How much of the loop before the stop the way out starts with: enough for a whole train behind it. */
const BEHIND = 230;
/** How far from the track a truck waits to board, and where the station's building stands. */
const BOARD_OFF = 9;
const HOUSE_OFF = 17;
/** Rails climb or fall no more than this a metre, and go in under the hill where it stands this high over them. */
const GRADE = 0.02;
const COVER = 9;
const TUNNEL_ON = 300;
/**
 * How much of the train at either end the platform leaves clear: the flat wagon and a
 * little more, so a truck going round behind it to the ramp, or backing off it, crosses
 * no platform. The wagon stands at one end to leave and at the other on coming in.
 */
const WAGON_ROOM = CONSIST[CONSIST.length - 1].length + 2;

/**
 * The valley's station: a platform on the inside of the loop, the branch leaving it past
 * the platform's end, curving out to the foot of the mountains and in.
 */
export function valleyStation(track: Track, ground: (x: number, z: number) => number): Station {
  const pts: { x: number; z: number; y: number }[] = [];
  const start = VALLEY_STOP - BEHIND;
  const points = VALLEY_STOP + POINTS_PAST;
  for (let s = start; s <= points; s += 2.5) {
    const p = trackPoint(track, s);
    pts.push({ x: p.x, z: p.z, y: p.y });
  }
  // The branch: a curve from the points, along the loop at first, then out toward the
  // mountains, as far as the hill needs to rise over the rails for a tunnel.
  const p0 = trackFrame(track, points);
  const r0 = Math.hypot(p0.x, p0.z);
  const out = { x: p0.x / r0, z: p0.z / r0 };
  const far = { x: out.x * 2620, z: out.z * 2620 };
  const c1 = { x: p0.x + p0.fx * 150, z: p0.z + p0.fz * 150 };
  const c2 = { x: far.x - out.x * 160, z: far.z - out.z * 160 };
  const curve: { x: number; z: number }[] = [];
  for (let k = 1; k <= 60; k++) {
    const u = k / 60;
    const a = (1 - u) ** 3;
    const b = 3 * u * (1 - u) ** 2;
    const c = 3 * u * u * (1 - u);
    const d = u ** 3;
    curve.push({ x: a * p0.x + b * c1.x + c * c2.x + d * far.x, z: a * p0.z + b * c1.z + c * c2.z + d * far.z });
  }
  // Rails half a metre over the ground, never steeper than GRADE, from the loop's own height.
  let y = p0.y;
  let portal = -1;
  let last = { x: p0.x, z: p0.z };
  let along = 0;
  for (const p of curve) {
    const step = Math.hypot(p.x - last.x, p.z - last.z);
    along += step;
    last = p;
    const want = ground(p.x, p.z) + 0.4;
    y = Math.max(y - GRADE * step, Math.min(y + GRADE * step, want));
    pts.push({ ...p, y });
    // The tunnel goes in where the hill stands COVER over the rails and stays so, into the
    // mountains. A foothill on the way is cut through.
    if (ground(p.x, p.z) - y <= COVER) portal = -1;
    else if (portal < 0) portal = along;
  }
  // On into the mountain, level.
  const end = curve[curve.length - 1];
  const prev = curve[curve.length - 2];
  const dl = Math.hypot(end.x - prev.x, end.z - prev.z);
  for (let d = 10; d <= TUNNEL_ON; d += 10) pts.push({ x: end.x + ((end.x - prev.x) / dl) * d, z: end.z + ((end.z - prev.z) / dl) * d, y });
  const line = lineThrough(pts);
  const pointsAlong = points - start;
  const portalAt = portal < 0 ? pointsAlong + along : pointsAlong + portal;
  // The platform is on the inside of the loop, to the right of the way out.
  const head = VALLEY_STOP - start;
  const platform: [number, number] = [head - TRAIN_LENGTH + WAGON_ROOM, head - WAGON_ROOM];
  return {
    ...stationParts(line, head, 1, head - TRAIN_LENGTH, -1, platform),
    line, head, facing: 1, arrive: head - TRAIN_LENGTH, points: pointsAlong, portal: portalAt, platform, side: -1,
  };
}

/**
 * Fourth and King: the line runs from the buffers out to the tunnel, the platform on the
 * King Street side. A train stands with its front to the buffers, and leaves backing out,
 * as Caltrain's do, pushed from the far end.
 */
export function cityStation(line: RailLine, portal: number): Station {
  const head = 3;
  // Trains come in and leave the same way round here, so the wagon is only ever at the far end.
  const platform: [number, number] = [0, head + TRAIN_LENGTH - WAGON_ROOM];
  // The building stands past the buffers, its front to Fourth Street.
  const f = lineFrame(line, 0);
  const building = { x: f.x - f.fx * 16, z: f.z - f.fz * 16, rot: Math.atan2(-f.fx, -f.fz) };
  return { ...stationParts(line, head, -1, head, 1, platform), ...building, line, head, facing: -1, arrive: head, points: null, portal, platform, side: 1 };
}

/**
 * The building, and where trucks board and are left. A train standing to leave has its
 * flat wagon at its back; so does one that has just come in.
 */
function stationParts(line: RailLine, head: number, facing: 1 | -1, arrive: number, side: 1 | -1, platform: [number, number]) {
  // The flat wagon's middle: behind the front of whichever way the train faces. An arriving train always faces −1.
  const waiting = lineFrame(line, head - facing * FLAT_FROM_HEAD);
  const arrived = lineFrame(line, arrive + FLAT_FROM_HEAD + 12);
  const middle = lineFrame(line, (platform[0] + platform[1]) / 2);
  const left = (f: ReturnType<typeof lineFrame>, d: number) => ({ x: f.x + f.lx * side * d, z: f.z + f.lz * side * d });
  const house = left(middle, HOUSE_OFF);
  // Facing away from the track, out onto the yard.
  const away = Math.atan2(middle.lx * side, middle.lz * side);
  return {
    ...house, rot: away,
    // Waiting alongside, facing the way the train will leave: out along the line, toward the tunnel.
    board: { ...left(waiting, BOARD_OFF), heading: Math.atan2(waiting.fx, waiting.fz) },
    // Left beside the platform's end, facing away from the track, ready to drive off.
    leave: { ...left(arrived, BOARD_OFF + 3), heading: away },
  };
}

/** How near the waiting spot a truck has to be, and how slowly going, for the train to be on offer. */
export const BOARD_REACH = 8;

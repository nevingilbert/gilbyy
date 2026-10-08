import type { Mission } from "./missions";
import { makeRandom } from "./noise";
import { CAFE, ROW, START, WORLD, gridX, gridZ, type Terrain } from "./terrain";

/**
 * Four buildings that have nothing to do with driving: a bank, a church, a school and a
 * casino, each standing somewhere out in the valley. Stop at the door and press E, and a
 * small card says what the owner's other project behind it is, with a link that opens in
 * a new tab. They are easter eggs: not on the map or the compass, not counted, and worth
 * no miles. See docs/decisions/0012-easter-egg-buildings.md.
 *
 * Pure data, no three.js.
 */
export type LandmarkKind = "bank" | "church" | "school" | "casino";
export type Landmark = { kind: LandmarkKind; x: number; z: number; y: number; rot: number };

export const LANDMARKS: Record<LandmarkKind, { place: string; title: string; blurb: string; host: string }> = {
  bank: {
    place: "the bank",
    title: "Deal or No Deal",
    blurb: "Pick a case, then see how long you hold out against the banker's offers.",
    host: "deal.gilbyy.com",
  },
  church: {
    place: "the church",
    title: "Salem",
    blurb: "A remake of Town of Salem. Somebody in town is lying; work out who before they get to you.",
    host: "salem.gilbyy.com",
  },
  school: {
    place: "the schoolhouse",
    title: "Times Tables",
    blurb: "Multiplication and mixed maths against the clock, played against your friends.",
    host: "times.gilbyy.com",
  },
  casino: {
    place: "the casino",
    title: "Friendly Bets",
    blurb: "For hangouts: bet anything on anything. “I bet five that Sam falls asleep before midnight.”",
    host: "bets.gilbyy.com",
  },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS) as LandmarkKind[];
export const landmarkUrl = (kind: LandmarkKind) => `https://${LANDMARKS[kind].host}/`;

/** The yard levelled round each one, the blend back into the hillside, and how far trees and rocks keep off. */
export const LANDMARK_FLAT = 20;
export const LANDMARK_BLEND = 22;
export const LANDMARK_CLEAR = 24;

/**
 * Where the four stand: dry, fairly level ground you can reach on stock tyres, well away
 * from the camp, the garages, the railway, the rivers, the courses and each other. The
 * school is a short drive from camp, the casino a long one. Deterministic, with its own
 * random stream so nothing else in the valley moves.
 */
export function chooseLandmarks(t: Terrain, missions: Mission[], seed: number): Landmark[] {
  const { heights, zone, trackDist, riverDist, roadDist, campDist, water, snow, ice } = t;
  const rand = makeRandom(seed + 91);
  const taken: { x: number; z: number }[] = [...t.sites, CAFE, ...missions.flatMap((m) => [m.start, ...m.gates])];
  const candidates: { x: number; z: number; y: number }[] = [];
  for (let j = 4; j < ROW - 4; j += 3) {
    for (let i = 4; i < ROW - 4; i += 3) {
      const k = j * ROW + i;
      const x = gridX(i);
      const z = gridZ(j);
      if (Math.hypot(x, z) > WORLD.wallStart - 80 || zone[k] !== 1 || snow[k] > 0.2 || ice[k] > 0) continue;
      if (trackDist[k] < 70 || riverDist[k] < 80 || roadDist[k] < 40 || campDist[k] < 200) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let wet = false;
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const kk = (j + dj) * ROW + i + di;
          lo = Math.min(lo, heights[kk]);
          hi = Math.max(hi, heights[kk]);
          wet ||= heights[kk] < water[kk] + 1;
        }
      }
      if (wet || hi - lo > 5) continue;
      if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < 260)) continue;
      candidates.push({ x, z, y: heights[k] });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const fromStart = (c: { x: number; z: number }) => Math.hypot(c.x - START.x, c.z - START.z);
  const plan: { kind: LandmarkKind; accept: (d: number) => boolean }[] = [
    { kind: "school", accept: (d) => d > 400 && d < 900 },
    { kind: "casino", accept: (d) => d > 1500 },
    { kind: "bank", accept: (d) => d > 700 },
    { kind: "church", accept: (d) => d > 700 },
  ];
  const picked: Landmark[] = [];
  for (const { kind, accept } of plan) {
    const apart = (c: { x: number; z: number }) => picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 700);
    const c = candidates.find((c) => accept(fromStart(c)) && apart(c)) ?? candidates.find(apart);
    // Each faces back toward camp, so the front is what you see coming.
    if (c) picked.push({ kind, x: c.x, z: c.z, y: c.y, rot: Math.atan2(START.x - c.x, START.z - c.z) });
  }
  return picked;
}

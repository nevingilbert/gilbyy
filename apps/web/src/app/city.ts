/**
 * San Francisco (ADR 0022): the whole city at 1:2.5 across and 1:1.7 up, from the Census's
 * streets and the USGS's ground (city-streets.ts), with its parks, neighbourhoods and
 * landmarks set down by hand (city-places.ts). A train from the valley comes out of the
 * tunnel under Potrero Hill and runs in to Fourth and King. Thirty tents on Rob Hill in
 * the Presidio, the only campground in the city; a café on Washington Square in North
 * Beach; three garages; eight courses; and both bridges to drive.
 *
 * It lies on the same grid as the valley and the island, so the physics, the renderer and
 * the map read it the same way. Pure data, no three.js. Build it after `loadCityData()`.
 */
import { buildDecks, deckIndex, deckPoint, type Deck, type DeckIndex } from "./city-bridges";
import { layBuildings, Walls, type Building, type District } from "./city-buildings";
import { DISTRICTS, LANDMARKS, PARKS, type ParkKind, type Spot } from "./city-places";
import { SIDEWALK, STREET_WIDTH, cityData, resample, sidewalkOf, streetGraph, toGame, type Pt, type Street, type StreetClass, type StreetGraph } from "./city-streets";
import { courseDistOf, courseLength, courseLimits, gatesAlong, type Mission } from "./missions";
import { makeRandom } from "./noise";
import { CELL, FAR, HALF, ROW, WORLD, flood, gridX, gridZ, level, nearest, sampleGrid, type Pitch, type Site, type Track } from "./terrain";
import { cableLine, type CableLine } from "./cable-car";
import { CONVOY_MAX, lineUp } from "./convoy";
import { lineUpAlone } from "./mission-run";
import { BED, besideBed, carsOn, clearBed, mouthAt, pastEnd } from "./rail";
import { easeRoads } from "./roads";
import { cityStation } from "./station";
import { HEADROOM, trainObstacles } from "./track";
import { obstacleIndex, trunkRadius, type Bush, type Obstacle, type Rock, type Tree, type World } from "./world";

/** How much shorter than life the hills are drawn: across is 1:2.5, so the streets come out steeper than they are, which suits them. */
export const VSCALE = 1.7;
/** The edge of the world is a square this far either side of the middle; past it there is only the sea, or the hills to the south and north. */
export const CITY_LIMIT = 2880;
/** The steepest any street is along itself, rise over run: 38 degrees, short of the 40 that no truck climbs past (physics.ts). */
export const STREET_GRADE = Math.tan((38 * Math.PI) / 180);

/** The street map the terrain is painted from: distance to the nearest kerb, every KERB_CELL metres. */
export const KERB_N = 2048;
export const KERB_CELL = (HALF * 2) / KERB_N;
/** A kerb distance as a byte: an eighth of a metre a step, from 16 m inside the road to 15.9 m outside it. */
const kerbByte = (d: number) => Math.max(0, Math.min(255, Math.round((d + 16) * 8)));
export const kerbOf = (byte: number) => byte / 8 - 16;

/** What a park's ground is, at each grid vertex: 0 none, then the kinds in order. */
const PARK_CODES: ParkKind[] = ["wood", "lawn", "wild", "sand", "plaza"];
const DISTRICT_CODES: District[] = ["rows", "towers", "midrise", "chinatown", "lofts", "sheds", "avenues", "marina", "barracks"];

/** Something famous, for the renderer to build: what, where, which way it faces. */
export type CityLandmark = { kind: keyof typeof LANDMARKS; x: number; z: number; y: number; rot: number };

/** What a landmark stands on: a box, across and along the way it faces, or a round. */
export type Footprint = readonly [number, number] | { readonly r: number };

/**
 * What each solid landmark stands on at a truck's height, for the walls, as it's drawn
 * (city-landmarks.ts): Oracle Park's stands go round, so a round; the Painted Ladies are the
 * four of theirs that fit their block. The gate and the windmills' sails a truck passes
 * under or round.
 */
export const LANDMARK_FOOTPRINT: Partial<Record<CityLandmark["kind"], Footprint>> = {
  coitTower: [10, 10], transamerica: [21, 21], salesforce: [22, 22], bankOfAmerica: [22, 22], ferryBuilding: [13, 78], cityHall: [48, 36],
  graceCathedral: [16, 34], palaceOfFineArts: [22, 22], ghirardelli: [26, 26], pier39: [26, 72], oraclePark: { r: 46 }, missionDolores: [10, 22],
  cliffHouse: [16, 12], legionOfHonor: [30, 36], paintedLadies: [12, 25.2], fortPoint: [24, 24], conservatory: [30, 12],
  dutchWindmill: [6, 6], murphyWindmill: [6, 6],
};

/** How far every landmark's footprint stands back from the kerb: over the pavement, and a little more. */
export const LANDMARK_BACK = SIDEWALK + 0.4;
/** How high a bridge's deck has to stand over a landmark for it to stand under the deck: Fort Point under the Golden Gate. */
const UNDER_DECK = 20;
/** Which way Pier 39 runs out from the Embarcadero, as the survey has it, north by a little west: a heading from its end back to its entrance. */
const PIER_RUNS = 0.22;

/** How far a footprint reaches from its middle. */
const reachOf = (f: Footprint) => ("r" in f ? f.r : Math.hypot(f[0] / 2, f[1] / 2));

/** Points every `step` metres over a footprint turned by `rot`, from its middle: its edge first, then inside it. */
export function footprintPoints(rot: number, f: Footprint, step = 1): Pt[] {
  const out: Pt[] = [];
  if ("r" in f) {
    for (let r = f.r; r > 0; r -= step) {
      const n = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) out.push({ x: Math.sin((i / n) * 2 * Math.PI) * r, z: Math.cos((i / n) * 2 * Math.PI) * r });
    }
    out.push({ x: 0, z: 0 });
    return out;
  }
  const [w, d] = f;
  const [cos, sin] = [Math.cos(rot), Math.sin(rot)];
  const na = Math.max(1, Math.ceil(w / step));
  const nb = Math.max(1, Math.ceil(d / step));
  // Across the way it faces is (cos, −sin), along it (sin, cos), as the walls have a box.
  const at = (i: number, j: number) => {
    const [a, b] = [-w / 2 + (w * i) / na, -d / 2 + (d * j) / nb];
    out.push({ x: a * cos + b * sin, z: -a * sin + b * cos });
  };
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) if (i === 0 || j === 0 || i === na || j === nb) at(i, j);
  for (let i = 1; i < na; i++) for (let j = 1; j < nb; j++) at(i, j);
  return out;
}

/** The nearest offset from where something is, ring by ring every half metre out to `reach`, that `ok` takes; null if none does. */
function nearestOffset(ok: (dx: number, dz: number) => boolean, reach = 60): Pt | null {
  for (let r = 0.5; r <= reach; r += 0.5) {
    const n = Math.ceil((2 * Math.PI * r) / 0.5);
    for (let i = 0; i < n; i++) {
      const [x, z] = [Math.sin((i / n) * 2 * Math.PI) * r, Math.cos((i / n) * 2 * Math.PI) * r];
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}

/** How high the hill stands over the rails where the line into the city goes in under it. */
const TUNNEL_COVER = 7;

/** The railway into Fourth and King: a line from the buffers, out past the platforms, under Potrero Hill and on into the dark. */
export type CityRail = {
  line: Track;
  /** How far along the line the tunnel's mouth is. */
  portal: number;
};

export type CityParts = {
  streets: Street[];
  graph: StreetGraph;
  /** Distance to the nearest kerb, as bytes (`kerbOf`), KERB_N square, north row first. */
  kerb: Uint8Array;
  buildings: Building[];
  walls: Walls;
  decks: Deck[];
  deckIndex: DeckIndex;
  /** At each grid vertex: 0 no park, 1 + the kind's index in PARK_CODES. */
  parks: Uint8Array;
  landmarks: CityLandmark[];
  rail: CityRail;
  /** The cable cars' line, Powell and Hyde (cable-car.ts). */
  cable: CableLine;
  /** The campground's fire, out in front of its tents. */
  fire: Pt;
  /**
   * Lombard's crooked block, from its top corner down its length, and its lane's middle
   * line, for its bricks; and the flowers in its beds.
   */
  crooked: { x: number; z: number; dx: number; dz: number; length: number; lane: Pt[] };
  flowers: Bush[];
};

export type CityWorld = World & { city: CityParts };


/** Whether a point is inside a polygon (even–odd). */
function inside(pts: Pt[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** Calls `cell` for every cell of a `n`-square grid of `size`-metre cells whose middle is inside the polygon. */
function fillPolygon(pts: Pt[], n: number, size: number, cell: (i: number, j: number) => void) {
  const zs = pts.map((p) => p.z);
  const j0 = Math.max(0, Math.floor((Math.min(...zs) + HALF) / size));
  const j1 = Math.min(n - 1, Math.ceil((Math.max(...zs) + HALF) / size));
  for (let j = j0; j <= j1; j++) {
    const z = -HALF + (j + 0.5) * size;
    const xs: number[] = [];
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const p = pts[a];
      const q = pts[b];
      if ((p.z > z) !== (q.z > z)) xs.push(p.x + ((z - p.z) / (q.z - p.z)) * (q.x - p.x));
    }
    xs.sort((u, v) => u - v);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const i0 = Math.max(0, Math.ceil((xs[m] + HALF) / size - 0.5));
      const i1 = Math.min(n - 1, Math.floor((xs[m + 1] + HALF) / size - 0.5));
      for (let i = i0; i <= i1; i++) cell(i, j);
    }
  }
}

/** The kerb map: every texel's distance to the nearest kerb, from every street but the bridges' decks (they're drawn as decks). */
export const kerbMap = (streets: Street[]) => kerbMapOf(streets.filter((s) => s.cls !== 4).map((s) => ({ xs: s.xs, zs: s.zs, half: STREET_WIDTH[s.cls] / 2 })));

/** A kerb map of any roads, each a line and half its paved width: Vegas's too (ADR 0023). Or those roads added to the map `out`. */
export function kerbMapOf(roads: { xs: ArrayLike<number>; zs: ArrayLike<number>; half: number }[], out = new Uint8Array(KERB_N * KERB_N).fill(255)) {
  for (const s of roads) {
    const half = s.half;
    const reach = half + 6;
    for (let k = 1; k < s.xs.length; k++) {
      const ax = s.xs[k - 1];
      const az = s.zs[k - 1];
      const dx = s.xs[k] - ax;
      const dz = s.zs[k] - az;
      const l2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - reach + HALF) / KERB_CELL));
      const i1 = Math.min(KERB_N - 1, Math.ceil((Math.max(ax, ax + dx) + reach + HALF) / KERB_CELL));
      const j0 = Math.max(0, Math.floor((Math.min(az, az + dz) - reach + HALF) / KERB_CELL));
      const j1 = Math.min(KERB_N - 1, Math.ceil((Math.max(az, az + dz) + reach + HALF) / KERB_CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = -HALF + (j + 0.5) * KERB_CELL - az;
        for (let i = i0; i <= i1; i++) {
          const px = -HALF + (i + 0.5) * KERB_CELL - ax;
          const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / l2));
          const v = kerbByte(Math.hypot(px - t * dx, pz - t * dz) - half);
          const idx = j * KERB_N + i;
          if (v < out[idx]) out[idx] = v;
        }
      }
    }
  }
  return out;
}

/** A kerb map's distance at a spot, bilinear between texels. */
export function kerbAt(kerb: Uint8Array, x: number, z: number) {
  const fx = Math.max(0, Math.min(KERB_N - 1.001, (x + HALF) / KERB_CELL - 0.5));
  const fz = Math.max(0, Math.min(KERB_N - 1.001, (z + HALF) / KERB_CELL - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * KERB_N + i;
  return kerbOf((kerb[k] * (1 - u) + kerb[k + 1] * u) * (1 - v) + (kerb[k + KERB_N] * (1 - u) + kerb[k + KERB_N + 1] * u) * v);
}

/** Thirty pitches in three rows of ten round `centre`, facing `heading`, and where the fire is. */
export function campAt(centre: Pt, heading: number): { pitches: Pitch[]; fire: Pt } {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  // Local x is across the rows, local z the way they face.
  const at = (lx: number, lz: number) => ({ x: centre.x + fz * lx + fx * lz, z: centre.z - fx * lx + fz * lz });
  const pitches: Pitch[] = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 10; i++) {
      const p = at(-54 + i * 12, -32 + row * 30);
      const bay = at(-54 + i * 12, -28 + row * 30);
      pitches.push({ index: pitches.length, ...p, rot: heading, parking: { ...bay, heading } });
    }
  }
  return { pitches, fire: at(70, 0) };
}

/** Where to put a spot named by its streets' corner, or by its longitude and latitude. */
const spotOf = (graph: StreetGraph, s: Spot): Pt | null => (typeof s[0] === "string" ? graph.corner(s[0], s[1] as string) : toGame(s[0] as number, s[1] as number));

/** Lombard's crooked block: how many hairpins, how far the lane swings either side, and the straight at each end, out of the cross streets. */
const CROOKED = { turns: 8, swing: 6.5, ends: 7 } as const;
/** How far from each corner, along it, the block's garden begins: past the kerb of Hyde Street, and of Leavenworth. */
export const CROOKED_KERB = STREET_WIDTH[2] / 2 + 0.5;
/** Whether a spot is in the crooked block's garden, its lane and beds, given the block (CityParts.crooked). */
export function inCrooked(c: { x: number; z: number; dx: number; dz: number; length: number }, x: number, z: number) {
  const along = (x - c.x) * c.dx + (z - c.z) * c.dz;
  return along > CROOKED_KERB && along < c.length - CROOKED_KERB && Math.abs((x - c.x) * c.dz - (z - c.z) * c.dx) < 11;
}

/**
 * Lombard's crooked block as it's driven, from Hyde down to Leavenworth in eight hairpin
 * turns, the lane swinging from one side of the block to the other. The survey has it
 * straight. Points from corner to corner, both included.
 */
function crookedLane(top: Pt, bottom: Pt): Pt[] {
  const L = Math.hypot(bottom.x - top.x, bottom.z - top.z);
  const ux = (bottom.x - top.x) / L;
  const uz = (bottom.z - top.z) / L;
  const at = (a: number, b: number) => ({ x: top.x + ux * a - uz * b, z: top.z + uz * a + ux * b });
  const step = (L - 2 * CROOKED.ends) / CROOKED.turns;
  const corners = [top];
  for (let i = 0; i < CROOKED.turns; i++) corners.push(at(CROOKED.ends + (i + 0.5) * step, i % 2 ? CROOKED.swing : -CROOKED.swing));
  corners.push(bottom);
  const pts: Pt[] = [top];
  for (let i = 1; i < corners.length - 1; i++) pts.push(...roundCorner(corners[i - 1], corners[i], corners[i + 1], 3.5));
  pts.push(bottom);
  return pts;
}

/** The streets, with Lombard's block from `top` to `bottom` laid as its crooked lane, an alley's width. */
function withCrookedLane(streets: Street[], top: Pt, bottom: Pt): Street[] {
  const is = (s: Street, i: number, p: Pt) => Math.abs(s.xs[i] - p.x) < 0.01 && Math.abs(s.zs[i] - p.z) < 0.01;
  const out: Street[] = [];
  for (const s of streets) {
    let a = -1;
    let b = -1;
    if (s.name === "Lombard St") {
      for (let i = 0; i < s.xs.length; i++) {
        if (is(s, i, top)) a = i;
        if (is(s, i, bottom)) b = i;
      }
    }
    if (a < 0 || b < 0) {
      out.push(s);
      continue;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (lo > 0) out.push({ ...s, xs: s.xs.slice(0, lo + 1), zs: s.zs.slice(0, lo + 1) });
    if (hi < s.xs.length - 1) out.push({ ...s, xs: s.xs.slice(hi), zs: s.zs.slice(hi) });
    const lane = crookedLane(top, bottom);
    out.push({ name: s.name, cls: 0, xs: Float32Array.from(lane, (p) => p.x), zs: Float32Array.from(lane, (p) => p.z) });
  }
  return out;
}

/**
 * Stretches the survey has as streets that aren't: stairways, and the way down the cliffs
 * of Telegraph Hill's old quarry, which no street takes. Each is a street, all of it or
 * from one spot along it to another. They aren't drawn or driven, but what stands along
 * them stands as it did, and nothing grows on them: they're still the ways people go.
 */
const NOT_STREETS: { street: string; from?: Spot; to?: Spot }[] = [
  // The Greenwich Steps, up from Sansome Street, across Montgomery, to Coit Tower.
  { street: "Greenwich St", from: ["Greenwich St", "Sansome St"], to: ["Greenwich St", "Telegraph Hill Blvd"] },
  // The Filbert Steps the same way up, from their foot, and the boardwalk and the lane off them.
  { street: "Filbert St", from: ["Filbert St", "Sansome St"], to: [-122.4034, 37.802114] },
  { street: "Filbert St", from: ["Filbert St", "Napier Ln"], to: ["Filbert St", "Telegraph Hill Blvd"] },
  { street: "Napier Ln" },
  { street: "Darrell Pl" },
  // Down the quarry's face: Union Street ends at Calhoun Terrace, Alta Street and Montgomery
  // Street at the top, and Lombard Street turns into Telegraph Hill Boulevard at Kearny and
  // starts again at Winthrop, at the foot.
  { street: "Union St", from: ["Union St", "Calhoun Ter"], to: ["Union St", "Sansome St"] },
  { street: "Alta St", from: ["Alta St", "Montgomery St"], to: [-122.40294, 37.80171] },
  { street: "Montgomery St", from: ["Montgomery St", "Greenwich St"], to: ["Montgomery St", "Lombard St"] },
  { street: "Lombard St", from: ["Lombard St", "Kearny St"], to: ["Lombard St", "Winthrop St"] },
  // The Oakhurst Lane stairway in Forest Knolls, the longest in the city.
  { street: "Oakhurst Ln" },
];

/**
 * The streets without what isn't a street (NOT_STREETS), each one cut where a stretch comes
 * out of it, its parts where it was in the list; and those stretches. Spots are found on `graph`.
 */
function takeOut(streets: Street[], graph: StreetGraph): { streets: Street[]; out: Street[] } {
  const kept = [...streets];
  const out: Street[] = [];
  /** The point of a street within a metre of a spot, or -1. */
  const pointAt = (s: Street, p: Pt) => {
    let best = -1;
    let far = 1;
    for (let i = 0; i < s.xs.length; i++) {
      const d = Math.hypot(s.xs[i] - p.x, s.zs[i] - p.z);
      if (d < far) [best, far] = [i, d];
    }
    return best;
  };
  for (const { street, from, to } of NOT_STREETS) {
    const a = from ? spotOf(graph, from) : null;
    const b = to ? spotOf(graph, to) : null;
    for (let n = kept.length - 1; n >= 0; n--) {
      const s = kept[n];
      if (s.name !== street) continue;
      if (!from || !to) {
        out.push(s);
        kept.splice(n, 1);
        continue;
      }
      const [i, j] = a && b ? [pointAt(s, a), pointAt(s, b)] : [-1, -1];
      if (i < 0 || j < 0 || i === j) continue;
      const [lo, hi] = i < j ? [i, j] : [j, i];
      out.push({ ...s, xs: s.xs.slice(lo, hi + 1), zs: s.zs.slice(lo, hi + 1) });
      const parts: Street[] = [];
      if (lo > 0) parts.push({ ...s, xs: s.xs.slice(0, lo + 1), zs: s.zs.slice(0, lo + 1) });
      if (hi < s.xs.length - 1) parts.push({ ...s, xs: s.xs.slice(hi), zs: s.zs.slice(hi) });
      kept.splice(n, 1, ...parts);
    }
  }
  return { streets: kept, out };
}

export function buildCity(seed = 20261015): CityWorld {
  const data = cityData();
  if (!data) throw new Error("The city's data isn't loaded yet (loadCityData).");
  const rand = makeRandom(seed);
  // Lombard's crooked block goes in first, so everything is laid round it.
  const surveyed = streetGraph(data.streets);
  const crookedTop = surveyed.corner("Lombard St", "Hyde St");
  const crookedFoot = surveyed.corner("Lombard St", "Leavenworth St");
  const allStreets = crookedTop && crookedFoot ? withCrookedLane(data.streets, crookedTop, crookedFoot) : data.streets;
  const crookedPts = crookedTop && crookedFoot ? crookedLane(crookedTop, crookedFoot) : [];
  // And what isn't a street comes out of what's drawn and driven (NOT_STREETS).
  const { streets: drawn, out: notStreets } = takeOut(allStreets, surveyed);
  const graph = streetGraph(drawn);
  const at = (s: Spot): Pt => {
    const p = spotOf(graph, s);
    if (!p) throw new Error(`No such place in the city: ${s.join(" & ")}`);
    return p;
  };

  // ——— The ground ———

  const heights = new Float32Array(ROW * ROW);
  const water = new Float32Array(ROW * ROW).fill(WORLD.water);
  for (let k = 0; k < heights.length; k++) {
    const code = data.water[k];
    // Land stands a little proud of the sea, wherever the survey has it.
    heights[k] = code === 1 || code === 2 ? data.elevation[k] / VSCALE : Math.max(0.6, data.elevation[k] / VSCALE);
  }
  // The seabed falls away from the shore: how many cells out each sea vertex is, from the nearest land.
  const out = new Int32Array(ROW * ROW).fill(-1);
  const queue: number[] = [];
  for (let k = 0; k < out.length; k++) {
    if (data.water[k] === 1) continue;
    out[k] = 0;
    queue.push(k);
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const i = k % ROW;
    for (const n of [k - 1, k + 1, k - ROW, k + ROW]) {
      if (n < 0 || n >= out.length || out[n] >= 0 || (n === k - 1 && i === 0) || (n === k + 1 && i === ROW - 1)) continue;
      out[n] = out[k] + 1;
      queue.push(n);
    }
  }
  for (let k = 0; k < heights.length; k++) if (data.water[k] === 1) heights[k] = -Math.min(24, 1.6 + out[k] * 1.4);
  // Lakes: each its own level, the survey's water surface, with a bed sloping down from its shore.
  const lake = new Int32Array(ROW * ROW).fill(-1);
  for (let k0 = 0; k0 < lake.length; k0++) {
    if (data.water[k0] !== 2 || lake[k0] >= 0) continue;
    const members = [k0];
    lake[k0] = k0;
    for (let q = 0; q < members.length; q++) {
      const k = members[q];
      const i = k % ROW;
      for (const n of [k - 1, k + 1, k - ROW, k + ROW]) {
        if (n < 0 || n >= lake.length || lake[n] >= 0 || data.water[n] !== 2 || (n === k - 1 && i === 0) || (n === k + 1 && i === ROW - 1)) continue;
        lake[n] = k0;
        members.push(n);
      }
    }
    const levels = members.map((k) => data.elevation[k]).sort((a, b) => a - b);
    const surface = levels[Math.floor(levels.length / 2)] / VSCALE;
    for (const k of members) {
      const i = k % ROW;
      const j = Math.floor(k / ROW);
      let shore = 0;
      for (let r = 1; r < 6 && !shore; r++) {
        for (const [di, dj] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const n = (j + dj) * ROW + i + di;
          if (n >= 0 && n < lake.length && lake[n] !== k0) shore = r;
        }
      }
      heights[k] = surface - 0.8 - (shore || 6) * 0.7;
    }
    // The water's surface over the lake, and a cell beyond, so the sheet meets the shore.
    for (const k of members) {
      const i = k % ROW;
      for (const n of [k, k - 1, k + 1, k - ROW, k + ROW, k - ROW - 1, k - ROW + 1, k + ROW - 1, k + ROW + 1]) {
        if (n >= 0 && n < water.length && Math.abs((n % ROW) - i) <= 1) water[n] = Math.max(water[n], surface);
      }
    }
  }

  // Parks and neighbourhoods, vertex by vertex.
  const parkPolys = PARKS.map((p) => ({ park: p, pts: p.edge.map((e) => spotOf(graph, e)).filter((q): q is Pt => q !== null) })).filter((p) => p.pts.length >= 3);
  /** Calls `vertex` for every grid vertex inside a polygon. */
  const eachVertexIn = (pts: Pt[], vertex: (k: number) => void) => {
    const i0 = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.x)) + HALF) / CELL));
    const i1 = Math.min(ROW - 1, Math.ceil((Math.max(...pts.map((p) => p.x)) + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.z)) + HALF) / CELL));
    const j1 = Math.min(ROW - 1, Math.ceil((Math.max(...pts.map((p) => p.z)) + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inside(pts, gridX(i), gridZ(j))) vertex(j * ROW + i);
  };
  const parks = new Uint8Array(ROW * ROW);
  for (const { park, pts } of parkPolys) {
    const code = PARK_CODES.indexOf(park.kind) + 1;
    eachVertexIn(pts, (k) => (parks[k] = code));
  }
  // Ocean Beach: the sand between the Great Highway and the sea, all down the west.
  for (let k = 0; k < parks.length; k++) {
    if (data.water[k] !== 0 || gridX(k % ROW) > -2380) continue;
    if (out[k] === 0 && data.elevation[k] < 14) {
      let near = Infinity;
      const i = k % ROW;
      const j = Math.floor(k / ROW);
      for (let r = 1; r <= 7 && near === Infinity; r++) {
        for (const [di, dj] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const n = (j + dj) * ROW + i + di;
          if (n >= 0 && n < parks.length && data.water[n] === 1) near = r;
        }
      }
      if (near <= 6) parks[k] = PARK_CODES.indexOf("sand") + 1;
    }
  }
  const parkAt = (x: number, z: number): ParkKind | null => {
    const code = parks[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];
    return code ? PARK_CODES[code - 1] : null;
  };
  const districts = new Uint8Array(ROW * ROW);
  for (const d of DISTRICTS) {
    const code = DISTRICT_CODES.indexOf(d.district);
    eachVertexIn(d.edge.map(([lon, lat]) => toGame(lon, lat)), (k) => (districts[k] = code));
  }
  const districtAt = (x: number, z: number) => DISTRICT_CODES[districts[Math.round((Math.max(-HALF, Math.min(HALF, z)) + HALF) / CELL) * ROW + Math.round((Math.max(-HALF, Math.min(HALF, x)) + HALF) / CELL)]];

  // ——— Streets ———

  // The campground's lanes are streets too, laid with the rest once the camp is placed (below).
  const streets = [...drawn];
  const lanes: Street[] = [];
  const decksGround = (x: number, z: number) => sampleGrid(heights, x, z);
  const decks = buildDecks(decksGround);
  const decksAt = deckIndex(decks);

  // ——— The campground on Rob Hill, the café, the garages, the station ———

  // Rob Hill: the Presidio's highest ground, where its only campground is. The camp looks
  // north, toward the bridge.
  const robGuess = toGame(LANDMARKS.robHill[0], LANDMARKS.robHill[1]);
  let rob = robGuess;
  for (let dz = -160; dz <= 160; dz += 8) {
    for (let dx = -160; dx <= 160; dx += 8) {
      const p = { x: robGuess.x + dx, z: robGuess.z + dz };
      if (sampleGrid(heights, p.x, p.z) > sampleGrid(heights, rob.x, rob.z)) rob = p;
    }
  }
  const campHeading = Math.PI;
  const camp = campAt(rob, campHeading);
  const campY = sampleGrid(heights, rob.x, rob.z);
  const campDist = new Float32Array(ROW * ROW).fill(FAR);
  const siteDist = new Float32Array(ROW * ROW).fill(FAR);
  for (const p of camp.pitches) level(heights, { x0: p.x, x1: p.x, z0: p.z, z1: p.z }, campY, 9, 26, campDist);
  level(heights, { x0: camp.fire.x, x1: camp.fire.x, z0: camp.fire.z, z1: camp.fire.z }, campY, 12, 20, campDist);
  // The lanes along each row, and one out to the nearest street.
  const lane = (pts: Pt[]): Street => ({ name: "", cls: 0, xs: Float32Array.from(pts.map((p) => p.x)), zs: Float32Array.from(pts.map((p) => p.z)) });
  for (let row = 0; row < 3; row++) {
    const a = camp.pitches[row * 10].parking;
    const b = camp.pitches[row * 10 + 9].parking;
    const fx = Math.sin(campHeading) * 6;
    const fz = Math.cos(campHeading) * 6;
    lanes.push(lane([{ x: a.x + fx - (b.x - a.x) * 0.08, z: a.z + fz - (b.z - a.z) * 0.08 }, { x: b.x + fx + (b.x - a.x) * 0.15, z: b.z + fz + (b.z - a.z) * 0.15 }]));
  }
  const gateNode = graph.nearestNode(camp.fire);
  lanes.push(lane([camp.fire, { x: graph.xs[gateNode], z: graph.zs[gateNode] }]));
  streets.push(...lanes);

  // The café, in Washington Square, North Beach: in the square's north-west corner, looking
  // out over the lawn to Saints Peter and Paul.
  const square = [at(["Powell St", "Union St"]), at(["Stockton St", "Union St"]), at(["Stockton St", "Filbert St"]), at(["Powell St", "Filbert St"])];
  const sq = { x: square.reduce((s, p) => s + p.x, 0) / 4, z: square.reduce((s, p) => s + p.z, 0) / 4 };
  const cafe = { x: sq.x - 4, z: sq.z - 6, rot: 0 };
  level(heights, { x0: cafe.x - 9, x1: cafe.x + 9, z0: cafe.z - 7, z1: cafe.z + 12 }, sampleGrid(heights, cafe.x, cafe.z), 0, 10, siteDist);

  // Three garages: a Victorian with its garage under the bay windows in the Mission, a pier
  // shed on the Embarcadero, and an old airfield hangar at Crissy Field.
  const facing = (from: Pt, to: Pt) => Math.atan2(to.x - from.x, to.z - from.z);
  const sideOf = (a: Pt, b: Pt, t: number, off: number) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    return { x: a.x + (b.x - a.x) * t + uz * off, z: a.z + (b.z - a.z) * t - ux * off };
  };
  const v20 = at(["Valencia St", "20th St"]);
  const v21 = at(["Valencia St", "21st St"]);
  const victorian = sideOf(v20, v21, 0.5, -(STREET_WIDTH[2] / 2 + 1.6 + 7));
  const e1 = at(["The Embarcadero", "Bay St"]);
  const e2 = at(["The Embarcadero", "Beach St"]);
  // On the bay side of the Embarcadero, out on the pier: whichever side the water is.
  const wetSide = (p: Pt) => data.water[Math.round((p.z + HALF) / CELL) * ROW + Math.round((p.x + HALF) / CELL)] === 1;
  const pierOff = STREET_WIDTH[3] / 2 + 1.6 + 16;
  const pierAt = wetSide(sideOf(e1, e2, 0.45, pierOff + 40)) ? sideOf(e1, e2, 0.45, pierOff) : sideOf(e1, e2, 0.45, -pierOff);
  const crissy = at(["Mason St", "Crissy Field Ave"]);
  const hangarAt = { x: crissy.x + 30, z: crissy.z - 22 };
  const sites: Site[] = [
    { ...victorian, rot: facing(victorian, { x: (v20.x + v21.x) / 2, z: (v20.z + v21.z) / 2 }), style: "victorian", y: sampleGrid(heights, victorian.x, victorian.z) },
    { ...pierAt, rot: facing(pierAt, { x: (e1.x + e2.x) / 2, z: (e1.z + e2.z) / 2 }), style: "pier", y: Math.max(1.2, sampleGrid(heights, pierAt.x, pierAt.z)) },
    { ...hangarAt, rot: facing(hangarAt, { x: crissy.x + 30, z: crissy.z + 10 }), style: "airfield", y: sampleGrid(heights, hangarAt.x, hangarAt.z) },
  ];
  for (const s of sites) level(heights, { x0: s.x, x1: s.x, z0: s.z, z1: s.z }, s.y, 12, 16, siteDist);

  // ——— The cable cars: the Powell–Hyde line ———

  // From the turntable at Powell and Market, up Powell, along Jackson, over Russian Hill on
  // Hyde to the turnaround at Beach Street. Its corners rounded, so a car takes them in a curve.
  const cableRoute = resample(graph.route([toGame(-122.4078, 37.7848), at(["Powell St", "Jackson St"]), at(["Hyde St", "Jackson St"]), at(["Hyde St", "Beach St"])]), 1);
  const ROUND = 6;
  const cable = cableLine(cableRoute.map((p, i) => {
    if (i < ROUND || i >= cableRoute.length - ROUND) return p;
    let [x, z] = [0, 0];
    for (let k = -ROUND; k <= ROUND; k++) [x, z] = [x + cableRoute[i + k].x, z + cableRoute[i + k].z];
    return { x: x / (2 * ROUND + 1), z: z / (2 * ROUND + 1) };
  }));

  // The street map as it's drawn and driven; and `ways`, with the stretches that aren't
  // streets back in it, which is what the houses, the trees and the landmarks are laid out
  // round, as they were before those came out.
  const kerb = kerbMap(streets);
  const ways = kerbMapOf(notStreets.map((s) => ({ xs: s.xs, zs: s.zs, half: STREET_WIDTH[s.cls] / 2 })), kerb.slice());
  const kerbHere = (x: number, z: number) => kerbAt(ways, x, z);

  // ——— The railway into Fourth and King ———

  const rail = layRail(graph, heights, at);
  // Up to the tunnel's mouth only: past it the rails are under the hill, which stays.
  const open = rail.line.s.findIndex((s) => s > rail.portal + 4);
  const openLine = { xs: rail.line.xs.slice(0, open), zs: rail.line.zs.slice(0, open) };
  const near = nearest(openLine, false, 60);
  const trackDist = near.dist;
  const last = openLine.xs.length - 1;
  for (let k = 0; k < heights.length; k++) {
    const d = trackDist[k];
    if (d >= FAR) continue;
    // Not past the tunnel's mouth: the hill over it stays whole.
    if (near.at[k] > last - 1e-4 && pastEnd(openLine, gridX(k % ROW), gridZ(Math.floor(k / ROW)))) {
      trackDist[k] = FAR;
      continue;
    }
    const i = Math.min(last - 1, Math.floor(near.at[k]));
    const bed = rail.line.ys[i] + (rail.line.ys[i + 1] - rail.line.ys[i]) * (near.at[k] - i) - BED.under;
    // A level bed for the rails; banks either side, and a walled cutting where they go in under the hill.
    heights[k] = besideBed(heights[k], bed, d);
  }
  const dug = heights.slice();
  clearBed(heights, rail.line, 0, rail.portal + 2);
  // On a grid ten metres square the floor's last metres reach in under a street that crosses
  // over the line by the mouth, and dig the middle out of it: Eighteenth Street's. A street
  // that stands as high over the rails as the hill over the tunnel goes over them: it keeps
  // its ground, and the tunnel goes in short of it.
  for (let k = 0; k < heights.length; k++) {
    if (dug[k] - heights[k] > TUNNEL_COVER && kerbAt(kerb, gridX(k % ROW), gridZ(Math.floor(k / ROW))) < 0) heights[k] = dug[k];
  }
  // The tunnel's face stands where the cutting's floor ends.
  rail.portal = mouthAt(rail.line, rail.portal - 40, (x, z) => sampleGrid(heights, x, z));

  // ——— Landmarks ———

  const landmarks: CityLandmark[] = [];
  const landmark = (kind: keyof typeof LANDMARKS, rot: number) => {
    const p = at(LANDMARKS[kind] as Spot);
    landmarks.push({ kind, ...p, y: sampleGrid(heights, p.x, p.z), rot });
    return landmarks[landmarks.length - 1];
  };
  const ladies = at(["Steiner St", "Hayes St"]);
  const grove = at(["Steiner St", "Grove St"]);
  for (const [kind, rot] of [
    ["coitTower", 0], ["transamerica", 0], ["salesforce", 0], ["bankOfAmerica", 0], ["ferryBuilding", 0], ["cityHall", 0],
    ["graceCathedral", 0], ["palaceOfFineArts", 0], ["sutroTower", 0], ["twinPeaks", 0], ["mountDavidson", 0], ["alcatraz", 0],
    ["ghirardelli", 0], ["pier39", 0], ["oraclePark", 0], ["chinatownGate", 0], ["castroTheatre", 0], ["missionDolores", 0],
    ["dutchWindmill", 0], ["murphyWindmill", 0], ["conservatory", 0], ["cliffHouse", 0], ["legionOfHonor", 0], ["fortPoint", 0],
  ] as const) landmark(kind, rot);
  // The Painted Ladies, between Hayes and Grove on the east side of Steiner, their row along
  // it and their fronts to it, facing west across it to Alamo Square.
  const row = sideOf(ladies, grove, 0.5, -(STREET_WIDTH[2] / 2 + 1.6 + 6.8));
  landmarks.push({ kind: "paintedLadies", ...row, y: sampleGrid(heights, row.x, row.z), rot: facing(ladies, grove) });
  // Each faces the way it does: the Ferry Building onto the Embarcadero, the Chinatown gate up
  // Grant, City Hall onto Civic Center's plaza, Grace Cathedral across Taylor Street, Mission
  // Dolores onto Dolores Street and Ghirardelli's sign to the bay; the towers square to their
  // streets; and Pier 39 out from the Embarcadero the way the survey has it, its front to the
  // street and the sea lions' floats off its west side.
  const turn = (kind: CityLandmark["kind"], rot: number) => {
    const l = landmarks.find((m) => m.kind === kind);
    if (l) l.rot = rot;
  };
  turn("ferryBuilding", facing(at(["The Embarcadero", "Broadway"]), at(["The Embarcadero", "Howard St"])));
  turn("chinatownGate", facing(at(["Grant Ave", "Bush St"]), at(["Grant Ave", "Pine St"])));
  turn("cityHall", facing(at(["Van Ness Ave", "McAllister St"]), at(["Polk St", "McAllister St"])));
  turn("graceCathedral", facing(at(["Jones St", "California St"]), at(["Taylor St", "California St"])));
  turn("missionDolores", facing(at(["Church St", "16th St"]), at(["Dolores St", "16th St"])));
  turn("ghirardelli", facing(at(["Larkin St", "N Point St"]), at(["Larkin St", "Beach St"])));
  turn("transamerica", facing(at(["Montgomery St", "Washington St"]), at(["Montgomery St", "Clay St"])));
  turn("bankOfAmerica", facing(at(["Kearny St", "California St"]), at(["Kearny St", "Pine St"])));
  turn("salesforce", facing(at(["1st St", "Mission St"]), at(["Fremont St", "Mission St"])));
  turn("pier39", PIER_RUNS);

  // The survey puts some of them over a street: the blocks are smaller than life, and the
  // streets aren't. Each stands back from them, at the nearest spot where all of its
  // footprint is clear of every kerb by the pavement and a little more, and of a bridge's
  // road unless the deck is high over it, with its middle on dry land. Pier 39 is the other
  // way about: it's looked for only north of where it was, out over the water from its
  // entrance on the Embarcadero.
  const deckOver = (x: number, z: number) => {
    const n = decksAt.nearest(x, z);
    return n && n.off < n.deck.half + 3 ? n.y - sampleGrid(heights, x, z) : Infinity;
  };
  for (const l of landmarks) {
    const f = LANDMARK_FOOTPRINT[l.kind];
    if (!f) continue;
    const pts = footprintPoints(l.rot, f);
    const fits = (x: number, z: number) =>
      (l.kind === "pier39" || sampleGrid(heights, x, z) > sampleGrid(water, x, z)) &&
      pts.every((p) => kerbHere(x + p.x, z + p.z) >= LANDMARK_BACK && deckOver(x + p.x, z + p.z) > UNDER_DECK);
    const by = fits(l.x, l.z) ? null : nearestOffset((dx, dz) => (l.kind !== "pier39" || dz <= 0) && fits(l.x + dx, l.z + dz));
    if (by) [l.x, l.z] = [l.x + by.x, l.z + by.z];
    // Its own ground; and the pier's deck over the water, and over the sand the survey has under it.
    l.y = l.kind === "pier39" ? Math.max(WORLD.water + 1.2, ...pts.map((p) => sampleGrid(heights, l.x + p.x, l.z + p.z) - 0.6)) : sampleGrid(heights, l.x, l.z);
  }

  /** How much room each landmark keeps clear of row houses: at least the whole of its footprint, and a little. */
  const LANDMARK_ROOM: Partial<Record<CityLandmark["kind"], number>> = {
    coitTower: 16, transamerica: 16, salesforce: 18, bankOfAmerica: 16, ferryBuilding: 44, cityHall: 34, graceCathedral: 16,
    palaceOfFineArts: 40, ghirardelli: 22, pier39: 40, oraclePark: 60, missionDolores: 12, cliffHouse: 14,
    legionOfHonor: 26, paintedLadies: 26, fortPoint: 20, dutchWindmill: 8, murphyWindmill: 8, conservatory: 18,
  };
  const roomOf = (l: CityLandmark) => {
    const f = LANDMARK_FOOTPRINT[l.kind];
    return Math.max(LANDMARK_ROOM[l.kind] ?? 0, f ? reachOf(f) + 4 : 0);
  };

  // ——— What may not be built on ———

  // A grid every 2 m, as fine as the buildings' walls: water, parks, the railway, the
  // bridges' footings, the camp, the café, the garages and the landmarks' own ground.
  const BN = 3000;
  const BS = (HALF * 2) / BN;
  const blockedGrid = new Uint8Array(BN * BN);
  const wet = new Uint8Array(ROW * ROW);
  for (let k = 0; k < wet.length; k++) wet[k] = heights[k] < water[k] + 0.3 || data.water[k] === 3 ? 1 : 0;
  for (let j = 0; j < BN; j++) {
    for (let i = 0; i < BN; i++) {
      const x = -HALF + (i + 0.5) * BS;
      const z = -HALF + (j + 0.5) * BS;
      const vi = Math.min(ROW - 2, Math.floor((x + HALF) / CELL));
      const vj = Math.min(ROW - 2, Math.floor((z + HALF) / CELL));
      const k = vj * ROW + vi;
      if (wet[k] || wet[k + 1] || wet[k + ROW] || wet[k + ROW + 1]) blockedGrid[j * BN + i] = 1;
    }
  }
  for (const { pts } of parkPolys) fillPolygon(pts, BN, BS, (i, j) => (blockedGrid[j * BN + i] = 1));
  const stamp = (x: number, z: number, r: number) => {
    for (let j = Math.max(0, Math.floor((z - r + HALF) / BS)); j <= Math.min(BN - 1, Math.ceil((z + r + HALF) / BS)); j++) {
      for (let i = Math.max(0, Math.floor((x - r + HALF) / BS)); i <= Math.min(BN - 1, Math.ceil((x + r + HALF) / BS)); i++) {
        if (Math.hypot(-HALF + (i + 0.5) * BS - x, -HALF + (j + 0.5) * BS - z) <= r) blockedGrid[j * BN + i] = 1;
      }
    }
  };
  for (let k = 0; k < rail.line.xs.length; k += 2) stamp(rail.line.xs[k], rail.line.zs[k], 9);
  // The yard between King and Townsend, Fourth to Seventh.
  fillPolygon([at(["King St", "4th St"]), at(["Townsend St", "4th St"]), at(["Townsend St", "7th St"]), at(["King St", "7th St"])], BN, BS, (i, j) => (blockedGrid[j * BN + i] = 1));
  for (const d of decks) for (let k = 0; k < d.xs.length; k += 2) stamp(d.xs[k], d.zs[k], d.half + 4);
  for (const p of camp.pitches) stamp(p.x, p.z, 14);
  stamp(camp.fire.x, camp.fire.z, 18);
  stamp(cafe.x, cafe.z, 16);
  for (const s of sites) stamp(s.x, s.z, 24);
  for (const l of landmarks) if (roomOf(l)) stamp(l.x, l.z, roomOf(l));
  // Lombard's crooked block, a garden all the way down.
  const lt = at(["Lombard St", "Hyde St"]);
  const lf = at(["Lombard St", "Leavenworth St"]);
  for (let t = 0; t <= 1; t += 0.05) stamp(lt.x + (lf.x - lt.x) * t, lt.z + (lf.z - lt.z) * t, 13);

  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const blocked = (x: number, z: number) => {
    const i = Math.floor((x + HALF) / BS);
    const j = Math.floor((z + HALF) / BS);
    return i < 0 || j < 0 || i >= BN || j >= BN || blockedGrid[j * BN + i] === 1;
  };

  // ——— Buildings ———

  // Along the stairways too: the houses that stand along the Filbert Steps do.
  const { buildings, walls } = layBuildings({
    streets: [...allStreets, ...lanes],
    frontAt: (cls) => STREET_WIDTH[cls as StreetClass] / 2 + sidewalkOf(cls as StreetClass),
    kerb: kerbHere,
    blocked,
    district: districtAt,
    height: ground,
    vscale: VSCALE,
    rand,
  });
  // The landmarks are solid too, in the same field, where they're drawn.
  for (const l of landmarks) {
    const f = LANDMARK_FOOTPRINT[l.kind];
    if (!f) continue;
    if ("r" in f) walls.addRound(l.x, l.z, f.r);
    else walls.addBox(l.x, l.z, l.rot, f[0] / 2, f[1] / 2);
  }

  // ——— Fields for the scatter, the grass and the map ———

  const roadDist = new Float32Array(ROW * ROW).fill(FAR);
  const forest = new Float32Array(ROW * ROW);
  for (let j = 0; j < ROW; j++) {
    for (let i = 0; i < ROW; i++) {
      const k = j * ROW + i;
      const d = kerbHere(gridX(i), gridZ(j));
      roadDist[k] = d >= 15.8 ? FAR : d;
      forest[k] = parks[k] === PARK_CODES.indexOf("wood") + 1 ? 1 : parks[k] === PARK_CODES.indexOf("lawn") + 1 ? 0.25 : 0;
    }
  }

  // ——— Trees, bushes and rocks ———

  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  const clearOf = (x: number, z: number, room: number) =>
    kerbHere(x, z) > room && sampleGrid(trackDist, x, z) > 10 && sampleGrid(campDist, x, z) > 4 && sampleGrid(siteDist, x, z) > 18 &&
    walls.distance(x, z) > room && !decksAt.roadAt(x, z) && (decksAt.nearest(x, z)?.off ?? Infinity) > 14;
  const trees: Tree[] = [];
  const STEP = 9;
  for (let z = -HALF + STEP; z < HALF - STEP; z += STEP) {
    for (let x = -HALF + STEP; x < HALF - STEP; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP;
      const tz = z + (rand() - 0.5) * STEP;
      const kind = parkAt(tx, tz);
      const chance = kind === "wood" ? 0.58 : kind === "lawn" ? 0.1 : kind === "plaza" ? 0.04 : 0;
      if (!chance || rand() > chance) continue;
      const y = ground(tx, tz);
      if (y < sampleGrid(water, tx, tz) + 0.8 || slope(tx, tz) > 0.75 || !clearOf(tx, tz, 3)) continue;
      // Monterey cypress and pine, and the eucalyptus planted all over the Presidio and Sutro's forest.
      const pick = rand();
      const tree: Tree["kind"] = pick < 0.4 ? "pine" : pick < 0.7 ? "cypress" : "eucalyptus";
      trees.push({ x: tx, y: y - 0.3, z: tz, scale: 0.85 + rand() * 0.55, rot: rand() * Math.PI * 2, kind: tree, tone: 0.18 + rand() * 0.82 });
    }
  }
  // Palms: down the middle of the Embarcadero and of Dolores Street.
  const palmsAlong = (pts: Pt[], every: number) => {
    for (const p of resample(pts, every)) {
      const y = ground(p.x, p.z);
      if (y < 0.5 || walls.distance(p.x, p.z) < 2) continue;
      trees.push({ x: p.x, y: y - 0.2, z: p.z, scale: 0.95 + rand() * 0.25, rot: rand() * Math.PI * 2, kind: "palm", tone: rand() });
    }
  };
  palmsAlong(graph.route([at(["The Embarcadero", "Beach St"]), at(["The Embarcadero", "Bay St"]), at(["The Embarcadero", "Broadway"]), at(["The Embarcadero", "Howard St"])]), 18);
  palmsAlong(graph.route([at(["Dolores St", "16th St"]), at(["Dolores St", "20th St"])]), 16);

  const bushes: Bush[] = [];
  for (let tries = 0; tries < 60000 && bushes.length < 7000; tries++) {
    const x = (rand() - 0.5) * 2 * CITY_LIMIT;
    const z = (rand() - 0.5) * 2 * CITY_LIMIT;
    const kind = parkAt(x, z);
    const chance = kind === "wild" ? 0.32 : kind === "wood" ? 0.12 : kind === "lawn" ? 0.03 : 0;
    if (!chance || rand() > chance) continue;
    const y = ground(x, z);
    if (y < sampleGrid(water, x, z) + 0.6 || slope(x, z) > 0.65 || !clearOf(x, z, 2)) continue;
    bushes.push({ x, y: y - 0.25, z, scale: 0.6 + rand() * 0.8, rot: rand() * Math.PI * 2, tone: rand() });
  }
  // Hydrangeas and roses in the beds between Lombard's hairpins, and box hedges along their edges.
  const flowers: Bush[] = [];
  const crookedLength = Math.hypot(lf.x - lt.x, lf.z - lt.z);
  const [cu, cv] = [{ x: (lf.x - lt.x) / crookedLength, z: (lf.z - lt.z) / crookedLength }, { x: -(lf.z - lt.z) / crookedLength, z: (lf.x - lt.x) / crookedLength }];
  /** How far a spot is from the crooked lane's middle. */
  const toLane = (x: number, z: number) => {
    let d = Infinity;
    for (let i = 1; i < crookedPts.length; i++) {
      const [a, b] = [crookedPts[i - 1], crookedPts[i]];
      const [dx, dz] = [b.x - a.x, b.z - a.z];
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      d = Math.min(d, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
    }
    return d;
  };
  const laneHalf = STREET_WIDTH[0] / 2;
  for (let a = CROOKED_KERB + 0.4; a < crookedLength - CROOKED_KERB - 0.4; a += 1.3) {
    for (let b = -CROOKED.swing - 3.5; b <= CROOKED.swing + 3.5; b += 1.3) {
      const x = lt.x + cu.x * (a + (rand() - 0.5) * 0.6) + cv.x * (b + (rand() - 0.5) * 0.6);
      const z = lt.z + cu.z * (a + (rand() - 0.5) * 0.6) + cv.z * (b + (rand() - 0.5) * 0.6);
      const off = toLane(x, z) - laneHalf;
      if (off < 0.5) continue;
      const bush = { x, y: ground(x, z) - 0.25, z, scale: 0.45 + rand() * 0.3, rot: rand() * Math.PI * 2, tone: rand() };
      (off < 1.3 ? bushes : flowers).push(bush);
    }
  }

  const rocks: Rock[] = [];
  for (let tries = 0; tries < 40000 && rocks.length < 900; tries++) {
    const x = (rand() - 0.5) * 2 * CITY_LIMIT;
    const z = (rand() - 0.5) * 2 * CITY_LIMIT;
    if (parkAt(x, z) !== "wild") continue;
    const y = ground(x, z);
    const s = slope(x, z);
    if (y < 0.5 || rand() > 0.04 + Math.min(0.8, s * 1.4) || !clearOf(x, z, 4)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 3.5;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // ——— Courses ———

  // Room for a truck to wait: on dry, gentle ground, off the bridges and clear of the buildings.
  const roomy = (x: number, z: number) =>
    walls.distance(x, z) > 3.4 && ground(x, z) > sampleGrid(water, x, z) + 0.3 && !decksAt.roadAt(x, z) && slope(x, z) < 0.3;
  // The camp's way out, where its lane meets the streets, and the pitches no course may run through.
  const campGate = { x: graph.xs[gateNode], z: graph.zs[gateNode] };
  const inCamp = (x: number, z: number) => sampleGrid(campDist, x, z) < 12;
  const missions = planCityCourses(graph, decks, at, campGate, roomy, inCamp);
  const courseDist = courseDistOf(missions, 20);
  // Nothing growing or lying where a truck is put down: in a tent's bay, or where a course
  // lines up its drivers, ten deep for friends. The scatter came first, so it gives way.
  const putDown = [
    ...camp.pitches.map((p) => p.parking),
    ...missions.flatMap((m) => (m.crew > 1 ? Array.from({ length: CONVOY_MAX }, (_, slot) => lineUp(m, slot)) : [lineUpAlone(m)])),
  ];
  const inTheWay = (x: number, z: number, r: number) => putDown.some((p) => Math.hypot(p.x - x, p.z - z) < r + 3.4);
  for (let i = trees.length - 1; i >= 0; i--) if (inTheWay(trees[i].x, trees[i].z, trunkRadius(trees[i]))) trees.splice(i, 1);
  for (let i = rocks.length - 1; i >= 0; i--) if (inTheWay(rocks[i].x, rocks[i].z, Math.max(rocks[i].sx, rocks[i].sz))) rocks.splice(i, 1);

  // ——— Streets a truck can climb ———

  // On a grid ten metres square the survey's ground has a few streets steeper along
  // themselves than any truck climbs: where one runs along the foot of a cliff, or off the
  // camp's level onto the bank round it. Under those the ground is eased until none is
  // steeper than STREET_GRADE, as little of it as will do, and the rails' bed, the water's
  // edge and the levelled camp, café and garages stay as they are. It's done last, so
  // nothing is laid out any differently for it: what stands where the ground moved moves with it.
  const uneased = heights.slice();
  const keep = (k: number) => heights[k] < water[k] + 0.5 || trackDist[k] < BED.half + 3 || campDist[k] < 13 || siteDist[k] < 15;
  const inCity = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) < CITY_LIMIT;
  const roads = streets.filter((s) => s.cls !== 4).map((s) => ({ xs: s.xs, zs: s.zs, half: STREET_WIDTH[s.cls] / 2 }));
  if (easeRoads(heights, roads, STREET_GRADE, keep, inCity)) {
    const lift = (x: number, z: number) => sampleGrid(heights, x, z) - sampleGrid(uneased, x, z);
    for (const s of [...trees, ...bushes, ...rocks, ...flowers, ...landmarks]) s.y += lift(s.x, s.z);
    // A building's base and top go by its lowest and highest corner (city-buildings.ts).
    for (const b of buildings) {
      const [ax, az, fx, fz] = [(Math.cos(b.rot) * b.w) / 2, (-Math.sin(b.rot) * b.w) / 2, (Math.sin(b.rot) * b.d) / 2, (Math.cos(b.rot) * b.d) / 2];
      const corners = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([p, q]) => [b.x + ax * p + fx * q, b.z + az * p + fz * q]);
      const [was, now] = [uneased, heights].map((h) => corners.map(([x, z]) => sampleGrid(h, x, z)));
      b.base += Math.min(...now) - Math.min(...was);
      b.top += Math.max(...now) - Math.max(...was);
    }
  }

  // ——— Who can get where ———

  const start = camp.pitches[0].parking;
  const zone = new Uint8Array(ROW * ROW);
  const within = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) < CITY_LIMIT;
  flood(heights, water, 1.3, zone, 1, start, within);
  flood(heights, water, 2.6, zone, 2, start, within);

  const solid = obstacleIndex();
  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z), boulder: true });
  // The train that always stands at the platform at Fourth and King, as the plane stands on its stand, is solid like it.
  const station = cityStation(rail.line, rail.portal);
  for (const o of trainObstacles(carsOn(station.line, station.head, station.facing))) solid.add(o);
  /** What's built under a bridge's deck, where the deck stands high, is below a truck up on it: Fort Point, under the Golden Gate. */
  const under = (x: number, z: number, wall: Obstacle[]) => {
    const road = wall.length ? decksAt.roadAt(x, z) : null;
    return road !== null && road - ground(x, z) > UNDER_DECK ? wall.map((o) => ({ ...o, top: road - HEADROOM })) : wall;
  };

  /** The ground, or a bridge's deck: whichever is under something whose underside is at `above`, or the higher without it. */
  const height = (x: number, z: number, above?: number) => {
    const g = ground(x, z);
    const road = decksAt.roadAt(x, z);
    if (road === null) return g;
    if (above === undefined) return Math.max(g, road);
    const reach = above + 3;
    if (road <= reach && g <= reach) return Math.max(g, road);
    if (road <= reach) return road;
    if (g <= reach) return g;
    return Math.min(g, road);
  };

  return {
    id: "city",
    heights, water, forest, trackDist, riverDist: new Float32Array(ROW * ROW).fill(FAR), roadDist, siteDist, campDist, zone,
    snow: new Float32Array(ROW * ROW), ice: new Float32Array(ROW * ROW),
    track: { xs: [], zs: [], ys: [], s: [], length: 0, bridges: [], crossings: [] }, rivers: [], roads: [], sites,
    trees, bushes, rocks, missions, landmarks: [], courseDist, airport: null, station, dock: null, pad: null,
    cafe, start, pitches: camp.pitches, camp: { ...rob, heading: campHeading },
    sea: true, mapSpan: CITY_LIMIT * 2.05, square: true,
    height, waterAt: (x, z) => sampleGrid(water, x, z),
    obstaclesNear: (x, z) => {
      const near = solid.near(x, z);
      const wall = under(x, z, walls.near(x, z));
      const rails = decksAt.railings(x, z);
      return wall.length || rails.length ? [...near, ...wall, ...rails] : near;
    },
    limit: CITY_LIMIT,
    // The streets and their pavements, the garages' aprons, and the bridges' decks. Given
    // the asker's underside, as `height` takes it, a deck is paved for a truck up on it: on
    // its road, or where it meets the ground, at its ends and in a tunnel's mouth, on the
    // ground that comes up within reach of its road. Not for one on the ground under it,
    // which is on whatever that is, or on the hill over its tunnel. Without, a deck is paved
    // wherever it is.
    pavedAt: (x, z, above) => {
      const road = decksAt.roadAt(x, z);
      if (road !== null && (above === undefined || Math.abs(height(x, z, above) - road) < 3)) return true;
      return kerbAt(kerb, x, z) < 1.6 || sampleGrid(siteDist, x, z) < 10;
    },
    slipAt: () => 0,
    addObstacles: (list: readonly Obstacle[]) => list.forEach(solid.add),
    setTide: () => {},
    city: {
      streets, graph, kerb, buildings, walls, decks, deckIndex: decksAt, parks, landmarks, rail, cable, fire: camp.fire,
      crooked: { x: lt.x, z: lt.z, dx: cu.x, dz: cu.z, length: crookedLength, lane: crookedPts }, flowers,
    },
  };
}

/** Points round the corner at `b`, on the way from `a` to `c`: a quadratic from `r` before it to `r` after, tangent to both. */
function roundCorner(a: Pt, b: Pt, c: Pt, r: number): Pt[] {
  const la = Math.hypot(b.x - a.x, b.z - a.z);
  const lc = Math.hypot(c.x - b.x, c.z - b.z);
  const ra = Math.min(r, la / 2);
  const rc = Math.min(r, lc / 2);
  const t1 = { x: b.x + ((a.x - b.x) / la) * ra, z: b.z + ((a.z - b.z) / la) * ra };
  const t2 = { x: b.x + ((c.x - b.x) / lc) * rc, z: b.z + ((c.z - b.z) / lc) * rc };
  const out: Pt[] = [];
  for (let k = 0; k <= 12; k++) {
    const u = k / 12;
    out.push({ x: (1 - u) ** 2 * t1.x + 2 * u * (1 - u) * b.x + u * u * t2.x, z: (1 - u) ** 2 * t1.z + 2 * u * (1 - u) * b.z + u * u * t2.z });
  }
  return out;
}

/**
 * Caltrain's line into the city, from the buffers at Fourth and King: down the yard to
 * Seventh, round onto the bay side of Seventh Street, over the level crossing at
 * Sixteenth, down the east side of Pennsylvania Avenue in a cutting, and in under Potrero
 * Hill where it first stands 7 m over the rails, by Eighteenth. It runs on in the dark for
 * the train to come out of.
 */
function layRail(graph: StreetGraph, heights: Float32Array, at: (s: Spot) => Pt): CityRail {
  const k4 = at(["King St", "4th St"]);
  const t4 = at(["Townsend St", "4th St"]);
  const k7 = at(["King St", "7th St"]);
  const t7 = at(["Townsend St", "7th St"]);
  const s16 = at(["7th St", "16th St"]);
  // The yard's middle line, Fourth to Seventh.
  const y4 = { x: (k4.x + t4.x) / 2, z: (k4.z + t4.z) / 2 };
  const y7 = { x: (k7.x + t7.x) / 2, z: (k7.z + t7.z) / 2 };
  const yard = { x: y7.x - y4.x, z: y7.z - y4.z };
  const yl = Math.hypot(yard.x, yard.z);
  const yu = { x: yard.x / yl, z: yard.z / yl };
  // Seventh Street's line, moved 12 m onto its bay side.
  const sev = { x: k7.x - s16.x, z: k7.z - s16.z };
  const sl = Math.hypot(sev.x, sev.z);
  const su = { x: sev.x / sl, z: sev.z / sl };
  const bay = { x: -su.z, z: su.x };
  const side = (bay.x > 0 ? 1 : -1) * 12;
  const p16 = { x: s16.x + bay.x * side, z: s16.z + bay.z * side };
  // Where the yard's line and the Seventh Street line meet.
  const denom = yu.x * su.z - yu.z * su.x;
  const tm = ((p16.x - y4.x) * su.z - (p16.z - y4.z) * su.x) / denom;
  const corner = { x: y4.x + yu.x * tm, z: y4.z + yu.z * tm };
  // The buffers stand 32 m into the yard from Fourth Street, the station building between them and the street.
  const buffers = { x: y4.x + yu.x * 32, z: y4.z + yu.z * 32 };
  // South of Sixteenth the line runs down the east side of Pennsylvania Avenue, in its cut
  // beside the freeway, and goes in under Potrero Hill where the hill rises over it.
  const pa = at(["Pennsylvania Ave", "17th St"]);
  const pb = at(["Pennsylvania Ave", "22nd St"]);
  const pl = Math.hypot(pb.x - pa.x, pb.z - pa.z);
  const pu = { x: (pb.x - pa.x) / pl, z: (pb.z - pa.z) / pl };
  const penn = (t: number) => ({ x: pa.x + pu.x * t + pu.z * 20, z: pa.z + pu.z * t - pu.x * 20 });
  const pts = resample([
    buffers,
    ...roundCorner(buffers, corner, p16, 40),
    ...roundCorner(corner, p16, penn(0), 30),
    ...roundCorner(p16, penn(0), penn(300), 40),
    penn(300),
  ], 2.5);
  const ground = (p: Pt) => sampleGrid(heights, p.x, p.z);
  // Rails half a metre above the ground, never steeper than 2 in 100.
  const raw = pts.map((p) => ground(p) + 0.4);
  const ys = raw.slice();
  for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1] + 0.05);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], Math.max(raw[i], ys[i + 1] - 0.05));
  const s = pts.map((_, i) => i * 2.5);
  // The level crossing at Sixteenth, and the tunnel's mouth: the first point past it with
  // the hill 7 m over the rails. Under the hill the rails run on level.
  let near16 = 0;
  pts.forEach((p, i) => Math.hypot(p.x - p16.x, p.z - p16.z) < Math.hypot(pts[near16].x - p16.x, pts[near16].z - p16.z) && (near16 = i));
  const after16 = s[near16];
  let mouth = pts.length - 1;
  for (let i = near16; i < pts.length; i++) {
    if (ground(pts[i]) - ys[i] > TUNNEL_COVER) {
      mouth = i;
      break;
    }
  }
  for (let i = mouth + 1; i < ys.length; i++) ys[i] = ys[mouth];
  const portal = s[mouth];
  return {
    line: { xs: pts.map((p) => p.x), zs: pts.map((p) => p.z), ys, s, length: s[s.length - 1], bridges: [], crossings: [after16] },
    portal,
  };
}

/**
 * The city's courses: four to drive alone and four for friends, all on its streets. Down
 * Lombard's crooked block; the hills of Russian Hill as the old film's car chase took
 * them; across the Golden Gate and back; up Twin Peaks. For friends: from the bay to the
 * beach the way the footrace goes; a race down the Great Highway beside Ocean Beach; a race
 * along the Embarcadero under the palms; and a convoy through the Presidio's woods.
 */
function planCityCourses(
  graph: StreetGraph, decks: Deck[], at: (s: Spot) => Pt, campGate: Pt, roomy: (x: number, z: number) => boolean, inCamp: (x: number, z: number) => boolean,
): Mission[] {
  const out: Mission[] = [];
  const flags = (pts: Pt[], every: number) => resample(pts, every).slice(1);
  /** The start arch stands a few metres short of the line's first point. */
  const startOf = (line: Pt[], pts: Pt[]) => {
    const first = line[0];
    const dir = Math.atan2(pts[0].x - first.x, pts[0].z - first.z);
    return { x: first.x - Math.sin(dir) * 4, z: first.z - Math.cos(dir) * 4, heading: dir };
  };
  /** The line, starting `d` metres along it. */
  const from = (line: Pt[], d: number): Pt[] => {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < seg) return [{ x: a.x + ((b.x - a.x) * d) / seg, z: a.z + ((b.z - a.z) * d) / seg }, ...line.slice(i)];
      d -= seg;
    }
    return line.slice(-2);
  };
  const course = (
    id: string, name: string, blurb: string, line: Pt[], every: number, width: number,
    pay: { reward: number; repeatReward: number }, crew = 1, race = false,
  ) => {
    if (line.length < 2) return;
    // Friends line up behind the arch, two abreast and up to five rows deep: it stands far
    // enough along the line for every one of them to wait on the street, not in a building.
    for (let d = 0, along = line; crew > 1 && d <= 120; d += 5, along = from(along, 5)) {
      const start = startOf(along, flags(along, every));
      if (!Array.from({ length: CONVOY_MAX }, (_, slot) => lineUp({ start }, slot)).every((p) => roomy(p.x, p.z))) continue;
      line = along;
      break;
    }
    const pts = flags(line, every);
    const start = startOf(line, pts);
    out.push({
      id, name, blurb, start, gates: gatesAlong(start, pts, width), cooldown: 600, ...courseLimits(courseLength(start, pts)), crew, race, ...pay,
    });
  };
  const via = (...stops: Spot[]) => graph.route(stops.map(at));

  // Lombard Street: down from Larkin to the top of the crooked block, round its eight
  // turns, and on down to Columbus.
  const crooked = via(["Lombard St", "Larkin St"], ["Lombard St", "Hyde St"], ["Lombard St", "Leavenworth St"], ["Lombard St", "Columbus Ave"]);
  course("lombard", "Lombard Street", "Down the crookedest street, round all eight turns, and on to Columbus.", crooked, 9, 9, { reward: 20, repeatReward: 7 });

  // The chase: over Russian Hill and down its far side, the streets the old film flew.
  const chase = via(["Larkin St", "Union St"], ["Larkin St", "Chestnut St"], ["Taylor St", "Chestnut St"], ["Taylor St", "Vallejo St"], ["Jones St", "Vallejo St"], ["Jones St", "Filbert St"], ["Hyde St", "Filbert St"], ["Hyde St", "Union St"]);
  course("hill-chase", "Hill Chase", "Over the crests of Russian Hill, fast enough to fly. The film's car chase did.", chase, 34, 12, { reward: 25, repeatReward: 8 });

  // The Golden Gate: from the old toll plaza across to Vista Point and back.
  const gg = decks.find((d) => d.name === "golden-gate");
  if (gg) {
    const there: Pt[] = [];
    for (let s = 6; s < gg.length - 6; s += 40) {
      const p = deckPoint(gg, s);
      there.push({ x: p.x + p.fz * 3.5, z: p.z - p.fx * 3.5 });
    }
    const back: Pt[] = [];
    for (let s = gg.length - 30; s > 6; s -= 40) {
      const p = deckPoint(gg, s);
      back.push({ x: p.x - p.fz * 3.5, z: p.z + p.fx * 3.5 });
    }
    course("golden-gate", "Golden Gate", "Across the bridge to Vista Point and back, the towers going by overhead.", [...there, ...back], 40, 9, { reward: 30, repeatReward: 10 });
  }

  // Twin Peaks: up from Market and round the figure eight to the top.
  const peaks = via(["Market St", "Clayton St"], ["Twin Peaks Blvd", "Clarendon Ave"], LANDMARKS.twinPeaks as Spot);
  course("twin-peaks", "Twin Peaks", "Up from Market Street, round the figure eight, to the whole city below.", peaks, 30, 11, { reward: 25, repeatReward: 8 });

  // For friends.
  const breakers = via(["Howard St", "Main St"], ["Howard St", "9th St"], ["Hayes St", "Divisadero St"], ["Fell St", "Divisadero St"], ["Fell St", "Stanyan St"], ["Kezar Dr", "Stanyan St"], ["Great Hwy", "Fulton St"]);
  course("bay-to-beach", "Bay to Beach", "For two to ten friends: from the bay to the breakers, the footrace's way, together.", breakers, 60, 13, { reward: 40, repeatReward: 12 }, 2, false);
  const highway = via(["Great Hwy", "Point Lobos Ave"], ["Great Hwy", "Sloat Blvd"]);
  course("great-highway", "Great Highway", "Two to ten friends, flat out beside Ocean Beach. Every finisher is paid the same.", highway, 50, 15, { reward: 25, repeatReward: 8 }, 2, true);
  const embarcadero = via(["The Embarcadero", "Beach St"], ["The Embarcadero", "Broadway"], ["The Embarcadero", "Howard St"], ["King St", "3rd St"]);
  course("embarcadero", "Embarcadero", "Two to ten friends, down the waterfront under the palms. Every finisher is paid the same.", embarcadero, 45, 15, { reward: 30, repeatReward: 10 }, 2, true);
  // From the camp's way out, never back through its pitches: the tents stand where Rob Hill's own lanes ran.
  const presidio = graph.route([campGate, at(["Lincoln Blvd", "Merchant Rd"]), at(["Mason St", "Crissy Field Ave"]), at(["Marina Blvd", "Lyon St"])], inCamp);
  course("presidio", "Presidio", "For two to ten friends: down through the Presidio's woods to Crissy Field and the Marina, together.", presidio, 50, 12, { reward: 30, repeatReward: 10 }, 2, false);
  return out;
}


export type { Deck };

import { Walls } from "./city-buildings";
import { campAt, kerbAt, kerbMapOf } from "./city";
import { resample, type Pt } from "./city-streets";
import { PIER, causewayTop, dockLine, layDock, type Dock } from "./dock";
import { ferryObstacles } from "./ferry";
import { PAD, heliObstacles, standAt, type Pad } from "./heli";
import { courseDistOf, courseLength, courseLimits, gatesAlong, type Mission } from "./missions";
import { fbm, makeNoise2D, makeRandom, smoothstep } from "./noise";
import { gradeRoad, lowNear, routeAcross, smoothPath, toPts } from "./roads";
import {
  CELL, FAR, HALF, ROW, SITE_BLEND, SITE_FLAT, SNORKEL_WADE, STOCK_WADE, WORLD,
  flood, gridX, gridZ, level, markNear, nearest, sampleGrid, type Path, type Site, type Track,
} from "./terrain";
import { obstacleIndex, trunkRadius, type Bush, type Obstacle, type Rock, type Tree, type World } from "./world";

/**
 * Las Vegas and the Grand Canyon (ADR 0023), the world the ferry from the island comes
 * to: a desert basin ringed by mountains, with the Strip down its middle and downtown at
 * its north end; Lake Mead to the north-east, with the marina the ferry comes in to and
 * the camp at an oasis by it; Red Rock's mesas to the west; and to the south-east the land
 * rising in long steps to a high plateau, with the Grand Canyon cut down through it to the
 * Colorado, which runs out into the lake. Not from a map: each place is where it makes one
 * world, in roughly the direction it lies from the others, and the Strip's resorts are
 * its own, after the famous ones but none of them by name.
 *
 * The same grid as the other worlds. Pure data, no three.js. North is −z.
 */
export const VEGAS = {
  /** The basin's floor, the lake's surface (and the river's: it's the lake's arm), and the plateau's top. */
  floor: 30,
  lake: 12,
  rim: 150,
  /** The river's half-width; how far its bed is under the surface in the middle. */
  river: 34,
  deep: 4,
} as const;

/**
 * The Colorado's line through the canyon, from the box canyon at its head, up in the
 * south-east mountains, to where it runs out into the lake.
 */
export const CANYON: readonly Pt[] = [
  { x: 2150, z: 1650 }, { x: 2000, z: 1640 }, { x: 1830, z: 1470 }, { x: 1860, z: 1160 }, { x: 1700, z: 860 },
  { x: 1780, z: 500 }, { x: 1620, z: 200 }, { x: 1660, z: -150 }, { x: 1540, z: -450 }, { x: 1580, z: -820 },
];
/**
 * A side canyon from the west rim down to the river, its floor falling the whole way: the
 * one way to the bottom on wheels, from the rim village at its head.
 */
export const SIDE_CANYON: readonly Pt[] = [
  { x: 1250, z: 560 }, { x: 1290, z: 800 }, { x: 1420, z: 1040 }, { x: 1610, z: 1180 }, { x: 1815, z: 1195 },
];
/** Lake Mead: round blobs, each a centre and a radius, whose union is the lake. */
const LAKE_BLOBS: readonly (Pt & { r: number })[] = [
  { x: 1120, z: -1380, r: 520 }, { x: 1580, z: -1150, r: 400 }, { x: 760, z: -1720, r: 330 },
  { x: 1500, z: -1650, r: 330 }, { x: 1920, z: -1560, r: 240 }, { x: 1580, z: -850, r: 220 },
];

/**
 * The canyon's walls, `m` metres from the river's middle: the river, its beaches, the
 * inner gorge, a broad bench, a sheer red cliff, then the slopes up to the rim, and on up
 * into whatever's higher.
 */
function canyonWall(m: number) {
  const r = VEGAS.river;
  return (
    VEGAS.lake - VEGAS.deep +
    3 * smoothstep(r - 12, r, m) + 3.5 * smoothstep(r, r + 18, m) + 40 * smoothstep(r + 18, r + 50, m) +
    49 * smoothstep(190, 222, m) + 59 * smoothstep(280, 400, m) + Math.max(0, m - 400) * 0.6
  );
}
/** How far from the river's middle its beaches are, on either bank. */
export const BEACH = VEGAS.river + 9;

/** The ground of the whole world, on the grid, before anything is built on it. */
export function makeVegas(seed: number) {
  const roll = makeNoise2D(seed);
  const ridge = makeNoise2D(seed + 1);
  const mesa = makeNoise2D(seed + 2);
  const shore = makeNoise2D(seed + 3);
  const butte = makeNoise2D(seed + 4);
  const crag = makeNoise2D(seed + 5);

  const canyon = smoothPath(CANYON, 20);
  const toCanyon = nearest(canyon, false, 560);
  const side = smoothPath(SIDE_CANYON, 15);
  const toSide = nearest(side, false, 160);

  /** How far inside the lake a point is, as a share of its blob's radius: above 0 is water. */
  const lakeness = (x: number, z: number) => {
    let best = -Infinity;
    for (const b of LAKE_BLOBS) best = Math.max(best, 1 - Math.hypot(x - b.x, z - b.z) / b.r);
    return best + 0.06 * shore(x / 260, z / 260);
  };
  /** Where the rise to the plateau is halfway up, across the basin from the Strip; and how much of a point is up it, 0 to 1. */
  const edge = (z: number) => 700 + 90 * Math.sin(z / 430);
  const plateau = (x: number, z: number) => smoothstep(edge(z) - 380, edge(z) + 380, x) * smoothstep(-800, -250, z);
  /** The rise goes up in long steps: low cliffs any truck can climb, and shelves between. */
  const steps = (t: number) => t - (0.45 * Math.sin(2 * Math.PI * 3 * t)) / (2 * Math.PI * 3);
  /** The mesas of Red Rock, along the west: 0 away from them, up to 1 in among them. */
  const redRock = (x: number, z: number) => smoothstep(-1250, -1700, x) * smoothstep(2300, 1900, Math.hypot(x, z));

  const heights = new Float32Array(ROW * ROW);
  for (let k = 0; k < heights.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const r = Math.hypot(x, z);
    // The basin: a gentle roll, falling a little toward the lake; and up onto the plateau.
    const basin = VEGAS.floor + 6 * fbm(roll, x / 700, z / 700, 3) - 6 * smoothstep(-400, 1400, x - z * 0.4);
    const up = steps(plateau(x, z));
    let h = basin + up * (VEGAS.rim + 3 * fbm(roll, x / 420 + 7, z / 420, 3) - basin);
    // Red Rock: stepped mesas of red sandstone.
    const west = redRock(x, z);
    if (west > 0) {
      const n = fbm(mesa, x / 300, z / 300, 2);
      h += west * (38 * smoothstep(0.02, 0.08, n) + 26 * smoothstep(0.3, 0.36, n) + 14 * smoothstep(0.52, 0.56, n));
    }
    // The mountains all round, highest in the west.
    const ring = smoothstep(2150, 2750, r + 140 * ridge(x / 500, z / 500));
    h += ring * (210 + 120 * smoothstep(0, -2000, x) + 90 * fbm(ridge, x / 260, z / 260, 4));
    // Lake Mead: its bed, and the shore rising out of it, with a few islands of red rock out in the east of it.
    const lake = lakeness(x, z);
    if (lake > -0.15) {
      const edgeY = VEGAS.lake - 0.5;
      h = lake > 0 ? Math.min(h, edgeY - 18 * smoothstep(0, 0.4, lake)) : Math.min(h, edgeY + (h - edgeY) * smoothstep(0, -0.15, lake));
      const crown = crag(x / 160, z / 160);
      if (x > 1500 && lake > 0.25 && crown > 0.76) h = Math.max(h, VEGAS.lake + 22 * smoothstep(0.76, 0.86, crown));
    }
    // The canyon, cut into whatever's there. It's a slot at its head, opening out downstream.
    const d = toCanyon.dist[k];
    if (d < FAR) {
      const along = toCanyon.at[k] / (canyon.xs.length - 1);
      const open = 0.1 + 0.9 * smoothstep(0, 0.2, along);
      const m = d <= VEGAS.river ? d : VEGAS.river + (d - VEGAS.river) / open;
      let cut = canyonWall(m);
      // Temples: flat-topped buttes standing off the bench, nearly as high as the rim.
      const b = butte(x / 190, z / 190);
      if (m > 130 && m < 360 && b > 0.5) cut = Math.max(cut, VEGAS.rim - 34 * (1 - smoothstep(0.5, 0.6, b)) - 10);
      h = Math.min(h, cut);
    }
    // The side canyon: its floor falling from the rim to the river beach, steep walls either side.
    const s = toSide.dist[k];
    if (s < FAR) {
      const along = toSide.at[k] / (side.xs.length - 1);
      const floor = VEGAS.rim - along * (VEGAS.rim - (VEGAS.lake + 1.2));
      h = Math.min(h, floor + Math.max(0, s - 14) * 1.3);
    }
    heights[k] = h;
  }
  return { heights, canyon, toCanyon, side, toSide, lakeness, plateau, edge, redRock };
}

export type VegasShape = ReturnType<typeof makeVegas>;

/** The Strip's line, north–south, and the cross streets along it. */
export const STRIP_X = -250;
export const KOVAL_X = 150;
export const CROSS = { tropicana: 430, harmon: 230, flamingo: -90, sands: -400, sahara: -1100, fremont: -1450 } as const;

/** A road: its middle line and half its paved width. */
export type Road = { name: string; xs: number[]; zs: number[]; half: number };

type RoadPlan = { name: string; half: number; pts: Pt[]; curve?: boolean; grade?: number; smooth?: number };
const ROADS: RoadPlan[] = [
  { name: "Interstate 15", half: 9, pts: [{ x: -650, z: 1250 }, { x: -650, z: -1950 }] },
  { name: "Tropicana Avenue", half: 7, pts: [{ x: -650, z: CROSS.tropicana }, { x: 420, z: CROSS.tropicana }] },
  { name: "Harmon Avenue", half: 7, pts: [{ x: STRIP_X, z: CROSS.harmon }, { x: 420, z: CROSS.harmon }] },
  { name: "Flamingo Road", half: 7, pts: [{ x: -650, z: CROSS.flamingo }, { x: 420, z: CROSS.flamingo }] },
  { name: "Spring Mountain Road", half: 7, pts: [{ x: -650, z: CROSS.sands }, { x: STRIP_X, z: CROSS.sands }] },
  { name: "Sands Avenue", half: 7, pts: [{ x: STRIP_X, z: CROSS.sands }, { x: 420, z: CROSS.sands }] },
  { name: "Sahara Avenue", half: 7, pts: [{ x: -650, z: CROSS.sahara }, { x: 300, z: CROSS.sahara }] },
  { name: "Koval Lane", half: 7, pts: [{ x: KOVAL_X, z: CROSS.tropicana }, { x: KOVAL_X, z: CROSS.sahara }] },
  { name: "Fremont Street", half: 6, pts: [{ x: -660, z: CROSS.fremont }, { x: STRIP_X, z: CROSS.fremont }] },
  {
    name: "Lake Mead Drive", half: 5, curve: true, grade: 0.14,
    pts: [{ x: STRIP_X, z: CROSS.fremont }, { x: 0, z: -1462 }, { x: 200, z: -1530 }, { x: 330, z: -1625 }, { x: 424, z: -1650 }],
  },
  {
    name: "Canyon Road", half: 5, grade: 0.21, smooth: 400, curve: true,
    pts: [{ x: 420, z: CROSS.tropicana }, { x: 700, z: 438 }, { x: 1000, z: 432 }, { x: 1215, z: 440 }],
  },
  // Last, so it's laid over every street that crosses it.
  { name: "Las Vegas Boulevard", half: 11, pts: [{ x: STRIP_X, z: 1100 }, { x: STRIP_X, z: CROSS.fremont }] },
];

/** Something on the Strip or downtown that the renderer builds, after the famous resorts; boxes are half-sizes along x and z. */
export type ResortKind =
  | "pyramid" | "castle" | "skyline" | "glass" | "fountains" | "palace" | "volcano" | "bigtop"
  | "lion" | "slab" | "eiffel" | "wheel" | "venice" | "bronze" | "sphere" | "strat" | "downtown";
export type Resort = { kind: ResortKind; x: number; z: number; hw: number; hd: number; y: number; tone: number };

const RESORTS: Omit<Resort, "y" | "tone">[] = [
  // West of the Strip, south to north.
  { kind: "pyramid", x: -350, z: 690, hw: 62, hd: 62 },
  { kind: "castle", x: -332, z: 530, hw: 50, hd: 52 },
  { kind: "skyline", x: -322, z: 345, hw: 44, hd: 55 },
  { kind: "glass", x: -335, z: 200, hw: 55, hd: 45 },
  { kind: "fountains", x: -455, z: 40, hw: 45, hd: 85 },
  { kind: "palace", x: -345, z: -215, hw: 65, hd: 72 },
  { kind: "volcano", x: -335, z: -345, hw: 55, hd: 38 },
  { kind: "bigtop", x: -340, z: -760, hw: 60, hd: 60 },
  // East of it.
  { kind: "lion", x: -125, z: 520, hw: 95, hd: 75 },
  { kind: "slab", x: -150, z: 330, hw: 70, hd: 66 },
  { kind: "eiffel", x: -100, z: 110, hw: 55, hd: 60 },
  { kind: "wheel", x: 80, z: -110, hw: 10, hd: 46 },
  { kind: "venice", x: -130, z: -292, hw: 85, hd: 82 },
  { kind: "sphere", x: 40, z: -485, hw: 38, hd: 38 },
  { kind: "bronze", x: -125, z: -620, hw: 90, hd: 85 },
  { kind: "strat", x: -150, z: -1010, hw: 55, hd: 40 },
  // Downtown, along Fremont Street either side.
  ...[-600, -530, -460, -390, -320].flatMap((x) => [
    { kind: "downtown" as const, x, z: CROSS.fremont - 40, hw: 30, hd: 30 },
    { kind: "downtown" as const, x, z: CROSS.fremont + 40, hw: 30, hd: 30 },
  ]),
];
/** The lake in front of the fountains, between the hotel and the Strip: its edges, how far its water is under the pavement, and how deep. */
const POOL = { x0: -398, x1: -282, z0: -36, z1: 116, below: 0.6, depth: 2.2 } as const;
/** Fremont Street's canopy: along the street over these x, this high, and half as wide. */
export const CANOPY = { x0: -625, x1: -425, height: 26, half: 11 } as const;
/** The Eiffel tower: its middle this far along x from the hotel's, half the spread of its legs, and its height. */
export const EIFFEL = { dx: -88, spread: 13, height: 84 } as const;
/** The wheel: its radius, its axle's height, and how far its feet stand either side of its plane. */
export const WHEEL = { radius: 44, axle: 52, feet: 26 } as const;
/** The tower at the north end of the Strip: this far back from its casino's front, which it rises out of; this tall; its shaft this thick. */
export const STRAT = { inset: 16, height: 190, shaft: 9 } as const;

/** The F1 circuit's line, the Grand Prix's: up Koval, along Sands, down the Strip, along Harmon. Its corners are rounded. */
function circuitLine(): Pt[] {
  const corners: Pt[] = [
    { x: KOVAL_X, z: CROSS.harmon }, { x: KOVAL_X, z: CROSS.sands }, { x: STRIP_X + 5, z: CROSS.sands }, { x: STRIP_X + 5, z: CROSS.harmon },
  ];
  const out: Pt[] = [];
  // Tight enough that the middle of each corner stays on the tarmac, inside the kerb's corner.
  const R = 18;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[(i + corners.length - 1) % corners.length];
    const b = corners[i];
    const c = corners[(i + 1) % corners.length];
    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const bc = Math.hypot(c.x - b.x, c.z - b.z);
    const p = { x: b.x - ((b.x - a.x) / ab) * R, z: b.z - ((b.z - a.z) / ab) * R };
    const q = { x: b.x + ((c.x - b.x) / bc) * R, z: b.z + ((c.z - b.z) / bc) * R };
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      out.push({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * b.x + t * t * q.x, z: (1 - t) * (1 - t) * p.z + 2 * (1 - t) * t * b.z + t * t * q.z });
    }
  }
  return out;
}
/** The Grand Prix's start and finish, on Koval facing north. */
export const GRID = { x: KOVAL_X, z: 60 } as const;

/** What the ground is, at each grid vertex, for the renderer to colour: the codes' order is `GROUNDS`. */
export const GROUNDS = ["desert", "redrock", "canyon", "shore", "rim", "town"] as const;
export type GroundKind = (typeof GROUNDS)[number];

export type VegasParts = {
  /** At each grid vertex, an index into GROUNDS. */
  ground: Uint8Array;
  roads: Road[];
  /** Distance to the nearest kerb, as bytes (`kerbOf` in city.ts), KERB_N square, north row first. */
  kerb: Uint8Array;
  walls: Walls;
  resorts: Resort[];
  /** The lake before the fountains: its rectangle and its water's height. */
  pool: { x0: number; x1: number; z0: number; z1: number; y: number };
  /** The Grand Prix's line, closed. */
  circuit: Pt[];
  /** The Welcome sign in the Strip's median, at its south end. */
  sign: { x: number; z: number; y: number };
  /** The canopy over Fremont Street, at the street's height. */
  canopy: { x0: number; x1: number; z: number; y: number };
  /** The camp's fire; the oasis's palms are round the camp. */
  fire: Pt;
  /** The Colorado's line, from the box canyon to the lake; and the lookout on the rim. */
  canyon: Path;
  lookout: { x: number; z: number; y: number; heading: number };
};
export type VegasWorld = World & { vegas: VegasParts };

const NO_TRACK: Track = { xs: [], zs: [], ys: [], s: [], length: 0, bridges: [], crossings: [] };

/** Las Vegas. Deterministic, like the others. */
export function buildVegas(seed = 20261023): VegasWorld {
  const rand = makeRandom(seed + 20);
  const shape = makeVegas(seed);
  const { heights } = shape;
  const far = () => new Float32Array(ROW * ROW).fill(FAR);
  const water = new Float32Array(ROW * ROW).fill(VEGAS.lake);
  const [roadDist, siteDist, campDist] = [far(), far(), far()];
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const field = (f: Float32Array, x: number, z: number) => sampleGrid(f, x, z);

  // The resorts' lots, level, each at the ground under its front; then the roads over them.
  const resorts: Resort[] = RESORTS.map((r) => {
    const front = { x: r.x < STRIP_X ? r.x + r.hw : r.x - r.hw, z: r.z };
    const y = r.kind === "downtown" ? ground(r.x, CROSS.fremont) : r.kind === "wheel" || r.kind === "sphere" ? ground(r.x, r.z) : ground(front.x, front.z);
    return { ...r, y, tone: rand() };
  });
  for (const r of resorts) level(heights, { x0: r.x - r.hw - 6, x1: r.x + r.hw + 6, z0: r.z - r.hd - 6, z1: r.z + r.hd + 6 }, r.y, 0, 24, siteDist);
  // The marina: the bluff over the lake cut back into a slipway, down to just over the
  // water where the causeway leaves the shore, for Lake Mead Drive to come down to it.
  const root = { x: 424, z: -1650 };
  const dockY = VEGAS.lake + PIER.rise;
  level(heights, { x0: root.x - 30, x1: root.x + 4, z0: root.z - 22, z1: root.z + 22 }, dockY, 0, 110);
  const roads: Road[] = [];
  for (const plan of ROADS) {
    const pts = plan.curve ? toPts(smoothPath(plan.pts, 10)) : plan.pts;
    const dist = gradeRoad(heights, pts, plan.half, plan.grade ?? 0.08, plan.smooth ?? 60);
    for (let k = 0; k < dist.length; k++) roadDist[k] = Math.min(roadDist[k], Math.max(0, dist[k] - plan.half));
    roads.push({ name: plan.name, xs: pts.map((p) => p.x), zs: pts.map((p) => p.z), half: plan.half });
  }
  const kerb = kerbMapOf(roads);
  const kerbFrom = (x: number, z: number) => kerbAt(kerb, x, z);

  // The lake before the fountains, its water a little below the pavement.
  const poolY = ground((POOL.x0 + POOL.x1) / 2, POOL.z1) - POOL.below;
  for (let k = 0; k < heights.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const out = Math.max(POOL.x0 - x, x - POOL.x1, POOL.z0 - z, z - POOL.z1);
    if (out > CELL) continue;
    // Its stone edge is the row of grid points just outside; inside, a flat bed under the water.
    if (out > 0) heights[k] = Math.max(heights[k], poolY + 0.5);
    else {
      heights[k] = poolY - POOL.depth;
      water[k] = poolY;
    }
  }

  // The causeway, out into the lake from the foot of the slipway.
  const dock: Dock = { ...root, heading: Math.PI / 2, root: dockY, y: dockY, water: VEGAS.lake };
  layDock(heights, dock, siteDist);

  // The camp: three rows of ten facing the lake, a short way up from the marina, the fire
  // between them and the water; palms round it, an oasis on the shore.
  const campCentre = { x: 310, z: -1760 };
  const campHeading = Math.PI / 2;
  const camp = campAt(campCentre, campHeading);
  const campY = ground(campCentre.x, campCentre.z);
  level(heights, { x0: campCentre.x - 40, x1: campCentre.x + 36, z0: campCentre.z - 62, z1: campCentre.z + 62 }, campY, 0, 30, campDist);
  for (let k = 0; k < campDist.length; k++) campDist[k] = Math.max(0, campDist[k] - 4);
  const fire = { x: campCentre.x + 52, z: campCentre.z };
  level(heights, { x0: fire.x, x1: fire.x, z0: fire.z, z1: fire.z }, campY, 9, 12, campDist);

  // The diner: on Lake Mead Drive, on the way out to the marina, its door to the road.
  const cafe = { x: 205, z: -1490, rot: Math.PI * 0.82 };
  level(heights, { x0: cafe.x, x1: cafe.x, z0: cafe.z, z1: cafe.z }, ground(cafe.x, cafe.z), SITE_FLAT, SITE_BLEND, siteDist);

  // Three garages: a speed shop at the south end of the Strip, the pit garage by the Grand
  // Prix's grid on Koval, and a trading post up on the canyon's rim.
  const site = (style: Site["style"], x: number, z: number, rot: number): Site => ({ x, z, rot, style, y: ground(x, z) });
  const sites: Site[] = [
    site("speedshop", -318, 880, Math.PI / 2),
    site("pitgarage", KOVAL_X + 64, GRID.z - 10, -Math.PI / 2),
    site("tradingpost", 1200, 505, -Math.PI / 2),
  ];
  for (const s of sites) level(heights, { x0: s.x, x1: s.x, z0: s.z, z1: s.z }, s.y, SITE_FLAT, SITE_BLEND, siteDist);
  // The lookout, out on the rim past the trading post: a level shelf to stand a truck on and look down.
  const lookout = { x: 1318, z: 430, y: 0, heading: Math.PI / 2 };
  lookout.y = ground(lookout.x - 30, lookout.z);
  level(heights, { x0: lookout.x - 40, x1: lookout.x, z0: lookout.z - 14, z1: lookout.z + 14 }, lookout.y, 0, 14, siteDist);
  // The helipad (ADR 0024), on the rim south of the lookout: the helicopter to Japan leaves
  // from it out over the canyon.
  const pad: Pad = { x: 1235, z: 320, y: ground(1235, 320), heading: Math.PI / 2 };
  level(heights, { x0: pad.x, x1: pad.x, z0: pad.z, z1: pad.z }, pad.y, PAD.flat, 26, siteDist);
  // Nothing grows on the pad's paving, between it and the helicopter's stand, nor under the rotor.
  markNear(siteDist, pad, standAt(pad), 30, 5);

  // The walls of everything built: the resorts' blocks, as boxes.
  const walls = new Walls();
  const solid = obstacleIndex();
  for (const r of resorts) {
    if (r.kind === "sphere") solid.add({ x: r.x, z: r.z, r: r.hw, h: Infinity });
    else if (r.kind === "wheel") {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.add({ x: r.x + sx * 6, z: r.z + sz * WHEEL.feet, r: 1.6, h: Infinity });
    } else {
      walls.addBox(r.x, r.z, 0, r.hw, r.hd);
      if (r.kind === "eiffel") {
        const tx = r.x + EIFFEL.dx;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.add({ x: tx + sx * EIFFEL.spread, z: r.z + sz * EIFFEL.spread, r: 2.4, h: Infinity });
      }
    }
  }
  // Fremont's canopy stands on columns along both pavements.
  for (let x = CANOPY.x0; x <= CANOPY.x1 + 0.1; x += 25) for (const side of [-1, 1]) solid.add({ x, z: CROSS.fremont + side * CANOPY.half, r: 0.7, h: Infinity });
  // The Welcome sign, on its island in the middle of the Strip.
  const sign = { x: STRIP_X, z: 1010, y: ground(STRIP_X, 1010) };
  solid.add({ x: sign.x, z: sign.z, r: 3.2, h: Infinity });
  const wallFrom = (x: number, z: number) => walls.distance(x, z);

  // The courses.
  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  const circuit = circuitLine();
  const missions = planVegasCourses({ heights, water, circuit, shape, wallFrom });
  const courseDist = courseDistOf(missions, 20, true);

  // The causeway is kept clear too.
  const dockNear = nearest(dockLine(dock), false, 40).dist;

  /** Clear of what's built, the roads, the courses and the camp, by at least these distances. The walls' field reaches 12 m. */
  const clear = (x: number, z: number, road: number, built: number) =>
    field(roadDist, x, z) > road && field(siteDist, x, z) > built && field(campDist, x, z) > built &&
    field(courseDist, x, z) > 7 && field(dockNear, x, z) > 20 && wallFrom(x, z) > Math.min(built, 12) &&
    Math.max(Math.abs(x - (CANOPY.x0 + CANOPY.x1) / 2) - 140, Math.abs(z - CROSS.fremont) - 70) > 0;
  /** Within the town: near enough the Strip, or any road, that it's lots and verges, not desert. */
  const townDist = nearest({ xs: [STRIP_X, STRIP_X], zs: [1100, CROSS.fremont] }, false, 900).dist;
  const inTown = (x: number, z: number) => (field(townDist, x, z) < 560 && z > -1700 && z < 1050) || field(roadDist, x, z) < 25;

  const trees: Tree[] = [];
  // Palms down both sides of the Strip, bar the crossings.
  for (let z = 1080; z > CROSS.fremont + 30; z -= 26) {
    if (Object.values(CROSS).some((c) => Math.abs(z - c) < 24) || Math.abs(z - sign.z) < 30) continue;
    for (const side of [-1, 1]) {
      const x = STRIP_X + side * 13.6;
      if (wallFrom(x, z) < 3 || field(courseDist, x, z) < 3) continue;
      trees.push({ x, y: ground(x, z) - 0.2, z, scale: 1 + rand() * 0.3, rot: rand() * Math.PI * 2, kind: "palm", tone: rand() });
    }
  }
  // The oasis: palms round the camp and down to the water.
  for (let tries = 0, n = 0; tries < 900 && n < 70; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 60;
    const x = campCentre.x + Math.cos(a) * r * 1.2;
    const z = campCentre.z + Math.sin(a) * r;
    const y = ground(x, z);
    if (y < VEGAS.lake + 1 || slope(x, z) > 0.5 || !clear(x, z, 6, 10)) continue;
    trees.push({ x, y: y - 0.2, z, scale: 0.85 + rand() * 0.5, rot: rand() * Math.PI * 2, kind: "palm", tone: rand() });
    n++;
  }
  // Joshua trees scattered over the desert, thicker to the south; pines along the canyon's rim.
  const stand = makeNoise2D(seed + 11);
  const canyonAt = (x: number, z: number) => shape.toCanyon.dist[Math.round((z + HALF) / CELL) * ROW + Math.round((x + HALF) / CELL)];
  for (let z = -2800; z < 2800; z += 12) {
    for (let x = -2800; x < 2800; x += 12) {
      const tx = x + (rand() - 0.5) * 12;
      const tz = z + (rand() - 0.5) * 12;
      const y = ground(tx, tz);
      if (y < VEGAS.lake + 2 || Math.hypot(tx, tz) > WORLD.limit - 40 || slope(tx, tz) > 0.45 || inTown(tx, tz)) continue;
      const up = shape.plateau(tx, tz);
      const rim = up > 0.95 && y > VEGAS.rim - 12;
      const chance = rim
        ? 0.05 + 0.12 * smoothstep(0.1, 0.6, stand(tx / 200, tz / 200))
        : up < 0.3 && y < 90 ? 0.012 + 0.03 * smoothstep(0, 0.6, stand(tx / 300, tz / 300)) * smoothstep(-400, 900, tz) : 0;
      if (rand() > chance || !clear(tx, tz, 8, 18)) continue;
      // Not right on the canyon's edge.
      if (rim && canyonAt(tx, tz) < 390) continue;
      const kind = rim ? "pine" : "joshua";
      // The rim's pines are pinyon, dark all year: a tone under the valley's larches' share (scenery.ts).
      const tone = rim ? 0.2 + rand() * 0.8 : rand();
      trees.push({ x: tx, y: y - 0.2, z: tz, scale: (rim ? 0.55 : 0.8) + rand() * 0.5, rot: rand() * Math.PI * 2, kind, tone });
    }
  }

  // Boulders: fallen from the canyon's cliffs, on the rise's shelves and among Red Rock's
  // mesas, and a few out on the flat.
  const rocks: Rock[] = [];
  const reach = WORLD.limit - 60;
  for (let tries = 0; tries < 90000 && rocks.length < 3200; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    if (Math.hypot(x, z) > reach) continue;
    const y = ground(x, z);
    if (y < VEGAS.lake + 0.8 || inTown(x, z)) continue;
    const s = slope(x, z);
    const chance = canyonAt(x, z) < 380 ? 0.08 + Math.min(0.5, s) : shape.redRock(x, z) > 0.3 ? 0.06 + Math.min(0.5, s) : 0.006 + Math.min(0.2, s * 0.4);
    if (rand() > chance || !clear(x, z, 10, 18)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 4;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // Creosote and sage everywhere the desert is, and only a few on the town's verges.
  const bushes: Bush[] = [];
  for (let tries = 0; tries < 120000 && bushes.length < 11000; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    const y = ground(x, z);
    if (y < VEGAS.lake + 1 || slope(x, z) > 0.55 || (inTown(x, z) && rand() > 0.15)) continue;
    if (!clear(x, z, 5, 12)) continue;
    bushes.push({ x, y: y - 0.2, z, scale: 0.4 + rand() * 0.7, rot: rand() * Math.PI * 2, tone: rand() });
  }

  // What the ground is, for its colours: the canyon's walls and floor, the lake's shore,
  // Red Rock's sandstone, the plateau and the rise to it, the town's lots, or desert.
  const kinds = new Uint8Array(ROW * ROW);
  const code = (g: GroundKind) => GROUNDS.indexOf(g);
  for (let k = 0; k < kinds.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const y = heights[k];
    kinds[k] =
      shape.toCanyon.dist[k] < 400 && y < VEGAS.rim + 4 ? code("canyon")
      : shape.lakeness(x, z) > -0.2 && y < VEGAS.lake + 9 ? code("shore")
      : shape.redRock(x, z) > 0.25 && y > VEGAS.floor + 4 ? code("redrock")
      : shape.plateau(x, z) > 0.2 ? code("rim")
      : inTown(x, z) ? code("town")
      : code("desert");
  }

  // What a truck can reach, wading and with a snorkel.
  const start = camp.pitches[0].parking;
  const zone = new Uint8Array(ROW * ROW);
  flood(heights, water, STOCK_WADE, zone, 1, start);
  flood(heights, water, SNORKEL_WADE, zone, 2, start);

  for (const t of trees) solid.add({ x: t.x, z: t.z, r: trunkRadius(t), h: Infinity });
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z), boulder: true });
  for (const o of ferryObstacles(dock, VEGAS.lake)) solid.add(o);
  for (const o of heliObstacles(pad)) solid.add(o);

  return {
    id: "vegas",
    heights, water, forest: new Float32Array(ROW * ROW), trackDist: far(), riverDist: far(), roadDist, siteDist, campDist, zone,
    snow: new Float32Array(ROW * ROW), ice: new Float32Array(ROW * ROW),
    track: NO_TRACK, rivers: [], roads: [], sites,
    trees, bushes, rocks, missions, landmarks: [], courseDist, airport: null, station: null, dock, pad,
    cafe, start, pitches: camp.pitches, camp: { ...campCentre, heading: campHeading },
    sea: false, mapSpan: WORLD.limit * 2.1,
    height: (x, z) => Math.max(ground(x, z), causewayTop(dock, x, z)), waterAt: (x, z) => sampleGrid(water, x, z),
    obstaclesNear: (x, z) => {
      const near = solid.near(x, z);
      const wall = walls.near(x, z);
      return wall.length ? [...near, ...wall] : near;
    },
    limit: WORLD.limit,
    pavedAt: (x, z) => kerbFrom(x, z) < 1.6 || field(siteDist, x, z) < 10,
    slipAt: () => 0,
    addObstacles: (list: readonly Obstacle[]) => list.forEach(solid.add),
    setTide: () => {},
    vegas: {
      ground: kinds, roads, kerb, walls, resorts, pool: { x0: POOL.x0, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1, y: poolY },
      circuit, sign, canopy: { x0: CANOPY.x0, x1: CANOPY.x1, z: CROSS.fremont, y: ground((CANOPY.x0 + CANOPY.x1) / 2, CROSS.fremont) },
      fire, canyon: shape.canyon, lookout,
    },
  };
}

type CourseKit = {
  heights: Float32Array;
  water: Float32Array;
  circuit: Pt[];
  shape: VegasShape;
  wallFrom: (x: number, z: number) => number;
};

/**
 * Vegas's courses. Four to drive alone: a lap of the Grand Prix circuit, the length of
 * the Strip, across the desert to Red Rock, and down the side canyon to the river. And four
 * for friends (ADR 0019): two laps of the Grand Prix against each other, down to the river
 * and along it together, round the lake together, and a race among Red Rock's mesas.
 * Payouts must match `public.missions` (shop.test.ts checks).
 */
function planVegasCourses(kit: CourseKit): Mission[] {
  const { heights, circuit } = kit;
  const out: Mission[] = [];
  const course = (
    id: string, name: string, blurb: string, start: Pt, pts: Pt[], width: number,
    pay: { reward: number; repeatReward: number }, crew = 1, race = false,
  ) => {
    out.push({
      id, name, blurb, start: { ...start, heading: Math.atan2(pts[0].x - start.x, pts[0].z - start.z) },
      gates: gatesAlong(start, pts, width), cooldown: 600, ...courseLimits(courseLength(start, pts)), crew, race, ...pay,
    });
  };
  /** `d` metres short of `from` on the way from there to `to`. */
  const before = (from: Pt, to: Pt, d: number) => {
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    return { x: from.x - ((to.x - from.x) / len) * d, z: from.z - ((to.z - from.z) / len) * d };
  };

  // The Grand Prix: from the grid on Koval, once round, a flag every 60 metres or so.
  const lap = lapFrom(circuit, GRID, 60);
  course("grand-prix", "Grand Prix", "Once round the street circuit: up Koval, along Sands, down the Strip and back by Harmon.", GRID, lap, 16, { reward: 30, repeatReward: 10 });
  course(
    "grand-prix-race", "Grand Prix Race", "Two to ten friends, two laps of the street circuit. Quickest wins; every finisher is paid the same.",
    before(lap[0], lap[1], 30), [...lap, ...lap], 16, { reward: 40, repeatReward: 14 }, 2, true,
  );

  // The Strip, end to end: from the Welcome sign to the tower, in the northbound lanes.
  const strip: Pt[] = [];
  for (let z = 940; z >= -980; z -= 96) strip.push({ x: STRIP_X + 5, z });
  course("the-strip", "The Strip", "The whole Strip, the Welcome sign to the tower, every light lit.", { x: STRIP_X + 5, z: 1000 }, strip, 14, { reward: 20, repeatReward: 7 });

  // Down the side canyon from the rim to the river, and along the beach to the first bend.
  // The side canyon comes down on the river's left bank, looking downstream.
  const side = resample(toPts(kit.shape.side), 45);
  const joins = joinAt(kit.shape.canyon, kit.shape.side);
  const beach = beachAlong(kit.shape.canyon, joins + 0.02, joins + 0.12, 1, 45);
  course("canyon-descent", "Canyon Descent", "From the rim down the side canyon to the Colorado, and along its beach.", side[0], [...side.slice(1), ...beach], 14, { reward: 35, repeatReward: 12 });

  // Across the desert from the Strip's south end to Red Rock, by the gentlest way.
  const dash = routeAcross(heights, kit.water, { x: -420, z: 980 }, { x: -1720, z: -260 }, 0.32, 70, (x, z) => kit.wallFrom(x, z) < 10);
  if (dash) course("desert-run", "Desert Run", "Out past the Welcome sign and across the desert, among the Joshua trees, to Red Rock.", dash[0], dash.slice(1), 14, { reward: 25, repeatReward: 8 });

  // For friends, together: from the rim down to the river, then all the way down its beach
  // to a little short of where it runs out into the lake.
  const n = kit.shape.canyon.xs.length - 1;
  let mouth = n;
  while (mouth > 0 && kit.shape.lakeness(kit.shape.canyon.xs[mouth], kit.shape.canyon.zs[mouth]) > -0.2) mouth--;
  const down = beachAlong(kit.shape.canyon, joins + 0.02, mouth / n, 1, 60);
  const together = [...resample(toPts(kit.shape.side), 60).slice(1), ...down];
  course("rim-to-river", "Rim to River", "For two to ten friends: down the side canyon together, and the whole way down the Colorado to the lake.", side[0], together, 16, { reward: 50, repeatReward: 16 }, 2);

  // For friends, together: round the lake's shore from the marina, to where the canyon comes out.
  const shore = routeAcross(heights, kit.water, { x: 360, z: -1480 }, { x: 1300, z: -620 }, 0.3, 70, (x, z) => kit.shape.lakeness(x, z) > -0.04 || kit.wallFrom(x, z) < 10);
  if (shore) course("lakeshore", "Lakeshore", "For two to ten friends: from the marina round the shore of Lake Mead, together.", before(shore[0], shore[1], 10), shore, 16, { reward: 35, repeatReward: 12 }, 2);

  // For friends, against each other: a lap among Red Rock's mesas, turning in the open
  // ground between them.
  const loop = [{ x: -1560, z: -620 }, { x: -1880, z: -800 }, { x: -2080, z: -420 }, { x: -1880, z: -60 }, { x: -1580, z: -230 }]
    .map((p) => lowNear(heights, p, 220, VEGAS.floor + 8));
  const legs: Pt[] = [];
  for (let i = 0; i < loop.length; i++) {
    const leg = routeAcross(heights, kit.water, loop[i], loop[(i + 1) % loop.length], 0.32, 70);
    if (!leg) {
      legs.length = 0;
      break;
    }
    legs.push(...(i ? leg.slice(1) : leg));
  }
  // The arch is at the first turn: the way in to it, behind, is the last leg's way.
  if (legs.length > 4) {
    course(
      "red-rock-race", "Red Rock Race", "Two to ten friends, once round among the red mesas. Quickest wins; every finisher is paid the same.",
      legs[0], [...legs.slice(1), legs[0]], 16, { reward: 35, repeatReward: 12 }, 2, true,
    );
  }
  return out;
}

/** How far down the canyon's line, 0 to 1, the side canyon comes into it. */
function joinAt(canyon: Path, side: Path) {
  const [ex, ez] = [side.xs[side.xs.length - 1], side.zs[side.zs.length - 1]];
  let best = 0;
  for (let i = 1; i < canyon.xs.length; i++) if (Math.hypot(canyon.xs[i] - ex, canyon.zs[i] - ez) < Math.hypot(canyon.xs[best] - ex, canyon.zs[best] - ez)) best = i;
  return best / (canyon.xs.length - 1);
}

/**
 * The circuit once round from where `from` is on it, as flags: one at the start, middle and
 * end of every corner, so a straight line from flag to flag never cuts across one, and the
 * straights between them split into lengths of no more than `every`. Ends back at `from`.
 */
function lapFrom(circuit: Pt[], from: Pt, every: number): Pt[] {
  // The corners' points, seven each (circuitLine): the first, the middle and the last.
  const anchors = circuit.filter((_, i) => i % 7 === 0 || i % 7 === 3 || i % 7 === 6);
  const flags: Pt[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / every));
    for (let k = 0; k < n; k++) flags.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  // Begin at the flag nearest `from`, which is on a straight: the grid.
  let at = 0;
  for (let i = 1; i < flags.length; i++) if (Math.hypot(flags[i].x - from.x, flags[i].z - from.z) < Math.hypot(flags[at].x - from.x, flags[at].z - from.z)) at = i;
  return [...flags.slice(at + 1), ...flags.slice(0, at), { x: from.x, z: from.z }];
}

/**
 * Points along a beach of the river: from `a` to `b` of the way down the canyon's line,
 * on the left bank (`side` 1, looking downstream) or the right (−1), every `every` metres.
 */
function beachAlong(canyon: Path, a: number, b: number, side: number, every: number): Pt[] {
  const n = canyon.xs.length - 1;
  const pts: Pt[] = [];
  for (let i = Math.round(a * n); i <= Math.round(b * n); i++) {
    const j = Math.min(n, i + 1);
    const k = Math.max(0, i - 1);
    const dx = canyon.xs[j] - canyon.xs[k];
    const dz = canyon.zs[j] - canyon.zs[k];
    const len = Math.hypot(dx, dz) || 1;
    // Left of the way downstream is (dz, −dx) in this world's x, z.
    pts.push({ x: canyon.xs[i] + (dz / len) * BEACH * side, z: canyon.zs[i] - (dx / len) * BEACH * side });
  }
  return resample(pts, every);
}

import { Walls } from "./city-buildings";
import { campAt, kerbAt, kerbMapOf } from "./city";
import { resample, type Pt } from "./city-streets";
import { PAD, heliObstacles, standAt, type Pad } from "./heli";
import { courseDistOf, courseLength, courseLimits, gatesAlong, type Mission } from "./missions";
import { fbm, makeNoise2D, makeRandom, smoothstep } from "./noise";
import { gradeRoad, routeAcross, smoothPath, toPts } from "./roads";
import {
  FAR, ROW, SITE_BLEND, SITE_FLAT, SNORKEL_WADE, STOCK_WADE, WORLD,
  flood, gridX, gridZ, level, markNear, sampleGrid, type Site, type Track,
} from "./terrain";
import { obstacleIndex, trunkRadius, type Bush, type Obstacle, type Rock, type Tree, type World } from "./world";

/**
 * Japan (ADR 0024), the world the helicopter from Vegas flies to: an island with the sea
 * all round. In its north-west the mountain, a snow-capped cone over everything; at its
 * foot a lake, the camp on the lake's south shore looking across it to the mountain, a
 * red gate standing in the shallows and the teahouse by the water; on a hill to the
 * south-west a five-storey pagoda among cherry trees; to the east a ridge the road crosses
 * by a pass, up a flight of hairpins, down to a harbour town on the coast; in the south,
 * rice terraces stepping down a hillside to the sea; in the south-west a bamboo forest; and
 * up a valley in the north-east mountains, a hot spring. Not from a map: each place is
 * where it makes one world, the way Japan's famous views go together.
 *
 * The same grid as the other worlds. Pure data, no three.js. North is −z.
 */
export const JAPAN = {
  /** About how far from the middle the coast is. */
  shore: 2380,
  /** The mountain: where, how wide at its foot, and how high; and where its snow starts. */
  fuji: { x: -1150, z: -1100, r: 1150, peak: 430, snow: 270 },
  /** The lake at its foot: where, how big, and its surface. */
  lake: { x: -330, z: -360, r: 270, level: 22 },
  /** The ridge to the east and the pass over it. */
  ridgeX: 1150,
  passZ: -150,
  /** Where the terraces step down to the south coast. */
  terraces: { x: 250, z: 1100, halfX: 380, halfZ: 260 },
  /** The pagoda's hill. */
  pagoda: { x: -720, z: 260, height: 74 },
  /** The bamboo forest, and the hot spring up its valley. */
  bamboo: { x: -760, z: 1050, r: 360 },
  onsen: { x: 980, z: -1450, r: 11 },
} as const;

/** How much lower each terrace is than the one above. */
export const TERRACE = 2.4;
/** How deep the water stands in a paddy. */
const PADDY = 0.12;

/** The ground of the whole world, on the grid, before anything is built on it. */
export function makeJapan(seed: number) {
  const coast = makeNoise2D(seed);
  const bays = makeNoise2D(seed + 1);
  const hills = makeNoise2D(seed + 2);
  const ridgeN = makeNoise2D(seed + 3);
  const fine = makeNoise2D(seed + 4);

  /** How far inland a point is; negative out at sea. */
  const inland = (x: number, z: number) =>
    JAPAN.shore + 160 * coast(x / 1100, z / 1100) + 70 * bays(x / 380, z / 380) - Math.hypot(x, z);

  const f = JAPAN.fuji;
  const lake = JAPAN.lake;
  const t = JAPAN.terraces;

  /** The terraces' slope, from its top, a ridge across the south, down to the coast: 0 off it, its height on it. */
  const slopeSouth = (x: number, z: number) => {
    const top = t.z - t.halfZ - 140;
    const across = smoothstep(t.halfX + 420, t.halfX - 80, Math.abs(x - t.x));
    return across * 92 * smoothstep(top - 620, top, z) * (1 - smoothstep(top, top + 1250, z) * 0.85);
  };
  /** How much of a point is in the terraced part of that slope, 0 to 1: a ragged oval, the way fields follow a hill. */
  const terraced = (x: number, z: number) =>
    smoothstep(1.06, 1, Math.hypot((x - t.x) / t.halfX, (z - t.z) / t.halfZ) + 0.22 * fine(x / 230 + 9, z / 230));
  /** How far a point is from the lake's edge, outward; and so whether it's in the lake. */
  const fromLake = (x: number, z: number) => Math.hypot(x - lake.x, z - lake.z) + 24 * fine(x / 160, z / 160) - lake.r;
  /** The ridge's middle at a given z. */
  const ridgeAt = (z: number) => JAPAN.ridgeX - 120 * Math.sin(z / 700);

  const height = (x: number, z: number) => {
    const d = inland(x, z);
    // The sea floor, shelving away from a beach.
    if (d < 0) return Math.max(-40, d > -80 ? d * 0.05 : -4 + (d + 80) * 0.2);
    // The lowland: rising gently from the shore, and rolling, but quiet round the lake.
    const calm = smoothstep(80, 600, fromLake(x, z));
    let h = Math.min(d * 0.03, 26) + 2 + (6 + 16 * calm) * fbm(hills, x / 520, z / 520, 3) * smoothstep(0, 300, d);
    // The hills the terraces are cut into, falling to the south coast.
    h = Math.max(h, Math.min(h + slopeSouth(x, z), slopeSouth(x, z) + Math.min(d * 0.03, 8)));
    // The mountain: a concave cone, a crater at its top, gullies down its flanks.
    const rf = Math.hypot(x - f.x, z - f.z);
    if (rf < f.r) {
      const u = rf / f.r;
      const a = Math.atan2(z - f.z, x - f.x);
      const gully = 1 - 0.06 * Math.pow(Math.abs(Math.sin(a * 9 + 3 * u)), 6) * smoothstep(0.1, 0.5, u);
      const cone = f.peak * Math.pow(1 - u, 1.7) * gully;
      const crater = 22 * (1 - smoothstep(0.02, 0.05, u));
      h = Math.max(h, cone - crater);
    }
    // The ridge to the east, north to south: a chain of peaks with saddles between, and the
    // pass that notches it.
    const across = Math.abs(x - ridgeAt(z));
    const along = smoothstep(-2400, -1600, z) * smoothstep(1100, 500, z);
    const crest = 205 + 75 * ridgeN(z / 520, 3.7) + 25 * fbm(ridgeN, x / 240, z / 240, 3);
    const profile = 1 - Math.pow(Math.min(1, across / 520), 1.6);
    const notch = 1 - 0.3 * smoothstep(380, 0, Math.abs(z - JAPAN.passZ));
    h = Math.max(h, Math.max(0, profile) * crest * along * notch);
    // The north-east mountains, and the valley up into them where the hot spring is.
    const ne = smoothstep(500, 1300, x - z * 0.3) * smoothstep(-300, -1100, z);
    const valley = smoothstep(260, 40, Math.abs(x - JAPAN.onsen.x + (z - JAPAN.onsen.z) * 0.25));
    h = Math.max(h, ne * (190 + 60 * fbm(ridgeN, x / 300 + 5, z / 300, 3)) * (1 - 0.55 * valley));
    // The pagoda's hill: round, with a level top for the pagoda.
    const rp = Math.hypot(x - JAPAN.pagoda.x, z - JAPAN.pagoda.z);
    h += JAPAN.pagoda.height * (1 - smoothstep(30, 300, rp));
    // The terraces: the hillside cut into level shelves, each a little lower than the one
    // above, following the slope's contours down toward the sea.
    const inT = terraced(x, z);
    if (inT > 0) {
      const step = TERRACE * Math.round(h / TERRACE + 0.12 * fine(x / 90, z / 90));
      h = h + (step - h) * inT;
    }
    // The lake: its bed, and its shore rising out of it.
    const out = fromLake(x, z);
    if (out < 120) {
      const bed = lake.level - 0.5 - 14 * smoothstep(0, -lake.r * 0.6, out);
      const shore = lake.level - 0.5 + (h - (lake.level - 0.5)) * smoothstep(0, 120, out);
      h = out < 0 ? Math.min(h, bed) : Math.min(h, shore);
    }
    return h;
  };

  const heights = new Float32Array(ROW * ROW);
  for (let k = 0; k < heights.length; k++) heights[k] = height(gridX(k % ROW), gridZ(Math.floor(k / ROW)));
  return { heights, inland, height, terraced, fromLake, ridgeAt };
}

export type JapanShape = ReturnType<typeof makeJapan>;

/** A road: its middle line and half its paved width. */
export type Road = { name: string; xs: number[]; zs: number[]; half: number };

/** The hairpins up the ridge's west flank to the pass: legs to and fro, each a little further up. */
function hairpins(shape: JapanShape): Pt[] {
  const z0 = JAPAN.passZ - 110;
  const z1 = JAPAN.passZ + 100;
  const pts: Pt[] = [{ x: 640, z: JAPAN.passZ }];
  const legs = 5;
  for (let i = 0; i < legs; i++) {
    const x = 745 + i * 88;
    const [a, b] = i % 2 ? [z0, z1] : [z1, z0];
    pts.push({ x, z: a }, { x, z: b });
  }
  pts.push({ x: shape.ridgeAt(JAPAN.passZ), z: JAPAN.passZ });
  return pts;
}

/**
 * A climbing road's height `s` metres along it, from `foot` to `top`, level through every
 * bend and climbing evenly on the straights between.
 */
function levelBends(pts: Pt[], foot: number, top: number) {
  const line = resample(pts, 5);
  const heading = (i: number) => Math.atan2(line[Math.min(line.length - 1, i + 1)].x - line[Math.max(0, i - 1)].x, line[Math.min(line.length - 1, i + 1)].z - line[Math.max(0, i - 1)].z);
  // How much each 5 m climbs: none where the road is turning, within three steps either way.
  const turning = line.map((_, i) => {
    let most = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(line.length - 2, i + 3); j++) {
      const d = heading(j + 1) - heading(j);
      most = Math.max(most, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
    }
    return most > 0.04;
  });
  const climbs = turning.map((t): number => (t ? 0 : 1));
  const total = climbs.reduce((a, b) => a + b, 0) || 1;
  const at: number[] = [0];
  for (let i = 1; i < line.length; i++) at.push(at[i - 1] + climbs[i]);
  return (s: number) => {
    const i = Math.max(0, Math.min(line.length - 1, Math.round(s / 5)));
    return foot + ((top - foot) * at[i]) / total;
  };
}

/** Something the renderer builds that the world knows the place of. */
export type Feature = { kind: "torii" | "pagoda" | "onsen" | "boat" | "lantern"; x: number; z: number; y: number; rot: number };
/** A house in the town: a footprint, a height, which way its front faces. */
export type House = { x: number; z: number; y: number; w: number; d: number; h: number; rot: number; tone: number };

/** What the ground is, at each grid vertex, for the renderer to colour: the codes' order is `JAPAN_GROUNDS`. */
export const JAPAN_GROUNDS = ["meadow", "paddy", "forest", "ash", "town", "beach"] as const;
export type JapanGround = (typeof JAPAN_GROUNDS)[number];

export type JapanParts = {
  ground: Uint8Array;
  roads: Road[];
  kerb: Uint8Array;
  walls: Walls;
  houses: House[];
  features: Feature[];
  /** The camp's fire. */
  fire: Pt;
};
export type JapanWorld = World & { japan: JapanParts };

const NO_TRACK: Track = { xs: [], zs: [], ys: [], s: [], length: 0, bridges: [], crossings: [] };

/** Japan. Deterministic, like the others. */
export function buildJapan(seed = 20261024): JapanWorld {
  const rand = makeRandom(seed + 20);
  const shape = makeJapan(seed);
  const { heights } = shape;
  const far = () => new Float32Array(ROW * ROW).fill(FAR);
  const water = new Float32Array(ROW * ROW).fill(WORLD.water);
  const [roadDist, siteDist, campDist] = [far(), far(), far()];
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const field = (f: Float32Array, x: number, z: number) => sampleGrid(f, x, z);
  const lake = JAPAN.lake;

  // First what's levelled, so the roads come to it on its level: the camp on the lake's
  // south shore, facing across it to the mountain, three rows of ten.
  const campCentre = { x: -330, z: 40 };
  const campHeading = Math.PI;
  const camp = campAt(campCentre, campHeading);
  const campY = ground(campCentre.x, campCentre.z);
  level(heights, { x0: campCentre.x - 60, x1: campCentre.x + 60, z0: campCentre.z - 36, z1: campCentre.z + 36 }, campY, 0, 30, campDist);
  for (let k = 0; k < campDist.length; k++) campDist[k] = Math.max(0, campDist[k] - 4);
  const fire = { x: campCentre.x - 70, z: campCentre.z };
  level(heights, { x0: fire.x, x1: fire.x, z0: fire.z, z1: fire.z }, campY, 9, 12, campDist);

  // The teahouse, on the shore by the camp, looking out over the lake.
  const cafe = { x: -110, z: -70, rot: Math.atan2(lake.x + 110, lake.z + 70) };
  level(heights, { x0: cafe.x, x1: cafe.x, z0: cafe.z, z1: cafe.z }, ground(cafe.x, cafe.z), SITE_FLAT, SITE_BLEND, siteDist);

  // The helipad, on open ground south-east of the camp, well away from the roads.
  const padAt = { x: -150, z: 210 };
  const pad: Pad = { ...padAt, y: ground(padAt.x, padAt.z), heading: 0.6 };
  level(heights, { x0: pad.x, x1: pad.x, z0: pad.z, z1: pad.z }, pad.y, PAD.flat, 26, siteDist);
  // Nothing grows on the pad's paving, between it and the helicopter's stand, nor under the rotor.
  markNear(siteDist, pad, standAt(pad), 30, 5);

  // Three garages: a workshop at the foot of the pass, a shed by the harbour, and a
  // storehouse barn at the top of the terraces.
  const site = (style: Site["style"], x: number, z: number, rot: number): Site => ({ x, z, rot, style, y: ground(x, z) });
  const sites: Site[] = [
    site("passworks", 600, JAPAN.passZ - 70, Math.PI / 2),
    site("harbour", 2190, 300, Math.PI / 2),
    site("kura", 250, 790, 0),
  ];
  for (const s of sites) level(heights, { x0: s.x, x1: s.x, z0: s.z, z1: s.z }, s.y, SITE_FLAT, SITE_BLEND, siteDist);
  // The pagoda's ground, at the top of its hill.
  const pagodaY = ground(JAPAN.pagoda.x, JAPAN.pagoda.z);
  level(heights, { x0: JAPAN.pagoda.x, x1: JAPAN.pagoda.x, z0: JAPAN.pagoda.z, z1: JAPAN.pagoda.z }, pagodaY, 16, 20, siteDist);

  // The roads, laid in on even grades, on benches wide enough to stay level on a slope.
  const roads: Road[] = [];
  const lay = (name: string, half: number, pts: Pt[], grade = 0.11, profile?: (s: number) => number) => {
    const dist = gradeRoad(heights, pts, half, grade, 80, profile, true);
    for (let k = 0; k < dist.length; k++) roadDist[k] = Math.min(roadDist[k], Math.max(0, dist[k] - half));
    roads.push({ name, xs: pts.map((p) => p.x), zs: pts.map((p) => p.z), half });
  };
  const curve = (pts: Pt[]) => toPts(smoothPath(pts, 8));
  // The hairpins climb on the legs and are level round each bend, as such roads are: on
  // a ten-metre grid a climbing bend would be tilted across.
  const pins = curve(hairpins(shape));
  lay("The Pass", 4.5, pins, 0.12, levelBends(pins, ground(pins[0].x, pins[0].z), ground(pins[pins.length - 1].x, pins[pins.length - 1].z)));
  lay("Lake Road", 4.5, curve([{ x: -820, z: 60 }, { x: -560, z: 70 }, { x: -330, z: 110 }, { x: -60, z: 10 }, { x: 160, z: -150 }, { x: 420, z: -170 }, { x: 640, z: JAPAN.passZ }]));
  // Down the ridge's east side to the town, winding to keep its grade.
  lay("Harbour Road", 4.5, curve([
    { x: shape.ridgeAt(JAPAN.passZ), z: JAPAN.passZ }, { x: 1310, z: -120 }, { x: 1390, z: -230 }, { x: 1500, z: -190 },
    { x: 1560, z: -40 }, { x: 1660, z: 90 }, { x: 1760, z: 180 }, { x: 1860, z: 260 },
  ]), 0.16);
  lay("Farm Road", 4, curve([{ x: -60, z: 10 }, { x: 60, z: 220 }, { x: -20, z: 430 }, { x: 160, z: 560 }, { x: 120, z: 700 }, { x: 250, z: 765 }]));
  lay("Pagoda Road", 3.5, curve([{ x: -470, z: 85 }, { x: -560, z: 160 }, { x: -520, z: 300 }, { x: -620, z: 380 }, { x: -712, z: 280 }]), 0.13);
  // Up the mountain round its south-west flank, along it rather than straight at it, as such
  // roads go, to where the cedars give out: straight up, it was cut deep into the slope.
  const fuji = JAPAN.fuji;
  const round = Array.from({ length: 8 }, (_, i) => {
    const t = (i + 1) / 8;
    const a = ((74 + 56 * t) * Math.PI) / 180;
    return { x: fuji.x + Math.cos(a) * (1200 - 580 * t), z: fuji.z + Math.sin(a) * (1200 - 580 * t) };
  });
  lay("Mountain Road", 4, curve([{ x: -820, z: 60 }, ...round]), 0.13);
  // The harbour town: a few narrow streets in a grid by the sea.
  for (const z of [180, 260, 340]) lay("Town", 4, [{ x: 1760, z }, { x: 2180, z }], 0.06);
  for (const x of [1860, 1960, 2060]) lay("Town", 4, [{ x, z: 120 }, { x, z: 400 }], 0.06);
  const kerb = kerbMapOf(roads);
  const kerbFrom = (x: number, z: number) => kerbAt(kerb, x, z);

  // The water: the lake at its own level, and each paddy a hand's depth over its shelf.
  for (let k = 0; k < heights.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    if (shape.fromLake(x, z) < 30 && heights[k] < lake.level + 0.5) water[k] = lake.level;
    else if (shape.terraced(x, z) > 0.98 && roadDist[k] > 3 && shape.inland(x, z) > 60) water[k] = heights[k] + PADDY;
  }

  // The hot spring: a round pool up the north-east valley, a stone's height of steaming water.
  const onsenY = ground(JAPAN.onsen.x, JAPAN.onsen.z);
  for (let k = 0; k < heights.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const r = Math.hypot(x - JAPAN.onsen.x, z - JAPAN.onsen.z);
    if (r > JAPAN.onsen.r + 30) continue;
    heights[k] = onsenY + (heights[k] - onsenY) * smoothstep(JAPAN.onsen.r + 4, JAPAN.onsen.r + 30, r);
    if (r < JAPAN.onsen.r) {
      heights[k] = onsenY - 0.8;
      water[k] = onsenY;
    }
  }

  // What's built: the town's houses along its streets, the pagoda, the gate in the lake.
  const walls = new Walls();
  const solid = obstacleIndex();
  const houses: House[] = [];
  for (const r of roads.filter((r) => r.name === "Town")) {
    const [a, b] = [{ x: r.xs[0], z: r.zs[0] }, { x: r.xs[r.xs.length - 1], z: r.zs[r.zs.length - 1] }];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
    for (let s = 10; s < len - 10; s += 13) {
      for (const side of [1, -1]) {
        const d = 9 + rand() * 2;
        const w = 9 + rand() * 3;
        const cx = a.x + ux * s + uz * side * (r.half + 2 + d / 2);
        const cz = a.z + uz * s - ux * side * (r.half + 2 + d / 2);
        // Clear of every street, and on dry land.
        if (kerbFrom(cx, cz) < d / 2 + 1 || shape.inland(cx, cz) < 30 || walls.distance(cx, cz) < Math.max(w, d) / 2 + 1) continue;
        // Its front faces back across to the street.
        const rot = Math.atan2(-uz * side, ux * side);
        houses.push({ x: cx, z: cz, y: ground(cx, cz), w, d, h: 6 + rand() * 3.5, rot, tone: rand() });
        walls.addBox(cx, cz, rot, w / 2, d / 2);
      }
    }
  }
  const features: Feature[] = [
    { kind: "pagoda", x: JAPAN.pagoda.x, z: JAPAN.pagoda.z, y: pagodaY, rot: 0.4 },
    { kind: "torii", x: lake.x - lake.r + 18, z: lake.z + 20, y: lake.level - 0.6, rot: -Math.PI / 2 },
    { kind: "onsen", x: JAPAN.onsen.x, z: JAPAN.onsen.z, y: onsenY, rot: 0 },
  ];
  walls.addBox(JAPAN.pagoda.x, JAPAN.pagoda.z, 0.4, 7, 7);
  const torii = features[1];
  // Its pillars, and the legs that brace each of them, in water shallow enough to drive to.
  for (const s of [1, -1]) {
    solid.add({ x: torii.x, z: torii.z + s * 6, r: 0.8, h: Infinity });
    for (const t of [1, -1]) solid.add({ x: torii.x + t * 3.2, z: torii.z + s * 6, r: 0.5, h: Infinity });
  }
  // Boats moored off the harbour, and stone lanterns along the shore by the camp.
  for (let i = 0; i < 5; i++) {
    // Out where the water's deep enough to float them.
    const z = 150 + i * 40;
    let x = JAPAN.shore - 300;
    while (x < JAPAN.shore + 500 && ground(x, z) > -2.5) x += 5;
    features.push({ kind: "boat", x: x + 8 + (i % 2) * 16, z, y: 0, rot: Math.PI / 2 + (rand() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 9; i++) {
    const x = campCentre.x - 120 + i * 30;
    const z = lake.z + Math.sqrt(Math.max(0, (lake.r + 40) ** 2 - (x - lake.x) ** 2));
    if (field(roadDist, x, z) < 4 || field(campDist, x, z) < 4) continue;
    features.push({ kind: "lantern", x, z, y: ground(x, z), rot: 0 });
    solid.add({ x, z, r: 0.5, h: Infinity });
  }

  // The courses.
  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  const missions = planJapanCourses({ heights, water, shape, pins, roads, campCentre, kura: sites[2] });
  const courseDist = courseDistOf(missions, 20, true);

  /** Clear of what's built, the roads, the courses, the camp and the hot spring, by at least these distances. The walls' field reaches 12 m. */
  const clear = (x: number, z: number, road: number, built: number) =>
    field(roadDist, x, z) > road && field(siteDist, x, z) > built && field(campDist, x, z) > built &&
    field(courseDist, x, z) > 7 && walls.distance(x, z) > Math.min(built, 12) &&
    Math.hypot(x - JAPAN.onsen.x, z - JAPAN.onsen.z) > JAPAN.onsen.r + 8;

  // Trees: cedar on the mountain's lower slopes and over the ridges, maples among them, the
  // bamboo forest thick in the south-west, and cherries round the lake, the pagoda, the
  // camp's road and the town.
  const trees: Tree[] = [];
  const stand = makeNoise2D(seed + 11);
  const pagodaR = (x: number, z: number) => Math.hypot(x - JAPAN.pagoda.x, z - JAPAN.pagoda.z);
  const bambooR = (x: number, z: number) => Math.hypot(x - JAPAN.bamboo.x, z - JAPAN.bamboo.z);
  for (let z = -2700; z < 2700; z += 8) {
    for (let x = -2700; x < 2700; x += 8) {
      const tx = x + (rand() - 0.5) * 8;
      const tz = z + (rand() - 0.5) * 8;
      const y = ground(tx, tz);
      if (y < 2 || shape.inland(tx, tz) < 40 || slope(tx, tz) > 0.7 || field(water, tx, tz) > y - 0.2) continue;
      if (shape.terraced(tx, tz) > 0.2) continue;
      const n = stand(tx / 240, tz / 240);
      const inBamboo = bambooR(tx, tz) < JAPAN.bamboo.r + 60 * n;
      const mountain = y > 70 && y < JAPAN.fuji.snow - 40;
      const blossom = (shape.fromLake(tx, tz) > 20 && shape.fromLake(tx, tz) < 170) || (pagodaR(tx, tz) > 40 && pagodaR(tx, tz) < 260) || field(roadDist, tx, tz) < 22;
      const chance = inBamboo ? 0.55 : mountain ? 0.12 + 0.2 * smoothstep(0, 0.6, n) : blossom ? 0.05 : 0.012 + 0.03 * smoothstep(0.2, 0.7, n);
      if (rand() > chance || !clear(tx, tz, inBamboo ? 4 : 7, 16)) continue;
      const kind = inBamboo ? "bamboo" : mountain ? (rand() < 0.22 ? "broadleaf" : "pine") : blossom && rand() < 0.75 ? "sakura" : rand() < 0.5 ? "broadleaf" : "pine";
      // Cedars are dark all year: under the valley's larches' share of tones (scenery.ts).
      const tone = kind === "pine" ? 0.2 + rand() * 0.8 : rand();
      const scale = kind === "bamboo" ? 0.8 + rand() * 0.5 : kind === "sakura" ? 0.75 + rand() * 0.4 : 0.7 + rand() * 0.6;
      trees.push({ x: tx, y: y - 0.2, z: tz, scale, rot: rand() * Math.PI * 2, kind, tone });
    }
  }

  // Rocks: black lava on the mountain's slopes, boulders in the ridges' gullies and the hot spring's valley.
  const rocks: Rock[] = [];
  const reach = WORLD.limit - 80;
  for (let tries = 0; tries < 60000 && rocks.length < 2400; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    const y = ground(x, z);
    if (y < 1.5 || shape.inland(x, z) < 10 || field(water, x, z) > y - 0.3) continue;
    const s = slope(x, z);
    const chance = y > 60 ? 0.04 + Math.min(0.4, s * 0.8) : shape.inland(x, z) < 70 ? 0.03 : 0.004;
    if (rand() > chance || !clear(x, z, 9, 18)) continue;
    const size = 0.5 + Math.pow(rand(), 2.2) * 3.5;
    rocks.push({
      x, y: y - size * 0.25, z,
      sx: size * (0.8 + rand() * 0.5), sy: size * (0.55 + rand() * 0.35), sz: size * (0.8 + rand() * 0.5),
      rot: rand() * Math.PI * 2, tone: rand(),
    });
  }

  // Undergrowth everywhere it's green.
  const bushes: Bush[] = [];
  for (let tries = 0; tries < 110000 && bushes.length < 10000; tries++) {
    const x = (rand() - 0.5) * 2 * reach;
    const z = (rand() - 0.5) * 2 * reach;
    const y = ground(x, z);
    if (y < 2.5 || y > JAPAN.fuji.snow - 30 || shape.inland(x, z) < 50 || slope(x, z) > 0.6 || field(water, x, z) > y - 0.2 || shape.terraced(x, z) > 0.2) continue;
    if (!clear(x, z, 4, 12)) continue;
    bushes.push({ x, y: y - 0.2, z, scale: 0.5 + rand() * 0.8, rot: rand() * Math.PI * 2, tone: rand() });
  }

  // What the ground is, for its colours.
  const kinds = new Uint8Array(ROW * ROW);
  const code = (g: JapanGround) => JAPAN_GROUNDS.indexOf(g);
  for (let k = 0; k < kinds.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const y = heights[k];
    kinds[k] =
      shape.inland(x, z) < 70 && y < 6 ? code("beach")
      : water[k] > heights[k] && shape.terraced(x, z) > 0.5 ? code("paddy")
      : y > JAPAN.fuji.snow - 60 && Math.hypot(x - JAPAN.fuji.x, z - JAPAN.fuji.z) < JAPAN.fuji.r ? code("ash")
      : y > 70 ? code("forest")
      : Math.hypot(x - 1960, z - 260) < 320 ? code("town")
      : code("meadow");
  }

  // Snow on the mountain's cap and the ridge's highest peaks, its lower edge ragged. It's
  // as slippery as the valley's: chains help.
  const drift = makeNoise2D(seed + 31);
  const snow = new Float32Array(ROW * ROW);
  for (let k = 0; k < snow.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    snow[k] = smoothstep(JAPAN.fuji.snow - 10, JAPAN.fuji.snow + 10, heights[k] + 22 * drift(x / 90, z / 90));
  }

  // What a truck can reach, wading and with a snorkel.
  const start = camp.pitches[0].parking;
  const zone = new Uint8Array(ROW * ROW);
  flood(heights, water, STOCK_WADE, zone, 1, start);
  flood(heights, water, SNORKEL_WADE, zone, 2, start);

  for (const tr of trees) solid.add({ x: tr.x, z: tr.z, r: trunkRadius(tr), h: Infinity });
  for (const r of rocks) solid.add({ x: r.x, z: r.z, r: Math.min(r.sx, r.sz) * 0.8, h: r.y + r.sy * 0.95 - ground(r.x, r.z), boulder: true });
  for (const o of heliObstacles(pad)) solid.add(o);

  return {
    id: "japan",
    heights, water, forest: new Float32Array(ROW * ROW), trackDist: far(), riverDist: far(), roadDist, siteDist, campDist, zone,
    snow, ice: new Float32Array(ROW * ROW),
    track: NO_TRACK, rivers: [], roads: [], sites,
    trees, bushes, rocks, missions, landmarks: [], courseDist, airport: null, station: null, dock: null, pad,
    cafe, start, pitches: camp.pitches, camp: { ...campCentre, heading: campHeading },
    sea: true, mapSpan: (JAPAN.shore + 420) * 2,
    height: ground, waterAt: (x, z) => sampleGrid(water, x, z),
    obstaclesNear: (x, z) => {
      const near = solid.near(x, z);
      const wall = walls.near(x, z);
      return wall.length ? [...near, ...wall] : near;
    },
    limit: WORLD.limit,
    pavedAt: (x, z) => kerbFrom(x, z) < 1.6 || field(siteDist, x, z) < 10,
    slipAt: (x, z) => Math.min(1, field(snow, x, z)),
    addObstacles: (list: readonly Obstacle[]) => list.forEach(solid.add),
    setTide: () => {},
    japan: { ground: kinds, roads, kerb, walls, houses, features, fire },
  };
}

type CourseKit = {
  heights: Float32Array;
  water: Float32Array;
  shape: JapanShape;
  pins: Pt[];
  roads: Road[];
  campCentre: Pt;
  kura: Pt;
};

/**
 * Japan's courses. Four to drive alone: down the pass's hairpins, along the terraces'
 * paddy dykes, a loop through the bamboo, and round the lake. And four for friends (ADR
 * 0019): up the mountain together to the end of its road, a race from the pass down to the
 * harbour, along the south coast together, and a race round the pagoda's hill.
 * Payouts must match `public.missions` (shop.test.ts checks).
 */
function planJapanCourses(kit: CourseKit): Mission[] {
  const { heights, water, shape } = kit;
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
  const roadOf = (name: string) => toPts({ xs: kit.roads.find((r) => r.name === name)!.xs, zs: kit.roads.find((r) => r.name === name)!.zs });
  /** Flags along a road's line, every `every` metres, and at each sharp turn in it, so no straight line between two flags leaves it. */
  const alongRoad = (pts: Pt[], every: number) => {
    const fine = resample(pts, 4);
    const flags: Pt[] = [];
    let since = 0;
    for (let i = 1; i < fine.length - 1; i++) {
      since += 4;
      const a = Math.atan2(fine[i].x - fine[i - 1].x, fine[i].z - fine[i - 1].z);
      const b = Math.atan2(fine[i + 1].x - fine[i].x, fine[i + 1].z - fine[i].z);
      const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      if (since >= every || (turn > 0.06 && since >= 24)) {
        flags.push(fine[i]);
        since = 0;
      }
    }
    flags.push(fine[fine.length - 1]);
    return flags;
  };

  // Down the pass: from the top of the hairpins to their foot.
  const down = alongRoad([...kit.pins].reverse(), 50);
  course("the-pass", "The Pass", "Down the hairpins from the pass, every bend of them.", kit.pins[kit.pins.length - 1], down, 12, { reward: 30, repeatReward: 10 });

  // Along the dykes: from the storehouse down the terraces, zigzagging shelf to shelf.
  const t = JAPAN.terraces;
  const dykes: Pt[] = [];
  for (let i = 0; i < 7; i++) dykes.push({ x: t.x + (i % 2 ? 1 : -1) * t.halfX * 0.4, z: t.z - t.halfZ * 0.75 + i * ((t.halfZ * 1.5) / 6) });
  // The arch stands in the storehouse's yard, before its door.
  course("paddy-dykes", "Paddy Dykes", "Down through the rice terraces, shelf to shelf, the water either side.", { x: kit.kura.x, z: kit.kura.z + 26 }, dykes, 14, { reward: 25, repeatReward: 8 });

  // Through the bamboo: a loop under the canes.
  const b = JAPAN.bamboo;
  const loop = Array.from({ length: 13 }, (_, i) => ({ x: b.x + Math.cos((i / 12) * Math.PI * 2) * b.r * 0.55, z: b.z + Math.sin((i / 12) * Math.PI * 2) * b.r * 0.55 }));
  course("bamboo-grove", "Bamboo Grove", "Once round under the bamboo, the light coming down green.", { x: loop[0].x, z: loop[0].z - 30 }, loop.slice(1), 12, { reward: 25, repeatReward: 8 });

  // Round the lake, by the gentlest ground near its shore: from the camp's side, west, round
  // under the mountain, and back by the east. It starts on the shore below the camp, not in
  // it, and keeps out of its pitches and away from its fire.
  const lake = JAPAN.lake;
  const c = kit.campCentre;
  const inCamp = (x: number, z: number) => Math.abs(x - c.x) < 82 && Math.abs(z - c.z) < 52;
  const around = [0.5, 0.9, 1.3, 1.7, 0.1].map((turn, i) => ({
    x: lake.x + Math.cos(Math.PI * turn) * (lake.r + (i ? 100 : 60)), z: lake.z + Math.sin(Math.PI * turn) * (lake.r + (i ? 100 : 60)),
  }));
  const shoreLegs: Pt[] = [];
  let whole = true;
  for (let i = 0; i < around.length && whole; i++) {
    const leg = routeAcross(heights, water, around[i], around[(i + 1) % around.length], 0.36, 70, (x, z) => shape.fromLake(x, z) < 25 || inCamp(x, z));
    if (leg) shoreLegs.push(...(i ? leg.slice(1) : leg));
    else whole = false;
  }
  // The legs come back round to where they began, so the last flag, the finish, is at the arch.
  if (whole) {
    course("lake-round", "Round the Lake", "Once round the lake, the mountain over it all the way.", shoreLegs[0], shoreLegs.slice(1), 14, { reward: 30, repeatReward: 10 });
  }

  // For friends, together: up the mountain's road to where it ends, high on its flank. The
  // arch stands a little way up the road, so friends line up on it behind.
  const mountain = resample(roadOf("Mountain Road"), 4);
  const foot = mountain[14];
  course("mountain-road", "Mountain Road", "For two to ten friends: up the mountain together, to the end of its road.", foot, alongRoad(mountain.slice(14), 60), 16, { reward: 25, repeatReward: 8 }, 2);

  // For friends, against each other: from the pass down to the harbour.
  // The arch stands a little way down the road from the top, so friends line up on it behind.
  const harbour = resample(roadOf("Harbour Road"), 4);
  course("harbour-run", "Harbour Run", "Two to ten friends, from the pass down to the harbour. Quickest wins; every finisher is paid the same.", harbour[10], alongRoad(harbour.slice(10), 60), 14, { reward: 30, repeatReward: 10 }, 2, true);

  // For friends, together: along the south coast, behind the beach, from the bamboo to the terraces' foot.
  const coast = routeAcross(heights, water, { x: b.x + 200, z: b.z + 520 }, { x: t.x + 300, z: t.z + 520 }, 0.3, 70, (x, z) => shape.inland(x, z) < 50 || shape.terraced(x, z) > 0.1);
  if (coast) course("south-coast", "South Coast", "For two to ten friends: along the south coast together, the sea on your right.", coast[0], coast.slice(1), 16, { reward: 35, repeatReward: 12 }, 2);

  // For friends, against each other: once round the pagoda's hill.
  const p = JAPAN.pagoda;
  const round = Array.from({ length: 15 }, (_, i) => ({ x: p.x + Math.cos((i / 14) * Math.PI * 2) * 340, z: p.z + Math.sin((i / 14) * Math.PI * 2) * 340 }));
  course("pagoda-race", "Pagoda Race", "Two to ten friends, once round the pagoda's hill. Quickest wins; every finisher is paid the same.", { x: round[0].x, z: round[0].z - 40 }, round.slice(1), 16, { reward: 30, repeatReward: 10 }, 2, true);
  return out;
}

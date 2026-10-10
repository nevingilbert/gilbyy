import { fieldDist, type Airport } from "./airport";
import { LINE_UP_BACK } from "./convoy";
import { RAMP, type Ramp } from "./ramp";
import { METRES_PER_MILE } from "./shop";
import { CAFE, CAMP_GATE, FROZEN, LAKES, ROW, SNOWLINE_Z, START, WORLD, gridX, gridZ, nearest, sampleGrid, type Path, type Terrain } from "./terrain";

/**
 * Optional driving challenges, laid out on the real terrain at load. Drive to a start
 * arch, press E, and go through the gates in order. Finishing earns miles; there is
 * no failing, only giving up. Courses pay far better than the same minutes spent just
 * driving (ADR 0017). Pure data, no three.js.
 */
export type Gate = { x: number; z: number; heading: number; width: number };
export type Mission = {
  id: string;
  name: string;
  blurb: string;
  start: { x: number; z: number; heading: number };
  /** In order; the last is the finish. */
  gates: Gate[];
  /** Miles for the first finish, and for each finish after that (no sooner than `cooldown` seconds apart). */
  reward: number;
  repeatReward: number;
  cooldown: number;
  /** Faster than this is not believable; the server refuses the claim. */
  minSeconds: number;
  /** Miles that must have been banked while the run was on, or the server refuses the claim. */
  minMiles: number;
  /** How many drivers it takes: 1 for a course you drive alone, more for a convoy or a race. */
  crew: number;
  /** Driven by friends against each other rather than together. Paid the same either way. */
  race: boolean;
  /** A ramp on the course's line. With one, what a run is told afterwards is its time in the air, not on the clock. */
  ramp?: Ramp;
};

type Pt = { x: number; z: number };

function helpers(t: Terrain) {
  const h = (x: number, z: number) => sampleGrid(t.heights, x, z);
  const f = (field: Float32Array, x: number, z: number) => sampleGrid(field, x, z);
  const slope = (x: number, z: number) => Math.hypot(h(x + 2, z) - h(x - 2, z), h(x, z + 2) - h(x, z - 2)) / 4;
  const zone = (x: number, z: number) =>
    t.zone[Math.round((z + WORLD.size / 2) / (WORLD.size / WORLD.segments)) * ROW + Math.round((x + WORLD.size / 2) / (WORLD.size / WORLD.segments))];
  /** A spot a course can pass through: dry, drivable, clear of the railway, rivers, buildings and camp. */
  const clearAt = (x: number, z: number, maxSlope: number) =>
    Math.hypot(x, z) < WORLD.wallStart - 120 &&
    zone(x, z) > 0 &&
    h(x, z) > f(t.water, x, z) + 0.4 &&
    slope(x, z) <= maxSlope &&
    f(t.trackDist, x, z) > 14 &&
    f(t.riverDist, x, z) > 40 &&
    f(t.siteDist, x, z) > 35 &&
    f(t.campDist, x, z) > 60 &&
    f(t.roadDist, x, z) > 8;
  /** Checks every few metres along a polyline. */
  const lineOk = (pts: Pt[], maxSlope: number) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
      for (let k = 0; k <= n; k++) if (!clearAt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, maxSlope)) return false;
    }
    return true;
  };
  /** Whether every few metres along a polyline is more than `gap` from the courses in `avoid`. */
  const awayFrom = (avoid: Float32Array | null, pts: Pt[], gap: number) => {
    if (!avoid) return true;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10);
      for (let k = 0; k <= n; k++) if (f(avoid, a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n) <= gap) return false;
    }
    return true;
  };
  return { h, f, slope, zone, clearAt, lineOk, awayFrom };
}

/** Each gate faces along the path: from the point before it toward the point after it. */
export function gatesAlong(start: Pt, pts: Pt[], width: number): Gate[] {
  return pts.map((p, i) => {
    const prev = i === 0 ? start : pts[i - 1];
    const next = pts[i + 1] ?? p;
    const dx = (next === p ? p.x - prev.x : next.x - prev.x);
    const dz = (next === p ? p.z - prev.z : next.z - prev.z);
    return { x: p.x, z: p.z, heading: Math.atan2(dx, dz), width };
  });
}

const length = (start: Pt, pts: Pt[]) =>
  pts.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? pts[i - 1] : start).x, p.z - (i ? pts[i - 1] : start).z), 0);

/**
 * No rig averages this many metres a second round a course, so a quicker claim is refused.
 * A tenth more than the quickest rig's top speed (the Sandfly's 24.5): flags have width,
 * and a good line through them is a little shorter than the one measured.
 */
export const TOO_QUICK = 27;
const secondsFor = (metres: number) => Math.floor(metres / TOO_QUICK);
/**
 * Three fifths of the line through the flags, in miles. The odometer counts every metre
 * driven, so an honest run always banks more than this; a claim from a truck that never
 * drove the course doesn't.
 */
const milesFor = (metres: number) => Math.floor(((metres * 0.6) / METRES_PER_MILE) * 100) / 100;
/** The limits that follow from how long a course's line is. */
export const courseLimits = (metres: number) => ({ minSeconds: secondsFor(metres), minMiles: milesFor(metres) });
const limits = courseLimits;

/** Weaving between flags through the thickest forest within reach of camp. */
function forestSlalom(t: Terrain): Mission | null {
  const { f, clearAt, lineOk } = helpers(t);
  let best: { start: Pt; heading: number; pts: Pt[]; score: number } | null = null;
  for (let z = -1800; z <= 1800; z += 60) {
    for (let x = -1800; x <= 1800; x += 60) {
      const fromStart = Math.hypot(x - START.x, z - START.z);
      if (fromStart < 300 || fromStart > 1800 || f(t.snow, x, z) > 0.05 || !clearAt(x, z, 0.3)) continue;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * Math.PI * 2;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const pts: Pt[] = [];
        let forest = 0;
        for (let g = 1; g <= 10; g++) {
          const side = g % 2 ? 7 : -7;
          const p = { x: x + dx * g * 40 + dz * side, z: z + dz * g * 40 - dx * side };
          pts.push(p);
          forest += f(t.forest, p.x, p.z);
        }
        const score = forest / 10;
        if (score < 0.55 || (best && score <= best.score)) continue;
        if (!lineOk([{ x, z }, ...pts], 0.32)) continue;
        best = { start: { x, z }, heading: a, pts, score };
      }
    }
  }
  if (!best) return null;
  return {
    id: "forest-slalom", name: "Forest Slalom", blurb: "Ten flags through the pines. Mind the trunks.",
    start: { ...best.start, heading: best.heading }, gates: gatesAlong(best.start, best.pts, 9),
    reward: 12, repeatReward: 4, cooldown: 600, ...limits(length(best.start, best.pts)), crew: 1, race: false,
  };
}

/**
 * Straight up the biggest climbable hill on the near side, flag by flag to the summit.
 * With `avoid`, the biggest one more than 150 m from every course in it.
 */
function ridgeRun(t: Terrain, avoid: Float32Array | null = null, id = "ridge-run", name = "Ridge Run"): Mission | null {
  const { h, f, zone, clearAt, lineOk, awayFrom } = helpers(t);
  let best: { start: Pt; heading: number; pts: Pt[]; climb: number } | null = null;
  for (let z = -2000; z <= 2000; z += 50) {
    for (let x = -2000; x <= 2000; x += 50) {
      if (zone(x, z) !== 1 || f(t.snow, x, z) > 0.2 || (avoid && f(avoid, x, z) <= 150)) continue;
      const top = h(x, z);
      let peak = true;
      for (let k = 0; k < 8 && peak; k++) peak = h(x + Math.sin(k) * 120, z + Math.cos(k) * 120) < top - 8;
      if (!peak) continue;
      for (let d = 0; d < 16; d++) {
        const a = (d / 16) * Math.PI * 2;
        const start = { x: x - Math.sin(a) * 360, z: z - Math.cos(a) * 360 };
        const climb = top - h(start.x, start.z);
        if (climb < 30 || (best && climb <= best.climb)) continue;
        if (!clearAt(start.x, start.z, 0.25) || !lineOk([start, { x, z }], 0.42) || !awayFrom(avoid, [start, { x, z }], 150)) continue;
        const pts = [1, 2, 3, 4, 5, 6, 7].map((g) => {
          const along = g / 7;
          const side = g === 7 ? 0 : g % 2 ? 4 : -4;
          return { x: start.x + (x - start.x) * along + Math.cos(a) * side, z: start.z + (z - start.z) * along - Math.sin(a) * side };
        });
        best = { start, heading: a, pts, climb };
      }
    }
  }
  if (!best) return null;
  return {
    id, name, blurb: `Seven flags, ${Math.round(best.climb)} metres of climb. Keep it steady.`,
    start: { ...best.start, heading: best.heading }, gates: gatesAlong(best.start, best.pts, 9),
    reward: 15, repeatReward: 5, cooldown: 600, ...limits(length(best.start, best.pts)), crew: 1, race: false,
  };
}

/** Round the west lake's shore, anticlockwise, back to where you started. */
function lakeshoreLoop(t: Terrain): Mission | null {
  const { clearAt } = helpers(t);
  const lake = LAKES[1];
  const pts: Pt[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let push = 0; push <= 60; push += 10) {
      const r = lake.r + 45 + push;
      const p = { x: lake.x + Math.cos(a) * r, z: lake.z + Math.sin(a) * r };
      if (clearAt(p.x, p.z, 0.4)) {
        pts.push(p);
        break;
      }
    }
  }
  if (pts.length < 9) return null;
  // Start a little before the first flag, and finish back at it.
  const tangent = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  const start = { x: pts[0].x - Math.sin(tangent) * 30, z: pts[0].z - Math.cos(tangent) * 30 };
  const loop = [...pts, pts[0]];
  return {
    id: "lakeshore-loop", name: "Lakeshore Loop", blurb: "Once round the west lake. Wet feet optional.",
    start: { ...start, heading: tangent }, gates: gatesAlong(start, loop, 10),
    reward: 20, repeatReward: 7, cooldown: 600, ...limits(length(start, loop)), crew: 1, race: false,
  };
}

/** Zigzag across the frozen lake. On road tyres, this is mostly sliding. */
function iceDrift(t: Terrain): Mission | null {
  const { clearAt } = helpers(t);
  const lake = FROZEN[0];
  const start = { x: lake.x - lake.r - 45, z: lake.z };
  if (!clearAt(start.x, start.z, 0.3)) return null;
  const pts: Pt[] = [];
  for (let x = lake.x - lake.r + 30, k = 0; x <= lake.x + lake.r - 30; x += 45, k++) pts.push({ x, z: lake.z + (k % 2 ? 28 : -28) });
  pts.push({ x: lake.x + lake.r + 40, z: lake.z });
  return {
    id: "ice-drift", name: "Ice Drift", blurb: "Flags across the frozen lake. Snow tyres help. A lot.",
    start: { ...start, heading: Math.PI / 2 }, gates: gatesAlong(start, pts, 12),
    reward: 25, repeatReward: 8, cooldown: 600, ...limits(length(start, pts)), crew: 1, race: false,
  };
}

/** What a loop course for friends is planned around, and what makes one better than another. */
type LoopPlan = {
  /** It starts at the flag nearest here, which must be within 260 m. */
  near: Pt;
  radii: number[];
  flags: number;
  score(loop: { climb: number; forest: number; steep: number; from: number }): number;
};

/**
 * The best loop for `plan`: flags round a circle, nudged onto clear ground, at least 50 m
 * from every other course (`others`). Begins at the flag nearest `plan.near` and ends
 * back on it, with room for a start arch and a line-up behind it.
 */
function loopNear(t: Terrain, others: Float32Array, plan: LoopPlan): Pt[] | null {
  const { h, f, slope, clearAt, lineOk } = helpers(t);
  const clear = (x: number, z: number) => clearAt(x, z, 0.4) && f(others, x, z) > 50;
  /**
   * The valley is bumpy everywhere, and a loop this long can't miss every steep patch.
   * How much of it is steep, or null if any stretch is a wall or runs near another course.
   */
  const steepness = (pts: Pt[]) => {
    let steep = 0, samples = 0, run = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
      for (let k = 0; k < n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        if (f(others, x, z) <= 30) return null;
        const s = slope(x, z);
        samples++;
        if (s > 0.45) steep++;
        run = s > 0.7 ? run + 1 : 0;
        if (run > 2) return null;
      }
    }
    return steep / samples;
  };
  const { near, flags: n } = plan;
  let best: { pts: Pt[]; score: number } | null = null;
  for (let cz = near.z - 700; cz <= near.z + 700; cz += 50) {
    for (let cx = near.x - 700; cx <= near.x + 700; cx += 50) {
      for (const r of plan.radii) {
        // The loop has to come past `near`.
        if (Math.abs(Math.hypot(cx - near.x, cz - near.z) - r) > 200) continue;
        const pts: Pt[] = [];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const p = [0, -25, 25, -50, 50].map((push) => ({ x: cx + Math.cos(a) * (r + push), z: cz + Math.sin(a) * (r + push) })).find((q) => clear(q.x, q.z));
          if (!p) break;
          pts.push(p);
        }
        if (pts.length < n) continue;
        const first = pts.reduce((b, p, i) => (Math.hypot(p.x - near.x, p.z - near.z) < Math.hypot(pts[b].x - near.x, pts[b].z - near.z) ? i : b), 0);
        const loop = [...pts.slice(first), ...pts.slice(0, first), pts[first]];
        const from = Math.hypot(loop[0].x - near.x, loop[0].z - near.z);
        if (from > 260) continue;
        const heading = Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z);
        const back = (d: number) => ({ x: loop[0].x - Math.sin(heading) * d, z: loop[0].z - Math.cos(heading) * d });
        if (!clearAt(back(40).x, back(40).z, 0.3) || f(others, back(75).x, back(75).z) <= 50 || !lineOk([back(75), loop[0]], 0.5)) continue;
        if (!lineOk(loop, Infinity)) continue;
        const steep = steepness(loop);
        if (steep === null) continue;
        let lo = Infinity, hi = -Infinity, forest = 0;
        for (const p of pts) {
          lo = Math.min(lo, h(p.x, p.z));
          hi = Math.max(hi, h(p.x, p.z));
          forest += f(t.forest, p.x, p.z) / n;
        }
        const score = plan.score({ climb: hi - lo, forest, steep, from });
        if (!best || score > best.score) best = { pts: loop, score };
      }
    }
  }
  return best?.pts ?? null;
}

/** The start arch 40 m before the first flag, and the gates the rest of the way round. */
function loopCourse(loop: Pt[], width: number) {
  const heading = Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z);
  const start = { x: loop[0].x - Math.sin(heading) * 40, z: loop[0].z - Math.cos(heading) * 40 };
  return { start: { ...start, heading }, gates: gatesAlong(start, loop, width), length: length(start, loop) };
}

/**
 * For friends: a long loop out from the café and back, driven together, with flags wide
 * enough for two abreast. It starts a short drive from the café, where friends are made.
 */
function convoy(t: Terrain, others: Float32Array): Mission | null {
  const loop = loopNear(t, others, {
    near: CAFE, radii: [240, 300, 360], flags: 14,
    // Some climbing, some trees, not much that's steep, and not far from the café.
    score: (l) => Math.min(l.climb, 40) / 40 + Math.min(l.forest, 0.5) - l.steep * 4 - l.from / 400,
  });
  if (!loop) return null;
  const c = loopCourse(loop, 14);
  return {
    id: "convoy", name: "Convoy", blurb: "For two to ten friends: once round and back to the café.",
    start: c.start, gates: c.gates,
    reward: 30, repeatReward: 10, cooldown: 600, ...limits(c.length), crew: 2, race: false,
  };
}

/**
 * For friends who'd rather race: a fast loop by the camp, open and as gentle as the
 * valley allows, so it's about the driving line more than the bumps.
 */
function race(t: Terrain, others: Float32Array): Mission | null {
  const loop = loopNear(t, others, {
    near: CAMP_GATE, radii: [260, 320, 380], flags: 12,
    score: (l) => -l.steep * 6 - Math.max(0, l.forest - 0.2) - l.from / 300,
  });
  if (!loop) return null;
  const c = loopCourse(loop, 14);
  return {
    id: "race", name: "Race", blurb: "Two to ten friends, once round. Quickest wins; every finisher is paid the same.",
    start: c.start, gates: c.gates,
    reward: 25, repeatReward: 8, cooldown: 600, ...limits(c.length), crew: 2, race: true,
  };
}

/** What a straight run of flags looks for. */
type LinePlan = {
  /** The start and every flag must be somewhere this allows, as well as on clear ground. */
  where: (x: number, z: number) => boolean;
  /** How good a flag's spot is. The line with the best average wins, if it reaches `least`. */
  score: (x: number, z: number) => number;
  least: number;
  flags: number;
  spacing: number;
  /** How far each flag sits off the centre line, alternately left and right. */
  side: number;
  maxSlope: number;
};

/** The best straight run of flags for `plan`, anywhere in the valley. */
function flagLine(t: Terrain, plan: LinePlan) {
  const { clearAt, lineOk } = helpers(t);
  let best: { start: Pt; heading: number; pts: Pt[]; score: number } | null = null;
  for (let z = -2200; z <= 2200; z += 60) {
    for (let x = -2200; x <= 2200; x += 60) {
      // A line rarely scores well from a start that scores badly, so don't try those.
      if (plan.score(x, z) < plan.least - 0.2 || !plan.where(x, z) || !clearAt(x, z, 0.3)) continue;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * Math.PI * 2;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const pts: Pt[] = [];
        let score = 0;
        for (let g = 1; g <= plan.flags; g++) {
          const side = g % 2 ? plan.side : -plan.side;
          const p = { x: x + dx * g * plan.spacing + dz * side, z: z + dz * g * plan.spacing - dx * side };
          pts.push(p);
          score += plan.score(p.x, p.z) / plan.flags;
        }
        if (score < plan.least || (best && score <= best.score)) continue;
        if (!pts.every((p) => plan.where(p.x, p.z)) || !lineOk([{ x, z }, ...pts], plan.maxSlope)) continue;
        best = { start: { x, z }, heading: a, pts, score };
      }
    }
  }
  return best;
}

/** A solo course from a run of flags, or null if the valley has nowhere for it. `crewLine` makes one for friends of it. */
function lineCourse(line: ReturnType<typeof flagLine>, width: number, m: Pick<Mission, "id" | "name" | "blurb" | "reward" | "repeatReward">): Mission | null {
  if (!line) return null;
  return {
    ...m, start: { ...line.start, heading: line.heading }, gates: gatesAlong(line.start, line.pts, width),
    cooldown: 600, ...limits(length(line.start, line.pts)), crew: 1, race: false,
  };
}

/** A second slalom, deeper in the woods and well away from camp. */
function deepWoods(t: Terrain, avoid: Float32Array): Mission | null {
  const { f, zone } = helpers(t);
  const line = flagLine(t, {
    where: (x, z) => zone(x, z) === 1 && f(t.snow, x, z) <= 0.05 && f(avoid, x, z) > 120 && Math.hypot(x - START.x, z - START.z) > 500,
    score: (x, z) => f(t.forest, x, z), least: 0.55, flags: 12, spacing: 40, side: 7, maxSlope: 0.32,
  });
  return lineCourse(line, 9, { id: "deep-woods", name: "Deep Woods", blurb: "Twelve flags through the far pines. Slower than it looks.", reward: 15, repeatReward: 5 });
}

/** Flags across the open snow, wide apart. Road tyres can't climb it; chains or studs can. */
function snowfield(t: Terrain, avoid: Float32Array): Mission | null {
  const { f, zone, slope } = helpers(t);
  const line = flagLine(t, {
    where: (x, z) => zone(x, z) === 1 && f(t.snow, x, z) > 0.7 && f(t.ice, x, z) < 0.1 && f(avoid, x, z) > 150,
    score: (x, z) => 1 - slope(x, z) * 2, least: 0.6, flags: 10, spacing: 50, side: 14, maxSlope: 0.3,
  });
  return lineCourse(line, 12, { id: "snowfield", name: "Snowfield", blurb: "Ten wide flags across the snow. Bring chains or studded tyres.", reward: 25, repeatReward: 8 });
}

/**
 * Along the river's far bank, where only a snorkel gets you: seven flags that follow the
 * water 65–95 m out. Within reach of `riverDist`, so it never takes the hollow the
 * airstrip is hidden in, which has to be further off (`valleyAirfield`).
 */
function farBank(t: Terrain, avoid: Float32Array): Mission | null {
  const { f, zone, slope, clearAt, lineOk } = helpers(t);
  // The far bank is steep in places, so this allows a bit more slope than the other lines.
  const ok = (p: Pt) => zone(p.x, p.z) === 2 && f(t.riverDist, p.x, p.z) < 110 && f(avoid, p.x, p.z) > 150 && clearAt(p.x, p.z, 0.4);
  let best: { start: Pt; heading: number; pts: Pt[]; score: number } | null = null;
  for (const river of t.rivers) {
    for (const side of [1, -1]) {
      for (const out of [65, 80, 95]) {
        // Every fourth point of the river (40 m apart), pushed out square to its course.
        const bank: Pt[] = [];
        for (let i = 2; i < river.xs.length - 2; i += 4) {
          const dx = river.xs[i + 2] - river.xs[i - 2];
          const dz = river.zs[i + 2] - river.zs[i - 2];
          const d = Math.hypot(dx, dz) || 1;
          bank.push({ x: river.xs[i] + (dz / d) * out * side, z: river.zs[i] - (dx / d) * out * side });
        }
        for (let i = 0; i + 8 <= bank.length; i++) {
          const run = bank.slice(i, i + 8);
          if (!run.every(ok)) continue;
          const score = run.reduce((sum, p) => sum + Math.min(f(t.forest, p.x, p.z), 0.6) - slope(p.x, p.z), 0) / run.length;
          if ((best && score <= best.score) || !lineOk(run, 0.42)) continue;
          best = { start: run[0], heading: Math.atan2(run[1].x - run[0].x, run[1].z - run[0].z), pts: run.slice(1), score };
        }
      }
    }
  }
  return lineCourse(best, 10, { id: "far-bank", name: "Far Bank", blurb: "Seven flags along the river's far bank. You'll need a snorkel to get there.", reward: 30, repeatReward: 10 });
}

const highRidge = (t: Terrain, avoid: Float32Array) => {
  const m = ridgeRun(t, avoid, "high-ridge", "High Ridge");
  return m && { ...m, reward: 18, repeatReward: 6 };
};

/** A loop by the south lake, out past the quiet end of the valley. */
function southernShore(t: Terrain, avoid: Float32Array): Mission | null {
  const lake = LAKES[2];
  const loop = loopNear(t, avoid, {
    near: { x: lake.x, z: lake.z - lake.r - 60 }, radii: [280, 340], flags: 14,
    score: (l) => Math.min(l.forest, 0.3) - l.steep * 4 - l.from / 300,
  });
  if (!loop) return null;
  const c = loopCourse(loop, 10);
  return {
    id: "southern-shore", name: "Southern Shore", blurb: "Once round by the south lake, at the quiet end of the valley.",
    start: c.start, gates: c.gates,
    reward: 20, repeatReward: 7, cooldown: 600, ...limits(c.length), crew: 1, race: false,
  };
}

/** For friends with longer: a big loop from the big lake's south shore, driven together. */
function grandTour(t: Terrain, others: Float32Array): Mission | null {
  const lake = LAKES[0];
  const loop = loopNear(t, others, {
    near: { x: lake.x, z: lake.z + lake.r + 120 }, radii: [360, 420], flags: 18,
    score: (l) => Math.min(l.climb, 50) / 50 + Math.min(l.forest, 0.4) - l.steep * 4 - l.from / 400,
  });
  if (!loop) return null;
  const c = loopCourse(loop, 14);
  return {
    id: "grand-tour", name: "Grand Tour", blurb: "For two to ten friends: the long way round, by the big lake.",
    start: c.start, gates: c.gates,
    reward: 40, repeatReward: 12, cooldown: 600, ...limits(c.length), crew: 2, race: false,
  };
}

/** A second race, hillier and through the trees, by the roadside workshop. */
function hillRace(t: Terrain, others: Float32Array): Mission | null {
  const workshop = t.sites.find((s) => s.style === "workshop");
  if (!workshop) return null;
  const loop = loopNear(t, others, {
    near: workshop, radii: [260, 320, 380], flags: 12,
    score: (l) => Math.min(l.climb, 50) / 50 + Math.min(l.forest, 0.4) - l.steep * 4 - l.from / 300,
  });
  if (!loop) return null;
  const c = loopCourse(loop, 14);
  return {
    id: "hill-race", name: "Hill Race", blurb: "Two to ten friends, up and down through the trees. Every finisher is paid the same.",
    start: c.start, gates: c.gates,
    reward: 30, repeatReward: 10, cooldown: 600, ...limits(c.length), crew: 2, race: true,
  };
}

/**
 * How a jump is laid out along a straight line from its start arch: flags to line you up,
 * the ramp, and two flags to come down between. Metres from the arch, then from the lip.
 */
const JUMP = { lineUp: [35, 70, 105], foot: 125, land: [52, 100], runOut: 40 } as const;

/**
 * One jump: a straight run at a timber ramp, on the most level open strip within a short
 * drive of camp. What a run is told afterwards is how long it was in the air.
 */
function bigAir(t: Terrain, avoid: Float32Array): Mission | null {
  const { h, f, zone, clearAt, lineOk, awayFrom } = helpers(t);
  const lip = JUMP.foot + RAMP.length;
  // From the last flag before the ramp to where the quickest rig comes down.
  const [from, to] = [JUMP.lineUp[2], lip + 45];
  let best: { start: Pt; heading: number; score: number } | null = null;
  for (let z = -1800; z <= 1800; z += 60) {
    for (let x = -1800; x <= 1800; x += 60) {
      const drive = Math.hypot(x - START.x, z - START.z);
      if (drive < 250 || drive > 1400 || zone(x, z) !== 1 || f(t.snow, x, z) > 0.05 || f(t.forest, x, z) > 0.5) continue;
      if (f(avoid, x, z) <= 150 || !clearAt(x, z, 0.15)) continue;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * Math.PI * 2;
        const at = (s: number, side = 0) => ({ x: x + Math.sin(a) * s + Math.cos(a) * side, z: z + Math.cos(a) * s - Math.sin(a) * side });
        const y = (s: number, side = 0) => h(at(s, side).x, at(s, side).z);
        // How far the ground strays from one even grade under the ramp and the landing, and how much it tilts across them.
        const grade = (y(to) - y(from)) / (to - from);
        let rough = 0;
        for (let s = from; s <= to; s += 5) rough = Math.max(rough, Math.abs(y(s) - y(from) - grade * (s - from)), Math.abs(y(s, 5) - y(s)), Math.abs(y(s, -5) - y(s)));
        // Level is best. A little downhill is fine; uphill takes the speed off.
        const score = -rough - Math.abs(grade) * 20 - Math.max(0, grade) * 40 - drive / 1500;
        if (rough > 0.8 || (best && score <= best.score)) continue;
        const line = [at(-25), at(lip + JUMP.land[1] + JUMP.runOut)];
        if (!awayFrom(avoid, line, 150) || !lineOk(line, 0.22)) continue;
        best = { start: { x, z }, heading: a, score };
      }
    }
  }
  if (!best) return null;
  const { start, heading } = best;
  const at = (s: number) => ({ x: start.x + Math.sin(heading) * s, z: start.z + Math.cos(heading) * s });
  // The fourth flag stands on the deck just short of the lip, so the only way through it is off the ramp.
  const pts = [...JUMP.lineUp, lip - 1.5, lip + JUMP.land[0], lip + JUMP.land[1]].map(at);
  const widths = [9, 9, 9, RAMP.width - 0.6, 12, 12];
  return {
    id: "big-air", name: "Big Air", blurb: "A straight run at a timber ramp. It's the time in the air that counts.",
    start: { ...start, heading }, gates: gatesAlong(start, pts, 9).map((g, i) => ({ ...g, width: widths[i] })),
    reward: 15, repeatReward: 5, cooldown: 600, ...limits(length(start, pts)), crew: 1, race: false,
    ramp: { ...at(JUMP.foot), heading },
  };
}

/**
 * A course for friends from a run of flags, or null if the valley has nowhere for it: the
 * flags wide enough for two abreast, and ground behind the arch for ten trucks to line up on.
 */
function crewLine(
  t: Terrain, avoid: Float32Array, line: ReturnType<typeof flagLine>,
  m: Pick<Mission, "id" | "name" | "blurb" | "reward" | "repeatReward" | "race">,
): Mission | null {
  const { lineOk, awayFrom } = helpers(t);
  if (!line) return null;
  const behind = { x: line.start.x - Math.sin(line.heading) * (LINE_UP_BACK + 4), z: line.start.z - Math.cos(line.heading) * (LINE_UP_BACK + 4) };
  if (!lineOk([behind, line.start], 0.5) || !awayFrom(avoid, [behind, line.start], 150)) return null;
  return { ...lineCourse(line, 14, m)!, crew: 2, race: m.race };
}

/**
 * For friends, together: beside the railway on the green side of the valley, eight flags
 * 34 m from the rails along whichever stretch is gentlest. The ground by the line is all
 * cuttings and embankments, so this is allowed more slope than the other runs of flags.
 */
function trackside(t: Terrain, avoid: Float32Array): Mission | null {
  const { f, zone, slope, clearAt, lineOk, awayFrom } = helpers(t);
  const { xs, zs } = t.track;
  const n = xs.length;
  const ok = (p: Pt) => zone(p.x, p.z) === 1 && f(t.snow, p.x, p.z) <= 0.05 && f(avoid, p.x, p.z) > 150 && clearAt(p.x, p.z, 0.45);
  let best: { start: Pt; heading: number; pts: Pt[]; score: number } | null = null;
  for (const side of [1, -1]) {
    for (const way of [1, -1]) {
      for (let i = 0; i < n; i += 4) {
        // A point every 60 m along the rails, pushed out square to them, and one more behind the first for the line-up.
        const at = (k: number) => {
          const j = (((i + way * k * 12) % n) + n) % n;
          const dx = xs[(j + 2) % n] - xs[(j + n - 2) % n];
          const dz = zs[(j + 2) % n] - zs[(j + n - 2) % n];
          const d = Math.hypot(dx, dz) || 1;
          return { x: xs[j] + (dz / d) * 34 * side, z: zs[j] - (dx / d) * 34 * side };
        };
        const run = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(at);
        if (!run.every(ok) || !ok(at(-1))) continue;
        const score = -run.reduce((sum, p) => sum + slope(p.x, p.z), 0) / run.length;
        if ((best && score <= best.score) || !awayFrom(avoid, run, 150) || !lineOk(run, 0.5)) continue;
        best = { start: run[0], heading: Math.atan2(run[1].x - run[0].x, run[1].z - run[0].z), pts: run.slice(1), score };
      }
    }
  }
  return crewLine(t, avoid, best, {
    id: "trackside", name: "Trackside", blurb: "For two to ten friends: eight flags beside the railway. Wave if the train comes by.",
    reward: 25, repeatReward: 8, race: false,
  });
}

/** For friends, against each other: flags far apart over the most open, level ground left. Nothing to do but keep your foot down. */
function flatOut(t: Terrain, avoid: Float32Array): Mission | null {
  const { f, zone, slope } = helpers(t);
  const line = flagLine(t, {
    where: (x, z) => zone(x, z) === 1 && f(t.snow, x, z) <= 0.05 && f(avoid, x, z) > 150,
    score: (x, z) => 1 - f(t.forest, x, z) - slope(x, z) * 2, least: 0.3, flags: 8, spacing: 60, side: 9, maxSlope: 0.32,
  });
  return crewLine(t, avoid, line, {
    id: "flat-out", name: "Flat Out", blurb: "Two to ten friends, eight flags over open ground. Quickest wins; every finisher is paid the same.",
    reward: 25, repeatReward: 8, race: true,
  });
}

/** A loop for friends that starts near `near`, if there is room for one there. */
const friendsLoop = (
  near: (t: Terrain) => Pt | undefined, plan: Omit<LoopPlan, "near">,
  m: Pick<Mission, "id" | "name" | "blurb" | "reward" | "repeatReward" | "race">,
) => (t: Terrain, room: Float32Array): Mission | null => {
  const at = near(t);
  const loop = at && loopNear(t, room, { ...plan, near: at });
  if (!loop) return null;
  const c = loopCourse(loop, 14);
  return { ...m, start: c.start, gates: c.gates, cooldown: 600, ...limits(c.length), crew: 2 };
};

/** Lowers `dist` to the distance to `m`'s driving line wherever that is nearer, out to `reach` metres. */
const addCourse = (dist: Float32Array, m: Mission, reach: number, lineUps = false) => {
  // From a little behind the start arch, where trucks line up: as far back as ten of them need, when asked.
  const behind = lineUps && m.crew > 1 ? LINE_UP_BACK + 6 : 25;
  const back = { x: m.start.x - Math.sin(m.start.heading) * behind, z: m.start.z - Math.cos(m.start.heading) * behind };
  const path: Path = { xs: [back.x, m.start.x, ...m.gates.map((g) => g.x)], zs: [back.z, m.start.z, ...m.gates.map((g) => g.z)] };
  if (m.ramp) {
    // A jump is finished flat out, so it needs room to pull up past its last flag.
    const end = m.gates[m.gates.length - 1];
    path.xs.push(end.x + Math.sin(end.heading) * JUMP.runOut);
    path.zs.push(end.z + Math.cos(end.heading) * JUMP.runOut);
  }
  const d = nearest(path, false, reach).dist;
  for (let k = 0; k < d.length; k++) dist[k] = Math.min(dist[k], d[k]);
};

/**
 * Distance to the nearest course's driving line, out to `reach` metres. With `lineUps`,
 * also to where a full crew of ten lines up behind each course for friends: what the
 * scatter keeps clear. Planning leaves that out, so no course that was already there moves.
 */
export const courseDistOf = (missions: Mission[], reach: number, lineUps = false) => {
  const dist = new Float32Array(ROW * ROW).fill(1000);
  for (const m of missions) addCourse(dist, m, reach, lineUps);
  return dist;
};

/** The thirteen courses the valley had before ADR 0019, each where it has always been. */
export function planMissions(t: Terrain): Mission[] {
  const solo = [forestSlalom(t), ridgeRun(t), lakeshoreLoop(t), iceDrift(t)].filter((m): m is Mission => !!m);
  const withConvoy = [...solo, convoy(t, courseDistOf(solo, 60))].filter((m): m is Mission => !!m);
  const missions = [...withConvoy, race(t, courseDistOf(withConvoy, 60))].filter((m): m is Mission => !!m);
  // The courses added with ADR 0017, each laid out clear of every course before it, so the
  // first six stay exactly where they were.
  const avoid = courseDistOf(missions, 160);
  for (const plan of [grandTour, hillRace, deepWoods, southernShore, highRidge, snowfield, farBank]) {
    const m = plan(t, avoid);
    if (!m) continue;
    missions.push(m);
    addCourse(avoid, m, 160);
  }
  return missions;
}

/** What makes a loop good to drive together, and what makes one good to race round. */
const TOGETHER: LoopPlan["score"] = (l) => Math.min(l.climb, 40) / 40 + Math.min(l.forest, 0.5) - l.steep * 4 - l.from / 400;
const AGAINST: LoopPlan["score"] = (l) => -l.steep * 6 - Math.max(0, l.forest - 0.2) - l.from / 300;

/**
 * The loops for friends added with ADR 0019, in the parts of the valley that had room for
 * one: by the barn, at the head of the big lake, under the snowline, and between the west
 * lake and the south one.
 */
const FRIENDS_LOOPS = [
  friendsLoop((t) => t.sites.find((s) => s.style === "barn"), { radii: [240, 300, 360], flags: 14, score: TOGETHER }, {
    id: "barn-round", name: "Barn Round", blurb: "For two to ten friends: once round from the barn and back, together.",
    reward: 30, repeatReward: 10, race: false,
  }),
  friendsLoop(() => ({ x: LAKES[0].x, z: LAKES[0].z - LAKES[0].r - 100 }), { radii: [260, 320, 380], flags: 12, score: AGAINST }, {
    id: "lakehead-race", name: "Lakehead Race", blurb: "Two to ten friends, once round at the head of the big lake. Quickest wins; every finisher is paid the same.",
    reward: 30, repeatReward: 10, race: true,
  }),
  friendsLoop(() => ({ x: -150, z: SNOWLINE_Z + 50 }), { radii: [240, 300, 360], flags: 14, score: TOGETHER }, {
    id: "snowline", name: "Snowline", blurb: "For two to ten friends: once round, up into the first of the snow and back down, together.",
    reward: 30, repeatReward: 10, race: false,
  }),
  friendsLoop(() => ({ x: LAKES[1].x + 450, z: LAKES[1].z + 300 }), { radii: [260, 320, 380], flags: 12, score: AGAINST }, {
    id: "two-lakes-race", name: "Two Lakes Race", blurb: "Two to ten friends, a lap between the west lake and the south one. Every finisher is paid the same.",
    reward: 30, repeatReward: 10, race: true,
  }),
];

/**
 * The courses added with ADR 0019: one to drive alone, the jump, and six for friends, so
 * the valley has as many of one as the other. They are laid out once the easter eggs and
 * the airstrip have been chosen, so none of those move. A run of flags keeps 150 m from
 * every course before it and a loop 100 m, and all of them 260 m from the four buildings
 * and 500 m from the airstrip, which stays hidden.
 */
export function planMore(t: Terrain, missions: Mission[], landmarks: Pt[], airport: Airport): Mission[] {
  const courses = courseDistOf(missions, 160);
  // How near the easter eggs and the airstrip are, less what a course must keep from them on top of its 150 m.
  const others = new Float32Array(ROW * ROW);
  for (let j = 0; j < ROW; j++) {
    for (let i = 0; i < ROW; i++) {
      const [x, z] = [gridX(i), gridZ(j)];
      let d = fieldDist(airport, x, z) - 350;
      for (const l of landmarks) d = Math.min(d, Math.hypot(l.x - x, l.z - z) - 110);
      others[j * ROW + i] = d;
    }
  }
  /** What a run of flags keeps 150 m from, or with `loop` what a loop keeps 50 m from. */
  const avoid = (loop: boolean) => courses.map((c, k) => Math.max(0, Math.min(c - (loop ? 50 : 0), others[k] - (loop ? 100 : 0))));
  const more: Mission[] = [];
  const add = (m: Mission | null) => {
    if (!m) return;
    more.push(m);
    addCourse(courses, m, 160);
  };
  add(bigAir(t, avoid(false)));
  for (const plan of FRIENDS_LOOPS) add(plan(t, avoid(true)));
  for (const plan of [trackside, flatOut]) add(plan(t, avoid(false)));
  return more;
}

/** How far a course is to drive, from its start through every flag. */
export const courseLength = length;

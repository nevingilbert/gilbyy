import { CONVOY_MAX, lineUp } from "./convoy";
import { dockBoard, dockLeave } from "./dock";
import { boardSpot, leaveSpot } from "./flight";
import { padBoard, padLeave } from "./heli";
import { lineUpAlone, startRun, tick } from "./mission-run";
import { makeCar, step, type Car, type CarSpec, type Input } from "./physics";
import { TIDE } from "./tide";
import type { Ground, Mission, Obstacle, World } from "./world";

/**
 * The dev panel's places and checks (DevPanel.tsx): for building and testing the game
 * without signing in, in development builds only, never on gilbyy.com. Pure, so the
 * same checks run in the tests (sweep.test.ts) and, in the panel, on the world as the
 * scene has built it, with every model's colliders in.
 */

/** A named place in a world to jump to, and the way to face there. */
export type DevSpot = { name: string; x: number; z: number; heading: number };

/** A spot `d` metres out in front of something at (x, z) facing `rot`, turned to face it. */
const before = (x: number, z: number, rot: number, d: number) => ({ x: x + Math.sin(rot) * d, z: z + Math.cos(rot) * d, heading: rot + Math.PI });

/** What a course is called in passing. */
const kindOf = (m: Mission) => (m.crew > 1 ? (m.race ? "Race" : "Convoy") : "Course");

/**
 * Everywhere worth jumping to in a world: the camp, each garage's door and the café, what
 * takes you to another world, every course's start, and the easter eggs.
 */
export function devSpots(world: World): DevSpot[] {
  const out: DevSpot[] = [{ name: "Camp", ...world.start }];
  for (const s of world.sites) out.push({ name: `Garage: ${s.style}`, ...before(s.x, s.z, s.rot, 18) });
  out.push({ name: "Café", ...before(world.cafe.x, world.cafe.z, world.cafe.rot, 16) });
  if (world.airport) out.push({ name: "Airstrip: behind the plane", ...boardSpot(world.airport) });
  if (world.station) out.push({ name: "Station: beside the train", ...world.station.board });
  if (world.dock) out.push({ name: "Dock: out on the causeway", ...dockBoard(world.dock) });
  if (world.pad) out.push({ name: "Helipad", ...padBoard(world.pad) });
  for (const m of world.missions) out.push({ name: `${kindOf(m)}: ${m.name}`, x: m.start.x, z: m.start.z, heading: m.start.heading });
  for (const l of world.landmarks) out.push({ name: `Easter egg: the ${l.kind}`, ...before(l.x, l.z, l.rot, 16) });
  return out;
}

/** How far a truck reaches from its middle, however it's turned: its two circles, front and back (physics.ts). */
const reachOf = (spec: CarSpec) => spec.wheelbase * 0.46 + spec.radius;

/**
 * The nearest spot to (x, z), spiralling out, where a truck can be put down: inside the
 * world, no deeper in water than it can wade, and nothing it would hit within its reach
 * however it's turned. Null if there's none within `reach`.
 */
export function clearSpot(world: World, x: number, z: number, spec: CarSpec, reach = 60) {
  const size = reachOf(spec) + 0.3;
  const ok = (px: number, pz: number) => {
    if (Math.hypot(px, pz) > world.limit - 20) return false;
    if (world.waterAt(px, pz) - world.height(px, pz) > spec.wade * 0.8) return false;
    return !world.obstaclesNear(px, pz).some((o) => o.h > spec.clearance && Math.hypot(o.x - px, o.z - pz) < o.r + size);
  };
  if (ok(x, z)) return { x, z };
  for (let r = 2; r <= reach; r += 2) {
    const steps = Math.max(8, Math.round((2 * Math.PI * r) / 2));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/**
 * Every place the game itself puts a truck down: the camp, the thirty tents, where each
 * trip boards and leaves you, and where a course lines you up (for a convoy, all ten).
 * `more` adds what only the scene knows, like where each garage lets you out.
 */
export function spawnSpots(world: World, more: DevSpot[] = []): DevSpot[] {
  const out: DevSpot[] = [{ name: "the camp's start", ...world.start }];
  for (const p of world.pitches) out.push({ name: `tent ${p.index + 1}'s bay`, ...p.parking });
  if (world.airport) out.push({ name: "behind the plane", ...boardSpot(world.airport) }, { name: "off the plane", ...leaveSpot(world.airport) });
  if (world.station) out.push({ name: "beside the train", ...world.station.board }, { name: "off the train", ...world.station.leave });
  if (world.dock) out.push({ name: "on the causeway", ...dockBoard(world.dock) }, { name: "off the ferry", ...dockLeave(world.dock) });
  if (world.pad) out.push({ name: "on the helipad", ...padBoard(world.pad) }, { name: "off the helicopter", ...padLeave(world.pad) });
  for (const m of world.missions) {
    if (m.crew === 1) out.push({ name: `${m.name}'s line-up`, ...lineUpAlone(m) });
    else for (let slot = 0; slot < CONVOY_MAX; slot++) out.push({ name: `${m.name}'s line-up, place ${slot + 1}`, ...lineUp(m, slot) });
  }
  return [...out, ...more];
}

/** Something wrong with a place the game puts a truck down. */
export type SpotProblem = { spot: DevSpot; why: string; at?: Obstacle };

/**
 * What's wrong with a spot for a truck facing its way: anything it would hit there, water
 * deeper than it can wade, or the world's edge. Nothing, and it's an empty list.
 */
export function spotProblems(world: World, spot: DevSpot, spec: CarSpec): SpotProblem[] {
  const out: SpotProblem[] = [];
  if (world.square ? Math.max(Math.abs(spot.x), Math.abs(spot.z)) > world.limit - 4 : Math.hypot(spot.x, spot.z) > world.limit - 4) {
    out.push({ spot, why: "at the world's edge" });
  }
  const depth = world.waterAt(spot.x, spot.z) - world.height(spot.x, spot.z);
  if (depth > spec.wade) out.push({ spot, why: `in ${depth.toFixed(1)} m of water` });
  const fx = Math.sin(spot.heading);
  const fz = Math.cos(spot.heading);
  const offset = spec.wheelbase * 0.46;
  const seen = new Set<Obstacle>();
  for (const end of [1, -1]) {
    const cx = spot.x + fx * offset * end;
    const cz = spot.z + fz * offset * end;
    for (const o of world.obstaclesNear(cx, cz)) {
      if (o.h <= spec.clearance || seen.has(o)) continue;
      // Up on a ramp's deck, or under a bridge: what's over or under it isn't in its way.
      const y = world.height(spot.x, spot.z);
      if (o.top !== undefined && y > o.top) continue;
      if (o.bottom !== undefined && y + spec.ride < o.bottom) continue;
      const gap = Math.hypot(cx - o.x, cz - o.z) - (spec.radius + o.r);
      if (gap < -0.05) {
        seen.add(o);
        out.push({ spot, why: `${o.r >= 25 ? "in a wall" : o.boulder ? "on a boulder" : "on top of something"}, ${(-gap).toFixed(1)} m into it`, at: o });
      }
    }
  }
  return out;
}

/** What the bot made of a course (`driveCourse`). */
export type BotRun = {
  name: string;
  /** Gates passed, of how many, and in how long. */
  passed: number;
  of: number;
  seconds: number;
  /** Where it gave up, and why, if it didn't finish. */
  stuck: { x: number; z: number; why: string } | null;
  /** How many ways it found on the way round. */
  plans: number;
};

type Pt = { x: number; z: number };

/** The bot's clock: the game's own step (Game.tsx). */
const DT = 1 / 120;
/** The grid the bot finds its way on, and how far ahead along its way it steers for. */
const CELL = 2;
const LOOK = 7;
/** The most ways the bot finds to each gate, on average, before it calls itself lost. */
const PLANS_A_GATE = 6;

/**
 * Whether a truck could stand at (x, z) on ground `h` high: inside the world, no deeper
 * in water than it can wade, ground it could hold, and nothing it would hit, as the
 * physics has it (physics.ts `collide`): not what's under the deck it's on, or over it.
 */
function standable(world: World, x: number, z: number, h: number, spec: CarSpec, room: number) {
  if ((world.square ? Math.max(Math.abs(x), Math.abs(z)) : Math.hypot(x, z)) > world.limit - 6) return false;
  if (world.waterAt(x, z) - h > spec.wade * 0.9) return false;
  const up = h + 1;
  if (Math.hypot(world.height(x + 1, z, up) - world.height(x - 1, z, up), world.height(x, z + 1, up) - world.height(x, z - 1, up)) / 2 > 0.9) return false;
  for (const o of world.obstaclesNear(x, z)) {
    if (o.h <= spec.clearance) continue;
    if (o.top !== undefined && h > o.top) continue;
    if (o.bottom !== undefined && h + spec.ride < o.bottom) continue;
    if (Math.hypot(o.x - x, o.z - z) < o.r + room) return false;
  }
  return true;
}

/**
 * A way a truck on ground `a.y` high could drive from `a` to `b`, found on a 2 m grid
 * round the straight line between them and pulled straight between its corners: never
 * into anything it would hit, deeper water than it can wade, or ground too steep to
 * hold, and on whichever surface it's on, so under a bridge, not over it. Null if
 * there's none within `margin` of that line.
 */
export function wayThrough(world: World, a: Pt & { y: number }, b: Pt, spec: CarSpec, margin = 40): Pt[] | null {
  const x0 = Math.min(a.x, b.x) - margin;
  const z0 = Math.min(a.z, b.z) - margin;
  const nx = Math.ceil((Math.max(a.x, b.x) + margin - x0) / CELL) + 1;
  const nz = Math.ceil((Math.max(a.z, b.z) + margin - z0) / CELL) + 1;
  const room = spec.radius + 0.2;
  const xOf = (k: number) => x0 + (k % nx) * CELL;
  const zOf = (k: number) => z0 + Math.floor(k / nx) * CELL;
  const cellOf = (p: Pt) => Math.round((p.z - z0) / CELL) * nx + Math.round((p.x - x0) / CELL);
  // Each square's ground, on the surface it was come to from, and whether a truck can be there: 0 not looked at yet, 1 it can, -1 not.
  const ground = new Float32Array(nx * nz);
  const looked = new Int8Array(nx * nz);
  const open = (k: number, from: number) => {
    if (looked[k]) return looked[k] > 0;
    const x = xOf(k);
    const z = zOf(k);
    ground[k] = world.height(x, z, from + 1);
    looked[k] = standable(world, x, z, ground[k], spec, room) ? 1 : -1;
    return looked[k] > 0;
  };
  const start = cellOf(a);
  ground[start] = world.height(xOf(start), zOf(start), a.y + 1);
  looked[start] = 1;
  const goal = cellOf(b);
  const cost = new Float32Array(nx * nz).fill(Infinity);
  const key = new Float32Array(nx * nz);
  const prev = new Int32Array(nx * nz).fill(-1);
  const done = new Uint8Array(nx * nz);
  const heap: number[] = [];
  const push = (k: number) => {
    heap.push(k);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (key[heap[p]] <= key[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        let m = i;
        if (l < heap.length && key[heap[l]] < key[heap[m]]) m = l;
        if (l + 1 < heap.length && key[heap[l + 1]] < key[heap[m]]) m = l + 1;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const gx = xOf(goal);
  const gz = zOf(goal);
  cost[start] = 0;
  key[start] = Math.hypot(xOf(start) - gx, zOf(start) - gz);
  push(start);
  // A gate's middle with a post in it: anywhere within a few metres of it will do.
  let reached = -1;
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal || (looked[goal] < 0 && Math.hypot(xOf(k) - gx, zOf(k) - gz) <= 4)) {
      reached = k;
      break;
    }
    const i = k % nx;
    const j = Math.floor(k / nx);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const nk = nj * nx + ni;
        if (done[nk] || !open(nk, ground[k])) continue;
        // Not across a corner: both of the squares beside a diagonal step have to be clear.
        if (di && dj && (!open(j * nx + ni, ground[k]) || !open(nj * nx + i, ground[k]))) continue;
        const climb = Math.abs(ground[nk] - ground[k]) / (Math.hypot(di, dj) * CELL);
        const c = cost[k] + Math.hypot(di, dj) * CELL * (1 + 2 * climb);
        if (c >= cost[nk]) continue;
        cost[nk] = c;
        prev[nk] = k;
        key[nk] = c + Math.hypot(xOf(nk) - gx, zOf(nk) - gz);
        push(nk);
      }
    }
  }
  if (reached < 0) return null;
  const cells: number[] = [];
  for (let k = reached; k >= 0; k = prev[k]) {
    cells.push(k);
    if (k === start) break;
  }
  cells.reverse();
  // Pulled straight: from each corner, on to the furthest point along it that a straight line reaches over ground a truck could be on.
  const clear = (p: number, q: number) => {
    const [ax, az, bx, bz] = [xOf(p), zOf(p), xOf(q), zOf(q)];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2));
    let h = ground[p];
    for (let i = 1; i < n; i++) {
      const [x, z] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
      h = world.height(x, z, h + 1);
      if (!standable(world, x, z, h, spec, room)) return false;
    }
    return true;
  };
  const way: Pt[] = [];
  for (let i = 0; i < cells.length - 1; ) {
    let j = Math.min(cells.length - 1, i + 60);
    while (j > i + 1 && !clear(cells[i], cells[j])) j--;
    way.push({ x: xOf(cells[j]), z: zOf(cells[j]) });
    i = j;
  }
  if (looked[goal] > 0 || !way.length) way.push({ x: b.x, z: b.z });
  return way;
}

/** The angle between going from `a` to `b` and from `b` to `c`. */
function turnAt(a: Pt, b: Pt, c: Pt) {
  const into = Math.atan2(b.x - a.x, b.z - a.z);
  const onto = Math.atan2(c.x - b.x, c.z - b.z);
  return Math.abs(Math.atan2(Math.sin(onto - into), Math.cos(onto - into)));
}

/** How far (x, z) is from the line from `a` to `b`. */
function offLine(a: Pt, b: Pt, x: number, z: number) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
}

/**
 * Drives a course the way a careful player would: from its line-up behind the start arch,
 * finding a way to each gate in turn round whatever is in the way, coming round to a
 * gate's right side first if it faces back the way the course came, easing off for the
 * bends, turning in three goes where it's tight, and backing off and finding another way
 * when something stops it anyway. A course it can't get round in `limit` seconds has
 * something wrong with it: a gate nobody can get to, a wall across the street, water too
 * deep, a slope too steep. A course on the sandbar is driven with the tide out.
 */
export function driveCourse(world: World, m: Mission, spec: CarSpec, limit = 420, watch?: (car: Car, t: number) => void): BotRun {
  if (m.ebb !== undefined) world.setTide(TIDE.fall);
  const at = lineUpAlone(m);
  const car = makeCar(world, at.x, at.z, at.heading, spec);
  // Where a bridge crosses over, whichever surface is under the truck, as Game.tsx has it.
  const ground: Ground = {
    height: (x, z) => world.height(x, z, car.y - spec.ride - 0.5),
    waterAt: (x, z) => world.waterAt(x, z),
    slipAt: (x, z) => world.slipAt(x, z),
    obstaclesNear: (x, z) => world.obstaclesNear(x, z),
    limit: world.limit,
    square: world.square,
    pavedAt: (x, z) => world.pavedAt?.(x, z) ?? false,
  };
  const run = startRun(m);
  run.clock = 0;
  const input: Input = { left: false, right: false, gas: false, brake: false };
  let t = 0;
  let plans = 0;
  const result = (why: string | null): BotRun => ({ name: m.name, passed: run.next, of: m.gates.length, seconds: t, stuck: why ? { x: car.x, z: car.z, why } : null, plans });
  /** Where it's heading for: the next gate, and before it, if that gate faces this way, round to its far side. */
  let target: Pt = m.gates[0];
  let rounding = false;
  let way: Pt[] = [];
  let k = 0;
  let from = { x: car.x, z: car.z };
  /** A way to the next gate from here; or, `comeRound` and if it faces this way, first round to its far side. */
  const plan = (comeRound = true) => {
    plans++;
    const g = m.gates[run.next];
    const fx = Math.sin(g.heading);
    const fz = Math.cos(g.heading);
    const behind = (car.x - g.x) * fx + (car.z - g.z) * fz;
    const round = { x: g.x - fx * 10, z: g.z - fz * 10 };
    rounding = comeRound && behind > -1.5 && Math.hypot(car.x - g.x, car.z - g.z) < 40 && standable(world, round.x, round.z, world.height(round.x, round.z, car.y - spec.ride + 1), spec, spec.radius + 0.2);
    target = rounding ? round : g;
    const at = { x: car.x, z: car.z, y: car.y - spec.ride };
    const found = wayThrough(world, at, target, spec) ?? wayThrough(world, at, target, spec, 110);
    way = found ?? [];
    k = 0;
    from = { x: car.x, z: car.z };
    return found !== null;
  };
  if (!plan()) return result(`no way through to gate 1`);
  let check = { x: car.x, z: car.z, t: 0 };
  let backing = 0;
  /** Whether the backing off is because something stopped it, and so wants a new way after. */
  let blocked = false;
  let tries = 0;
  while (t < limit) {
    const g = m.gates[run.next];
    while (k < way.length - 1 && Math.hypot(way[k].x - car.x, way[k].z - car.z) < LOOK) from = way[k++];
    const aim = way[k];
    const want = Math.atan2(aim.x - car.x, aim.z - car.z);
    const off = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
    const ahead = Math.hypot(aim.x - car.x, aim.z - car.z);
    // Round to the gate's far side: now through it.
    if (rounding && Math.hypot(target.x - car.x, target.z - car.z) < 4 && !plan(false)) return result(`no way through to gate ${run.next + 1}`);
    if (plans > 20 + m.gates.length * PLANS_A_GATE) return result(`lost its way to gate ${run.next + 1}`);
    if (backing > 0) {
      // Back off with the wheel the other way, to come at it again from a new angle.
      backing -= DT;
      Object.assign(input, { gas: false, brake: true, left: off < 0, right: off > 0 });
      if (backing <= 0 && blocked && !plan()) return result(`no way on to gate ${run.next + 1}`);
    } else if (ahead < 7 && Math.abs(off) > 1.3 && Math.abs(car.speed) < 4) {
      // Too tight to make going forward: the second go of a three-point turn.
      backing = 1;
      blocked = false;
    } else {
      // Slower for a corner coming up, the sharper the slower, and into a gate the course turns hard at.
      let bend = Math.abs(off);
      if (way[k + 1] && ahead < 24) bend = Math.max(bend, turnAt(car, aim, way[k + 1]) * (1 - ahead / 30));
      const next = m.gates[run.next + 1];
      if (!rounding && next && Math.hypot(g.x - car.x, g.z - car.z) < 18) bend = Math.max(bend, turnAt(car, g, next));
      const easy = bend > 1.4 ? 3 : bend > 0.8 ? 6 : bend > 0.4 ? 10 : Infinity;
      Object.assign(input, { gas: car.speed < easy, brake: car.speed > easy + 2.5, left: off > 0.03, right: off < -0.03 });
    }
    const was = { x: car.x, z: car.z };
    step(car, input, DT, ground, spec);
    watch?.(car, t);
    t += DT;
    const event = tick(run, DT, was, car, car.grounded);
    if (event?.kind === "finish") return result(null);
    if (event?.kind === "lost") return result(`lost the way to gate ${run.next + 1}`);
    if (car.stuck) return result("hung up on a boulder");
    if (event?.kind === "gate") {
      tries = 0;
      if (!plan()) return result(`no way through to gate ${run.next + 1}`);
    } else if (backing <= 0 && offLine(from, aim, car.x, car.z) > 12 && !plan()) {
      // Slid off its way: find another from where it is.
      return result(`no way on to gate ${run.next + 1}`);
    }
    // Every couple of seconds: has it got anywhere?
    if (t - check.t > 2.5) {
      if (backing <= 0 && Math.hypot(car.x - check.x, car.z - check.z) < 2) {
        if (++tries > 8) return result(`blocked short of gate ${run.next + 1}`);
        backing = 1.5;
        blocked = true;
      }
      check = { x: car.x, z: car.z, t };
    }
  }
  return result(`out of time short of gate ${run.next + 1}`);
}

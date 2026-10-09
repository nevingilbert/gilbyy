import { fieldDist } from "./airport";
import { makeRandom } from "./noise";
import { sampleGrid, WORLD, type World, type WorldId } from "./world";

/**
 * The animals (ADR 0015). In the valley, deer in the meadows along the forest edges, hares
 * out on the open grass, reindeer up on the snow and ducks on the lakes. On the island,
 * crabs and gulls on the beach, wild boar and macaws where the dunes give way to the
 * jungle, and dolphins out at sea.
 *
 * Birds fly low. The chase camera is about 8.5 m over the truck looking down, so anything
 * higher than that is never on screen.
 *
 * They're scenery that notices you. Each herd grazes and wanders about its home, and gets
 * out of the way of trucks and the train: the faster something comes, the sooner they
 * go, so a truck crept up to a herd and parked can watch it. Nothing hits them and they
 * hit nothing, they cost and pay nothing, and they aren't shared: every browser starts
 * them in the same places and after that each has its own.
 *
 * Pure data and functions, no three.js. Only herds near the truck are moved.
 */
export type SpeciesId = "deer" | "hare" | "reindeer" | "duck" | "crab" | "gull" | "boar" | "macaw" | "dolphin";

/**
 * How a species gets about:
 * - `walk`: on its feet. Grazes, follows its herd about, and runs from trucks.
 * - `perch`: a bird that sits on the ground or the water and flies off when a truck
 *   comes near, circling until it settles somewhere else.
 * - `soar`: always in the air, on a low loop over home. Pays trucks no mind.
 * - `swim`: out at sea on a loop, leaping now and then. Pays trucks no mind.
 */
export type Way = "walk" | "perch" | "soar" | "swim";

export type Species = {
  world: WorldId;
  way: Way;
  /** How many herds there are at most, and how many in each. */
  herds: number;
  size: readonly [number, number];
  /** How far apart herds' homes are at least, how far a herd strays from home, and how close it keeps together. */
  apart: number;
  range: number;
  spread: number;
  /** Walking and running speeds, m/s. A bird's run is its speed in the air. */
  walk: number;
  run: number;
  /** How close a truck can come before it goes: `calm` for a parked one, `wary` at speed. */
  calm: number;
  wary: number;
  /** How long it stands grazing, at least and at most, in seconds. */
  graze: readonly [number, number];
  /** How wide it is, for keeping out of trees, and how deep it will wade. */
  radius: number;
  wade: number;
  /** How far one stride or wingbeat carries it, in metres. */
  stride: number;
  /** How far it lowers its head to graze, in radians. */
  drop: number;
  /** How far away it's drawn. Past this the haze has it, or it's too small to see. */
  see: number;
  /** A bird: how high it flies, and for how long before it settles again. */
  cruise?: number;
  flight?: readonly [number, number];
  /** It sits on the water, not the ground. */
  water?: boolean;
  /** It keeps to the sand. */
  sand?: boolean;
  /** A crab digs itself into the sand when a truck comes this close. */
  hide?: number;
};

export const SPECIES: Record<SpeciesId, Species> = {
  deer: {
    world: "valley", way: "walk", herds: 80, size: [3, 6], apart: 160, range: 70, spread: 9,
    walk: 1.1, run: 10, calm: 14, wary: 48, graze: [4, 12], radius: 0.45, wade: 0.7, stride: 1.5, drop: 1.75, see: 280,
  },
  hare: {
    world: "valley", way: "walk", herds: 110, size: [1, 2], apart: 80, range: 40, spread: 4,
    walk: 0.9, run: 11, calm: 7, wary: 24, graze: [3, 9], radius: 0.2, wade: 0.15, stride: 0.9, drop: 0.4, see: 140,
  },
  reindeer: {
    world: "valley", way: "walk", herds: 20, size: [4, 8], apart: 180, range: 90, spread: 12,
    walk: 1, run: 8.5, calm: 14, wary: 42, graze: [5, 14], radius: 0.5, wade: 0.7, stride: 1.4, drop: 1.7, see: 300,
  },
  duck: {
    world: "valley", way: "perch", herds: 16, size: [3, 6], apart: 70, range: 60, spread: 5,
    walk: 0.35, run: 13, calm: 18, wary: 34, graze: [3, 8], radius: 0.2, wade: 0, stride: 0.4, drop: 1.2, see: 180,
    cruise: 7, flight: [8, 16], water: true,
  },
  crab: {
    world: "island", way: "walk", herds: 100, size: [2, 4], apart: 45, range: 25, spread: 6,
    walk: 0.5, run: 3.2, calm: 4.5, wary: 13, graze: [1.5, 5], radius: 0.25, wade: 0.3, stride: 0.4, drop: 0, see: 110,
    sand: true, hide: 6,
  },
  gull: {
    world: "island", way: "perch", herds: 32, size: [5, 10], apart: 140, range: 70, spread: 7,
    walk: 0.4, run: 9, calm: 10, wary: 30, graze: [2, 7], radius: 0.2, wade: 0.15, stride: 0.35, drop: 0.7, see: 200,
    cruise: 6, flight: [10, 20], sand: true,
  },
  boar: {
    world: "island", way: "walk", herds: 30, size: [2, 4], apart: 150, range: 60, spread: 6,
    walk: 0.8, run: 7, calm: 9, wary: 28, graze: [4, 12], radius: 0.4, wade: 0.4, stride: 0.9, drop: 0.55, see: 220,
  },
  macaw: {
    world: "island", way: "soar", herds: 16, size: [2, 3], apart: 220, range: 90, spread: 3,
    walk: 0, run: 9, calm: 0, wary: 0, graze: [0, 0], radius: 0.3, wade: 0, stride: 2.2, drop: 0, see: 200,
    cruise: 5,
  },
  dolphin: {
    world: "island", way: "swim", herds: 9, size: [2, 4], apart: 400, range: 90, spread: 5,
    walk: 0, run: 6.5, calm: 0, wary: 0, graze: [0, 0], radius: 0.4, wade: 0, stride: 3, drop: 0, see: 420,
  },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
export const speciesIn = (world: WorldId) => SPECIES_IDS.filter((id) => SPECIES[id].world === world);

export type AnimalState = "graze" | "walk" | "flee" | "hide" | "fly" | "land";

export type Animal = {
  species: SpeciesId;
  /** Where its feet are: on the ground, on the water, or for a bird in flight, in the air. */
  x: number;
  y: number;
  z: number;
  /** The way it's going (0 is +z, as for a truck), and its nose up from level. A crab goes sideways, so it faces a quarter turn off this. */
  heading: number;
  pitch: number;
  speed: number;
  state: AnimalState;
  /** Seconds left in this state. */
  timer: number;
  /** Where it's going. */
  tx: number;
  tz: number;
  /** Its head, from 0 up to 1 down grazing. */
  head: number;
  /** Where its legs or wings are in their cycle, in radians. */
  stride: number;
  /** A crab's dug in, 0 to 1; a bird's wings are spread, 0 folded to 1. */
  tuck: number;
  /** For telling one from another: its coat and its size. */
  tone: number;
  scale: number;
  /** Where it is on a loop, for one that soars or swims. */
  phase: number;
};

export type Herd = {
  species: SpeciesId;
  home: { x: number; z: number };
  /** Where the herd is gathering just now. It drifts about home. */
  focus: { x: number; z: number };
  /** Seconds until the focus moves on. */
  drift: number;
  /** A loop's radius, for a herd that soars or swims. */
  loop: number;
  animals: Animal[];
  /** Whether a truck is near enough for it to be moved and drawn. */
  active: boolean;
  rand: () => number;
};

/** Something that frightens animals: a truck, or a carriage of the train. */
export type Threat = { x: number; z: number; speed: number; heading: number };

/** Herds within this of the truck (plus how far they stray) are moved; the rest wait where they are. */
export const ACTIVE = 320;
/** At this speed and faster, a truck sends animals off from as far as they'll ever go. */
export const ALARM_SPEED = 12;
/** A herd-mate this close running sets the rest off too. */
const ALARM_SPREAD = 40;
/** How long a fright lasts after the last of what caused it. */
const FLEE_FOR = 2.5;
/** How long a crab stays dug in after the last truck has gone by. */
const HIDE_FOR = 2;
/** How far a running animal looks ahead for water, cliffs and fences. */
const LOOK_AHEAD = 0.6;
/** The headings it tries, in turn, when the way ahead is blocked. */
const DETOURS = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI];

const TAU = Math.PI * 2;
const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const turnToward = (from: number, to: number, max: number) => {
  const d = angleTo(from, to);
  return from + Math.max(-max, Math.min(max, d));
};
const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/** How far off a truck going at `speed` sends this species running. */
export const reach = (sp: Species, speed: number) => sp.calm + (sp.wary - sp.calm) * Math.min(1, Math.abs(speed) / ALARM_SPEED);

function steep(world: World, x: number, z: number) {
  const dx = world.height(x + 2, z) - world.height(x - 2, z);
  const dz = world.height(x, z + 2) - world.height(x, z - 2);
  return Math.hypot(dx, dz) / 4;
}

/** The ground or the water, whichever is higher: where something sitting on it is. */
const surface = (world: World, x: number, z: number) => Math.max(world.height(x, z), world.waterAt(x, z));

/** Whether an animal of this species can go to (x, z): not into deep water, up a cliff, onto a camp, a yard or a runway. */
export function passable(world: World, id: SpeciesId, x: number, z: number) {
  const sp = SPECIES[id];
  if (Math.hypot(x, z) > world.limit - 150) return false;
  const y = world.height(x, z);
  const depth = world.waterAt(x, z) - y;
  if (sp.water) return depth > 0.8 && Math.abs(world.waterAt(x, z) - WORLD.water) < 0.01 && sampleGrid(world.ice, x, z) < 0.02;
  if (depth > sp.wade) return false;
  if (sp.sand && (y > 3.6 || sampleGrid(world.forest, x, z) > 0.05)) return false;
  if (steep(world, x, z) > 0.65) return false;
  return sampleGrid(world.campDist, x, z) > 6 && sampleGrid(world.siteDist, x, z) > 26 && fieldDist(world.airport, x, z) > 30;
}

/** Whether a herd of this species could make its home at (x, z). Stricter than `passable`, and clear of everything players drive to. */
export function habitat(world: World, id: SpeciesId, x: number, z: number) {
  const sp = SPECIES[id];
  if (sp.world !== world.id) return false;
  const at = (f: Float32Array) => sampleGrid(f, x, z);
  // Gulls don't mind a camp; they hang about the beach in front of it.
  const clear =
    at(world.campDist) > (id === "gull" ? 22 : 40) && at(world.siteDist) > 45 && at(world.roadDist) > 12 && at(world.trackDist) > 12 &&
    at(world.courseDist) > 10 && fieldDist(world.airport, x, z) > 80 && Math.hypot(x, z) < world.limit - 400;
  if (!clear) return false;
  const y = world.height(x, z);
  const dry = world.waterAt(x, z) < y - 1;
  const forest = at(world.forest);
  const slope = steep(world, x, z);
  switch (id) {
    case "deer":
      return dry && slope < 0.4 && y < 180 && at(world.snow) < 0.1 && forest > 0.04 && forest < 0.7;
    case "hare":
      return dry && slope < 0.3 && y < 180 && at(world.snow) < 0.05 && forest < 0.2;
    case "reindeer":
      return dry && slope < 0.45 && at(world.snow) > 0.8 && at(world.ice) < 0.02;
    case "duck": {
      const depth = world.waterAt(x, z) - y;
      return passable(world, id, x, z) && depth > 2.5 && depth < 9;
    }
    case "crab":
      return y > 0.35 && y < 1.6 && forest < 0.02 && slope < 0.2;
    case "gull":
      return y > 0.6 && y < 3 && forest < 0.02 && slope < 0.15;
    case "boar":
      return y > 3 && forest > 0.2 && forest < 0.75 && slope < 0.4;
    case "macaw":
      return y > 3 && forest > 0.3 && forest < 0.75;
    case "dolphin": {
      if (!world.sea || y > -4) return false;
      // Close enough in to see from the beach, with the whole loop out where it's deep enough to leap.
      const r = Math.hypot(x, z);
      if (world.height((x * (r - 330)) / r, (z * (r - 330)) / r) < 0) return false;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        if (world.height(x + Math.cos(a) * sp.range, z + Math.sin(a) * sp.range) > -2) return false;
      }
      return true;
    }
  }
}

function makeHerd(world: World, id: SpeciesId, x: number, z: number, rand: () => number): Herd {
  const sp = SPECIES[id];
  const n = sp.size[0] + Math.floor(rand() * (sp.size[1] - sp.size[0] + 1));
  const looping = sp.way === "soar" || sp.way === "swim";
  // A pod or a pair keeps close together round its loop.
  const start = rand() * TAU;
  const animals: Animal[] = [];
  for (let i = 0; i < n; i++) {
    let [ax, az] = [x, z];
    for (let k = 0; k < 8 && !looping; k++) {
      const a = rand() * TAU;
      const r = Math.sqrt(rand()) * sp.spread;
      const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
      if (passable(world, id, px, pz)) {
        [ax, az] = [px, pz];
        break;
      }
    }
    const grazing = rand() < 0.6;
    animals.push({
      species: id, x: ax, y: surface(world, ax, az), z: az, heading: rand() * TAU, pitch: 0, speed: 0,
      state: "graze", timer: rand() * sp.graze[1], tx: ax, tz: az, head: grazing && sp.drop > 0 ? 1 : 0,
      stride: rand() * TAU, tuck: 0, tone: rand(), scale: 0.88 + rand() * 0.24, phase: start - i * (0.05 + rand() * 0.04),
    });
  }
  return {
    species: id, home: { x, z }, focus: { x, z }, drift: 10 + rand() * 30,
    loop: looping ? sp.range * (0.65 + rand() * 0.35) : 0,
    animals, active: false, rand: makeRandom(Math.floor(rand() * 2 ** 31)),
  };
}

/**
 * The spot in front of the camp, in the opening shot, where a herd of this species is
 * put first: the deer in the meadow below the valley's camp, the dolphins and the gulls
 * off the island's beach. Null if there's nowhere.
 */
function inView(world: World, id: SpeciesId) {
  const { x, z, heading } = world.camp;
  const [fx, fz] = [Math.sin(heading), Math.cos(heading)];
  const ahead = id === "gull" ? [36, 42, 48] : Array.from({ length: 45 }, (_, k) => 80 + k * 10);
  const aside = id === "gull" ? [0, 40, -40, 80, -80, 120, -120] : [0, 30, -30, 60, -60, 90, -90];
  for (const d of ahead)
    for (const s of aside) {
      const p = { x: x + fx * d + fz * s, z: z + fz * d - fx * s };
      if (habitat(world, id, p.x, p.z)) return p;
    }
  return null;
}

/** Which herds start in view of the camp, so the opening shot has something in it. */
const SHOWCASE: Record<WorldId, SpeciesId[]> = { valley: ["deer"], island: ["dolphin", "gull"] };

/** Every herd in a world, at home. Deterministic, so every browser starts them in the same places. */
export function placeHerds(world: World, seed = 20261009): Herd[] {
  const rand = makeRandom(seed + (world.id === "island" ? 77 : 33));
  const herds: Herd[] = [];
  const crowded = (id: SpeciesId, x: number, z: number) =>
    herds.some((h) => h.species === id && Math.hypot(h.home.x - x, h.home.z - z) < SPECIES[id].apart);
  for (const id of SHOWCASE[world.id]) {
    const p = inView(world, id);
    if (p) herds.push(makeHerd(world, id, p.x, p.z, rand));
  }
  const span = world.limit * 2;
  for (const id of speciesIn(world.id)) {
    const sp = SPECIES[id];
    let count = herds.filter((h) => h.species === id).length;
    for (let tries = 0; tries < sp.herds * 400 && count < sp.herds; tries++) {
      const x = (rand() - 0.5) * span;
      const z = (rand() - 0.5) * span;
      if (!habitat(world, id, x, z) || crowded(id, x, z)) continue;
      herds.push(makeHerd(world, id, x, z, rand));
      count++;
    }
  }
  return herds;
}

/** The most frightening threat in reach of an animal, and how far off it is; null if none. */
function scariest(a: Animal, sp: Species, threats: readonly Threat[], slack = 1) {
  let worst: Threat | null = null;
  let most = 1;
  for (const t of threats) {
    const k = Math.hypot(a.x - t.x, a.z - t.z) / (reach(sp, t.speed) * slack);
    if (k < most) {
      most = k;
      worst = t;
    }
  }
  return worst;
}

/**
 * The way to run from a threat: away from it, and if it's coming this way, off to the side
 * of its path as well, so even a truck that's faster than the animal goes by.
 */
export function fleeHeading(a: Animal, t: Threat) {
  const [ax, az] = [a.x - t.x, a.z - t.z];
  const d = Math.hypot(ax, az) || 1;
  let [fx, fz] = [ax / d, az / d];
  const going = Math.sign(t.speed);
  const [tx, tz] = [Math.sin(t.heading) * going, Math.cos(t.heading) * going];
  const coming = fx * tx + fz * tz;
  if (Math.abs(t.speed) > 1 && coming > 0) {
    // The side of its path the animal is on; dead ahead, whichever it favours.
    const across = tz * ax - tx * az;
    const side = Math.abs(across) > 0.3 ? Math.sign(across) : a.tone < 0.5 ? 1 : -1;
    fx += tz * side * coming * 1.5;
    fz += -tx * side * coming * 1.5;
  }
  return Math.atan2(fx, fz);
}

/** Moves an animal on its feet (or a bird on the water) toward `want`, round anything in the way. */
function go(world: World, a: Animal, sp: Species, want: number, speed: number, turn: number, dt: number) {
  // Look ahead along the way it wants to go; if that's blocked, try either side of it.
  const look = Math.max(2, speed * LOOK_AHEAD);
  let ok = false;
  for (const off of DETOURS) {
    const h = want + off;
    if (passable(world, a.species, a.x + Math.sin(h) * look, a.z + Math.cos(h) * look)) {
      want = h;
      ok = true;
      break;
    }
  }
  if (!ok) speed = 0;
  a.heading = turnToward(a.heading, want, turn * dt);
  a.speed = ease(a.speed, speed, speed > a.speed ? 3 : 4, dt);
  const [nx, nz] = [a.x + Math.sin(a.heading) * a.speed * dt, a.z + Math.cos(a.heading) * a.speed * dt];
  if (!passable(world, a.species, nx, nz)) {
    a.speed = 0;
    return;
  }
  a.x = nx;
  a.z = nz;
  // Round trees and boulders rather than through them.
  if (!sp.water)
    for (const o of world.obstaclesNear(a.x, a.z)) {
      if (o.h < 0.5) continue;
      const [dx, dz] = [a.x - o.x, a.z - o.z];
      const d = Math.hypot(dx, dz);
      const min = o.r + sp.radius;
      if (d < min && d > 1e-6) {
        a.x = o.x + (dx / d) * min;
        a.z = o.z + (dz / d) * min;
      }
    }
  a.stride = (a.stride + ((a.speed * dt) / sp.stride) * TAU) % TAU;
}

/** Picks somewhere near the herd's focus to wander to next. */
function wander(world: World, h: Herd, a: Animal, sp: Species) {
  for (let k = 0; k < 4; k++) {
    const ang = h.rand() * TAU;
    const r = Math.sqrt(h.rand()) * sp.spread;
    const [x, z] = [h.focus.x + Math.cos(ang) * r, h.focus.z + Math.sin(ang) * r];
    if (passable(world, a.species, x, z)) {
      a.tx = x;
      a.tz = z;
      a.state = "walk";
      a.timer = Math.hypot(x - a.x, z - a.z) / sp.walk + 5;
      return;
    }
  }
  a.state = "graze";
  a.timer = sp.graze[0];
}

/** Moves the herd's focus on a little, drawn back home if it has strayed. */
function drift(world: World, h: Herd, sp: Species) {
  for (let k = 0; k < 6; k++) {
    const ang = h.rand() * TAU;
    const r = 10 + h.rand() * 25;
    let [x, z] = [h.focus.x + Math.cos(ang) * r, h.focus.z + Math.sin(ang) * r];
    const out = Math.hypot(x - h.home.x, z - h.home.z);
    if (out > sp.range) {
      x = h.home.x + ((x - h.home.x) * sp.range) / out;
      z = h.home.z + ((z - h.home.z) * sp.range) / out;
    }
    if (passable(world, h.species, x, z)) {
      h.focus = { x, z };
      return;
    }
  }
  h.focus = { ...h.home };
}

/** Sets a herd running: every one near enough to see `from` go runs the same way. */
function alarm(h: Herd, from: Animal, heading: number) {
  for (const b of h.animals) {
    if (b === from || b.state === "flee" || b.state === "hide") continue;
    if (Math.hypot(b.x - from.x, b.z - from.z) > ALARM_SPREAD) continue;
    b.state = "flee";
    b.timer = FLEE_FOR;
    b.tx = b.x + Math.sin(heading) * 40;
    b.tz = b.z + Math.cos(heading) * 40;
  }
}

function stepWalker(world: World, h: Herd, a: Animal, sp: Species, threats: readonly Threat[], dt: number) {
  const fright = scariest(a, sp, threats);
  if (fright && sp.hide && Math.hypot(a.x - fright.x, a.z - fright.z) < sp.hide) {
    a.state = "hide";
    a.timer = HIDE_FOR;
  } else if (fright && a.state !== "hide") {
    const away = fleeHeading(a, fright);
    if (a.state !== "flee") alarm(h, a, away);
    a.state = "flee";
    a.timer = FLEE_FOR;
    a.tx = a.x + Math.sin(away) * 40;
    a.tz = a.z + Math.cos(away) * 40;
  }
  a.timer -= dt;
  switch (a.state) {
    case "hide": {
      a.speed = 0;
      a.tuck = Math.min(1, a.tuck + dt * 3);
      // Stays down until nothing's been near for a moment.
      if (threats.some((t) => Math.hypot(a.x - t.x, a.z - t.z) < (sp.hide ?? 0) * 2.2)) a.timer = HIDE_FOR;
      if (a.timer <= 0) {
        a.state = "graze";
        a.timer = sp.graze[0];
      }
      break;
    }
    case "flee": {
      a.head = ease(a.head, 0, 8, dt);
      go(world, a, sp, Math.atan2(a.tx - a.x, a.tz - a.z), sp.run, 6, dt);
      if (a.timer <= 0) {
        // Calm again, it gathers the herd where it's got to, and they drift home from there.
        if (Math.hypot(h.focus.x - a.x, h.focus.z - a.z) > sp.spread * 3) h.focus = { x: a.x, z: a.z };
        h.drift = 15 + h.rand() * 20;
        a.state = "graze";
        a.timer = sp.graze[0] + h.rand() * 2;
      }
      break;
    }
    case "walk": {
      a.head = ease(a.head, 0, 3, dt);
      const d = Math.hypot(a.tx - a.x, a.tz - a.z);
      go(world, a, sp, Math.atan2(a.tx - a.x, a.tz - a.z), d < 2 ? sp.walk * 0.5 : sp.walk, 2, dt);
      if (d < 0.8 || a.timer <= 0) {
        a.state = "graze";
        a.timer = sp.graze[0] + h.rand() * (sp.graze[1] - sp.graze[0]);
      }
      break;
    }
    case "graze": {
      a.speed = ease(a.speed, 0, 4, dt);
      a.head = ease(a.head, sp.drop > 0 && a.timer > 1 ? 1 : 0, 2.5, dt);
      if (a.timer <= 0) wander(world, h, a, sp);
      break;
    }
  }
  if (a.state !== "hide") a.tuck = Math.max(0, a.tuck - dt);
  // Its back follows the slope it's on.
  const len = sp.radius * 2;
  const [fx, fz] = [Math.sin(a.heading) * len, Math.cos(a.heading) * len];
  a.pitch = ease(a.pitch, Math.atan2(world.height(a.x + fx, a.z + fz) - world.height(a.x - fx, a.z - fz), len * 2), 6, dt);
  a.y = sp.water ? world.waterAt(a.x, a.z) : world.height(a.x, a.z);
}

/** Somewhere for a flock to settle, as far from the threat as can be found. */
function roost(world: World, h: Herd, sp: Species, from: Threat) {
  let best: { x: number; z: number } | null = null;
  let far = -1;
  for (let k = 0; k < 10; k++) {
    const ang = h.rand() * TAU;
    const r = Math.sqrt(h.rand()) * sp.range;
    const [x, z] = [h.home.x + Math.cos(ang) * r, h.home.z + Math.sin(ang) * r];
    if (!passable(world, h.species, x, z)) continue;
    const d = Math.hypot(x - from.x, z - from.z);
    if (d > far) {
      far = d;
      best = { x, z };
    }
  }
  return best ?? { ...h.home };
}

function takeOff(h: Herd, a: Animal, sp: Species) {
  a.state = "fly";
  const [lo, hi] = sp.flight ?? [10, 10];
  a.timer = lo + h.rand() * (hi - lo);
  // Off round the circle from where it is.
  a.phase = Math.atan2(a.z - h.focus.z, a.x - h.focus.x) + 0.6;
}

function stepPercher(world: World, h: Herd, a: Animal, sp: Species, threats: readonly Threat[], dt: number) {
  const cruise = sp.cruise ?? 10;
  const grounded = a.state === "graze" || a.state === "walk";
  const fright = grounded || a.state === "land" ? scariest(a, sp, threats) : null;
  if (fright) {
    // The whole flock goes up, and makes for somewhere away from whatever it was.
    h.focus = roost(world, h, sp, fright);
    for (const b of h.animals) if (b.state === "graze" || b.state === "walk" || b.state === "land") takeOff(h, b, sp);
  }
  a.timer -= dt;
  const below = surface(world, a.x, a.z);
  switch (a.state) {
    case "fly":
    case "land": {
      const flying = a.state === "fly";
      let want: number;
      let speed: number;
      let height: number;
      if (flying) {
        // Circles over where it means to settle.
        const ring = 18 + sp.spread + a.tone * 8;
        a.phase += (sp.run / ring) * dt;
        const [px, pz] = [h.focus.x + Math.cos(a.phase) * ring, h.focus.z + Math.sin(a.phase) * ring];
        want = Math.atan2(px - a.x, pz - a.z);
        speed = sp.run;
        height = below + cruise * (0.8 + a.tone * 0.4);
        if (a.timer <= 0) {
          a.state = "land";
          const ang = h.rand() * TAU;
          const r = Math.sqrt(h.rand()) * sp.spread;
          const [x, z] = [h.focus.x + Math.cos(ang) * r, h.focus.z + Math.sin(ang) * r];
          [a.tx, a.tz] = passable(world, a.species, x, z) ? [x, z] : [h.focus.x, h.focus.z];
        }
      } else {
        // Glides down to where it means to settle, and the last of the way drops onto it.
        const d = Math.hypot(a.tx - a.x, a.tz - a.z);
        if (d < 1.5 && a.y - below < 0.3) {
          a.state = "graze";
          a.timer = sp.graze[0] + h.rand() * (sp.graze[1] - sp.graze[0]);
          a.speed = 0;
          a.y = below;
          a.pitch = 0;
          break;
        }
        want = Math.atan2(a.tx - a.x, a.tz - a.z);
        speed = Math.max(0.6, Math.min(sp.run, d * 0.9));
        height = surface(world, a.tx, a.tz) + (d < 2 ? -0.5 : Math.min(cruise, d * 0.4));
      }
      a.heading = turnToward(a.heading, want, (flying ? 2.2 : 3.5) * dt);
      a.speed = ease(a.speed, speed, 2, dt);
      a.x += Math.sin(a.heading) * a.speed * dt;
      a.z += Math.cos(a.heading) * a.speed * dt;
      const climb = Math.max(-3, Math.min(4, (height - a.y) * 1.5));
      a.y = Math.max(surface(world, a.x, a.z), a.y + climb * dt);
      a.pitch = Math.atan2(climb, Math.max(1, a.speed)) * 0.6;
      a.tuck = Math.min(1, a.tuck + dt * 4);
      a.head = ease(a.head, 0, 6, dt);
      a.stride = (a.stride + ((a.speed * dt) / sp.stride) * TAU) % TAU;
      break;
    }
    case "walk":
    case "graze": {
      a.tuck = Math.max(0, a.tuck - dt * 2);
      if (a.state === "walk") {
        a.head = ease(a.head, 0, 3, dt);
        const d = Math.hypot(a.tx - a.x, a.tz - a.z);
        go(world, a, sp, Math.atan2(a.tx - a.x, a.tz - a.z), sp.walk, 2, dt);
        if (d < 0.5 || a.timer <= 0) {
          a.state = "graze";
          a.timer = sp.graze[0] + h.rand() * (sp.graze[1] - sp.graze[0]);
        }
      } else {
        a.speed = ease(a.speed, 0, 4, dt);
        a.head = ease(a.head, a.timer > 1 && a.tone > 0.3 ? 1 : 0, 3, dt);
        if (a.timer <= 0) wander(world, h, a, sp);
      }
      a.pitch = 0;
      a.y = sp.water ? world.waterAt(a.x, a.z) : world.height(a.x, a.z);
      break;
    }
  }
}

/** A macaw on its loop along the jungle's edge: where it is is a function of the time alone. */
export function soarAt(world: World, h: Herd, a: Animal, time: number) {
  const sp = SPECIES[a.species];
  const at = (t: number) => {
    const th = a.phase + (t * sp.run) / h.loop;
    // The loop breathes in and out, so it isn't a perfect circle.
    const r = h.loop * (1 + 0.22 * Math.sin(th * 2 + h.loop)) + (a.tone - 0.5) * 4;
    const [x, z] = [h.home.x + Math.cos(th) * r, h.home.z + Math.sin(th) * r];
    return { x, z, y: world.height(x, z) + (sp.cruise ?? 5) + 1.8 * Math.sin(th * 3 + a.tone * 6) };
  };
  const now = at(time);
  const next = at(time + 0.2);
  const run = Math.hypot(next.x - now.x, next.z - now.z);
  a.x = now.x;
  a.y = now.y;
  a.z = now.z;
  a.heading = Math.atan2(next.x - now.x, next.z - now.z);
  a.pitch = Math.atan2(next.y - now.y, run) * 0.7;
  a.speed = run / 0.2;
  // It flaps for a while, then glides.
  a.state = Math.sin(time * 0.6 + a.tone * 9) > -0.35 ? "fly" : "land";
  a.stride = ((time * sp.run) / sp.stride) * TAU + a.tone * 3;
  a.tuck = 1;
}

/** How often a dolphin leaps, in seconds, and for how much of that it's in the air. */
const LEAP_EVERY = 5.5;
const LEAP_SHARE = 0.17;
/** How high a leap goes, and how far under it swims between them. */
const LEAP_HIGH = 1.4;
const UNDER = 0.9;

/** A dolphin on its loop: under the surface, and every few seconds up out of it. A function of the time alone. */
export function swimAt(h: Herd, a: Animal, time: number) {
  const sp = SPECIES[a.species];
  const th = a.phase + (time * sp.run) / h.loop;
  const r = h.loop + (a.tone - 0.5) * 7;
  a.x = h.home.x + Math.cos(th) * r;
  a.z = h.home.z + Math.sin(th) * r;
  // Going anticlockwise round the loop: forward is (−sin, cos).
  a.heading = Math.atan2(-Math.sin(th), Math.cos(th));
  a.speed = sp.run;
  const cycle = time / LEAP_EVERY + a.tone * 0.35 + h.loop;
  const p = cycle - Math.floor(cycle);
  if (p < LEAP_SHARE) {
    const s = p / LEAP_SHARE;
    const rise = LEAP_HIGH + UNDER;
    a.y = WORLD.water - UNDER + 4 * rise * s * (1 - s);
    a.pitch = Math.atan2((4 * rise * (1 - 2 * s)) / (LEAP_SHARE * LEAP_EVERY), sp.run);
    a.state = "fly";
  } else {
    a.y = WORLD.water - UNDER + 0.15 * Math.sin(time * 1.3 + a.tone * 5);
    a.pitch = 0;
    a.state = "walk";
  }
  a.stride = ((time * sp.run) / sp.stride) * TAU;
}

/**
 * Moves every herd near `near` on by `dt`. Herds further off wait where they are, except
 * that macaws and dolphins, which go where the time says, are put there when they're next near.
 */
export function stepWildlife(world: World, herds: readonly Herd[], threats: readonly Threat[], near: { x: number; z: number }, dt: number, time: number) {
  for (const h of herds) {
    const sp = SPECIES[h.species];
    h.active = Math.hypot(h.home.x - near.x, h.home.z - near.z) < ACTIVE + sp.range + h.loop;
    if (!h.active) continue;
    if (sp.way === "soar") {
      for (const a of h.animals) soarAt(world, h, a, time);
      continue;
    }
    if (sp.way === "swim") {
      for (const a of h.animals) swimAt(h, a, time);
      continue;
    }
    if (dt <= 0) continue;
    if (!h.animals.some((a) => a.state === "flee" || a.state === "fly" || a.state === "land")) {
      h.drift -= dt;
      if (h.drift <= 0) {
        h.drift = 25 + h.rand() * 35;
        drift(world, h, sp);
      }
    }
    for (const a of h.animals) {
      if (sp.way === "walk") stepWalker(world, h, a, sp, threats, dt);
      else stepPercher(world, h, a, sp, threats, dt);
    }
  }
}

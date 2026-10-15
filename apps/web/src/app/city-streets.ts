/**
 * San Francisco's streets and ground, as baked from public-domain Census and USGS data
 * (scripts/bake-city.mjs, city-data.ts): reading them, and finding your way along them.
 * The city is drawn at 1:2.5 across, so a real longitude and latitude has a place on the
 * map (`toGame`), and so does a street corner (`corner`). See ADR 0022.
 *
 * The data is big enough to be fetched only for the city, so it's loaded once with
 * `loadCityData()` before the city is built. Pure, no three.js.
 */
import { HALF, ROW } from "./terrain";

/** Where the middle of the map is, and how much smaller than life the city is drawn across. Must match city-data.ts's CITY_FRAME. */
export const CITY_FRAME = { lon0: -122.43575, lat0: 37.77075, scale: 2.5, metresPerLon: 88117, metresPerLat: 110992 } as const;

/** A real place's spot on the map. North is −z, as everywhere in the game. */
export const toGame = (lon: number, lat: number) => ({
  x: ((lon - CITY_FRAME.lon0) * CITY_FRAME.metresPerLon) / CITY_FRAME.scale,
  z: (-(lat - CITY_FRAME.lat0) * CITY_FRAME.metresPerLat) / CITY_FRAME.scale,
});

/**
 * What a street is: 0 an alley or a service road, 1 an ordinary street, 2 a busy one,
 * 3 a boulevard, 4 a bridge's deck.
 */
export type StreetClass = 0 | 1 | 2 | 3 | 4;
/** Each class's paved width in metres, kerb to kerb. Streets are drawn full size; the blocks between them shrink. */
export const STREET_WIDTH: Record<StreetClass, number> = { 0: 6, 1: 9, 2: 12, 3: 15, 4: 16 };
/** The pavement each side of a street, between the kerb and the buildings. Alleys and bridges have none. */
export const SIDEWALK = 1.6;
export const sidewalkOf = (cls: StreetClass) => (cls === 0 || cls === 4 ? 0 : SIDEWALK);

export type Street = { name: string; cls: StreetClass; xs: Float32Array; zs: Float32Array };
export type CityData = {
  /** Real elevation in metres at each grid vertex. */
  elevation: Float32Array;
  /** At each grid vertex: 0 land, 1 the bay or the ocean, 2 a lake or a pond. */
  water: Uint8Array;
  streets: Street[];
};

let loaded: CityData | null = null;
let loading: Promise<CityData> | null = null;

/** Bytes from base64. */
const unbase64 = (s: string) => {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Deflated bytes, inflated: the browser's own decompression, so nothing to ship for it. */
async function inflate(packed: Uint8Array) {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(packed);
      c.close();
    },
  });
  const inflating = new DecompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>;
  return new Uint8Array(await new Response(source.pipeThrough(inflating)).arrayBuffer());
}

/** Reads the baked streets: the names, then each street's name, class and points (quarter metres). */
export function readStreets(bytes: Uint8Array): Street[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 4;
  const nameBytes = view.getUint32(o, true);
  o += 4;
  const names = new TextDecoder().decode(bytes.subarray(o, o + nameBytes)).split("\n");
  o += nameBytes;
  const count = view.getUint32(o, true);
  o += 4;
  const out: Street[] = [];
  for (let s = 0; s < count; s++) {
    const name = names[view.getUint16(o, true)];
    const cls = view.getUint8(o + 2) as StreetClass;
    const n = view.getUint16(o + 4, true);
    o += 6;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      xs[k] = view.getInt16(o, true) / 4;
      zs[k] = view.getInt16(o + 2, true) / 4;
      o += 4;
    }
    out.push({ name, cls, xs, zs });
  }
  return out;
}

/** Fetches and unpacks the city's ground and streets, once. The world can't be built until it has. */
export function loadCityData(): Promise<CityData> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= (async () => {
    const baked = await import("./city-data");
    const [heights, water, streets] = await Promise.all([baked.HEIGHTS, baked.WATER, baked.STREETS].map((s) => inflate(unbase64(s))));
    // Heights are quarter metres, each row as differences along it.
    const deltas = new Int16Array(heights.buffer, heights.byteOffset, ROW * ROW);
    const elevation = new Float32Array(ROW * ROW);
    for (let j = 0; j < ROW; j++) {
      let h = 0;
      for (let i = 0; i < ROW; i++) {
        h += deltas[j * ROW + i];
        elevation[j * ROW + i] = h / 4;
      }
    }
    loaded = { elevation, water: water.slice(0, ROW * ROW), streets: readStreets(streets) };
    return loaded;
  })();
  return loading;
}

/** The city's data if it has been loaded, or null. */
export const cityData = () => loaded;

/** Whether a spot is on the grid at all. */
export const onGrid = (x: number, z: number) => Math.abs(x) < HALF && Math.abs(z) < HALF;

// ——— Finding the way ———

export type Pt = { x: number; z: number };

/**
 * The streets as a network: a node wherever a street has a point, joined along each
 * street. The baked points are on a quarter-metre grid and streets meeting at a corner
 * share a point, so a corner is a node of each.
 */
export function streetGraph(streets: Street[]) {
  const ids = new Map<number, number>();
  const xs: number[] = [];
  const zs: number[] = [];
  const next: number[][] = [];
  /** Which streets pass through each node, by name. */
  const on: Set<string>[] = [];
  const node = (x: number, z: number) => {
    const key = Math.round(x * 4) * 100003 + Math.round(z * 4);
    let id = ids.get(key);
    if (id === undefined) {
      id = xs.length;
      ids.set(key, id);
      xs.push(x);
      zs.push(z);
      next.push([]);
      on.push(new Set());
    }
    return id;
  };
  for (const s of streets) {
    let prev = -1;
    for (let k = 0; k < s.xs.length; k++) {
      const id = node(s.xs[k], s.zs[k]);
      if (s.name) on[id].add(s.name);
      if (prev >= 0 && prev !== id) {
        next[prev].push(id);
        next[id].push(prev);
      }
      prev = id;
    }
  }
  const dist = (a: number, b: number) => Math.hypot(xs[a] - xs[b], zs[a] - zs[b]);

  /** Where two streets meet, by name: the corner nearest `near`, if there's more than one. Null if they don't. */
  const corner = (a: string, b: string, near?: Pt): Pt | null => {
    let best: Pt | null = null;
    let far = Infinity;
    for (let id = 0; id < xs.length; id++) {
      if (!on[id].has(a) || !on[id].has(b)) continue;
      const d = near ? Math.hypot(xs[id] - near.x, zs[id] - near.z) : 0;
      if (d < far) {
        far = d;
        best = { x: xs[id], z: zs[id] };
      }
    }
    return best;
  };

  /** The nearest node to a spot. */
  const nearestNode = (p: Pt) => {
    let best = 0;
    let far = Infinity;
    for (let id = 0; id < xs.length; id++) {
      const d = (xs[id] - p.x) ** 2 + (zs[id] - p.z) ** 2;
      if (d < far) {
        far = d;
        best = id;
      }
    }
    return best;
  };

  /** The shortest way along the streets from one spot to another, as the points of the streets it follows. */
  const path = (from: Pt, to: Pt): Pt[] => {
    const a = nearestNode(from);
    const b = nearestNode(to);
    const best = new Float64Array(xs.length).fill(Infinity);
    const back = new Int32Array(xs.length).fill(-1);
    best[a] = 0;
    // A binary heap of [distance, node].
    const heap: [number, number][] = [[0, a]];
    const push = (item: [number, number]) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
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
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, id] = pop();
      if (id === b) break;
      if (d > best[id]) continue;
      for (const n of next[id]) {
        const nd = d + dist(id, n);
        if (nd < best[n]) {
          best[n] = nd;
          back[n] = id;
          push([nd, n]);
        }
      }
    }
    if (a !== b && back[b] < 0) return [];
    const out: Pt[] = [];
    for (let id = b; id >= 0; id = back[id]) {
      out.push({ x: xs[id], z: zs[id] });
      if (id === a) break;
    }
    return out.reverse();
  };

  /** The way through each spot in turn. */
  const route = (stops: Pt[]) => {
    const out: Pt[] = [];
    for (let i = 1; i < stops.length; i++) {
      const leg = path(stops[i - 1], stops[i]);
      out.push(...(out.length ? leg.slice(1) : leg));
    }
    return out;
  };

  return { xs, zs, next, on, corner, nearestNode, path, route, size: () => xs.length };
}

export type StreetGraph = ReturnType<typeof streetGraph>;

/** Evenly spaced points along a line through `pts`, every `step` metres, ends included. */
export function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let at = step - carry;
    while (at <= len) {
      out.push({ x: a.x + ((b.x - a.x) * at) / len, z: a.z + ((b.z - a.z) * at) / len });
      at += step;
    }
    carry = len - (at - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) > step * 0.25) out.push(last);
  return out;
}

/** How long a line through `pts` is. */
export const lengthOf = (pts: Pt[]) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

import { resample, type Pt } from "./city-streets";
import { smoothstep } from "./noise";
import { CELL, FAR, HALF, ROW, WORLD, gridX, gridZ, nearest, sampleGrid, type Path } from "./terrain";

/**
 * Roads and routes over a drawn world's ground (Vegas, Japan: ADR 0023, 0024): smooth
 * lines through a few points, roads laid into the height grid on an even grade, and the
 * gentlest way a truck can drive from one spot to another, for laying courses over
 * rough ground. Pure, no three.js.
 */

/** A smooth path through control points (Catmull–Rom), as points every `step` metres or so. */
export function smoothPath(ctrl: readonly Pt[], step: number): Path {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [ctrl[Math.max(0, i - 1)], ctrl[i], ctrl[i + 1], ctrl[Math.min(ctrl.length - 1, i + 2)]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      xs.push(cr(p0.x, p1.x, p2.x, p3.x));
      zs.push(cr(p0.z, p1.z, p2.z, p3.z));
    }
  }
  const last = ctrl[ctrl.length - 1];
  xs.push(last.x);
  zs.push(last.z);
  return { xs, zs };
}

export const toPts = (p: Path): Pt[] => p.xs.map((x, i) => ({ x, z: p.zs[i] }));

/**
 * Lays a road into the ground: the heights along its line smoothed (its ends where they
 * are), held under `grade` either way, and the ground either side brought to it. Or, given
 * `profile`, the road's height `s` metres along it. Returns each grid point's distance from
 * its line, out to FAR.
 */
export function gradeRoad(heights: Float32Array, pts: Pt[], half: number, grade: number, smooth: number, profile?: (s: number) => number, wide = false) {
  const line = resample(pts, 5);
  const n = line.length;
  let y = line.map((p, i) => (profile ? profile(i * 5) : sampleGrid(heights, p.x, p.z)));
  if (!profile) {
    for (let it = 0; it < smooth; it++) {
      const next = y.slice();
      for (let i = 1; i < n - 1; i++) next[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
      y = next;
    }
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i - 1] - grade * 5, Math.min(y[i - 1] + grade * 5, y[i]));
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - grade * 5, Math.min(y[i + 1] + grade * 5, y[i]));
  }
  // `wide`: a bench wider than the road, so every grid triangle that touches the road is
  // level across it, however steep the ground beside: the grid is ten metres, a road nine wide.
  const [bench, blend] = wide ? [half + 5, half + 26] : [half + 2, half + 22];
  const near = nearest({ xs: line.map((p) => p.x), zs: line.map((p) => p.z) }, false, blend);
  for (let k = 0; k < heights.length; k++) {
    const d = near.dist[k];
    if (d >= FAR) continue;
    const i = Math.min(n - 1, Math.floor(near.at[k]));
    const t = near.at[k] - i;
    const yy = y[i] * (1 - t) + y[Math.min(n - 1, i + 1)] * t;
    heights[k] = yy + (heights[k] - yy) * smoothstep(bench, blend, d);
  }
  return near.dist;
}

/**
 * Eases the ground under roads where it's steeper along one than `grade`, rise over run,
 * moving as little of it as will do: gentler than `gradeRoad`, for a whole city of streets
 * of which only a few are too steep (ADR 0022). Each triangle of the grid a road crosses,
 * split as sampleGrid splits a cell, is brought back to `grade` along the road, its corners
 * moved toward one another, the high ones down and the low ones up; and again wherever that
 * tips another past it, until none is. A grid point `fixed` says is left where it is, and a
 * triangle whose middle isn't `within` is let be. Returns how many grid points moved.
 */
export function easeRoads(
  heights: Float32Array, roads: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; half: number }[], grade: number,
  fixed: (k: number) => boolean = () => false, within: (x: number, z: number) => boolean = () => true,
) {
  /** Whether a road's rectangle (its middle, its way, half its length and width) and a triangle are apart along (px, pz). */
  const apart = (px: number, pz: number, c: number, reach: number, xs: number[], zs: number[]) => {
    const [p, q, s] = [px * xs[0] + pz * zs[0], px * xs[1] + pz * zs[1], px * xs[2] + pz * zs[2]];
    return Math.max(p, q, s) < c - reach || Math.min(p, q, s) > c + reach;
  };
  /** The six triangles a grid point is a corner of. */
  const round = (k: number) => [2 * k, 2 * (k - 1), 2 * (k - 1) + 1, 2 * (k - ROW), 2 * (k - ROW) + 1, 2 * (k - ROW - 1) + 1];
  // A triangle is numbered twice its cell, and one more for the one with the cell's far
  // corner. Only one steeper than `grade` some way can be too steep along a road over it, and
  // few are: those, and later any that bringing them back tips past it.
  const most = (grade * CELL) ** 2;
  const steep = new Uint8Array(2 * ROW * ROW);
  for (let j = 0; j < ROW - 1; j++) {
    for (let i = 0; i < ROW - 1; i++) {
      const c = j * ROW + i;
      const a = heights[c];
      const b = heights[c + 1];
      const d = heights[c + ROW];
      const e = heights[c + ROW + 1];
      if ((b - a) ** 2 + (d - a) ** 2 > most) steep[2 * c] = 1;
      if ((e - d) ** 2 + (e - b) ** 2 > most) steep[2 * c + 1] = 1;
    }
  }
  /** Whether a triangle, if its cell is on the grid, is steeper some way than `grade`. */
  const tooSteep = (t: number) => {
    const c = t >> 1;
    if (t < 0 || c % ROW > ROW - 2 || c >= (ROW - 1) * ROW) return false;
    const gx = t & 1 ? heights[c + ROW + 1] - heights[c + ROW] : heights[c + 1] - heights[c];
    const gz = t & 1 ? heights[c + ROW + 1] - heights[c + 1] : heights[c + ROW] - heights[c];
    return gx * gx + gz * gz > most;
  };
  // Each of those a road crosses, and the ways along it, x then z, that the roads over it run.
  const along = new Map<number, number[]>();
  /** Adds the ways of the roads that cross the triangles `ts`; or, without, any steep one. */
  const cross = (ts: number[] | null) => {
    for (const r of roads) {
      for (let k = 1; k < r.xs.length; k++) {
        const [ax, az] = [r.xs[k - 1], r.zs[k - 1]];
        const len = Math.hypot(r.xs[k] - ax, r.zs[k] - az);
        if (len < 0.01) continue;
        const [ux, uz] = [(r.xs[k] - ax) / len, (r.zs[k] - az) / len];
        // The road's rectangle, a metre past each end: its middle, and half its length and width.
        const [cx, cz, hl, hw] = [ax + (ux * len) / 2, az + (uz * len) / 2, len / 2 + 1, r.half];
        const ex = Math.abs(ux) * hl + Math.abs(uz) * hw;
        const ez = Math.abs(uz) * hl + Math.abs(ux) * hw;
        const i0 = Math.max(0, Math.floor((cx - ex + HALF) / CELL));
        const i1 = Math.min(ROW - 2, Math.floor((cx + ex + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((cz - ez + HALF) / CELL));
        const j1 = Math.min(ROW - 2, Math.floor((cz + ez + HALF) / CELL));
        // How far the rectangle reaches across the cells' diagonals.
        const [cd, rd] = [cx + cz, Math.abs(ux + uz) * hl + Math.abs(uz - ux) * hw];
        const visit = (t: number, i: number, j: number) => {
          // The cells overlap it, so it's only apart from a triangle if a line between them
          // runs along the triangle's long side, or along the road, or across it.
          const side = t & 1;
          const [x0, z0] = [gridX(i), gridZ(j)];
          const d0 = x0 + z0 + side * CELL;
          if (d0 + CELL < cd - rd || d0 > cd + rd) return;
          const xs = side ? [x0 + CELL, x0, x0 + CELL] : [x0, x0 + CELL, x0];
          const zs = side ? [z0 + CELL, z0 + CELL, z0] : [z0, z0, z0 + CELL];
          if (apart(ux, uz, ux * cx + uz * cz, hl, xs, zs) || apart(uz, -ux, uz * cx - ux * cz, hw, xs, zs)) return;
          const m = side ? (2 * CELL) / 3 : CELL / 3;
          if (within(x0 + m, z0 + m)) (along.get(t) ?? along.set(t, []).get(t)!).push(ux, uz);
        };
        if (ts) {
          for (const t of ts) {
            const [i, j] = [(t >> 1) % ROW, Math.floor((t >> 1) / ROW)];
            if (i >= i0 && i <= i1 && j >= j0 && j <= j1) visit(t, i, j);
          }
          continue;
        }
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            for (let side = 0; side < 2; side++) if (steep[2 * (j * ROW + i) + side]) visit(2 * (j * ROW + i) + side, i, j);
          }
        }
      }
    }
  };
  // Whether each grid point may move, asked once, before it does: 0 not yet asked, 1 it may, 2 not.
  const may = new Uint8Array(ROW * ROW);
  const share = (k: number) => ((may[k] ||= fixed(k) ? 2 : 1) === 1 ? 1 : 0);
  const moved = new Uint8Array(ROW * ROW);
  const queued = new Uint8Array(2 * ROW * ROW);
  let count = 0;
  cross(null);
  let queue = [...along.keys()];
  for (let pass = 0; pass < 20 && queue.length; pass++) {
    for (const t of queue) queued[t] = 1;
    const touched: number[] = [];
    for (let q = 0, steps = 0; q < queue.length && steps < 1e6; q++) {
      const t = queue[q];
      queued[t] = 0;
      // Its corners, and what each one's height counts toward its slope along a way (ux, uz),
      // times CELL: the first corner's −(ux + uz), the next two's ux and uz; the other way
      // about for the triangle with the cell's far corner, which comes first.
      const c = t >> 1;
      const ks = t & 1 ? [c + ROW + 1, c + ROW, c + 1] : [c, c + 1, c + ROW];
      const sign = t & 1 ? -1 : 1;
      const ways = along.get(t)!;
      for (let d = 0; d < ways.length; d += 2) {
        const w = [-sign * (ways[d] + ways[d + 1]), sign * ways[d], sign * ways[d + 1]];
        const slope = (w[0] * heights[ks[0]] + w[1] * heights[ks[1]] + w[2] * heights[ks[2]]) / CELL;
        const over = Math.abs(slope) - grade;
        if (over <= 1e-5) continue;
        const free = ks.map(share);
        const sum = w[0] * w[0] * free[0] + w[1] * w[1] * free[1] + w[2] * w[2] * free[2];
        if (sum < 1e-9) continue;
        // Each corner that may move does, as much as it counts: the least that brings it back.
        const by = (Math.sign(slope) * over * CELL) / sum;
        steps++;
        for (let v = 0; v < 3; v++) {
          if (!free[v] || !w[v]) continue;
          const k = ks[v];
          heights[k] -= by * w[v];
          touched.push(k);
          if (!moved[k]) [moved[k], count] = [1, count + 1];
          for (const n of round(k)) {
            if (n >= 0 && !queued[n] && along.has(n)) {
              queued[n] = 1;
              queue.push(n);
            }
          }
        }
      }
    }
    // Round again for any triangle by what moved that it's tipped past `grade`, with a road over it.
    const tipped: number[] = [];
    for (const k of touched) {
      for (const t of round(k)) {
        if (steep[t] || !tooSteep(t)) continue;
        steep[t] = 1;
        tipped.push(t);
      }
    }
    if (!tipped.length) break;
    cross(tipped);
    queue = tipped.filter((t) => along.has(t));
  }
  return count;
}

/**
 * The cheapest way across the grid from one spot to another for a truck: no steeper than
 * `steep`, nowhere under `water` (each grid point's), and dearer the steeper it gets. As
 * flags along it, each as far from the last as `every` or as a straight line from the last
 * stays on ground the route could have taken. Null if there's no way.
 */
export function routeAcross(
  heights: Float32Array, water: Float32Array, from: Pt, to: Pt, steep: number, every: number,
  avoid: (x: number, z: number) => boolean = () => false,
): Pt[] | null {
  const idx = (p: Pt) => Math.round((p.z + HALF) / CELL) * ROW + Math.round((p.x + HALF) / CELL);
  const start = idx(from);
  const goal = idx(to);
  const cost = new Float32Array(ROW * ROW).fill(Infinity);
  const prev = new Int32Array(ROW * ROW).fill(-1);
  // A binary heap of grid points by cost so far plus the straight distance left.
  const heap: number[] = [];
  const key = new Float32Array(ROW * ROW);
  const push = (k: number) => {
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) {
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
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && key[heap[l]] < key[heap[m]]) m = l;
        if (r < heap.length && key[heap[r]] < key[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const gx = gridX(goal % ROW);
  const gz = gridZ(Math.floor(goal / ROW));
  cost[start] = 0;
  key[start] = Math.hypot(gridX(start % ROW) - gx, gridZ(Math.floor(start / ROW)) - gz);
  push(start);
  const done = new Uint8Array(ROW * ROW);
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    const i = k % ROW;
    const j = Math.floor(k / ROW);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 1 || nj < 1 || ni >= ROW - 1 || nj >= ROW - 1) continue;
        const nk = nj * ROW + ni;
        if (done[nk]) continue;
        const x = gridX(ni);
        const z = gridZ(nj);
        if (heights[nk] < water[nk] + 0.6 || Math.hypot(x, z) > WORLD.limit - 80 || avoid(x, z)) continue;
        const run = Math.hypot(di, dj) * CELL;
        // The worst slope round the point, not just along the step: a truck is wider than a line.
        const slope = Math.max(
          Math.abs(heights[nk] - heights[k]) / run,
          Math.abs(heights[nk + 1] - heights[nk - 1]) / (2 * CELL),
          Math.abs(heights[nk + ROW] - heights[nk - ROW]) / (2 * CELL),
        );
        if (slope > steep) continue;
        const c = cost[k] + run * (1 + (6 * slope * slope) / (steep * steep));
        if (c < cost[nk]) {
          cost[nk] = c;
          prev[nk] = k;
          key[nk] = c + Math.hypot(x - gx, z - gz);
          push(nk);
        }
      }
    }
  }
  if (!done[goal]) return null;
  const path: Pt[] = [];
  for (let k = goal; k !== -1; k = prev[k]) path.push({ x: gridX(k % ROW), z: gridZ(Math.floor(k / ROW)) });
  path.reverse();
  const ground = (x: number, z: number) => sampleGrid(heights, x, z);
  const fine = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const s = Math.hypot(ground(x + 3, z) - ground(x - 3, z), ground(x, z + 3) - ground(x, z - 3)) / 6;
      if (s > steep * 1.15 || ground(x, z) < sampleGrid(water, x, z) + 0.6 || avoid(x, z)) return false;
    }
    return true;
  };
  const flags: Pt[] = [path[0]];
  let last = 0;
  while (last < path.length - 1) {
    let next = last + 1;
    for (let m = last + 2; m < path.length; m++) {
      if (Math.hypot(path[m].x - path[last].x, path[m].z - path[last].z) > every) break;
      if (fine(path[last], path[m])) next = m;
    }
    flags.push(path[next]);
    last = next;
  }
  return flags;
}

/** The nearest level low ground to `p`, within `reach`: somewhere a course can turn among hills. */
export function lowNear(heights: Float32Array, p: Pt, reach: number, below: number): Pt {
  let best = p;
  let bestD = Infinity;
  for (let z = p.z - reach; z <= p.z + reach; z += CELL) {
    for (let x = p.x - reach; x <= p.x + reach; x += CELL) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > reach || d >= bestD) continue;
      const h = sampleGrid(heights, x, z);
      const s = Math.hypot(sampleGrid(heights, x + 15, z) - sampleGrid(heights, x - 15, z), sampleGrid(heights, x, z + 15) - sampleGrid(heights, x, z - 15)) / 30;
      if (h < below && s < 0.12) {
        best = { x, z };
        bestD = d;
      }
    }
  }
  return best;
}

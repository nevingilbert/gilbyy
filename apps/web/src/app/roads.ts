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

import { it } from "vitest";
import { buildWorld, START, ROW, CELL, HALF, WORLD, gridX, gridZ } from "../app/world";
it("leak", () => {
  const w = buildWorld();
  const H = w.heights, W = w.water;
  const startK = Math.round((START.z + HALF) / CELL) * ROW + Math.round((START.x + HALF) / CELL);
  const parent = new Int32Array(ROW * ROW).fill(-2);
  parent[startK] = -1;
  const q = [startK]; let qi = 0;
  while (qi < q.length) {
    const k = q[qi++]; const i = k % ROW;
    for (const nk of [k - 1, k + 1, k - ROW, k + ROW]) {
      if (nk < 0 || nk >= ROW * ROW || parent[nk] !== -2) continue;
      if ((nk === k - 1 && i === 0) || (nk === k + 1 && i === ROW - 1)) continue;
      if (Math.abs(H[nk] - H[k]) > CELL * 0.58) continue;
      if (Math.hypot(gridX(nk % ROW), gridZ(Math.floor(nk / ROW))) >= WORLD.limit) continue;
      if (W[nk] - H[nk] >= 1.3) continue;
      parent[nk] = k; q.push(nk);
    }
  }
  const tk = Math.round((0 + HALF) / CELL) * ROW + Math.round((1100 + HALF) / CELL);
  const out: string[] = [`target reached: ${parent[tk] !== -2}`];
  let k = tk, n = 0;
  while (k >= 0 && parent[k] !== -2) {
    if (n++ % 15 === 0) out.push(`(${gridX(k % ROW)}, ${gridZ(Math.floor(k / ROW))}) riverDist=${w.riverDist[k].toFixed(0)} h=${H[k].toFixed(1)} w=${W[k].toFixed(1)} r=${Math.round(Math.hypot(gridX(k % ROW), gridZ(Math.floor(k / ROW))))}`);
    k = parent[k];
  }
  const ra = w.rivers[0], rb = w.rivers[1];
  out.push("riverA: " + [0, 20, 40, 60, 80, 100, 120, 140, ra.xs.length - 1].map((i) => `(${Math.round(ra.xs[Math.min(i, ra.xs.length-1)])},${Math.round(ra.zs[Math.min(i, ra.xs.length-1)])} s=${ra.surface[Math.min(i, ra.xs.length-1)].toFixed(0)})`).join(" "));
  out.push("riverB: " + [0, 20, 40, 60, 80, 100, 120, 140, rb.xs.length - 1].map((i) => `(${Math.round(rb.xs[Math.min(i, rb.xs.length-1)])},${Math.round(rb.zs[Math.min(i, rb.xs.length-1)])} s=${rb.surface[Math.min(i, rb.xs.length-1)].toFixed(0)})`).join(" "));
  process.stdout.write(out.join("\n") + "\n");
});

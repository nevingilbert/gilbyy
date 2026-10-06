import { it } from "vitest";
import { buildWorld, WORLD, START, ROW, STOCK_WADE } from "../app/world";
it("terrain stats", () => {
  const t0 = performance.now();
  const w = buildWorld();
  const ms = performance.now() - t0;
  let z1 = 0, z2 = 0;
  for (const z of w.zone) { if (z === 1) z1++; else if (z === 2) z2++; }
  // River core depth along each river, inside the playable radius.
  const depths = w.rivers.map((r) => {
    let min = Infinity, max = -Infinity, n = 0;
    for (let i = 0; i < r.xs.length; i++) {
      const rr = Math.hypot(r.xs[i], r.zs[i]);
      if (rr > WORLD.limit || r.surface[i] < 1.5) continue;
      const d = w.waterAt(r.xs[i], r.zs[i]) - w.height(r.xs[i], r.zs[i]);
      min = Math.min(min, d); max = Math.max(max, d); n++;
    }
    return { pts: r.xs.length, n, min: min.toFixed(2), max: max.toFixed(2), srcSurf: r.surface[0].toFixed(0), end: [Math.round(r.xs.at(-1)!), Math.round(r.zs.at(-1)!)] };
  });
  const startK = Math.round((START.z + 2000) / 10) * ROW + Math.round((START.x + 2000) / 10);
  process.stdout.write(JSON.stringify({
    ms: Math.round(ms), zone1: z1, zone2: z2, startZone: w.zone[startK], stockWade: STOCK_WADE,
    trees: w.trees.length, rocks: w.rocks.length, bushes: w.bushes.length,
    track: { len: Math.round(w.track.length), minY: Math.min(...w.track.ys).toFixed(1), maxY: Math.max(...w.track.ys).toFixed(1), bridges: w.track.bridges.map(([a, b]) => [Math.round(a), Math.round(b)]), crossings: w.track.crossings.map(Math.round) },
    rivers: depths,
    sites: w.sites.map((s) => ({ style: s.style, x: Math.round(s.x), z: Math.round(s.z), zone: w.zone[Math.round((s.z + 2000) / 10) * ROW + Math.round((s.x + 2000) / 10)] })),
  }, null, 1) + "\n");
});

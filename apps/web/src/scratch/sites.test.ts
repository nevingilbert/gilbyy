import { it } from "vitest";
import { buildWorld, ROW, gridX, gridZ, WORLD } from "../app/world";
it("sites", () => {
  const w = buildWorld();
  const c = { zone2: 0, radius: 0, track: 0, river: 0, flatWet: 0, ok: 0 };
  for (let j = 4; j < ROW - 4; j += 3) for (let i = 4; i < ROW - 4; i += 3) {
    const k = j * ROW + i; if (w.zone[k] !== 2) continue; c.zone2++;
    const x = gridX(i), z = gridZ(j), r = Math.hypot(x, z);
    if (r < 180 || r > WORLD.wallStart - 60) { c.radius++; continue; }
    if (w.trackDist[k] < 70) { c.track++; continue; }
    if (w.riverDist[k] < 90) { c.river++; continue; }
    let lo = Infinity, hi = -Infinity, wet = false;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const kk = (j + dj) * ROW + i + di; lo = Math.min(lo, w.heights[kk]); hi = Math.max(hi, w.heights[kk]); wet ||= w.heights[kk] < w.water[kk] + 1; }
    if (wet || hi - lo > 4) { c.flatWet++; continue; }
    c.ok++;
  }
  process.stdout.write(JSON.stringify(c) + "\n");
});

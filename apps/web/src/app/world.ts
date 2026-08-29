export const WORLD = { w: 3200, h: 2400 };
export const START = { x: 600, y: 1250 };

export type Road = { x1: number; y1: number; x2: number; y2: number; width: number };
export type Tree = { x: number; y: number; r: number };
export type Building = { x: number; y: number; w: number; h: number; color: string };
export type Pond = { x: number; y: number; rx: number; ry: number };

/** A loose town grid. Roads are just line segments; the car may leave them freely. */
export const ROADS: Road[] = [
  { x1: 200, y1: 600, x2: 3000, y2: 600, width: 96 },
  { x1: 200, y1: 1250, x2: 3000, y2: 1250, width: 110 },
  { x1: 200, y1: 1900, x2: 3000, y2: 1900, width: 96 },
  { x1: 600, y1: 300, x2: 600, y2: 2200, width: 96 },
  { x1: 1600, y1: 300, x2: 1600, y2: 2200, width: 110 },
  { x1: 2600, y1: 300, x2: 2600, y2: 2200, width: 96 },
];

const HOUSE_COLORS = ["#b45309", "#0f766e", "#7c2d12", "#4338ca", "#9d174d", "#3f6212"];

export function distToSegment(px: number, py: number, r: Road) {
  const dx = r.x2 - r.x1;
  const dy = r.y2 - r.y1;
  const t = Math.max(0, Math.min(1, ((px - r.x1) * dx + (py - r.y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (r.x1 + t * dx), py - (r.y1 + t * dy));
}

const clearOfRoads = (x: number, y: number, pad: number) =>
  ROADS.every((r) => distToSegment(x, y, r) > r.width / 2 + pad);

/** Deterministic, so the town looks the same on every load. */
export function buildWorld() {
  let seed = 20260828;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  const ponds: Pond[] = [];
  while (ponds.length < 3) {
    const x = between(300, WORLD.w - 300);
    const y = between(300, WORLD.h - 300);
    const rx = between(110, 200);
    const ry = between(80, 150);
    if (clearOfRoads(x, y, Math.max(rx, ry) + 40)) ponds.push({ x, y, rx, ry });
  }

  const inPond = (x: number, y: number, pad: number) =>
    ponds.some((p) => Math.hypot((x - p.x) / (p.rx + pad), (y - p.y) / (p.ry + pad)) < 1);

  const buildings: Building[] = [];
  for (let tries = 0; tries < 900 && buildings.length < 34; tries++) {
    const w = between(90, 170);
    const h = between(80, 150);
    const x = between(200, WORLD.w - 200 - w);
    const y = between(200, WORLD.h - 200 - h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (!clearOfRoads(cx, cy, Math.max(w, h) / 2 + 30)) continue;
    if (inPond(cx, cy, 60)) continue;
    const overlaps = buildings.some(
      (b) => x < b.x + b.w + 50 && x + w + 50 > b.x && y < b.y + b.h + 50 && y + h + 50 > b.y
    );
    if (overlaps) continue;
    buildings.push({ x, y, w, h, color: HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)] });
  }

  const trees: Tree[] = [];
  for (let tries = 0; tries < 3000 && trees.length < 220; tries++) {
    const x = between(60, WORLD.w - 60);
    const y = between(60, WORLD.h - 60);
    if (!clearOfRoads(x, y, 30)) continue;
    if (inPond(x, y, 30)) continue;
    const nearHouse = buildings.some(
      (b) => x > b.x - 45 && x < b.x + b.w + 45 && y > b.y - 45 && y < b.y + b.h + 45
    );
    if (nearHouse) continue;
    trees.push({ x, y, r: between(13, 26) });
  }

  return { ponds, buildings, trees };
}

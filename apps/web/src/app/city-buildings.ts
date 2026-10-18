/**
 * San Francisco's buildings: a row of them along both sides of every street, as the city
 * is built. Each is a box standing on its own lot, its front to the pavement, its back to
 * the middle of the block. How wide, deep and tall depends on the neighbourhood: narrow
 * Victorians with bay windows in most of the city, stucco terraces in the avenues,
 * apartment blocks on Nob Hill, towers downtown. See ADR 0022.
 *
 * The truck can't drive through any of them. Rather than a collider each, they share one
 * field of distances to the nearest wall (`Walls`), which the physics reads through
 * `obstaclesNear` as a circle touching the wall. Pure, no three.js.
 */
import { CELL, HALF, ROW } from "./terrain";
import type { Obstacle } from "./world";

export type District = "rows" | "towers" | "midrise" | "chinatown" | "lofts" | "sheds" | "avenues" | "marina" | "barracks";

/**
 * One building. (x, z) is the middle of its footprint; `rot` is the way its front faces,
 * as a heading (0 faces +z): local +z points out of the front door into the street.
 * `w` is along the street, `d` back from it. It stands from `base` (under the lowest
 * corner) up to `top`.
 */
export type Building = {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  base: number;
  top: number;
  district: District;
  /** 0–1, for colour. */
  tone: number;
  /** Bay windows on the front, as on a Victorian. */
  bay: boolean;
};

/** What each neighbourhood's lots are like: frontage, depth, height in storeys, and how often a lot is built on. */
const LOTS: Record<District, { w: [number, number]; d: [number, number]; floors: [number, number]; storey: number; fill: number; bay: number }> = {
  rows: { w: [6.5, 8.5], d: [9, 16], floors: [2, 4], storey: 3.4, fill: 0.97, bay: 0.75 },
  avenues: { w: [7, 9], d: [9, 14], floors: [2, 2], storey: 3.3, fill: 0.97, bay: 0.15 },
  marina: { w: [8, 11], d: [10, 15], floors: [3, 3], storey: 3.3, fill: 0.95, bay: 0.35 },
  midrise: { w: [11, 18], d: [12, 20], floors: [5, 12], storey: 3.4, fill: 0.98, bay: 0.3 },
  chinatown: { w: [8, 12], d: [10, 16], floors: [3, 5], storey: 3.4, fill: 0.98, bay: 0.2 },
  towers: { w: [16, 26], d: [14, 24], floors: [8, 45], storey: 3.8, fill: 0.95, bay: 0 },
  lofts: { w: [14, 24], d: [12, 22], floors: [2, 6], storey: 4, fill: 0.85, bay: 0 },
  sheds: { w: [20, 34], d: [14, 26], floors: [1, 3], storey: 4.5, fill: 0.7, bay: 0 },
  barracks: { w: [18, 30], d: [10, 13], floors: [2, 3], storey: 3.6, fill: 0.45, bay: 0 },
};

/** Real heights above this are drawn shorter, as the hills are (city.ts): so the skyline stands to Twin Peaks as it does. */
const FULL_HEIGHT = 15;
export const drawnHeight = (real: number, vscale: number) => (real <= FULL_HEIGHT ? real : FULL_HEIGHT + (real - FULL_HEIGHT) / vscale);

/** How far the walls field reaches, and its grid: a value every WALL_CELL metres, in decimetres. */
const WALL_CELL = 2;
const WALL_N = Math.round((HALF * 2) / WALL_CELL);
const WALL_FAR = 12.7;

/**
 * The distance from anywhere to the nearest wall: negative inside a building. The
 * physics only needs it near walls, so it's kept in decimetres, out to 12.7 m.
 */
export class Walls {
  readonly field = new Int8Array(WALL_N * WALL_N).fill(127);

  /** Adds a box: centre, half-sizes along and across `rot`, which is a heading. */
  addBox(x: number, z: number, rot: number, hw: number, hd: number) {
    const reach = Math.hypot(hw, hd) + WALL_FAR;
    const i0 = Math.max(0, Math.floor((x - reach + HALF) / WALL_CELL));
    const i1 = Math.min(WALL_N - 1, Math.ceil((x + reach + HALF) / WALL_CELL));
    const j0 = Math.max(0, Math.floor((z - reach + HALF) / WALL_CELL));
    const j1 = Math.min(WALL_N - 1, Math.ceil((z + reach + HALF) / WALL_CELL));
    // Local axes: `across` along the front (x), `back` into the building (z).
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let j = j0; j <= j1; j++) {
      const pz = -HALF + (j + 0.5) * WALL_CELL - z;
      for (let i = i0; i <= i1; i++) {
        const px = -HALF + (i + 0.5) * WALL_CELL - x;
        // Into the box's frame: its +z is the heading (sin, cos), its +x is (cos, −sin).
        const lx = Math.abs(px * cos - pz * sin) - hw;
        const lz = Math.abs(px * sin + pz * cos) - hd;
        const d = lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz);
        const k = j * WALL_N + i;
        const v = Math.max(-128, Math.min(127, Math.round(d * 10)));
        if (v < this.field[k]) this.field[k] = v;
      }
    }
  }

  /** Adds a round: centre and radius. */
  addRound(x: number, z: number, r: number) {
    const reach = r + WALL_FAR;
    const i0 = Math.max(0, Math.floor((x - reach + HALF) / WALL_CELL));
    const i1 = Math.min(WALL_N - 1, Math.ceil((x + reach + HALF) / WALL_CELL));
    const j0 = Math.max(0, Math.floor((z - reach + HALF) / WALL_CELL));
    const j1 = Math.min(WALL_N - 1, Math.ceil((z + reach + HALF) / WALL_CELL));
    for (let j = j0; j <= j1; j++) {
      const pz = -HALF + (j + 0.5) * WALL_CELL - z;
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + (i + 0.5) * WALL_CELL - x, pz) - r;
        const k = j * WALL_N + i;
        const v = Math.max(-128, Math.min(127, Math.round(d * 10)));
        if (v < this.field[k]) this.field[k] = v;
      }
    }
  }

  /** Metres to the nearest wall, bilinear between the field's points. */
  distance(x: number, z: number) {
    const fx = Math.max(0, Math.min(WALL_N - 1.001, (x + HALF) / WALL_CELL - 0.5));
    const fz = Math.max(0, Math.min(WALL_N - 1.001, (z + HALF) / WALL_CELL - 0.5));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const f = this.field;
    const k = j * WALL_N + i;
    return ((f[k] * (1 - u) + f[k + 1] * u) * (1 - v) + (f[k + WALL_N] * (1 - u) + f[k + WALL_N + 1] * u) * v) / 10;
  }

  /**
   * The nearest wall as the physics sees obstacles: a circle so big it's flat where it
   * touches, its edge where the wall is. Empty if no wall is within `reach`.
   */
  near(x: number, z: number, reach = 4): Obstacle[] {
    const d = this.distance(x, z);
    if (d > reach) return [];
    const e = 0.5;
    let gx = this.distance(x + e, z) - this.distance(x - e, z);
    let gz = this.distance(x, z + e) - this.distance(x, z - e);
    const g = Math.hypot(gx, gz);
    if (g < 1e-6) return [];
    gx /= g;
    gz /= g;
    const R = 60;
    return [{ x: x - gx * (d + R), z: z - gz * (d + R), r: R, h: Infinity }];
  }
}

type Street = { cls: number; xs: Float32Array; zs: Float32Array };

export type LotRules = {
  streets: Street[];
  /** Half a street's paved width plus its pavement: where its buildings' fronts stand. */
  frontAt: (cls: number) => number;
  /** Metres from a spot to the nearest kerb: negative on the road. */
  kerb: (x: number, z: number) => number;
  /** True where nothing may be built: water, parks, the railway, the bridges' feet, special sites. */
  blocked: (x: number, z: number) => boolean;
  district: (x: number, z: number) => District;
  height: (x: number, z: number) => number;
  /** Drawn heights over real ones, for tall buildings (city.ts). */
  vscale: number;
  rand: () => number;
};

/** Every building along every street, each side, as long as there's room. */
export function layBuildings(rules: LotRules): { buildings: Building[]; walls: Walls } {
  const { streets, frontAt, kerb, blocked, district, height, vscale, rand } = rules;
  // Lots already taken, every 2 m, so a corner is built on once.
  const N = WALL_N;
  const taken = new Uint8Array(N * N);
  const cellOf = (x: number, z: number) => {
    const i = Math.floor((x + HALF) / WALL_CELL);
    const j = Math.floor((z + HALF) / WALL_CELL);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  };
  const free = (x: number, z: number) => {
    const k = cellOf(x, z);
    return k >= 0 && !taken[k] && !blocked(x, z) && kerb(x, z) > 0.4;
  };
  const buildings: Building[] = [];
  const walls = new Walls();

  for (const s of streets) {
    // Bridge decks and alleys have no buildings of their own; the streets round them do.
    if (s.cls === 4 || s.cls === 0) continue;
    const front = frontAt(s.cls);
    for (let k = 1; k < s.xs.length; k++) {
      const ax = s.xs[k - 1];
      const az = s.zs[k - 1];
      const bx = s.xs[k];
      const bz = s.zs[k];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 6) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (const side of [1, -1]) {
        // Out from the street to this side: the left of the way it runs, or the right.
        const nx = uz * side;
        const nz = -ux * side;
        let t = 0;
        while (t < len) {
          const fx = ax + ux * t + nx * front;
          const fz = az + uz * t + nz * front;
          const kind = district(fx, fz);
          const lot = LOTS[kind];
          const w = lot.w[0] + rand() * (lot.w[1] - lot.w[0]);
          const ok = rand() < lot.fill;
          if (t + w > len) break;
          const cx = fx + ux * (w / 2);
          const cz = fz + uz * (w / 2);
          // How deep: back from the pavement until the next street's pavement, or a park,
          // the water or another building; the block's middle is shared with the houses behind.
          let room = 0;
          while (room < 60 && free(cx + nx * (room + 1), cz + nz * (room + 1))) room += 1;
          const behind = room >= 60 ? lot.d[1] : room / 2 - 0.5;
          const d = Math.min(lot.d[0] + rand() * (lot.d[1] - lot.d[0]), behind);
          if (!ok || d < 6.5) {
            t += w;
            continue;
          }
          // All four corners and the middle free, on ground that isn't a cliff.
          const corners = [
            [fx, fz], [fx + ux * w, fz + uz * w],
            [fx + nx * d, fz + nz * d], [fx + ux * w + nx * d, fz + uz * w + nz * d],
            [cx + nx * (d / 2), cz + nz * (d / 2)],
          ];
          if (!corners.every(([x, z]) => free(x, z))) {
            t += 2;
            continue;
          }
          const ys = corners.map(([x, z]) => height(x, z));
          const low = Math.min(...ys);
          const high = Math.max(...ys);
          if (high - low > d * 0.9 + 2) {
            t += w;
            continue;
          }
          const floors = lot.floors[0] + Math.floor(rand() * (lot.floors[1] - lot.floors[0] + 1));
          // Towers are tallest in the middle of downtown, and only some of them.
          const real = floors * lot.storey * (kind === "towers" ? (rand() < 0.35 ? 1 : 0.45) : 1);
          const mx = cx + nx * (d / 2);
          const mz = cz + nz * (d / 2);
          const rot = Math.atan2(-nx, -nz);
          buildings.push({
            x: mx, z: mz, rot, w, d, base: low - 0.6, top: high + drawnHeight(real, vscale),
            district: kind, tone: rand(), bay: rand() < lot.bay,
          });
          walls.addBox(mx, mz, rot, w / 2, d / 2);
          // Mark the lot taken, cell by cell.
          for (let a = 0; a <= w; a += 1) {
            for (let b = 0; b <= d; b += 1) {
              const c = cellOf(fx + ux * a + nx * b, fz + uz * a + nz * b);
              if (c >= 0) taken[c] = 1;
            }
          }
          t += w;
        }
      }
    }
  }
  return { buildings, walls };
}

/** The grid vertex index nearest a spot, for fields on the game's own grid. */
export const vertexAt = (x: number, z: number) =>
  Math.round((Math.max(-HALF, Math.min(HALF, z)) + HALF) / CELL) * ROW + Math.round((Math.max(-HALF, Math.min(HALF, x)) + HALF) / CELL);

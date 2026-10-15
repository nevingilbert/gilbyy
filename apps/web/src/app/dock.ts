/**
 * Docks (ADR 0023): where the car ferry goes from, on the island's shore and at the marina
 * on Lake Mead. A dock is a causeway of stone out from the shore, a road along its top,
 * with deep water dredged at its end where the ferry ties up. The causeway is ground, laid
 * into the height grid like the island's sandbar, so a truck drives along it as on any road.
 *
 * Dock space: the origin at the causeway's root on the shore, +z out along it over the
 * water, +x to its left. Pure, no three.js.
 */
import { CELL, FAR, ROW, gridX, gridZ, type Path } from "./terrain";

export type Dock = {
  /** Where the causeway leaves the shore, and the way it runs out. */
  x: number;
  z: number;
  heading: number;
  /** The ground at its root; the road along its top, out over the water; and the water the ferry floats on at its end, at its highest. */
  root: number;
  y: number;
  water: number;
};

/**
 * The causeway: how long; half its road's width, and half its whole level top, which is
 * a grid cell wider so the ground between grid points can't dip under a wheel; how far its
 * stone banks run down to the bed; its top over high water; and how far out its road takes
 * to get up (or down) to that from the shore.
 */
export const PIER = { length: 72, half: 5, top: 15, bank: 10, rise: 2.4, slope: 24 } as const;

/** The causeway's road at `lz` metres out along it: from the ground at its root, up or down to its height over the water. */
export function pierTop(d: Dock, lz: number) {
  const t = Math.max(0, Math.min(1, lz / PIER.slope));
  return d.root + (d.y - d.root) * t * t * (3 - 2 * t);
}
/** The berth at its end: dredged this deep under high water, this far out and either side. */
const BERTH = { depth: 6.5, out: 58, half: 15 } as const;
/** How near the waiting spot a truck has to be for the ferry to be on offer. */
export const DOCK_REACH = 8;

/** A point in dock space as a world (x, z). */
export function fromDock(d: Dock, lx: number, lz: number) {
  const fx = Math.sin(d.heading);
  const fz = Math.cos(d.heading);
  return { x: d.x + fx * lz + fz * lx, z: d.z + fz * lz - fx * lx };
}

/** A world (x, z) in dock space. */
export function toDock(d: Dock, x: number, z: number) {
  const fx = Math.sin(d.heading);
  const fz = Math.cos(d.heading);
  const [dx, dz] = [x - d.x, z - d.z];
  return { x: dx * fz - dz * fx, z: dx * fx + dz * fz };
}

/** Where a truck waits to board: out near the causeway's end, facing the ferry. */
export function dockBoard(d: Dock) {
  return { ...fromDock(d, 0, PIER.length - 14), heading: d.heading };
}

/** Where a truck is left after a crossing: back at the causeway's root, facing inland. */
export function dockLeave(d: Dock) {
  return { ...fromDock(d, 0, 6), heading: d.heading + Math.PI };
}

/**
 * Builds the causeway into the height grid: its road level along the top, its stone banks
 * falling away to the bed either side, and off its end a quay wall straight down into the
 * berth, which is dredged deep. Only raises what's under the causeway and only lowers
 * what's in the berth. Its top is exact for the physics (`causewayTop`) and drawn as a
 * solid of its own; this is the ground round it.
 */
export function layDock(heights: Float32Array, d: Dock, siteDist?: Float32Array) {
  const reach = PIER.top + PIER.bank + CELL;
  for (let k = 0; k < heights.length; k++) {
    const x = gridX(k % ROW);
    const z = gridZ(Math.floor(k / ROW));
    const p = toDock(d, x, z);
    if (p.z < -reach || p.z > PIER.length + BERTH.out + reach || Math.abs(p.x) > Math.max(reach, BERTH.half + CELL)) continue;
    // How far beside the causeway's level top.
    const out = Math.max(Math.abs(p.x) - PIER.top, 0);
    if (p.z >= -CELL && p.z <= PIER.length && out < PIER.bank + CELL) {
      const road = pierTop(d, Math.max(0, p.z));
      // Its top is laid at its road's height, raised or cut; its banks only ever raise.
      if (out === 0 && p.z >= 0) heights[k] = road;
      else heights[k] = Math.max(heights[k], road - (out / PIER.bank) * (road - (d.water - BERTH.depth)));
      if (siteDist && out === 0) siteDist[k] = Math.min(siteDist[k], 0);
    }
    // The berth: deep water from the quay wall out, for the ferry's keel.
    if (p.z > PIER.length && p.z < PIER.length + BERTH.out && Math.abs(p.x) < BERTH.half) {
      heights[k] = Math.min(heights[k], d.water - BERTH.depth);
    }
  }
}

/**
 * The causeway's top, for whoever asks how high the ground is: the grid's ten-metre cells
 * can't make its end square, so its top is laid over them exactly, the way the jump's
 * deck is (ramp.ts). −Infinity off it.
 */
export function causewayTop(d: Dock, x: number, z: number) {
  const p = toDock(d, x, z);
  return p.z >= 0 && p.z <= PIER.length && Math.abs(p.x) <= PIER.top ? pierTop(d, p.z) : -Infinity;
}

/** The causeway's middle line, for keeping trees and rocks and courses off it. */
export function dockLine(d: Dock): Path {
  const a = fromDock(d, 0, -8);
  const b = fromDock(d, 0, PIER.length);
  return { xs: [a.x, b.x], zs: [a.z, b.z] };
}

/** Distance to the causeway, at every grid point: FAR beyond `reach`. */
export function dockDist(d: Dock, reach: number) {
  const out = new Float32Array(ROW * ROW).fill(FAR);
  for (let k = 0; k < out.length; k++) {
    const p = toDock(d, gridX(k % ROW), gridZ(Math.floor(k / ROW)));
    const dz = p.z < 0 ? -p.z : p.z > PIER.length ? p.z - PIER.length : 0;
    const dist = Math.hypot(Math.max(0, Math.abs(p.x) - PIER.top), dz);
    if (dist < reach) out[k] = dist;
  }
  return out;
}

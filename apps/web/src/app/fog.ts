import { HALF, WORLD } from "./terrain";

/**
 * The map's fog, as something small enough to save: the valley cut into a coarse grid,
 * one bit per cell the truck has been in. The map (map.ts) clears its fog around the
 * truck as it always did, and tells the store each new cell; on the next visit the fog
 * is cleared again around the middle of every saved cell, which lands within a few
 * pixels of where it was. See docs/decisions/0013-saved-fog.md.
 *
 * The three numbers below must match supabase/migrations/20261009120000_saved_fog.sql
 * (fog.test.ts checks).
 */
export const FOG_SIDE = 128;
export const FOG_CELLS = FOG_SIDE * FOG_SIDE;
/** The most cells one call to the server may carry. */
export const EXPLORE_MAX = 512;

const CELL = WORLD.size / FOG_SIDE;
const clamp = (v: number) => Math.min(FOG_SIDE - 1, Math.max(0, Math.floor((v + HALF) / CELL)));

/** The cell a spot in the valley falls in. */
export const cellAt = (x: number, z: number) => clamp(z) * FOG_SIDE + clamp(x);

/** The middle of a cell. */
export const cellCentre = (cell: number) => ({
  x: ((cell % FOG_SIDE) + 0.5) * CELL - HALF,
  z: (Math.floor(cell / FOG_SIDE) + 0.5) * CELL - HALF,
});

/**
 * The cells set in what the server sends back: the bits as hex, cell `n` being bit
 * `n % 8` of byte `n / 8`, counted from the low end, as Postgres's `set_bit` counts
 * them. Anything that isn't the right shape reads as nothing explored.
 */
export function decodeCells(hex: string | null | undefined): number[] {
  if (!hex || hex.length !== FOG_CELLS / 4 || /[^0-9a-f]/i.test(hex)) return [];
  const cells: number[] = [];
  for (let byte = 0; byte < FOG_CELLS / 8; byte++) {
    const v = parseInt(hex.slice(byte * 2, byte * 2 + 2), 16);
    for (let bit = 0; bit < 8; bit++) if (v & (1 << bit)) cells.push(byte * 8 + bit);
  }
  return cells;
}

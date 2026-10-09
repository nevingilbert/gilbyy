import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { EXPLORE_MAX, FOG_CELLS, FOG_SIDE, cellAt, cellCentre, decodeCells } from "./fog";
import { LocalStore } from "./store";
import { HALF, WORLD } from "./terrain";

const migration = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261009120000_saved_fog.sql"), "utf8");

/** What the server would send back for these cells: Postgres's set_bit, then hex. */
const encode = (cells: number[]) => {
  const bytes = new Uint8Array(FOG_CELLS / 8);
  for (const c of cells) bytes[c >> 3] |= 1 << (c & 7);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

describe("the saved fog", () => {
  it("is the same size on the server and in the valley", () => {
    expect(migration).toContain(`octet_length(cells) = ${FOG_CELLS / 8}`);
    expect(migration).toContain(`repeat('00', ${FOG_CELLS / 8})`);
    expect(migration).toContain(`cell >= ${FOG_CELLS}`);
    expect(migration).toContain(`cardinality(p_cells) > ${EXPLORE_MAX}`);
  });

  it("is still that size where explore() was rewritten to keep each world's apart", () => {
    const island = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261009180000_island.sql"), "utf8");
    expect(island).toContain(`repeat('00', ${FOG_CELLS / 8})`);
    expect(island).toContain(`cell >= ${FOG_CELLS}`);
    expect(island).toContain(`cardinality(p_cells) > ${EXPLORE_MAX}`);
  });

  it("gives every spot in the valley a cell, and each cell's middle is in that cell", () => {
    expect(cellAt(-HALF, -HALF)).toBe(0);
    expect(cellAt(HALF - 1, HALF - 1)).toBe(FOG_CELLS - 1);
    // Off the edge still lands in the nearest cell rather than outside the grid.
    expect(cellAt(-HALF - 500, HALF + 500)).toBe((FOG_SIDE - 1) * FOG_SIDE);
    for (const cell of [0, 1, FOG_SIDE, 8191, FOG_CELLS - 1]) {
      const c = cellCentre(cell);
      expect(cellAt(c.x, c.z)).toBe(cell);
    }
  });

  it("puts a restored clearing close enough to where the truck was", () => {
    const c = cellCentre(cellAt(123, -456));
    expect(Math.hypot(c.x - 123, c.z + 456)).toBeLessThan((WORLD.size / FOG_SIDE) * Math.SQRT1_2 + 1e-9);
  });

  it("reads back the cells the server has set", () => {
    const cells = [0, 7, 8, 30, 8191, FOG_CELLS - 1];
    expect(decodeCells(encode(cells))).toEqual(cells);
    expect(decodeCells(encode([]))).toEqual([]);
  });

  it("reads anything else as nothing explored", () => {
    expect(decodeCells(null)).toEqual([]);
    expect(decodeCells("")).toEqual([]);
    expect(decodeCells("ff")).toEqual([]);
    expect(decodeCells("zz".repeat(FOG_CELLS / 8))).toEqual([]);
  });

  it("lasts the visit in single player, like everything else", () => {
    const store = new LocalStore();
    store.explore(5);
    store.explore(5);
    store.explore(9);
    expect(store.explored()).toEqual([5, 9]);
  });
});

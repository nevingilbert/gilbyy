import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CAFE_KEY, PLACE_KINDS, PLACE_TOTALS, countFound, foundLine, garageKey, placesOf } from "./places";
import { LocalStore } from "./store";
import { buildWorld } from "./world";

const migration = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261007120000_found_places.sql"), "utf8");
const world = buildWorld();

describe("places", () => {
  it("are the same on the server and in the valley", () => {
    const block = migration.match(/insert into public\.places \([^)]*\) values([\s\S]*?);/)?.[1] ?? "";
    const server = Object.fromEntries([...block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]));
    expect(server).toEqual(PLACE_KINDS);
    // One garage of each style, or a style would stop naming a place.
    expect(placesOf(world.sites).map((p) => p.key).sort()).toEqual(Object.keys(PLACE_KINDS).sort());
    expect(world.sites.length).toBe(PLACE_TOTALS.garage);
  });

  it("are counted by kind, once each, ignoring anything that isn't one", () => {
    const found = [garageKey("barn"), garageKey("barn"), garageKey("cabin"), CAFE_KEY, "garage:castle"];
    expect(countFound(found)).toEqual({ garage: 2, cafe: 1 });
    expect(foundLine(countFound(found))).toBe("2/8 garages · 1/1 café");
  });

  it("stay found in single player too, for as long as the visit lasts", async () => {
    const store = new LocalStore();
    store.discover(garageKey("barn"));
    store.discover(garageKey("barn"));
    expect(store.get().found).toEqual([garageKey("barn")]);
    expect((await store.leaderboard())[0]).toMatchObject({ garages: 1, cafes: 0 });
  });
});

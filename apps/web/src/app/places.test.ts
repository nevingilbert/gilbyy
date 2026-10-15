import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";
import { buildCity } from "./city";
import { loadCityData } from "./city-streets";
import { buildIsland } from "./island";
import { buildJapan } from "./japan";
import { CAFE_KEY, CAFE_KEYS, PLACES, airportKey, countFound, dockKey, eggKey, foundLine, garageKey, helipadKey, placesOf, stationKey, totalsOf } from "./places";
import { LocalStore } from "./store";
import { buildVegas } from "./vegas";
import { buildWorld, type World } from "./world";

const dir = resolve(__dirname, "../../../../supabase/migrations");
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(resolve(dir, f), "utf8"));
const worlds: World[] = [buildWorld(), buildIsland()];
const [valley, island] = worlds;

// The city's ground and streets are fetched on their own (ADR 0022).
beforeAll(async () => {
  await loadCityData();
  worlds.push(buildCity(), buildVegas(), buildJapan());
}, 30000);

describe("places", () => {
  it("are the same on the server and in every world", () => {
    // Rows from before places had a world are the valley's.
    const server = Object.fromEntries(
      migrations.flatMap((sql) =>
        [...sql.matchAll(/insert into public\.places \([^)]*\) values([\s\S]*?);/g)].flatMap(([, block]) =>
          [...block.matchAll(/\('([^']+)',\s*'([^']+)'(?:,\s*'([^']+)')?\)/g)].map((m) => [m[1], { kind: m[2], world: m[3] ?? "valley" }]),
        ),
      ),
    );
    expect(server).toEqual(PLACES);
    expect(worlds.map((w) => w.id)).toEqual(["valley", "island", "city", "vegas", "japan"]);
    for (const world of worlds) {
      // One garage of each style, or a style would stop naming a place.
      const onMap = placesOf(world).map((p) => p.key).sort();
      const listed = Object.keys(PLACES).filter((k) => PLACES[k].world === world.id && PLACES[k].kind !== "egg").sort();
      expect(onMap).toEqual(listed);
      expect(world.sites.length).toBe(totalsOf(world.id).garage);
    }
    expect(valley.landmarks.map((l) => eggKey(l.kind)).sort()).toEqual(Object.keys(PLACES).filter((k) => PLACES[k].kind === "egg").sort());
    expect(island.landmarks).toEqual([]);
    expect(worlds[2].landmarks).toEqual([]);
  });

  it("are counted by kind for one world, once each, ignoring anything that isn't one there", () => {
    const found = [
      garageKey("barn"), garageKey("barn"), garageKey("cabin"), CAFE_KEY, "garage:castle", garageKey("shack"), eggKey("bank"), airportKey("island"),
      garageKey("pier"), stationKey("city"), CAFE_KEYS.city, dockKey("vegas"), garageKey("pitgarage"), helipadKey("japan"), garageKey("kura"),
    ];
    expect(countFound(found, "valley")).toEqual({ garage: 2, cafe: 1, airport: 0, station: 0, dock: 0, helipad: 0, egg: 1 });
    expect(foundLine(countFound(found, "valley"), "valley")).toBe("2/8 garages · 1/1 café · 0/1 airport · 0/1 station · 1/4 easter eggs");
    expect(countFound(found, "island")).toEqual({ garage: 1, cafe: 0, airport: 1, station: 0, dock: 0, helipad: 0, egg: 0 });
    // The island has no station and no easter eggs, so its line doesn't mention them; the city has no airport, Vegas a dock and a
    // helipad, and Japan only a helipad.
    expect(foundLine(countFound(found, "island"), "island")).toBe("1/3 garages · 0/1 café · 1/1 airport · 0/1 dock");
    expect(countFound(found, "city")).toEqual({ garage: 1, cafe: 1, airport: 0, station: 1, dock: 0, helipad: 0, egg: 0 });
    expect(foundLine(countFound(found, "city"), "city")).toBe("1/3 garages · 1/1 café · 1/1 station");
    expect(countFound(found, "vegas")).toEqual({ garage: 1, cafe: 0, airport: 0, station: 0, dock: 1, helipad: 0, egg: 0 });
    expect(foundLine(countFound(found, "vegas"), "vegas")).toBe("1/3 garages · 0/1 café · 1/1 dock · 0/1 helipad");
    expect(countFound(found, "japan")).toEqual({ garage: 1, cafe: 0, airport: 0, station: 0, dock: 0, helipad: 1, egg: 0 });
    expect(foundLine(countFound(found, "japan"), "japan")).toBe("1/3 garages · 0/1 café · 1/1 helipad");
  });

  it("never put an easter egg on the map", () => {
    for (const world of worlds) expect(placesOf(world).some((p) => p.key.startsWith("egg:"))).toBe(false);
  });

  it("stay found in single player too, for as long as the visit lasts", async () => {
    const store = new LocalStore();
    store.discover(garageKey("barn"));
    store.discover(garageKey("barn"));
    store.discover(garageKey("shack"));
    expect(store.get().found).toEqual([garageKey("barn"), garageKey("shack")]);
    expect((await store.leaderboard())[0]).toMatchObject({ world: "valley", found: { garage: 1, cafe: 0, airport: 0, station: 0, dock: 0, helipad: 0, egg: 0 } });
  });
});

import { fromField } from "./airport";
import { PIER, fromDock } from "./dock";
import { PLANE } from "./flight";
import type { LandmarkKind } from "./landmarks";
import type { SiteStyle, World, WorldId } from "./world";

/**
 * Things worth finding, world by world: the garages, the café, each world's airstrip,
 * station or dock, and the valley's four easter eggs. Coming within sight of a garage, the
 * café, an airstrip, a station or a dock finds it, and it stays on the map for good. An
 * easter egg is found by looking inside, and never goes on the map. Signed in it's all
 * saved (`discover` in the migrations) and counted beside your miles on the friends
 * leaderboard, for the world you're in. Finding pays nothing. See
 * docs/decisions/0008-found-places.md, 0016-the-islands-second-pass.md, 0022 and 0023.
 */
export type PlaceKind = "garage" | "cafe" | "airport" | "station" | "dock" | "egg";
/** A place with somewhere to stand on the map. Easter eggs are never one of these. */
export type Place = { key: string; kind: Exclude<PlaceKind, "egg">; x: number; z: number };
export type FoundCount = Record<PlaceKind, number>;

/** There is one garage of each style, so the style names it, and says which world it is in. */
export const GARAGE_STYLES: Record<WorldId, SiteStyle[]> = {
  valley: ["workshop", "barn", "quonset", "hangar", "ranch", "cabin", "bunker", "container"],
  island: ["shack", "outpost", "lodge"],
  city: ["victorian", "pier", "airfield"],
  vegas: ["speedshop", "pitgarage", "tradingpost"],
};
/** The worlds with an airstrip, those with a station (ADR 0022), and those with a dock (ADR 0023). */
const AIRSTRIPS: WorldId[] = ["valley", "island"];
const STATIONS: WorldId[] = ["valley", "city"];
const DOCKS: WorldId[] = ["island", "vegas"];
const EGGS: LandmarkKind[] = ["bank", "church", "school", "casino"];
export const garageKey = (style: SiteStyle) => `garage:${style}`;
export const airportKey = (world: WorldId) => `airport:${world}`;
export const stationKey = (world: WorldId) => `station:${world}`;
export const dockKey = (world: WorldId) => `dock:${world}`;
export const eggKey = (kind: LandmarkKind) => `egg:${kind}`;
/**
 * The valley's café is by the camp; the island's is on the beach; the city's is on
 * Washington Square in North Beach; Vegas's is a diner on the way out to the marina.
 */
export const CAFE_KEYS: Record<WorldId, string> = { valley: "cafe:camp", island: "cafe:beach", city: "cafe:northbeach", vegas: "cafe:diner" };
export const CAFE_KEY = CAFE_KEYS.valley;

/** Every key the server will accept, and where it is. Must match `public.places` (places.test.ts checks). */
export const PLACES: Record<string, { kind: PlaceKind; world: WorldId }> = {
  ...Object.fromEntries(
    (Object.keys(GARAGE_STYLES) as WorldId[]).flatMap((world) => [
      ...GARAGE_STYLES[world].map((s) => [garageKey(s), { kind: "garage" as const, world }]),
      ...(AIRSTRIPS.includes(world) ? [[airportKey(world), { kind: "airport" as const, world }]] : []),
      ...(STATIONS.includes(world) ? [[stationKey(world), { kind: "station" as const, world }]] : []),
      ...(DOCKS.includes(world) ? [[dockKey(world), { kind: "dock" as const, world }]] : []),
      [CAFE_KEYS[world], { kind: "cafe" as const, world }],
    ]),
  ),
  ...Object.fromEntries(EGGS.map((k) => [eggKey(k), { kind: "egg" as const, world: "valley" as const }])),
};

const NONE: FoundCount = { garage: 0, cafe: 0, airport: 0, station: 0, dock: 0, egg: 0 };

/** How many of each kind a world has. A kind it has none of is left out of its line. */
export const totalsOf = (world: WorldId): FoundCount => {
  const totals = { ...NONE };
  for (const p of Object.values(PLACES)) if (p.world === world) totals[p.kind]++;
  return totals;
};

/**
 * The places in a world that go on its map once found, and where. The airstrip's mark is
 * where the plane stands; the station's, its building; the dock's, out on the causeway.
 */
export const placesOf = (world: World): Place[] => {
  const out: Place[] = [
    ...world.sites.map((s) => ({ key: garageKey(s.style), kind: "garage" as const, x: s.x, z: s.z })),
    { key: CAFE_KEYS[world.id], kind: "cafe" as const, x: world.cafe.x, z: world.cafe.z },
  ];
  if (world.airport) {
    const stand = fromField(world.airport, 0, PLANE.stand);
    out.push({ key: airportKey(world.id), kind: "airport", x: stand.x, z: stand.z });
  }
  if (world.station) out.push({ key: stationKey(world.id), kind: "station", x: world.station.x, z: world.station.z });
  if (world.dock) {
    const end = fromDock(world.dock, 0, PIER.length - 10);
    out.push({ key: dockKey(world.id), kind: "dock", x: end.x, z: end.z });
  }
  return out;
};

/** How many of each kind in `world` are among `found`. Keys that aren't places there count for nothing. */
export const countFound = (found: string[], world: WorldId): FoundCount => {
  const count = { ...NONE };
  for (const key of new Set(found)) if (PLACES[key]?.world === world) count[PLACES[key].kind]++;
  return count;
};

const NAMES: Record<PlaceKind, [string, string]> = {
  garage: ["garage", "garages"], cafe: ["café", "cafés"], airport: ["airport", "airports"], station: ["station", "stations"], dock: ["dock", "docks"],
  egg: ["easter egg", "easter eggs"],
};

/** "3/8 garages · 1/1 café · 0/1 airport · 0/1 station · 2/4 easter eggs", for the kinds that world has. */
export const foundLine = (c: FoundCount, world: WorldId) => {
  const totals = totalsOf(world);
  return (Object.keys(NAMES) as PlaceKind[])
    .filter((k) => totals[k] > 0)
    .map((k) => `${c[k]}/${totals[k]} ${NAMES[k][totals[k] === 1 ? 0 : 1]}`)
    .join(" · ");
};

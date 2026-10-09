import { fromField } from "./airport";
import { PLANE } from "./flight";
import type { LandmarkKind } from "./landmarks";
import type { SiteStyle, World, WorldId } from "./world";

/**
 * Things worth finding, world by world: the garages, the café, each world's
 * airstrip, and the valley's four easter eggs. Coming within sight of a garage, the café
 * or an airstrip finds it, and it stays on the map for good. An easter egg is found by
 * looking inside, and never goes on the map. Signed in it's all saved (`discover` in the
 * migrations) and counted beside your miles on the friends leaderboard, for the world
 * you're in. Finding pays nothing. See docs/decisions/0008-found-places.md and
 * 0016-the-islands-second-pass.md.
 */
export type PlaceKind = "garage" | "cafe" | "airport" | "egg";
/** A place with somewhere to stand on the map. Easter eggs are never one of these. */
export type Place = { key: string; kind: Exclude<PlaceKind, "egg">; x: number; z: number };
export type FoundCount = Record<PlaceKind, number>;

/** There is one garage of each style, so the style names it, and says which world it is in. */
export const GARAGE_STYLES: Record<WorldId, SiteStyle[]> = {
  valley: ["workshop", "barn", "quonset", "hangar", "ranch", "cabin", "bunker", "container"],
  island: ["shack", "outpost", "lodge"],
};
const EGGS: LandmarkKind[] = ["bank", "church", "school", "casino"];
export const garageKey = (style: SiteStyle) => `garage:${style}`;
export const airportKey = (world: WorldId) => `airport:${world}`;
export const eggKey = (kind: LandmarkKind) => `egg:${kind}`;
/** The valley's café is by the camp; the island's is on the beach. */
export const CAFE_KEYS: Record<WorldId, string> = { valley: "cafe:camp", island: "cafe:beach" };
export const CAFE_KEY = CAFE_KEYS.valley;

/** Every key the server will accept, and where it is. Must match `public.places` (places.test.ts checks). */
export const PLACES: Record<string, { kind: PlaceKind; world: WorldId }> = {
  ...Object.fromEntries(
    (Object.keys(GARAGE_STYLES) as WorldId[]).flatMap((world) => [
      ...GARAGE_STYLES[world].map((s) => [garageKey(s), { kind: "garage" as const, world }]),
      [airportKey(world), { kind: "airport" as const, world }],
      [CAFE_KEYS[world], { kind: "cafe" as const, world }],
    ]),
  ),
  ...Object.fromEntries(EGGS.map((k) => [eggKey(k), { kind: "egg" as const, world: "valley" as const }])),
};

const NONE: FoundCount = { garage: 0, cafe: 0, airport: 0, egg: 0 };

/** How many of each kind a world has. A kind it has none of is left out of its line. */
export const totalsOf = (world: WorldId): FoundCount => {
  const totals = { ...NONE };
  for (const p of Object.values(PLACES)) if (p.world === world) totals[p.kind]++;
  return totals;
};

/** The places in a world that go on its map once found, and where. The airstrip's mark is where the plane stands. */
export const placesOf = (world: World): Place[] => {
  const stand = fromField(world.airport, 0, PLANE.stand);
  return [
    ...world.sites.map((s) => ({ key: garageKey(s.style), kind: "garage" as const, x: s.x, z: s.z })),
    { key: CAFE_KEYS[world.id], kind: "cafe" as const, x: world.cafe.x, z: world.cafe.z },
    { key: airportKey(world.id), kind: "airport" as const, x: stand.x, z: stand.z },
  ];
};

/** How many of each kind in `world` are among `found`. Keys that aren't places there count for nothing. */
export const countFound = (found: string[], world: WorldId): FoundCount => {
  const count = { ...NONE };
  for (const key of new Set(found)) if (PLACES[key]?.world === world) count[PLACES[key].kind]++;
  return count;
};

const NAMES: Record<PlaceKind, [string, string]> = {
  garage: ["garage", "garages"], cafe: ["café", "cafés"], airport: ["airport", "airports"], egg: ["easter egg", "easter eggs"],
};

/** "3/8 garages · 1/1 café · 0/1 airport · 2/4 easter eggs", for the kinds that world has. */
export const foundLine = (c: FoundCount, world: WorldId) => {
  const totals = totalsOf(world);
  return (Object.keys(NAMES) as PlaceKind[])
    .filter((k) => totals[k] > 0)
    .map((k) => `${c[k]}/${totals[k]} ${NAMES[k][totals[k] === 1 ? 0 : 1]}`)
    .join(" · ");
};

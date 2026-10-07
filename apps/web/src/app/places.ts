import { CAFE, type Site, type SiteStyle } from "./world";

/**
 * Places worth finding: the eight garages and the café. Once the truck has been near one
 * it stays on the map for good. Signed in it's saved (`discover` in the migrations) and
 * counted beside your miles on the friends leaderboard. See
 * docs/decisions/0008-found-places.md.
 */
export type PlaceKind = "garage" | "cafe";
export type Place = { key: string; kind: PlaceKind; x: number; z: number };
export type FoundCount = Record<PlaceKind, number>;

/** There is one garage of each style, so the style names it. */
export const GARAGE_STYLES: SiteStyle[] = ["workshop", "barn", "quonset", "hangar", "ranch", "cabin", "bunker", "container"];
export const garageKey = (style: SiteStyle) => `garage:${style}`;
export const CAFE_KEY = "cafe:camp";

/** Every key the server will accept. Must match `public.places` (places.test.ts checks). */
export const PLACE_KINDS: Record<string, PlaceKind> = {
  ...Object.fromEntries(GARAGE_STYLES.map((s) => [garageKey(s), "garage" as const])),
  [CAFE_KEY]: "cafe",
};
export const PLACE_TOTALS: FoundCount = { garage: GARAGE_STYLES.length, cafe: 1 };

export const placesOf = (sites: Site[]): Place[] => [
  ...sites.map((s) => ({ key: garageKey(s.style), kind: "garage" as const, x: s.x, z: s.z })),
  { key: CAFE_KEY, kind: "cafe", x: CAFE.x, z: CAFE.z },
];

/** How many of each kind are among `found`. Keys that aren't places count for nothing. */
export const countFound = (found: string[]): FoundCount => {
  const count: FoundCount = { garage: 0, cafe: 0 };
  for (const key of new Set(found)) if (PLACE_KINDS[key]) count[PLACE_KINDS[key]]++;
  return count;
};

/** "3/8 garages · 1/1 café" */
export const foundLine = (c: FoundCount) =>
  `${c.garage}/${PLACE_TOTALS.garage} garages · ${c.cafe}/${PLACE_TOTALS.cafe} ${PLACE_TOTALS.cafe === 1 ? "café" : "cafés"}`;

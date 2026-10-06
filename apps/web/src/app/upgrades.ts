import { PALETTE } from "./palette";
import type { CarSpec } from "./physics";
import { SNORKEL_WADE, STOCK_WADE } from "./terrain";

/**
 * What the garages sell. Nothing costs anything: each tier unlocks once you've driven
 * far enough, and from then on you can fit it whenever you like.
 *
 * Miles and the fitted loadout are kept in localStorage so a reload doesn't undo them.
 * That is the only thing the game persists, and it never leaves the browser.
 */

/** Miles driven to unlock each tier. */
export const TIER_MILES = [0, 1, 3, 6, 12] as const;
export const METRES_PER_MILE = 1609.344;

export type Category = "paint" | "tyres" | "lights" | "snorkel";

type Base = { id: string; name: string; tier: number; blurb: string };
export type Paint = Base & { color: string };
export type Tyre = Base & { radius: number; width: number; lugs: number; lift: number; grip: number; clearance: number };
export type Lights = Base & {
  /** Main beam: how far it reaches, how wide it spreads, how bright it is. */
  reach: number;
  spread: number;
  power: number;
  fogLamps: boolean;
  bar: boolean;
  ditch: boolean;
};
export type Snorkel = Base & { fitted: boolean };

export const PAINTS: Paint[] = [
  { id: "rustRed", name: "Rust Red", tier: 0, blurb: "How it left the factory.", color: PALETTE.paint.rustRed },
  { id: "desertCream", name: "Desert Cream", tier: 0, blurb: "Hides the dust.", color: PALETTE.paint.desertCream },
  { id: "oliveDrab", name: "Olive Drab", tier: 1, blurb: "Surplus-store chic.", color: PALETTE.paint.oliveDrab },
  { id: "skyBlue", name: "Sky Blue", tier: 1, blurb: "Like the brochure.", color: PALETTE.paint.skyBlue },
  { id: "mustard", name: "Mustard", tier: 2, blurb: "Very 1974.", color: PALETTE.paint.mustard },
  { id: "lagoonTeal", name: "Lagoon Teal", tier: 2, blurb: "For lake country.", color: PALETTE.paint.lagoonTeal },
  { id: "chocolate", name: "Chocolate", tier: 3, blurb: "Deep, glossy, serious.", color: PALETTE.paint.chocolate },
  { id: "pearlWhite", name: "Pearl White", tier: 3, blurb: "Brave, off-road.", color: PALETTE.paint.pearlWhite },
  { id: "sunsetOrange", name: "Sunset Orange", tier: 4, blurb: "Matches golden hour.", color: PALETTE.paint.sunsetOrange },
  { id: "midnight", name: "Midnight", tier: 4, blurb: "Nearly black, nearly blue.", color: PALETTE.paint.midnight },
];

export const TYRES: Tyre[] = [
  { id: "road", name: "Road tyres", tier: 0, blurb: "Fine on grass. Small rocks only.", radius: 0.42, width: 0.34, lugs: 0, lift: 0, grip: 1, clearance: 0.45 },
  { id: "allTerrain", name: "All-terrain", tier: 1, blurb: "A little more bite on climbs.", radius: 0.45, width: 0.36, lugs: 12, lift: 0.05, grip: 1.08, clearance: 0.6 },
  { id: "mud", name: "Mud-terrain", tier: 2, blurb: "Chunky lugs. Steeper hills.", radius: 0.48, width: 0.4, lugs: 10, lift: 0.1, grip: 1.16, clearance: 0.8 },
  { id: "big33", name: "33-inch mud", tier: 3, blurb: "Lifted. Rolls over boulders.", radius: 0.54, width: 0.44, lugs: 10, lift: 0.22, grip: 1.24, clearance: 1.15 },
  { id: "crawler37", name: "37-inch crawlers", tier: 4, blurb: "Climbs nearly anything.", radius: 0.6, width: 0.5, lugs: 9, lift: 0.36, grip: 1.32, clearance: 1.6 },
];

export const LIGHTS: Lights[] = [
  { id: "stock", name: "Stock headlights", tier: 0, blurb: "Dim and yellow. Drive slowly.", reach: 26, spread: 0.42, power: 1, fogLamps: false, bar: false, ditch: false },
  { id: "halogen", name: "Halogen bulbs", tier: 1, blurb: "Whiter, further.", reach: 42, spread: 0.45, power: 1.8, fogLamps: false, bar: false, ditch: false },
  { id: "driving", name: "Bumper driving lamps", tier: 2, blurb: "Wide light low down.", reach: 55, spread: 0.62, power: 2.5, fogLamps: true, bar: false, ditch: false },
  { id: "bar", name: "Roof light bar", tier: 3, blurb: "Night becomes day, mostly.", reach: 90, spread: 0.58, power: 4, fogLamps: true, bar: true, ditch: false },
  { id: "fullRig", name: "Full rig", tier: 4, blurb: "Bar, driving lamps, ditch lights.", reach: 115, spread: 0.75, power: 5.5, fogLamps: true, bar: true, ditch: true },
];

export const SNORKELS: Snorkel[] = [
  { id: "none", name: "No snorkel", tier: 0, blurb: "Keep the water below the doors.", fitted: false },
  { id: "snorkel", name: "Snorkel", tier: 3, blurb: "Breathes high. Fords the river.", fitted: true },
];

export const CATALOGUE = { paint: PAINTS, tyres: TYRES, lights: LIGHTS, snorkel: SNORKELS } as const;

export type Loadout = Record<Category, string>;
export const STOCK_LOADOUT: Loadout = { paint: "rustRed", tyres: "road", lights: "stock", snorkel: "none" };

const find = <T extends Base>(list: T[], id: string) => list.find((u) => u.id === id) ?? list[0];
export const paintOf = (l: Loadout) => find(PAINTS, l.paint);
export const tyresOf = (l: Loadout) => find(TYRES, l.tyres);
export const lightsOf = (l: Loadout) => find(LIGHTS, l.lights);
export const snorkelOf = (l: Loadout) => find(SNORKELS, l.snorkel);

/** Highest tier unlocked at this mileage. */
export function tierAt(miles: number) {
  let tier = 0;
  TIER_MILES.forEach((m, t) => {
    if (miles >= m) tier = t;
  });
  return tier;
}

/** How the fitted parts change the way the truck drives. */
export function specFor(l: Loadout): CarSpec {
  const tyres = tyresOf(l);
  return {
    wade: (snorkelOf(l).fitted ? SNORKEL_WADE : STOCK_WADE) + tyres.lift,
    grip: tyres.grip,
    lift: tyres.lift,
    clearance: tyres.clearance,
  };
}

export type Progress = { miles: number; loadout: Loadout };
const KEY = "gilbyy.progress.v1";

/** Never throws: a private window or blocked storage just means starting fresh. */
export function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.miles === "number" && raw.loadout) {
      const miles = Math.max(0, raw.miles);
      const tier = tierAt(miles);
      // Only keep parts that exist and are still unlocked at this mileage.
      const loadout = { ...STOCK_LOADOUT };
      for (const cat of Object.keys(CATALOGUE) as Category[]) {
        const item = (CATALOGUE[cat] as Base[]).find((u) => u.id === raw.loadout[cat]);
        if (item && item.tier <= tier) loadout[cat] = item.id;
      }
      return { miles, loadout };
    }
  } catch {
    // Fall through to a fresh start.
  }
  return { miles: 0, loadout: { ...STOCK_LOADOUT } };
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable; progress lasts until the tab closes.
  }
}

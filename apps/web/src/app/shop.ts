import { PALETTE } from "./palette";
import type { CarSpec } from "./physics";
import { SNORKEL_WADE } from "./terrain";
import { VEHICLES, vehicleById, type VehicleId } from "./vehicles";

/**
 * The garage shop. Miles you drive (and earn on missions) are money: spend them on
 * rigs and parts. Prices are set so the courses, which pay far better than driving
 * around, are the quick way to them (ADR 0017), except the first upgrade of each kind,
 * which a newcomer can drive to in a quarter of an hour. Lifetime miles are separate
 * and only ever go up; that is what the leaderboard shows.
 *
 * Prices here must match `supabase/migrations/…_shop.sql`, which the server uses to
 * check purchases; `shop.test.ts` holds the two together.
 */
export const METRES_PER_MILE = 1609.344;

export type Category = "vehicle" | "paint" | "tyres" | "lights" | "snorkel" | "winter";
export type PartCategory = Exclude<Category, "vehicle">;

type Base = { id: string; name: string; blurb: string; price: number };
export type Paint = Base & { color: string };
export type Tyre = Base & {
  /** Added to the rig's stock wheel radius. */
  radiusAdd: number;
  width: number;
  lugs: number;
  /** Suspension lift that comes with the set. */
  lift: number;
  gripAdd: number;
  clearanceAdd: number;
  snowGrip: number;
};
export type Lights = Base & { reach: number; spread: number; power: number; fogLamps: boolean; bar: boolean; ditch: boolean };
export type Toggle = Base & { fitted: boolean };
/** Chains grip the same whatever they're made of; `jewelled` is only how they look. */
export type Chains = Toggle & { jewelled: boolean };

export const PAINTS: Paint[] = [
  { id: "factory", name: "Factory colour", blurb: "How it left the showroom.", price: 0, color: "" },
  { id: "forestGreen", name: "Forest Green", blurb: "Blends into the pines.", price: 5, color: PALETTE.paint.forestGreen },
  { id: "desertCream", name: "Desert Cream", blurb: "Hides the dust.", price: 0.5, color: PALETTE.paint.desertCream },
  { id: "rustRed", name: "Rust Red", blurb: "The classic.", price: 0.5, color: PALETTE.paint.rustRed },
  { id: "oliveDrab", name: "Olive Drab", blurb: "Surplus-store chic.", price: 5, color: PALETTE.paint.oliveDrab },
  { id: "skyBlue", name: "Sky Blue", blurb: "Like the brochure.", price: 5, color: PALETTE.paint.skyBlue },
  { id: "mustard", name: "Mustard", blurb: "Very 1974.", price: 7.5, color: PALETTE.paint.mustard },
  { id: "lagoonTeal", name: "Lagoon Teal", blurb: "For lake country.", price: 7.5, color: PALETTE.paint.lagoonTeal },
  { id: "chocolate", name: "Chocolate", blurb: "Deep, glossy, serious.", price: 10, color: PALETTE.paint.chocolate },
  { id: "pearlWhite", name: "Pearl White", blurb: "Brave, off-road.", price: 10, color: PALETTE.paint.pearlWhite },
  { id: "sunsetOrange", name: "Sunset Orange", blurb: "Matches golden hour.", price: 15, color: PALETTE.paint.sunsetOrange },
  { id: "midnight", name: "Midnight", blurb: "Nearly black, nearly blue.", price: 15, color: PALETTE.paint.midnight },
];

export const TYRES: Tyre[] = [
  { id: "road", name: "Road tyres", blurb: "Fine on grass. Small rocks only. Useless on snow.", price: 0, radiusAdd: 0, width: 0.32, lugs: 0, lift: 0, gripAdd: 0, clearanceAdd: 0, snowGrip: 0.2 },
  { id: "allTerrain", name: "All-terrain", blurb: "A little more bite everywhere.", price: 2, radiusAdd: 0.03, width: 0.35, lugs: 12, lift: 0.04, gripAdd: 0.08, clearanceAdd: 0.15, snowGrip: 0.35 },
  { id: "mud", name: "Mud-terrain", blurb: "Chunky lugs. Steeper hills.", price: 20, radiusAdd: 0.06, width: 0.39, lugs: 10, lift: 0.08, gripAdd: 0.16, clearanceAdd: 0.3, snowGrip: 0.4 },
  { id: "studded", name: "Studded snow tyres", blurb: "Bite on snow and ice. Small rocks only.", price: 25, radiusAdd: 0.02, width: 0.34, lugs: 14, lift: 0.02, gripAdd: 0.04, clearanceAdd: 0.05, snowGrip: 0.95 },
  { id: "big33", name: "33-inch mud", blurb: "Lifted. Rolls over boulders.", price: 45, radiusAdd: 0.12, width: 0.44, lugs: 10, lift: 0.18, gripAdd: 0.24, clearanceAdd: 0.65, snowGrip: 0.45 },
  { id: "crawler37", name: "37-inch crawlers", blurb: "Climbs nearly anything.", price: 75, radiusAdd: 0.18, width: 0.5, lugs: 9, lift: 0.3, gripAdd: 0.32, clearanceAdd: 1.05, snowGrip: 0.5 },
];

export const LIGHTS: Lights[] = [
  { id: "stock", name: "Stock headlights", blurb: "Dim and yellow. Drive slowly.", price: 0, reach: 26, spread: 0.42, power: 1, fogLamps: false, bar: false, ditch: false },
  { id: "halogen", name: "Halogen bulbs", blurb: "Whiter, further.", price: 1, reach: 42, spread: 0.45, power: 1.8, fogLamps: false, bar: false, ditch: false },
  { id: "driving", name: "Bumper driving lamps", blurb: "Wide light low down.", price: 15, reach: 55, spread: 0.62, power: 2.5, fogLamps: true, bar: false, ditch: false },
  { id: "bar", name: "Roof light bar", blurb: "Night becomes day, mostly.", price: 30, reach: 90, spread: 0.58, power: 3.4, fogLamps: true, bar: true, ditch: false },
  { id: "fullRig", name: "Full rig", blurb: "Bar, driving lamps, ditch lights.", price: 50, reach: 115, spread: 0.72, power: 4.2, fogLamps: true, bar: true, ditch: true },
];

export const SNORKELS: Toggle[] = [
  { id: "none", name: "No snorkel", blurb: "Keep the water below the doors.", price: 0, fitted: false },
  { id: "snorkel", name: "Snorkel", blurb: "Breathes high. Fords the rivers to the east.", price: 45, fitted: true },
];

export const WINTER: Chains[] = [
  { id: "none", name: "No chains", blurb: "Snow is for sliding.", price: 0, fitted: false, jewelled: false },
  { id: "chains", name: "Snow chains", blurb: "Grip in snow country on any tyres.", price: 30, fitted: true, jewelled: false },
  // The one thing in the shop priced for showing off: the owner's number, far past anything else here.
  { id: "cartier", name: "Cartier chains", blurb: "Solid gold, a stone on every link. Grips no better.", price: 10000, fitted: true, jewelled: true },
];

export const PARTS = { paint: PAINTS, tyres: TYRES, lights: LIGHTS, snorkel: SNORKELS, winter: WINTER } as const;

export type Loadout = Record<PartCategory, string>;
export const STOCK_LOADOUT: Loadout = { paint: "factory", tyres: "road", lights: "stock", snorkel: "none", winter: "none" };

const find = <T extends Base>(list: readonly T[], id: string) => list.find((u) => u.id === id) ?? list[0];
export const paintOf = (l: Loadout) => find(PAINTS, l.paint);
/** The colour to paint a rig: the fitted paint, or the rig's own factory colour. */
export const paintColour = (vehicle: VehicleId, l: Loadout) => paintOf(l).color || PALETTE.paint[vehicleById(vehicle).factoryPaint];
export const tyresOf = (l: Loadout) => find(TYRES, l.tyres);
export const lightsOf = (l: Loadout) => find(LIGHTS, l.lights);
export const snorkelOf = (l: Loadout) => find(SNORKELS, l.snorkel);
export const winterOf = (l: Loadout) => find(WINTER, l.winter);

/** Every purchasable thing as `category:id`, the key used in `owned` and on the server. */
export const itemKey = (category: Category, id: string) => `${category}:${id}`;

/** Price of anything in the shop, by key. Free things are always owned. */
export function priceOf(key: string) {
  const [category, id] = key.split(":") as [Category, string];
  if (category === "vehicle") return VEHICLES.find((v) => v.id === id)?.price ?? Infinity;
  const item = (PARTS[category] as readonly Base[] | undefined)?.find((p) => p.id === id);
  return item ? item.price : Infinity;
}

/** The one world whose garages sell this, or null if they all do. */
export function soldOnlyIn(key: string) {
  const [category, id] = key.split(":");
  return (category === "vehicle" && VEHICLES.find((v) => v.id === id)?.only) || null;
}

/** Everything that changes how the rig drives, from the rig and its fitted parts. */
export function specFor(vehicle: VehicleId, l: Loadout): CarSpec {
  const v = vehicleById(vehicle);
  const t = tyresOf(l);
  return {
    accel: v.accel,
    maxSpeed: v.maxSpeed,
    wheelbase: v.wheelbase,
    track: v.track,
    ride: v.ride + t.radiusAdd + t.lift,
    travel: v.travel,
    // Without a snorkel, never deep enough for the rivers (2.2 m), whatever the tyres.
    wade: snorkelOf(l).fitted ? Math.max(SNORKEL_WADE, v.wade + 1) : v.wade + t.lift * 0.5,
    grip: v.grip + t.gripAdd,
    clearance: v.clearance + t.clearanceAdd,
    snowGrip: Math.max(t.snowGrip, winterOf(l).fitted ? 0.85 : 0),
    radius: v.width / 2 + 0.2,
  };
}

export type Progress = {
  /** Miles ever driven or earned: only goes up. */
  lifetime: number;
  /** Miles to spend. */
  balance: number;
  /** Keys of bought items. Free items are owned implicitly. */
  owned: string[];
  /** The rig being driven; null until a starter is picked. */
  vehicle: VehicleId | null;
  loadout: Loadout;
};

export const freshProgress = (): Progress => ({ lifetime: 0, balance: 0, owned: [], vehicle: null, loadout: { ...STOCK_LOADOUT } });

export const owns = (p: Progress, key: string) => priceOf(key) === 0 || p.owned.includes(key);

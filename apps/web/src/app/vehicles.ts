/**
 * The rigs you can own. Each is drawn from a real off-roader's shape and character,
 * but named for itself: the real names are trademarks.
 *
 * Starters are free; you pick one when you first arrive. The rest cost miles at a
 * garage, and one of them only at the garage on the island (ADR 0014). Pure data: shapes
 * for car-model.ts and vehicle-models.ts, handling for the physics (combined with the
 * fitted tyres in shop.ts).
 */
import type { PALETTE } from "./palette";
import type { WorldId } from "./terrain";

export type VehicleId = "ridgeback" | "bluff" | "mule" | "overlander" | "prairie" | "highland" | "summit" | "duneclaw" | "sandfly";

export type Vehicle = {
  id: VehicleId;
  name: string;
  blurb: string;
  /** Miles at a garage; 0 for starters. */
  price: number;
  starter: boolean;
  /** Outer size in metres, and where the wheels sit. */
  length: number;
  width: number;
  /** Roof height above the ground at rest, not counting racks or bars. */
  height: number;
  wheelbase: number;
  track: number;
  /** Stock tyre radius. Bigger tyre sets scale from this. */
  wheelRadius: number;
  /** Body centre above the ground at rest, on stock tyres. */
  ride: number;
  /** How far the wheels can droop before they leave the ground. */
  travel: number;
  /** Engine push (m/s²) and top speed (m/s). */
  accel: number;
  maxSpeed: number;
  /** Traction on climbs, before tyres. */
  grip: number;
  /** Tallest rock it rolls over on stock tyres. */
  clearance: number;
  /** Deepest water it fords without a snorkel. */
  wade: number;
  /** Its colour before any repaint. */
  factoryPaint: keyof typeof PALETTE.paint;
  /** The one world whose garages sell it. Once bought it's yours anywhere. */
  only?: WorldId;
};

export const VEHICLES: Vehicle[] = [
  // Inspired by the 1984–2001 Jeep Cherokee (XJ): the cheap, light, boxy way into the woods.
  {
    id: "ridgeback", name: "Ridgeback", blurb: "Boxy '80s compact SUV. Light, nimble, cheap to break.",
    price: 0, starter: true, length: 4.25, width: 1.8, height: 1.68, wheelbase: 2.58, track: 1.5,
    wheelRadius: 0.38, ride: 1.0, travel: 0.3, accel: 5.4, maxSpeed: 16, grip: 1.0, clearance: 0.4, wade: 1.15, factoryPaint: "forestGreen",
  },
  // Inspired by the 2007–2014 Toyota FJ Cruiser: retro, round lamps, white roof.
  {
    id: "bluff", name: "Bluff", blurb: "Retro two-door with a white lid. Tough and a bit silly.",
    price: 0, starter: true, length: 4.67, width: 1.9, height: 1.83, wheelbase: 2.69, track: 1.6,
    wheelRadius: 0.41, ride: 1.1, travel: 0.32, accel: 5.6, maxSpeed: 17, grip: 1.04, clearance: 0.45, wade: 1.25, factoryPaint: "mustard",
  },
  // Inspired by the 1980s Toyota Pickup/Hilux 4x4: the little truck that won't die.
  {
    id: "mule", name: "Mule", blurb: "'80s single-cab pickup. Gear in the bed, mud on the doors.",
    price: 0, starter: true, length: 4.45, width: 1.7, height: 1.72, wheelbase: 2.62, track: 1.45,
    wheelRadius: 0.39, ride: 1.05, travel: 0.32, accel: 5.0, maxSpeed: 16.5, grip: 1.02, clearance: 0.45, wade: 1.2, factoryPaint: "rustRed",
  },
  // Inspired by the Land Cruiser 70-series: the original red overlander from the trailers.
  {
    id: "overlander", name: "Overlander", blurb: "Classic expedition wagon with a roof rack. Goes anywhere slowly.",
    price: 8, starter: false, length: 4.6, width: 1.9, height: 2.0, wheelbase: 2.6, track: 1.7,
    wheelRadius: 0.42, ride: 1.15, travel: 0.32, accel: 5.4, maxSpeed: 17.5, grip: 1.08, clearance: 0.55, wade: 1.4, factoryPaint: "rustRed",
  },
  // Inspired by the Toyota Tundra: a full-size crew-cab pickup.
  {
    id: "prairie", name: "Prairie", blurb: "Full-size crew-cab pickup. Big engine, big everything.",
    price: 18, starter: false, length: 5.8, width: 2.05, height: 1.95, wheelbase: 3.7, track: 1.75,
    wheelRadius: 0.44, ride: 1.2, travel: 0.34, accel: 6.2, maxSpeed: 19, grip: 1.1, clearance: 0.6, wade: 1.4, factoryPaint: "pearlWhite",
  },
  // Inspired by the Range Rover: luxury on air suspension, famous for fording.
  {
    id: "highland", name: "Highland", blurb: "Posh four-door on air suspension. Wades deep, rides soft.",
    price: 28, starter: false, length: 5.0, width: 2.0, height: 1.87, wheelbase: 3.0, track: 1.7,
    wheelRadius: 0.43, ride: 1.18, travel: 0.38, accel: 6.4, maxSpeed: 19.5, grip: 1.12, clearance: 0.6, wade: 1.65, factoryPaint: "lagoonTeal",
  },
  // Inspired by the Land Cruiser 300: the flagship that crosses continents.
  {
    id: "summit", name: "Summit", blurb: "Flagship expedition SUV. Unbreakable, unhurried, unstoppable.",
    price: 40, starter: false, length: 5.0, width: 2.0, height: 1.95, wheelbase: 2.85, track: 1.7,
    wheelRadius: 0.45, ride: 1.22, travel: 0.36, accel: 6.0, maxSpeed: 19, grip: 1.18, clearance: 0.7, wade: 1.5, factoryPaint: "chocolate",
  },
  // Inspired by the Ford F-150 Raptor: wide, long-travel desert truck.
  {
    id: "duneclaw", name: "Duneclaw", blurb: "Wide-body desert pickup with long-travel suspension. Fast.",
    price: 55, starter: false, length: 5.9, width: 2.2, height: 2.0, wheelbase: 3.7, track: 1.9,
    wheelRadius: 0.47, ride: 1.28, travel: 0.48, accel: 7.2, maxSpeed: 23, grip: 1.15, clearance: 0.75, wade: 1.3, factoryPaint: "sunsetOrange",
  },
  // Inspired by the 1960s Meyers Manx and the sand rails that followed it: a tub, a cage and an engine out the back.
  {
    id: "sandfly", name: "Sandfly", blurb: "Open-frame dune buggy. Light, quick, airborne off every crest. Sold only on the island.",
    price: 30, starter: false, length: 3.5, width: 1.86, height: 1.6, wheelbase: 2.45, track: 1.56,
    wheelRadius: 0.4, ride: 0.92, travel: 0.5, accel: 7.6, maxSpeed: 24.5, grip: 1.16, clearance: 0.6, wade: 0.95, factoryPaint: "coral",
    only: "island",
  },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
export const STARTERS = VEHICLES.filter((v) => v.starter);

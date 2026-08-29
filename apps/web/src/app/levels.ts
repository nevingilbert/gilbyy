export type Level = {
  id: string;
  label: string;
  emoji: string;
  href: string;
  /** World-space position of the level's building. */
  x: number;
  y: number;
  color: string;
};

/**
 * Each level is its own app on its own Vercel project, not a route in this app.
 * Swap these to https://<name>.gilbyy.com once the domain is live and the
 * subdomains are attached in each project's Vercel settings.
 */
export const LEVELS: Level[] = [
  { id: "bets", label: "Bets", emoji: "🎲", href: "https://friendlybets.vercel.app", x: 1560, y: 380, color: "#2563eb" },
  { id: "meals", label: "Meals", emoji: "🍽️", href: "https://wellness-planner.vercel.app", x: 380, y: 900, color: "#ea580c" },
  { id: "karts", label: "Karts", emoji: "🏎️", href: "https://beeriokart-dashboard.vercel.app", x: 1180, y: 1280, color: "#dc2626" },
];

export const WORLD = { w: 2000, h: 1600 };
export const HUB = { x: 1000, y: 800 };
/** How close the car has to get before a level can be entered. */
export const ENTER_RADIUS = 110;

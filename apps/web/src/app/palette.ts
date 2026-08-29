/**
 * Every colour in the game lives here.
 *
 * The brief is a lightweight take on Over the Hill: muted, naturalistic, earthy.
 * See docs/art-direction.md before changing any of these — the rule of thumb is
 * "when in doubt, desaturate", and no pure primaries.
 *
 * Caveat: the DOM overlay in Game.tsx (title, hint, touch buttons) uses Tailwind
 * arbitrary values, so a few of these are mirrored as literals in className strings.
 * Tailwind can't read TS at build time. If you change `grass`, `hudText` or
 * `hudMarker`, grep Game.tsx for the old hex too.
 */
export const PALETTE = {
  // Ground
  grass: "#7a8b5c",
  // Kept translucent and close in value to the base — mottling should read as
  // texture, not as camouflage patches.
  grassPatchLight: "rgba(140,156,110,0.30)",
  grassPatchDark: "rgba(104,120,82,0.26)",

  // Water
  waterDeep: "#5f7079",
  waterShallow: "#6e8189",

  // Dirt tracks
  roadEdge: "#8d7d63",
  roadFill: "#9c8c70",
  roadCentre: "#b3a68d",

  // Buildings — weathered, not painted
  houses: ["#9c6f4f", "#7d6a55", "#8a5f4c", "#6f7a6a", "#a08360", "#6b6257"],
  houseRoofHighlight: "rgba(255,247,230,0.10)",

  // Trees
  treeBody: "#4e6b45",
  treeHighlight: "#5d7d50",

  shadow: "rgba(58,48,38,0.24)",
  carShadow: "rgba(58,48,38,0.32)",

  // Car — warm, but not a highlighter
  carBody: "#d9a441",
  carOutline: "#3d3428",
  carWindow: "#54707a",
  carTrim: "rgba(255,250,240,0.42)",
  tyre: "#3a332a",

  // HUD — quiet, low contrast, cornered
  hudPanel: "rgba(46,44,36,0.55)",
  hudBorder: "rgba(226,213,184,0.28)",
  hudLine: "rgba(226,213,184,0.26)",
  hudText: "rgba(238,229,208,0.82)",
  hudDim: "rgba(226,216,194,0.5)",
  hudMarker: "#e0bd6e",
} as const;

/**
 * Every colour in the game lives here.
 *
 * Sampled by eye from Over the Hill's trailers and screenshots (see
 * docs/art-direction.md). Its palette is *not* muted: it is a few saturated hues per
 * scene — orange grass, lilac-grey rock, near-black pines — held together by warm
 * haze that pulls everything in the distance toward the sky colour.
 *
 * These are albedos: what you see on screen is this times the light, plus fog.
 *
 * Caveat: the DOM overlay in Game.tsx uses Tailwind arbitrary values, so `hudText`
 * and `fog` are mirrored as literals in className strings. Tailwind can't read TS at
 * build time; if you change those, grep Game.tsx for the old hex too.
 */
export const PALETTE = {
  // Sky and air. The fog is the horizon colour, so distance dissolves into the sky.
  skyZenith: "#8e9cc9",
  skyHorizon: "#f4b893",
  sunGlow: "#ffe6bf",
  fog: "#efb08c",
  sunLight: "#ffd9ae",
  hemiSky: "#b7c0e6",
  hemiGround: "#b0703f",

  // Ground
  grass: ["#ee9f4f", "#f2ab5a", "#e6913f", "#f0b064"],
  forestFloor: ["#b9773b", "#a86a35"],
  rock: ["#a9a5b4", "#9b98aa", "#b4afbb"],
  shore: "#c8925e",
  lakebed: "#6f6a58",
  snow: "#f4ede8",

  water: "#4f9fb2",
  waterSpecular: "#ffe2bd",

  // Trees: mostly near-black pines, with golden larches and a few autumn broadleaves.
  pine: ["#1d4a2b", "#22553a", "#173f27", "#2b5a3a"],
  larch: ["#e2a33a", "#d98f2f"],
  broadleaf: ["#cf5a2e", "#e08a32", "#b9442c", "#e6b443"],
  bush: ["#3c6a2e", "#4a7733", "#2f5a28", "#5d7f35"],
  trunk: "#5c3b2a",
  boulder: ["#a29fae", "#948fa3", "#b2aab6"],

  // The 4x4 — the trailers' red overlander with a cream roof.
  carBody: "#c4473a",
  carRoof: "#efe4d2",
  carGlass: "#2d3a44",
  carTrim: "#3a332e",
  tyre: "#26221f",
  rim: "#d8d0c4",
  headlight: "#fff2d6",
  luggage: ["#3f6d8c", "#6b8f3a", "#d9a441"],

  // HUD — quiet, low contrast, cornered.
  hudText: "rgba(255,246,232,0.78)",
  hudDim: "rgba(255,246,232,0.45)",
} as const;

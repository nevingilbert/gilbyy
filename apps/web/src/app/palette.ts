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

  /**
   * The sky through the day, keyed by hour (sorted). daylight.ts blends between these.
   * 16.5 is the golden hour the page opens in; nights are deep blue, not black.
   */
  sky: [
    { hour: 0, zenith: "#0b1230", horizon: "#1d2a4a", fog: "#1a2442", light: "#9fb4e0", lightIntensity: 0.45, hemiSky: "#2c3d6e", hemiGround: "#16161e", hemiIntensity: 0.3, fogDensity: 0.0019 },
    { hour: 4.6, zenith: "#0d1434", horizon: "#22305a", fog: "#1f2a4c", light: "#9fb4e0", lightIntensity: 0.4, hemiSky: "#2c3d6e", hemiGround: "#16161e", hemiIntensity: 0.32, fogDensity: 0.0019 },
    { hour: 5.6, zenith: "#2c3870", horizon: "#9a7090", fog: "#76627e", light: "#d8a0a0", lightIntensity: 0.5, hemiSky: "#6a6c9e", hemiGround: "#3a2a2c", hemiIntensity: 0.6, fogDensity: 0.0018 },
    { hour: 6.6, zenith: "#7a8cc6", horizon: "#ffb48c", fog: "#f2a98a", light: "#ffc49a", lightIntensity: 2.2, hemiSky: "#b0b8e0", hemiGround: "#a0684a", hemiIntensity: 1.2, fogDensity: 0.0017 },
    { hour: 9, zenith: "#7fa2d6", horizon: "#f1d4b8", fog: "#e8cbb2", light: "#fff0dc", lightIntensity: 3, hemiSky: "#bcd0f0", hemiGround: "#a88060", hemiIntensity: 1.5, fogDensity: 0.0012 },
    { hour: 13, zenith: "#6f96d4", horizon: "#e8d8c6", fog: "#dfcdb9", light: "#fff6ea", lightIntensity: 3.2, hemiSky: "#c4d4f2", hemiGround: "#a08868", hemiIntensity: 1.6, fogDensity: 0.0011 },
    { hour: 16.5, zenith: "#8e9cc9", horizon: "#f4b893", fog: "#efb08c", light: "#ffd9ae", lightIntensity: 3.2, hemiSky: "#b7c0e6", hemiGround: "#b0703f", hemiIntensity: 1.5, fogDensity: 0.0016 },
    { hour: 18.6, zenith: "#6a68a8", horizon: "#ff9a6c", fog: "#e98c70", light: "#ff9a5a", lightIntensity: 1.8, hemiSky: "#9a90c0", hemiGround: "#8a4a3a", hemiIntensity: 1.1, fogDensity: 0.0017 },
    { hour: 19.6, zenith: "#2e3468", horizon: "#8c5c7c", fog: "#5c4c6c", light: "#a8a8d8", lightIntensity: 0.5, hemiSky: "#4a5080", hemiGround: "#2a2228", hemiIntensity: 0.55, fogDensity: 0.0018 },
    { hour: 21, zenith: "#0b1230", horizon: "#1d2a4a", fog: "#1a2442", light: "#9fb4e0", lightIntensity: 0.45, hemiSky: "#2c3d6e", hemiGround: "#16161e", hemiIntensity: 0.3, fogDensity: 0.0019 },
  ],
  moon: "#e8ecff",
  star: "#fff8ee",

  // Ground
  grass: ["#ee9f4f", "#f2ab5a", "#e6913f", "#f0b064"],
  forestFloor: ["#b9773b", "#a86a35"],
  rock: ["#a9a5b4", "#9b98aa", "#b4afbb"],
  shore: "#c8925e",
  /** Garage yards and the dirt roads over the level crossings. */
  dirt: ["#a8774c", "#b4865a"],
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

  /** Garage paint jobs, 60s–80s overlander colours. `rustRed` is the stock finish. */
  paint: {
    rustRed: "#c4473a",
    desertCream: "#e3d3b0",
    oliveDrab: "#6d7445",
    skyBlue: "#7fa7c2",
    mustard: "#d6a43a",
    lagoonTeal: "#2f8a8a",
    chocolate: "#6a4532",
    pearlWhite: "#efece6",
    sunsetOrange: "#e2702f",
    midnight: "#26303d",
  },
  lightBar: "#2a2826",

  // The 4x4 — the trailers' red overlander with a cream roof.
  carBody: "#c4473a",
  carRoof: "#efe4d2",
  carGlass: "#2d3a44",
  carTrim: "#3a332e",
  tyre: "#26221f",
  rim: "#d8d0c4",
  headlight: "#fff2d6",
  luggage: ["#3f6d8c", "#6b8f3a", "#d9a441"],

  // Garages and other buildings: weathered, rural, 60s–80s.
  barnRed: "#a8432f",
  boardsGrey: "#8a7f73",
  plaster: "#e8dcc6",
  timber: "#7a5236",
  logWood: "#8a5a36",
  roofSlate: "#4a4650",
  roofTin: "#9aa0a6",
  roofRust: "#a0603a",
  concrete: "#a9a59c",
  concreteDark: "#7d7a73",
  corrugated: "#b8bcbf",
  shipping: ["#b5532f", "#2f6f8f", "#d9a441", "#4f7a3a"],
  doorDark: "#2b2724",
  hazardYellow: "#e2b23a",
  trimCream: "#efe6d6",
  /** Lit windows; emissive strength is driven by time of day. */
  windowGlow: "#ffcf87",
  void: "#0d0b0a",

  // Railway
  rail: "#5a5550",
  sleeper: "#5b4636",
  ballast: "#8d8478",
  locoBody: "#8c2f2a",
  locoStripe: "#e8b64a",
  wagon: ["#6b4a3a", "#3f5a6b", "#7a6a3a"],
  tanker: "#3a3a3a",
  barrierWhite: "#f2ece2",
  barrierRed: "#c23a2e",
  signalRed: "#ff4a3a",

  // The map: an old parchment topo sheet, greyed out wherever you haven't been.
  map: {
    paper: "#eadcc0",
    paperShade: "#b9a382",
    forest: "#a7ad7c",
    rock: "#b6aea6",
    snow: "#f6f1ea",
    water: "#86a9b4",
    waterDeep: "#6f97a6",
    contour: "rgba(120,92,60,0.32)",
    track: "#5c4636",
    fog: "rgba(96,90,84,0.94)",
    car: "#c4473a",
    garage: "#3b2f27",
    train: "#2b2421",
    rim: "rgba(255,246,232,0.55)",
  },

  // HUD — quiet, low contrast, cornered.
  hudText: "rgba(255,246,232,0.78)",
  hudDim: "rgba(255,246,232,0.45)",
} as const;

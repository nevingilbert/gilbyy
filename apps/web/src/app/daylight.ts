import { PALETTE } from "./palette";

/**
 * Time of day. A full day takes about fifteen minutes: daylight lingers, night passes
 * quicker, and the page always opens in the late afternoon.
 *
 * Pure: hours from elapsed seconds, and the look of the sky at a given hour.
 */
export const START_HOUR = 16;
const DAY_HOUR = 50;
const NIGHT_HOUR = 25;
const isDay = (h: number) => h >= 6 && h < 19;
const SECONDS_BEFORE = Array.from({ length: 25 }, (_, h) => {
  let s = 0;
  for (let k = 0; k < h; k++) s += isDay(k) ? DAY_HOUR : NIGHT_HOUR;
  return s;
});
export const DAY_LENGTH = SECONDS_BEFORE[24];

/** Seconds after page load at which the clock first reads `hour`. */
export function secondsUntil(hour: number) {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const target = SECONDS_BEFORE[h] + (hour - Math.floor(hour)) * (isDay(h) ? DAY_HOUR : NIGHT_HOUR);
  return (((target - SECONDS_BEFORE[START_HOUR]) % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
}

/** Hour of day, 0–24, after `elapsed` seconds since the page loaded. */
export function hourAt(elapsed: number) {
  const t = (((SECONDS_BEFORE[START_HOUR] + elapsed) % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
  let h = 0;
  while (h < 23 && SECONDS_BEFORE[h + 1] <= t) h++;
  return h + (t - SECONDS_BEFORE[h]) / (isDay(h) ? DAY_HOUR : NIGHT_HOUR);
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type Sky = {
  /** sRGB, 0–1. */
  zenith: RGB;
  horizon: RGB;
  fog: RGB;
  light: RGB;
  hemiSky: RGB;
  hemiGround: RGB;
  lightIntensity: number;
  hemiIntensity: number;
  fogDensity: number;
  /** Unit vector toward the sun, or toward the moon at night. */
  lightDir: [number, number, number];
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  /** 0 by day, 1 at full night: headlights, lit windows and stars follow this. */
  night: number;
};

const KEYS = PALETTE.sky.map((k) => ({
  ...k,
  zenith: rgb(k.zenith), horizon: rgb(k.horizon), fog: rgb(k.fog), light: rgb(k.light),
  hemiSky: rgb(k.hemiSky), hemiGround: rgb(k.hemiGround),
}));

const MAX_ELEVATION = (50 * Math.PI) / 180;
const SUNRISE = 6;
const SUNSET = 18.6;

/** Sun rises in the east (+x), crosses the south (+z) and sets in the west (−x). */
function sunAt(hour: number): [number, number, number] {
  const a = (Math.PI * (hour - SUNRISE)) / (SUNSET - SUNRISE);
  const e = Math.sin(a) * MAX_ELEVATION;
  return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
}

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function skyAt(hour: number): Sky {
  let i = KEYS.findIndex((k) => k.hour > hour);
  if (i <= 0) i = KEYS.length;
  const a = KEYS[i - 1];
  const b = KEYS[i % KEYS.length];
  const span = ((b.hour - a.hour + 24) % 24) || 24;
  const t = (((hour - a.hour + 24) % 24) / span);

  const sun = sunAt(hour);
  // The moon hangs high in the opposite sky; the light swaps over as the sun sets.
  const moon = norm([-sun[0], 0.75, -sun[2] + 0.3]);
  const day = Math.max(0, Math.min(1, (sun[1] + 0.04) / 0.14));
  const lightDir = norm([
    moon[0] + (sun[0] - moon[0]) * day,
    moon[1] + (Math.max(sun[1], 0.05) - moon[1]) * day,
    moon[2] + (sun[2] - moon[2]) * day,
  ]);

  return {
    zenith: mix(a.zenith, b.zenith, t),
    horizon: mix(a.horizon, b.horizon, t),
    fog: mix(a.fog, b.fog, t),
    light: mix(a.light, b.light, t),
    hemiSky: mix(a.hemiSky, b.hemiSky, t),
    hemiGround: mix(a.hemiGround, b.hemiGround, t),
    lightIntensity: a.lightIntensity + (b.lightIntensity - a.lightIntensity) * t,
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
    lightDir,
    sunDir: sun,
    moonDir: moon,
    night: 1 - Math.max(0, Math.min(1, (sun[1] + 0.06) / 0.2)),
  };
}

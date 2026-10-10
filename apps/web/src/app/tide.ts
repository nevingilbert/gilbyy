/**
 * The island's tide (ADR 0020). The sea goes out and comes back in every ten minutes:
 * it stands at high water for a while, ebbs, stays out for longer, and floods again.
 * High water is where the sea has always stood, so nothing on the beach is ever
 * flooded; low water leaves bare a strip of wet sand all round the island, and the
 * sandbar off the camp (island.ts), which is under the sea the rest of the time.
 *
 * Pure: how far out the sea is follows from the time alone, so signed in, where everyone
 * shares a clock, everyone sees the same tide. It keeps its own time, not the sun's, so
 * low water comes round at a different hour each day.
 */
export const TIDE = {
  /** How far the sea falls from high water to low, in metres. */
  fall: 1.6,
  /** Seconds going out, staying out, coming in and staying in. One after the other, a whole tide. */
  ebb: 110,
  out: 270,
  flood: 110,
  in: 110,
} as const;

export const TIDE_LENGTH = TIDE.ebb + TIDE.out + TIDE.flood + TIDE.in;

/** Where a tide that began to ebb at 0 has got to at `time`, in seconds. */
const into = (time: number) => ((time % TIDE_LENGTH) + TIDE_LENGTH) % TIDE_LENGTH;
/** Eases from 0 to 1 as `u` does, slow at both ends, the way a tide turns. */
const ease = (u: number) => (1 - Math.cos(Math.PI * u)) / 2;
/** The `u` at which `ease` reaches `v`. */
const easeAt = (v: number) => Math.acos(1 - 2 * Math.max(0, Math.min(1, v))) / Math.PI;

/** How far the sea stands below high water, in metres, after `time` seconds of game time: 0 at high water, `TIDE.fall` at low. */
export function ebbAt(time: number) {
  const t = into(time);
  if (t < TIDE.ebb) return TIDE.fall * ease(t / TIDE.ebb);
  if (t < TIDE.ebb + TIDE.out) return TIDE.fall;
  if (t < TIDE.ebb + TIDE.out + TIDE.flood) return TIDE.fall * ease(1 - (t - TIDE.ebb - TIDE.out) / TIDE.flood);
  return 0;
}

/** Seconds from `time` until the sea is next at least `least` metres below high water: 0 if it is now. `least` is no more than `TIDE.fall`. */
export function untilEbb(time: number, least: number) {
  const t = into(time);
  const u = easeAt(least / TIDE.fall);
  const from = TIDE.ebb * u;
  const to = TIDE.ebb + TIDE.out + TIDE.flood * (1 - u);
  if (t < from) return from - t;
  return t <= to ? 0 : TIDE_LENGTH - t + from;
}

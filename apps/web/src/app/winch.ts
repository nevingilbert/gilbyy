import type { Car, CarSpec } from "./physics";
import { winchOf, type Loadout } from "./shop";

/**
 * Getting someone off a rock (ADR 0020). A truck that rams a rock a little too tall for
 * its tyres is hung up on it (physics.ts) and can do nothing for itself. Anyone here with
 * a winch fitted can pull it off: they stop within the cable's length, hook on, and the
 * stuck truck is hauled toward them until it's clear. The winch does nothing for the truck
 * it's bolted to, so a driver stuck with nobody about can ring BBB for a tow (tow.ts), or
 * reload, which starts them again from their tent.
 *
 * Pure rules, shared by both ends: the one winching and the one being winched each decide
 * for themselves whether the other is close enough.
 */

/** How much cable there is: the two trucks' centres are within this. */
export const WINCH_REACH = 22;
/** Whoever is winching has to be more or less stopped. */
export const WINCH_STILL = 3;
/** A pull that hasn't freed anyone after this long is over: the cable comes in. Seconds. */
export const WINCH_LIMIT = 15;
/** If the stuck truck hasn't said it's on the hook after this long, the cable never took. Seconds. */
export const WINCH_TAKES = 4;

type Spot = { x: number; z: number };

export const hasWinch = (l: Loadout | undefined) => Boolean(l && winchOf(l).fitted);

/**
 * Whether a truck at `me` with this loadout could hook onto a stuck truck at `them`. The
 * stuck driver allows a little `slack`: each end only knows roughly where the other is.
 */
export const canWinch = (me: Spot, loadout: Loadout | undefined, them: Spot, slack = 0) =>
  hasWinch(loadout) && Math.hypot(them.x - me.x, them.z - me.z) <= WINCH_REACH + slack;

/**
 * The cable's two ends: the winch on the front bumper of the truck pulling, and whichever
 * end of the stuck truck is nearer to it.
 */
export function cableEnds(puller: Car, pullerSpec: CarSpec, stuck: Car, stuckSpec: CarSpec) {
  const end = (c: Car, spec: CarSpec, side: number) => {
    const reach = (spec.wheelbase / 2 + 0.75) * side;
    return {
      x: c.x + Math.sin(c.heading) * reach,
      y: c.y - spec.ride * 0.4 + Math.sin(c.pitch) * reach,
      z: c.z + Math.cos(c.heading) * reach,
    };
  };
  const from = end(puller, pullerSpec, 1);
  const toward = (from.x - stuck.x) * Math.sin(stuck.heading) + (from.z - stuck.z) * Math.cos(stuck.heading);
  return { from, to: end(stuck, stuckSpec, toward >= 0 ? 1 : -1) };
}

/** What else a stuck driver can do besides ring BBB (tow.ts). `shared` is whether anyone else could be here at all. */
export function stuckHelp(shared: boolean, friendsHere: number) {
  const reload = "or reload to go back to your tent";
  if (!shared) return reload;
  return `${friendsHere ? "or a friend here with a winch can pull you off" : "or anyone here with a winch can pull you off"} · ${reload}`;
}

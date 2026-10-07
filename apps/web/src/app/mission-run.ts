import type { Gate, Mission } from "./missions";

/**
 * Driving a mission: a short countdown at the start arch, then each gate in order.
 * Pure, so the rules are tested without a renderer.
 */
export const COUNTDOWN = 3;
/** How near the start arch to be offered the mission. */
export const START_REACH = 14;
/** Wander this far from the next gate and the run is given up. */
export const GIVE_UP = 320;

export type Run = {
  mission: Mission;
  /** Seconds since the countdown began; negative while counting down. */
  clock: number;
  /** Index of the next gate to pass. */
  next: number;
};

export type RunEvent = { kind: "go" } | { kind: "gate"; index: number } | { kind: "finish"; seconds: number } | { kind: "lost" };

export const startRun = (mission: Mission): Run => ({ mission, clock: -COUNTDOWN, next: 0 });

type Pt = { x: number; z: number };

/**
 * Whether going from `a` to `b` passed through `gate`: crossed its line, between its
 * flags, heading the right way. Rolling right up to its middle counts too.
 */
export function crossed(gate: Gate, a: Pt, b: Pt) {
  const fx = Math.sin(gate.heading);
  const fz = Math.cos(gate.heading);
  const da = (a.x - gate.x) * fx + (a.z - gate.z) * fz;
  const db = (b.x - gate.x) * fx + (b.z - gate.z) * fz;
  if (db >= da && Math.hypot(b.x - gate.x, b.z - gate.z) < gate.width * 0.35) return true;
  if (!(da < 0 && db >= 0)) return false;
  const t = da / (da - db);
  const x = a.x + (b.x - a.x) * t - gate.x;
  const z = a.z + (b.z - a.z) * t - gate.z;
  return Math.abs(x * fz - z * fx) <= gate.width / 2 + 0.5;
}

/** Advances the run by `dt`, given where the truck was and is. */
export function tick(run: Run, dt: number, from: Pt, to: Pt): RunEvent | null {
  const before = run.clock;
  run.clock += dt;
  if (before < 0 && run.clock >= 0) return { kind: "go" };
  if (run.clock < 0) return null;
  const gate = run.mission.gates[run.next];
  if (!gate) return null;
  if (crossed(gate, from, to)) {
    run.next++;
    if (run.next >= run.mission.gates.length) return { kind: "finish", seconds: run.clock };
    return { kind: "gate", index: run.next - 1 };
  }
  if (Math.hypot(to.x - gate.x, to.z - gate.z) > GIVE_UP) return { kind: "lost" };
  return null;
}

/** The mission whose start arch the truck is waiting at, if any. */
export function missionAt(missions: Mission[], x: number, z: number) {
  return missions.find((m) => Math.hypot(m.start.x - x, m.start.z - z) < START_REACH) ?? null;
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

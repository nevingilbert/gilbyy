import type { Mission } from "./missions";

/**
 * A convoy: a course for two to four friends, driven together. A race is gathered and
 * set off the same way, and each driver's time travels with their last flag count so
 * everyone sees the same results. See docs/decisions/0010-convoys.md and
 * 0011-races.md.
 *
 * There is no game server, so the drivers agree among themselves over the valley's
 * broadcast channel (net.ts). One friend gathers at the start arch and calls out; friends
 * who drive up join; the one who gathered sets off; and from then on each truck says how
 * many flags it has passed. Everyone drives the course for themselves, and the convoy is
 * home once everyone still in it is through the finish. Then each claims the payout,
 * naming who they set off with.
 *
 * Broadcasts can be lost, so every message is safe to hear twice and each side repeats
 * itself until it hears back: the call goes out every few seconds while gathering, a
 * joiner keeps asking until the call lists them, and a running truck repeats its count.
 * A driver who goes quiet is left behind. Pure, with time passed in, so it's tested
 * without a network.
 */
export const CONVOY_MAX = 4;
/** How near the start arch to gather, or to join; drive this far again and you've left. */
export const GATHER_REACH = 30;
/** Seconds between calls while gathering, and between counts while running. */
export const CALL_EVERY = 3;
export const COUNT_EVERY = 5;
/** Not heard from for this long, a driver has gone. Seconds. */
export const CONVOY_SILENCE = 15;

export type ConvoyMsg =
  /** From whoever is gathering: who is in so far, them first. */
  | { kind: "open"; id: string; mission: string; crew: string[] }
  | { kind: "join"; id: string; from: string }
  | { kind: "go"; id: string; mission: string; crew: string[] }
  /** How many flags `from` has passed, and once through the finish, in how long. */
  | { kind: "pass"; id: string; from: string; passed: number; seconds?: number }
  | { kind: "leave"; id: string; from: string };

/** Each says which course it's about, so the game can call it a convoy or a race. */
export type ConvoyEvent = { mission: Mission } & (
  /** A friend has started gathering one. */
  | { kind: "called"; leader: string }
  /** Someone is in: the gatherer has taken them, or (`who` being me) taken me. */
  | { kind: "joined"; who: string }
  /** Set off: line up in `slot` and count down. `crew` is everyone in line-up order, me included. */
  | { kind: "go"; slot: number; crew: string[] }
  /** Someone left, or went quiet. */
  | { kind: "left"; who: string }
  /** The one I was waiting in was called off before it set off. */
  | { kind: "off"; leader: string }
  /**
   * Everyone still in it is through the finish. `with` is everyone who set off, besides
   * me; `times` is everyone through, me included, quickest first.
   */
  | { kind: "home"; with: string[]; times: { id: string; seconds: number }[] }
);

type Driver = { id: string; passed: number; heard: number; seconds?: number };
export type ConvoyState = {
  id: string;
  mission: Mission;
  leader: string;
  phase: "gathering" | "running";
  /** The leader first. Me included once I'm in. */
  crew: Driver[];
  /** Everyone who set off, besides me. */
  with: string[];
};
type Call = { leader: string; mission: string; crew: string[]; heard: number };

const KINDS = new Set(["open", "join", "go", "pass", "leave"]);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;
const isCrew = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 1 && v.length <= CONVOY_MAX && v.every(isId);

/** A convoy message off the wire, or null if it isn't one. */
export function readConvoy(p: unknown): ConvoyMsg | null {
  const o = p as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !KINDS.has(o.kind as string) || !isId(o.id)) return null;
  if (o.kind === "open" || o.kind === "go") {
    return isId(o.mission) && isCrew(o.crew) ? { kind: o.kind, id: o.id, mission: o.mission, crew: [...o.crew] } : null;
  }
  if (!isId(o.from)) return null;
  if (o.kind === "pass") {
    const n = o.passed;
    const t = o.seconds;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) return null;
    if (t === undefined) return { kind: "pass", id: o.id, from: o.from, passed: n };
    return typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= 36000 ? { kind: "pass", id: o.id, from: o.from, passed: n, seconds: t } : null;
  }
  return { kind: o.kind as "join" | "leave", id: o.id, from: o.from };
}

/**
 * Where each truck waits behind the start arch: two abreast, the gatherer on the right,
 * clear of the arch's posts.
 */
export function lineUp(m: Mission, slot: number) {
  const side = slot % 2 ? 2.2 : -2.2;
  const back = 8 + Math.floor(slot / 2) * 9;
  const { x, z, heading } = m.start;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return { x: x - fx * back + fz * side, z: z - fz * back - fx * side, heading };
}

/** One player's side of every convoy: the one they're in, and their friends' calls. */
export class Convoys {
  state: ConvoyState | null = null;
  private calls = new Map<string, Call>();
  private sentAt = -Infinity;
  private made = 0;

  constructor(
    private me: () => string,
    private send: (msg: ConvoyMsg) => void,
    private missions: readonly Mission[],
  ) {}

  /** A friend's convoy gathering for `mission`, if there is one. */
  callFor(mission: string) {
    for (const [id, c] of this.calls) if (c.mission === mission) return { id, ...c };
    return null;
  }

  /** Every friend's convoy that's gathering, for pointing the way. */
  callsOut() {
    return [...this.calls.values()];
  }

  /** The others in my convoy and how far each has got. */
  others() {
    return this.state?.crew.filter((d) => d.id !== this.me()) ?? [];
  }

  mine() {
    return this.state?.crew.find((d) => d.id === this.me()) ?? null;
  }

  /**
   * Where I am in a race, 1 for first: behind anyone through the finish quicker, or
   * still on the course with more flags passed.
   */
  place() {
    const me = this.mine();
    if (!me) return 1;
    const ahead = (o: Driver) =>
      o.seconds !== undefined ? me.seconds === undefined || o.seconds < me.seconds : me.seconds === undefined && o.passed > me.passed;
    return 1 + this.others().filter(ahead).length;
  }

  /** Starts gathering a convoy here, with me at its head. */
  gather(mission: Mission, now: number) {
    if (this.state) return;
    const me = this.me();
    const id = `${me}:${(++this.made).toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`;
    this.state = { id, mission, leader: me, phase: "gathering", crew: [{ id: me, passed: 0, heard: now }], with: [] };
    this.call(now);
  }

  /** Asks to join a friend's convoy that's gathering. */
  join(id: string, now: number) {
    const c = this.calls.get(id);
    const mission = c && this.missions.find((m) => m.id === c.mission);
    if (this.state || !c || !mission) return;
    this.state = { id, mission, leader: c.leader, phase: "gathering", crew: c.crew.map((d) => ({ id: d, passed: 0, heard: now })), with: [] };
    this.sentAt = now;
    this.send({ kind: "join", id, from: this.me() });
  }

  /** The gatherer sets off, once there are enough. Returns what to do about it. */
  go(now: number): ConvoyEvent[] {
    const s = this.state;
    if (!s || s.leader !== this.me() || s.phase !== "gathering" || s.crew.length < s.mission.crew) return [];
    this.send({ kind: "go", id: s.id, mission: s.mission.id, crew: s.crew.map((d) => d.id) });
    return [this.start(now)];
  }

  /** My truck has passed another flag. `seconds` is my time, once through the finish. */
  passed(passed: number, now: number, seconds?: number): ConvoyEvent[] {
    const d = this.mine();
    if (!this.state || this.state.phase !== "running" || !d || passed <= d.passed) return [];
    d.passed = passed;
    if (seconds !== undefined) d.seconds = seconds;
    this.count(now);
    return this.home(now);
  }

  /** Gives up, or calls it off. */
  leave() {
    const s = this.state;
    if (!s) return;
    this.send({ kind: "leave", id: s.id, from: this.me() });
    this.state = null;
  }

  /** Something heard from another player. Only friends' calls are listened to. */
  hear(msg: ConvoyMsg, now: number, isFriend: (id: string) => boolean): ConvoyEvent[] {
    const me = this.me();
    const s = this.state?.id === msg.id ? this.state : null;
    const out: ConvoyEvent[] = [];
    if (msg.kind === "open") {
      const leader = msg.crew[0];
      const mission = this.missions.find((m) => m.id === msg.mission);
      if (leader === me || !isFriend(leader) || !mission) return out;
      if (!this.calls.has(msg.id)) out.push({ kind: "called", leader, mission });
      this.calls.set(msg.id, { leader, mission: msg.mission, crew: msg.crew, heard: now });
      if (s?.phase === "gathering") {
        const wasIn = s.crew.some((d) => d.id === me);
        s.crew = msg.crew.map((id) => ({ id, passed: 0, heard: now }));
        if (!wasIn && msg.crew.includes(me)) out.push({ kind: "joined", who: me, mission: s.mission });
      }
    } else if (msg.kind === "join") {
      if (!s || s.leader !== me || s.phase !== "gathering" || !isFriend(msg.from)) return out;
      const d = s.crew.find((c) => c.id === msg.from);
      if (d) d.heard = now;
      else if (s.crew.length < CONVOY_MAX) {
        s.crew.push({ id: msg.from, passed: 0, heard: now });
        out.push({ kind: "joined", who: msg.from, mission: s.mission });
        this.call(now);
      }
    } else if (msg.kind === "go") {
      this.calls.delete(msg.id);
      if (s?.phase !== "gathering") return out;
      if (msg.crew.includes(me)) {
        s.crew = msg.crew.map((id) => ({ id, passed: 0, heard: now }));
        out.push(this.start(now));
      } else {
        // It set off without us: our asking to join never reached them.
        this.state = null;
        out.push({ kind: "off", leader: s.leader, mission: s.mission });
      }
    } else if (msg.kind === "pass") {
      this.calls.delete(msg.id);
      if (!s) return out;
      // The gatherer is counting, so it set off and the word didn't reach us.
      if (s.phase === "gathering") {
        if (msg.from !== s.leader || !s.crew.some((d) => d.id === me)) return out;
        out.push(this.start(now));
      }
      let d = s.crew.find((c) => c.id === msg.from);
      // Someone the gatherer took just before setting off, or back after going quiet.
      if (!d && s.crew.length < CONVOY_MAX) {
        d = { id: msg.from, passed: 0, heard: now };
        s.crew.push(d);
        if (!s.with.includes(msg.from)) s.with.push(msg.from);
      }
      if (d) {
        d.passed = Math.max(d.passed, msg.passed);
        d.heard = now;
        if (msg.seconds !== undefined) d.seconds = msg.seconds;
      }
      out.push(...this.home(now));
    } else if (msg.kind === "leave") {
      if (this.calls.get(msg.id)?.leader === msg.from) this.calls.delete(msg.id);
      if (!s) return out;
      if (s.phase === "gathering" && msg.from === s.leader) {
        this.state = null;
        out.push({ kind: "off", leader: msg.from, mission: s.mission });
      } else if (s.crew.some((d) => d.id === msg.from)) {
        s.crew = s.crew.filter((d) => d.id !== msg.from);
        out.push({ kind: "left", who: msg.from, mission: s.mission }, ...this.home(now));
      }
    }
    return out;
  }

  /** Each frame: repeat whatever needs repeating, and notice who has gone quiet. */
  tick(now: number): ConvoyEvent[] {
    for (const [id, c] of this.calls) if (now - c.heard > CALL_EVERY * 2.5) this.calls.delete(id);
    const s = this.state;
    if (!s) return [];
    const me = this.me();
    const out: ConvoyEvent[] = [];
    if (s.phase === "gathering" && s.leader !== me) {
      // Waiting on a friend's convoy: keep asking until they list us, which also says we're still here.
      if (now - (s.crew.find((d) => d.id === s.leader)?.heard ?? -Infinity) > CONVOY_SILENCE) {
        this.state = null;
        return [{ kind: "off", leader: s.leader, mission: s.mission }];
      }
      if (now - this.sentAt > CALL_EVERY) {
        this.sentAt = now;
        this.send({ kind: "join", id: s.id, from: me });
      }
      return out;
    }
    for (const d of s.crew) {
      if (d.id !== me && now - d.heard > CONVOY_SILENCE) out.push({ kind: "left", who: d.id, mission: s.mission });
    }
    if (out.length) s.crew = s.crew.filter((d) => d.id === me || now - d.heard <= CONVOY_SILENCE);
    if (s.phase === "gathering") {
      if (now - this.sentAt > CALL_EVERY) this.call(now);
      return out;
    }
    if (now - this.sentAt > COUNT_EVERY) this.count(now);
    return [...out, ...this.home(now)];
  }

  private call(now: number) {
    const s = this.state!;
    this.sentAt = now;
    this.send({ kind: "open", id: s.id, mission: s.mission.id, crew: s.crew.map((d) => d.id) });
  }

  private count(now: number) {
    const s = this.state!;
    const d = this.mine();
    this.sentAt = now;
    this.send({ kind: "pass", id: s.id, from: this.me(), passed: d?.passed ?? 0, ...(d?.seconds !== undefined && { seconds: d.seconds }) });
  }

  private start(now: number): ConvoyEvent {
    const s = this.state!;
    const me = this.me();
    s.phase = "running";
    for (const d of s.crew) {
      d.passed = 0;
      d.heard = now;
      delete d.seconds;
    }
    s.with = s.crew.filter((d) => d.id !== me).map((d) => d.id);
    // The first count goes out a second after setting off: if anyone missed the word to
    // go, hearing the gatherer count tells them.
    this.sentAt = now - COUNT_EVERY + 1;
    return { kind: "go", mission: s.mission, slot: Math.max(0, s.crew.findIndex((d) => d.id === me)), crew: s.crew.map((d) => d.id) };
  }

  /** Whether everyone still in it is through the finish. If so it's over, and each claims their own. */
  private home(now: number): ConvoyEvent[] {
    const s = this.state;
    if (!s || s.phase !== "running") return [];
    const flags = s.mission.gates.length;
    if (!s.crew.every((d) => d.passed >= flags)) return [];
    const times = s.crew.flatMap((d) => (d.seconds === undefined ? [] : [{ id: d.id, seconds: d.seconds }])).sort((a, b) => a.seconds - b.seconds);
    // Said once more, in case the last word on it went missing.
    this.count(now);
    this.state = null;
    return [{ kind: "home", mission: s.mission, with: s.with, times }];
  }
}

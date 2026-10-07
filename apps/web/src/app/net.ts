import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Loadout } from "./shop";
import { CAMP_PITCHES } from "./terrain";
import type { VehicleId } from "./vehicles";

/**
 * Everyone signed in drives the same valley. This is how they hear about each other:
 * who's here and which tent is theirs (presence), where their truck is (poses), friend
 * requests, and chat between friends.
 *
 * Two transports with the same shape. Online it's a private Supabase Realtime channel,
 * which only signed-in players can join (see the realtime policies in the migration).
 * `?net=local` swaps in a BroadcastChannel so two tabs of one browser can play
 * together without a Supabase project, for testing.
 *
 * Supabase's free plan counts every message once when sent and once per player who
 * receives it, so poses are sent sparingly: only when the truck has strayed from where
 * the others would guess it is, and less often the more players there are. See
 * docs/architecture.md.
 */
export type Pose = { x: number; y: number; z: number; heading: number; pitch: number; roll: number; speed: number; steer: number };
export type Peer = { id: string; name: string; vehicle: VehicleId; loadout: Loadout; tent: number; joined: number };
export type ChatLine = { from: string; text: string };

export type NetHandlers = {
  /** Everyone else here, whenever that changes. */
  peers(peers: Peer[]): void;
  pose(id: string, pose: Pose): void;
  /** `from` asked to be your friend (or accepted, if you'd asked). */
  asked(from: string): void;
  friended(from: string): void;
  chat(line: ChatLine): void;
};

export type Joined = { tent: number } | { full: true } | { error: string };

export interface Net {
  /** Takes a tent. Resolves `full` if all 30 are in use. */
  join(me: Omit<Peer, "tent" | "joined">): Promise<Joined>;
  /** Changes what others see of you (a new rig, new paint). */
  update(me: Partial<Pick<Peer, "name" | "vehicle" | "loadout">>): void;
  sendPose(pose: Pose): void;
  ask(to: string): void;
  friended(to: string): void;
  /** Says `text` to each of `to` (friends close enough to hear). */
  say(to: string[], text: string): void;
  /** The friends whose chat to listen for. */
  listen(friends: string[]): void;
  leave(): void;
}

export const MAX_PLAYERS = CAMP_PITCHES;
/** How near a friend has to be to hear you. */
export const CHAT_RANGE = 90;
export const MAX_CHAT = 140;

/** Lowest-joined first; the first thirty are in. Ties go to the smaller id. */
const byArrival = (a: Peer, b: Peer) => a.joined - b.joined || (a.id < b.id ? -1 : 1);

/**
 * Picks a tent no one earlier has. Random among the free ones, so two players arriving
 * together rarely pick the same; if they do, the later one moves (see `settle`).
 */
function pickTent(others: Peer[], avoid?: number) {
  const taken = new Set(others.map((p) => p.tent));
  if (avoid !== undefined) taken.add(avoid);
  const free = Array.from({ length: MAX_PLAYERS }, (_, i) => i).filter((i) => !taken.has(i));
  return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
}

/**
 * Given everyone present (including me), decides whether I'm in and on which tent:
 * anyone who arrived before me keeps theirs.
 */
export function settle(all: Peer[], me: Peer): Joined {
  const order = [...all].sort(byArrival);
  const rank = order.findIndex((p) => p.id === me.id);
  if (rank >= MAX_PLAYERS) return { full: true };
  const earlier = order.slice(0, Math.max(0, rank));
  if (!earlier.some((p) => p.tent === me.tent) && me.tent >= 0) return { tent: me.tent };
  const tent = pickTent(earlier);
  return tent < 0 ? { full: true } : { tent };
}

/**
 * When to send a pose: when the others' guess (carrying on in a straight line at the
 * last speed) is off by more than a metre or so, or the heading by a few degrees, but
 * never more often than the budget allows. Parked trucks send nothing.
 */
export class PoseGate {
  private last: Pose | null = null;
  private sentAt = -Infinity;

  /** `players` counts everyone here, me included. */
  due(pose: Pose, now: number, players: number) {
    // Budget: players² × rate ≲ 40 messages a second across the whole valley.
    const interval = Math.max(0.2, (players * players) / 40);
    const age = now - this.sentAt;
    if (age < interval) return false;
    const l = this.last;
    if (!l) return true;
    const guessX = l.x + Math.sin(l.heading) * l.speed * age;
    const guessZ = l.z + Math.cos(l.heading) * l.speed * age;
    const off = Math.hypot(pose.x - guessX, pose.z - guessZ);
    const turned = Math.abs(Math.atan2(Math.sin(pose.heading - l.heading), Math.cos(pose.heading - l.heading)));
    const moving = Math.abs(pose.speed) > 0.2 || Math.abs(l.speed) > 0.2;
    // A heartbeat every few seconds while moving, so a lost message doesn't strand anyone.
    return off > 1.2 || turned > 0.08 || Math.abs(pose.speed - l.speed) > 2.5 || (moving && age > 3);
  }

  /** Sends at the next chance, whatever the budget: someone new needs to know where we are. */
  forget() {
    this.last = null;
    this.sentAt = -Infinity;
  }

  sent(pose: Pose, now: number) {
    this.last = { ...pose };
    this.sentAt = now;
  }
}

const round = (n: number, k = 100) => Math.round(n * k) / k;
const packPose = (p: Pose) => [round(p.x), round(p.y), round(p.z), round(p.heading, 1000), round(p.pitch, 1000), round(p.roll, 1000), round(p.speed), round(p.steer, 1000)];
const unpackPose = (a: number[]): Pose => ({ x: a[0], y: a[1], z: a[2], heading: a[3], pitch: a[4], roll: a[5], speed: a[6], steer: a[7] });

/** The chat channel two friends share: the same name from either side. */
export const chatTopic = (a: string, b: string) => (a < b ? `chat:${a}:${b}` : `chat:${b}:${a}`);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The base both transports share: joining, settling a tent, and the event names. */
abstract class Base implements Net {
  protected me: Peer | null = null;
  protected others = new Map<string, Peer>();
  constructor(protected on: NetHandlers) {}

  protected abstract present(): Peer[];
  protected abstract announce(me: Peer): Promise<void>;
  protected abstract open(): Promise<string | null>;
  protected abstract emit(event: string, payload: Record<string, unknown>): void;
  abstract sendPose(pose: Pose): void;
  abstract say(to: string[], text: string): void;
  abstract listen(friends: string[]): void;
  abstract leave(): void;

  async join(info: Omit<Peer, "tent" | "joined">): Promise<Joined> {
    const error = await this.open();
    if (error) return { error };
    await wait(600); // Let presence fill in.
    const others = this.present().filter((p) => p.id !== info.id);
    if (others.length >= MAX_PLAYERS) {
      this.leave();
      return { full: true };
    }
    let me: Peer = { ...info, tent: pickTent(others), joined: Date.now() };
    // Claim, look again, and move if someone earlier got there first.
    for (let tries = 0; tries < 4; tries++) {
      this.me = me;
      await this.announce(me);
      await wait(700);
      const result = settle([...this.present().filter((p) => p.id !== me.id), me], me);
      if ("full" in result) {
        this.leave();
        return result;
      }
      if ("tent" in result && result.tent === me.tent) return result;
      if ("tent" in result) me = { ...me, tent: result.tent };
    }
    return { tent: me.tent };
  }

  update(patch: Partial<Pick<Peer, "name" | "vehicle" | "loadout">>) {
    if (!this.me) return;
    this.me = { ...this.me, ...patch };
    void this.announce(this.me);
  }

  ask(to: string) {
    if (this.me) this.emit("ask", { from: this.me.id, to });
  }

  friended(to: string) {
    if (this.me) this.emit("friended", { from: this.me.id, to });
  }

  protected heard(event: string, payload: Record<string, unknown>) {
    const me = this.me?.id;
    if (event === "pose" && typeof payload.id === "string" && Array.isArray(payload.p)) {
      this.on.pose(payload.id, unpackPose(payload.p as number[]));
    } else if ((event === "ask" || event === "friended") && payload.to === me && typeof payload.from === "string") {
      if (event === "ask") this.on.asked(payload.from);
      else this.on.friended(payload.from);
    }
  }

  protected peersChanged() {
    const me = this.me?.id;
    this.on.peers(this.present().filter((p) => p.id !== me));
  }
}

const isPeer = (p: unknown): p is Peer => {
  const o = p as Peer;
  return Boolean(o && typeof o.id === "string" && typeof o.name === "string" && typeof o.tent === "number" && typeof o.joined === "number");
};

/** Supabase Realtime: one private channel for the valley, one per pair of friends for chat. */
export class SupabaseNet extends Base {
  private world: RealtimeChannel | null = null;
  private chats = new Map<string, RealtimeChannel>();

  constructor(private sb: SupabaseClient, private myId: string, on: NetHandlers) {
    super(on);
  }

  protected present() {
    const state = this.world?.presenceState<Peer>() ?? {};
    // A player in two tabs shows twice under one key; the earlier claim stands.
    return Object.values(state).map((metas) => [...metas].filter(isPeer).sort(byArrival)[0]).filter(Boolean) as Peer[];
  }

  protected async open() {
    await this.sb.realtime.setAuth();
    const channel = this.sb.channel("world", {
      config: { private: true, presence: { key: this.myId }, broadcast: { self: false, ack: false } },
    });
    channel
      .on("presence", { event: "sync" }, () => this.peersChanged())
      .on("broadcast", { event: "pose" }, ({ payload }) => this.heard("pose", payload))
      .on("broadcast", { event: "ask" }, ({ payload }) => this.heard("ask", payload))
      .on("broadcast", { event: "friended" }, ({ payload }) => this.heard("friended", payload));
    this.world = channel;
    return new Promise<string | null>((resolve) => {
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") resolve(null);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(err?.message ?? "Couldn't reach the valley.");
      });
    });
  }

  protected async announce(me: Peer) {
    await this.world?.track(me);
  }

  protected emit(event: string, payload: Record<string, unknown>) {
    void this.world?.send({ type: "broadcast", event, payload });
  }

  sendPose(pose: Pose) {
    this.emit("pose", { id: this.myId, p: packPose(pose) });
  }

  listen(friends: string[]) {
    const want = new Set(friends.map((f) => chatTopic(this.myId, f)));
    for (const [topic, ch] of this.chats) {
      if (!want.has(topic)) {
        void this.sb.removeChannel(ch);
        this.chats.delete(topic);
      }
    }
    for (const topic of want) {
      if (this.chats.has(topic)) continue;
      const ch = this.sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
      ch.on("broadcast", { event: "say" }, ({ payload }) => {
        if (typeof payload.from === "string" && typeof payload.text === "string") {
          this.on.chat({ from: payload.from, text: payload.text.slice(0, MAX_CHAT) });
        }
      }).subscribe();
      this.chats.set(topic, ch);
    }
  }

  say(to: string[], text: string) {
    for (const friend of to) {
      void this.chats.get(chatTopic(this.myId, friend))?.send({ type: "broadcast", event: "say", payload: { from: this.myId, text: text.slice(0, MAX_CHAT) } });
    }
  }

  leave() {
    this.me = null;
    if (this.world) void this.sb.removeChannel(this.world);
    for (const ch of this.chats.values()) void this.sb.removeChannel(ch);
    this.world = null;
    this.chats.clear();
  }
}

/**
 * Tabs of one browser, for testing multiplayer without a Supabase project. Presence is
 * a heartbeat: a tab not heard from for a few seconds has gone.
 */
export class LocalNet extends Base {
  private bus: BroadcastChannel | null = null;
  private seen = new Map<string, number>();
  private beat = 0;
  private friends = new Set<string>();

  constructor(private myId: string, on: NetHandlers) {
    super(on);
  }

  protected present() {
    return [...this.others.values(), ...(this.me ? [this.me] : [])];
  }

  protected async open() {
    this.bus = new BroadcastChannel("gilbyy-local-world");
    this.bus.onmessage = ({ data }) => {
      const { event, payload } = data as { event: string; payload: Record<string, unknown> };
      const peer = payload as unknown;
      if (event === "here" && isPeer(peer) && peer.id !== this.myId) {
        const known = this.others.has(peer.id);
        this.others.set(peer.id, peer);
        this.seen.set(peer.id, Date.now());
        this.peersChanged();
        // Answer newcomers at once so they don't wait a whole heartbeat to see us.
        if (!known && this.me) this.post("here", this.me);
      } else if (event === "hello") {
        if (this.me) this.post("here", this.me);
      } else if (event === "gone" && typeof payload.id === "string") {
        this.others.delete(payload.id);
        this.peersChanged();
      } else if (event === "say" && payload.to === this.myId && typeof payload.from === "string" && this.friends.has(payload.from)) {
        this.on.chat({ from: payload.from, text: String(payload.text).slice(0, MAX_CHAT) });
      } else this.heard(event, payload);
    };
    this.post("hello", {});
    this.beat = window.setInterval(() => {
      if (this.me) this.post("here", this.me);
      const now = Date.now();
      let changed = false;
      for (const [id, at] of this.seen) {
        if (now - at > 12000) {
          this.seen.delete(id);
          changed = this.others.delete(id) || changed;
        }
      }
      if (changed) this.peersChanged();
    }, 1500);
    return null;
  }

  private post(event: string, payload: object) {
    this.bus?.postMessage({ event, payload });
  }

  protected async announce(me: Peer) {
    this.post("here", me);
  }

  protected emit(event: string, payload: Record<string, unknown>) {
    this.post(event, payload);
  }

  sendPose(pose: Pose) {
    this.post("pose", { id: this.myId, p: packPose(pose) });
  }

  listen(friends: string[]) {
    this.friends = new Set(friends);
  }

  say(to: string[], text: string) {
    for (const friend of to) this.post("say", { from: this.myId, to: friend, text: text.slice(0, MAX_CHAT) });
  }

  leave() {
    if (this.me) this.post("gone", { id: this.myId });
    this.me = null;
    window.clearInterval(this.beat);
    this.bus?.close();
    this.bus = null;
    this.others.clear();
  }
}

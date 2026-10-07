import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mission } from "./missions";
import { countFound } from "./places";
import { STOCK_LOADOUT, freshProgress, itemKey, owns, priceOf, type Loadout, type Progress } from "./shop";
import type { VehicleId } from "./vehicles";

/**
 * Where your miles and garage live. Single player keeps them in memory, so they're gone
 * when you leave (the banner says so). Signed in, every change goes through the
 * database's checked functions (supabase/migrations), so the server decides prices,
 * mission payouts and how fast miles can grow.
 */
export type Profile = Progress & {
  id: string;
  name: string | null;
  goals: string[];
  /** Keys of the garages and cafés found so far (places.ts). */
  found: string[];
};
export type Friend = { id: string; name: string };

/** What a name may be. Must match the check on `profiles.name` in the migrations. */
export const NAME_PATTERN = /^[A-Za-z0-9 _-]{2,20}$/;
const NAME_RULE = "2–20 letters, numbers, spaces, - or _.";
export type Standing = { id: string; name: string; lifetime: number; me: boolean; garages: number; cafes: number; goals: string[] };

export interface Store {
  readonly online: boolean;
  get(): Profile;
  /** Called whenever the profile changes. Returns an unsubscribe. */
  subscribe(cb: () => void): () => void;
  /** Miles just driven. Banked now (single player) or in batches (online). */
  addMiles(miles: number): void;
  flush(): Promise<void>;
  buy(key: string): Promise<string | null>;
  equip(vehicle: VehicleId, loadout: Loadout): Promise<string | null>;
  completeMission(m: Mission, seconds: number): Promise<{ paid: number } | { error: string }>;
  markGoal(goal: string): void;
  /** The truck has come up to a garage or a café for the first time. */
  discover(key: string): void;
  setName(name: string): Promise<string | null>;
  /** Asks to be friends; "friends" if they'd already asked you. */
  requestFriend(id: string): Promise<"pending" | "friends" | { error: string }>;
  /** Someone asked you (heard over the network). */
  noteAsked(from: string): void;
  friends(): Promise<Friend[]>;
  leaderboard(): Promise<Standing[]>;
}

/** In-memory progress with the same rules the server enforces. */
export class LocalStore implements Store {
  readonly online = false;
  private p: Profile;
  private listeners = new Set<() => void>();
  private runs = new Map<string, number>();
  private asked = new Set<string>();
  private asking = new Set<string>();
  private friendIds = new Map<string, string>();

  constructor(id = "local", name: string | null = null) {
    this.p = { ...freshProgress(), id, name, goals: [], found: [] };
  }

  get = () => this.p;
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private set(patch: Partial<Profile>) {
    this.p = { ...this.p, ...patch };
    this.listeners.forEach((cb) => cb());
  }

  addMiles(miles: number) {
    if (miles > 0) this.set({ lifetime: this.p.lifetime + miles, balance: this.p.balance + miles });
  }
  async flush() {}

  async buy(key: string) {
    const price = priceOf(key);
    if (!Number.isFinite(price)) return "That isn't for sale.";
    if (owns(this.p, key)) return null;
    if (this.p.balance < price) return "Not enough miles yet.";
    this.set({ balance: this.p.balance - price, owned: [...this.p.owned, key] });
    return null;
  }

  async equip(vehicle: VehicleId, loadout: Loadout) {
    const keys = [itemKey("vehicle", vehicle), ...Object.entries(loadout).map(([cat, id]) => `${cat}:${id}`)];
    if (!keys.every((k) => owns(this.p, k))) return "You don't own that yet.";
    this.set({ vehicle, loadout: { ...STOCK_LOADOUT, ...loadout } });
    return null;
  }

  async completeMission(m: Mission, seconds: number) {
    if (seconds < m.minSeconds) return { error: "That was too quick to count." };
    const last = this.runs.get(m.id);
    const now = Date.now() / 1000;
    if (last !== undefined && now - last < m.cooldown) return { error: "Come back later for another payout." };
    const paid = last === undefined ? m.reward : m.repeatReward;
    this.runs.set(m.id, now);
    this.set({ lifetime: this.p.lifetime + paid, balance: this.p.balance + paid });
    return { paid };
  }

  markGoal(goal: string) {
    if (!this.p.goals.includes(goal)) this.set({ goals: [...this.p.goals, goal] });
  }

  discover(key: string) {
    if (!this.p.found.includes(key)) this.set({ found: [...this.p.found, key] });
  }

  async setName(name: string) {
    if (!NAME_PATTERN.test(name.trim())) return NAME_RULE;
    this.set({ name: name.trim() });
    return null;
  }

  /** Local multiplayer (testing across tabs) needs names for friends it hears about. */
  rememberName(id: string, name: string) {
    if (this.friendIds.has(id)) this.friendIds.set(id, name);
  }

  async requestFriend(id: string) {
    if (this.friendIds.has(id)) return "friends" as const;
    if (this.asked.has(id)) {
      this.friendIds.set(id, id);
      this.listeners.forEach((cb) => cb());
      return "friends" as const;
    }
    this.asking.add(id);
    return "pending" as const;
  }

  noteAsked(from: string) {
    this.asked.add(from);
    // They asked back after we'd already asked: that's a friendship on this side too.
    if (this.asking.has(from)) {
      this.friendIds.set(from, from);
      this.listeners.forEach((cb) => cb());
    }
  }

  async friends() {
    return [...this.friendIds].map(([id, name]) => ({ id, name }));
  }

  async leaderboard() {
    const found = countFound(this.p.found);
    return [{ id: this.p.id, name: this.p.name ?? "You", lifetime: this.p.lifetime, me: true, garages: found.garage, cafes: found.cafe, goals: this.p.goals }];
  }
}

type Row = {
  id: string; name: string | null; lifetime: number; balance: number; owned: string[];
  vehicle: VehicleId | null; loadout: Loadout; goals: string[]; discovered: string[];
};

// The column is `discovered` because `found` means something else inside a database function.
const toProfile = (r: Row): Profile => ({
  id: r.id, name: r.name, lifetime: Number(r.lifetime), balance: Number(r.balance), owned: r.owned ?? [],
  vehicle: r.vehicle, loadout: { ...STOCK_LOADOUT, ...(r.loadout ?? {}) }, goals: r.goals ?? [], found: r.discovered ?? [],
});

/** Progress on the server. Miles are batched and banked every few seconds. */
export class SupabaseStore implements Store {
  readonly online = true;
  private p: Profile;
  private pending = 0;
  private listeners = new Set<() => void>();

  private constructor(private sb: SupabaseClient, row: Row) {
    this.p = toProfile(row);
  }

  static async open(sb: SupabaseClient) {
    const { data, error } = await sb.rpc("me");
    if (error || !data) throw new Error(error?.message ?? "No profile");
    return new SupabaseStore(sb, data as Row);
  }

  get = () => ({ ...this.p, lifetime: this.p.lifetime + this.pending, balance: this.p.balance + this.pending });
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  private async call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) return error.message;
    this.p = toProfile(data as Row);
    this.notify();
    return null;
  }

  addMiles(miles: number) {
    if (miles <= 0) return;
    this.pending += miles;
    this.notify();
  }

  async flush() {
    if (this.pending <= 0) return;
    const sending = this.pending;
    this.pending = 0;
    const error = await this.call("add_miles", { p_miles: sending });
    // The server banks what it believes; a failed call puts the miles back to try again.
    if (error) this.pending += sending;
  }

  buy = (key: string) => this.call("buy", { p_key: key });
  equip = (vehicle: VehicleId, loadout: Loadout) => this.call("equip", { p_vehicle: vehicle, p_loadout: loadout });

  async completeMission(m: Mission, seconds: number) {
    await this.flush();
    const before = this.p.balance;
    const error = await this.call("complete_mission", { p_mission: m.id, p_seconds: Math.round(seconds * 100) / 100 });
    return error ? { error } : { paid: this.p.balance - before };
  }

  markGoal(goal: string) {
    if (this.p.goals.includes(goal)) return;
    this.p = { ...this.p, goals: [...this.p.goals, goal] };
    void this.call("mark_goal", { p_goal: goal });
  }

  discover(key: string) {
    if (this.p.found.includes(key)) return;
    this.p = { ...this.p, found: [...this.p.found, key] };
    this.notify();
    void this.call("discover", { p_key: key });
  }

  async setName(name: string) {
    const error = await this.call("set_name", { p_name: name });
    // The database names the rule it refused on, which is no use to a player.
    if (error?.includes("profiles_name_key")) return "Someone already has that name.";
    if (error?.includes("profiles_name_check")) return NAME_RULE;
    return error;
  }

  async requestFriend(id: string) {
    const { data, error } = await this.sb.rpc("request_friend", { p_other: id });
    return error ? { error: error.message } : (data as "pending" | "friends");
  }

  noteAsked() {}

  async friends() {
    const { data } = await this.sb.from("friendships").select("a, b");
    const ids = (data ?? []).map((f: { a: string; b: string }) => (f.a === this.p.id ? f.b : f.a));
    if (!ids.length) return [];
    const { data: people } = await this.sb.from("profiles").select("id, name").in("id", ids);
    return (people ?? []).map((p: { id: string; name: string | null }) => ({ id: p.id, name: p.name ?? "Driver" }));
  }

  async leaderboard() {
    const { data } = await this.sb.rpc("leaderboard");
    return (data ?? []).map((r: { id: string; name: string; lifetime: number; is_me: boolean; garages: number; cafes: number; goals: string[] | null }) => ({
      id: r.id, name: r.name, lifetime: Number(r.lifetime), me: r.is_me, garages: r.garages ?? 0, cafes: r.cafes ?? 0, goals: r.goals ?? [],
    }));
  }
}

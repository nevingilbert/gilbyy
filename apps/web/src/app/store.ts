import type { SupabaseClient } from "@supabase/supabase-js";
import { CONVOY_MAX } from "./convoy";
import { EXPLORE_MAX, FOG_CELLS, decodeCells } from "./fog";
import type { Mission } from "./missions";
import { countFound, type FoundCount } from "./places";
import { STOCK_LOADOUT, freshProgress, itemKey, owns, priceOf, soldOnlyIn, type Loadout, type Progress } from "./shop";
import type { WorldId } from "./terrain";
import type { VehicleId } from "./vehicles";
import { WORLDS, isWorld } from "./worlds";

/**
 * Where your miles, garage and map live. Single player keeps them in memory, so they're gone
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
  /** Which world the truck is in. A flight changes it (ADR 0014). */
  world: WorldId;
};
export type Friend = { id: string; name: string };

/** What a name may be. Must match the check on `profiles.name` in the migrations. */
export const NAME_PATTERN = /^[A-Za-z0-9 _-]{2,20}$/;
const NAME_RULE = "2–20 letters, numbers, spaces, - or _.";
/** A row of the leaderboard. `found` is what they've found in `world`, the one the viewer is in. */
export type Standing = { id: string; name: string; lifetime: number; me: boolean; world: WorldId; found: FoundCount; goals: string[] };

const ONLY_SOLD = (world: WorldId) => `That's only sold on ${WORLDS[world].name}.`;
/** One world's explored cells, started empty the first time it's asked for. */
const cellsOf = (all: Map<WorldId, Set<number>>, world: WorldId) => all.get(world) ?? all.set(world, new Set()).get(world)!;

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
  /** A finished run. A convoy (`m.crew` > 1) names who else set off, and one of them must be a friend. */
  completeMission(m: Mission, seconds: number, crew?: string[]): Promise<{ paid: number } | { error: string }>;
  markGoal(goal: string): void;
  /** The truck has come up to a garage or a café for the first time. */
  discover(key: string): void;
  /** The truck has driven into a new cell of the map's fog (fog.ts), in the world it's in. Saved with the next flush. */
  explore(cell: number): void;
  /** The cells explored so far in the world the truck is in, earlier visits included. */
  explored(): number[];
  /** Pays the fare and moves the truck to another world. Resolves to why not, or null once it's aboard. */
  fly(to: WorldId): Promise<string | null>;
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
  private cells = new Map<WorldId, Set<number>>();

  constructor(id = "local", name: string | null = null, world: WorldId = "valley") {
    this.p = { ...freshProgress(), id, name, goals: [], found: [], world };
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
    const only = soldOnlyIn(key);
    if (only && only !== this.p.world) return ONLY_SOLD(only);
    if (this.p.balance < price) return "Not enough miles yet.";
    this.set({ balance: this.p.balance - price, owned: [...this.p.owned, key] });
    return null;
  }

  async fly(to: WorldId) {
    if (!isWorld(to)) return "The plane doesn't go there.";
    if (to === this.p.world) return null;
    if (this.p.balance < WORLDS[to].fare) return "Not enough miles yet.";
    this.set({ balance: this.p.balance - WORLDS[to].fare, world: to });
    return null;
  }

  async equip(vehicle: VehicleId, loadout: Loadout) {
    const keys = [itemKey("vehicle", vehicle), ...Object.entries(loadout).map(([cat, id]) => `${cat}:${id}`)];
    if (!keys.every((k) => owns(this.p, k))) return "You don't own that yet.";
    this.set({ vehicle, loadout: { ...STOCK_LOADOUT, ...loadout } });
    return null;
  }

  async completeMission(m: Mission, seconds: number, crew: string[] = []) {
    if (m.crew > 1) {
      const others = new Set(crew.filter((id) => id !== this.p.id));
      if (others.size < m.crew - 1 || others.size > CONVOY_MAX - 1) return { error: "A convoy needs friends." };
      if (![...others].some((id) => this.friendIds.has(id))) return { error: "A convoy needs friends." };
    }
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

  explore(cell: number) {
    cellsOf(this.cells, this.p.world).add(cell);
  }
  explored = () => [...cellsOf(this.cells, this.p.world)];

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
    const { world } = this.p;
    return [{ id: this.p.id, name: this.p.name ?? "You", lifetime: this.p.lifetime, me: true, world, found: countFound(this.p.found, world), goals: this.p.goals }];
  }
}

type Row = {
  id: string; name: string | null; lifetime: number; balance: number; owned: string[];
  vehicle: VehicleId | null; loadout: Loadout; goals: string[]; discovered: string[]; world?: string | null;
};

// The column is `discovered` because `found` means something else inside a database function.
// A database that hasn't heard of the island yet sends no world: that's the valley.
const toProfile = (r: Row): Profile => ({
  id: r.id, name: r.name, lifetime: Number(r.lifetime), balance: Number(r.balance), owned: r.owned ?? [],
  vehicle: r.vehicle, loadout: { ...STOCK_LOADOUT, ...(r.loadout ?? {}) }, goals: r.goals ?? [], found: r.discovered ?? [],
  world: isWorld(r.world) ? r.world : "valley",
});

/** Progress on the server. Miles are batched and banked every few seconds. */
export class SupabaseStore implements Store {
  readonly online = true;
  private p: Profile;
  private pending = 0;
  private listeners = new Set<() => void>();
  private cells = new Map<WorldId, Set<number>>();
  private unsent: { world: WorldId; cell: number }[] = [];

  private constructor(private sb: SupabaseClient, row: Row, cells: number[]) {
    this.p = toProfile(row);
    this.cells.set(this.p.world, new Set(cells));
  }

  static async open(sb: SupabaseClient) {
    // With no world named, `explored` answers for the one the player is in.
    const [{ data, error }, fog] = await Promise.all([sb.rpc("me"), sb.rpc("explored")]);
    if (error || !data) throw new Error(error?.message ?? "No profile");
    // A map that won't load is no reason to refuse the garage: it just starts fogged.
    return new SupabaseStore(sb, data as Row, fog.error ? [] : decodeCells(fog.data as string | null));
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
    await Promise.all([this.flushMiles(), this.flushFog()]);
  }

  private async flushMiles() {
    if (this.pending <= 0) return;
    const sending = this.pending;
    this.pending = 0;
    const error = await this.call("add_miles", { p_miles: sending });
    // The server banks what it believes; a failed call puts the miles back to try again.
    if (error) this.pending += sending;
  }

  private async flushFog() {
    if (!this.unsent.length) return;
    // One world's cells at a time: each is saved against the world it was explored in.
    const world = this.unsent[0].world;
    const sending = this.unsent.filter((u) => u.world === world).slice(0, EXPLORE_MAX);
    this.unsent = this.unsent.filter((u) => !sending.includes(u));
    const p_cells = sending.map((u) => u.cell);
    // The valley is the default, and named only by leaving it out, so this still saves
    // against a database that hasn't heard of the island yet.
    const { error } = await this.sb.rpc("explore", world === "valley" ? { p_cells } : { p_cells, p_world: world });
    if (error) this.unsent.unshift(...sending);
  }

  async buy(key: string) {
    const error = await this.call("buy", { p_key: key });
    const only = soldOnlyIn(key);
    return error?.includes("only sold") && only ? ONLY_SOLD(only) : error;
  }

  async fly(to: WorldId) {
    // Whatever was driven and seen here is banked here first.
    await this.flush();
    if (this.unsent.length) await this.flushFog();
    const error = await this.call("fly", { p_to: to });
    if (error?.includes("not enough miles")) return "Not enough miles yet.";
    // A database that hasn't had the island's migration yet has no such function.
    if (error) return /could not find the function/i.test(error) ? "The plane isn't flying yet. Try again later." : error;
    // The map of where it lands, if you've been there before.
    const fog = await this.sb.rpc("explored", { p_world: to });
    this.cells.set(to, new Set(fog.error ? [] : decodeCells(fog.data as string | null)));
    return null;
  }

  equip = (vehicle: VehicleId, loadout: Loadout) => this.call("equip", { p_vehicle: vehicle, p_loadout: loadout });

  async completeMission(m: Mission, seconds: number, crew: string[] = []) {
    await this.flush();
    const before = this.p.balance;
    const p_seconds = Math.round(seconds * 100) / 100;
    const error = m.crew > 1
      ? await this.call("complete_convoy", { p_mission: m.id, p_seconds, p_crew: crew })
      : await this.call("complete_mission", { p_mission: m.id, p_seconds });
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

  explore(cell: number) {
    const cells = cellsOf(this.cells, this.p.world);
    if (!Number.isInteger(cell) || cell < 0 || cell >= FOG_CELLS || cells.has(cell)) return;
    cells.add(cell);
    this.unsent.push({ world: this.p.world, cell });
  }
  explored = () => [...cellsOf(this.cells, this.p.world)];

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
    const { world } = this.p;
    let { data } = await this.sb.rpc("leaderboard", { p_world: world });
    // A database that can't count by world yet (before the island's second migration) still counts the valley.
    if (!data) ({ data } = await this.sb.rpc("leaderboard"));
    type Row = { id: string; name: string; lifetime: number; is_me: boolean; garages: number; cafes: number; airports?: number; eggs?: number; goals: string[] | null };
    return (data ?? []).map((r: Row) => ({
      id: r.id, name: r.name, lifetime: Number(r.lifetime), me: r.is_me, world,
      found: { garage: r.garages ?? 0, cafe: r.cafes ?? 0, airport: r.airports ?? 0, egg: r.eggs ?? 0 }, goals: r.goals ?? [],
    }));
  }
}

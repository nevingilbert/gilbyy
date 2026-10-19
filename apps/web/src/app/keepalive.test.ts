import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STOCK_LOADOUT } from "./shop";
import { SupabaseStore } from "./store";
import { KEEPALIVE, keepingAlive } from "./supabase";

/**
 * The bank made as a tab hides or closes is sent with fetch's keepalive, so the browser
 * doesn't cancel it as the page goes (supabase.ts, store.ts). These go through a real
 * supabase-js client down to the browser's fetch, which is stood in for here.
 */
const row = { id: "me", name: "Me", lifetime: 10, balance: 10, owned: [], vehicle: "bluff", loadout: STOCK_LOADOUT, goals: [], discovered: [], world: "valley" };
type Sent = { url: string; init: RequestInit };
/** A browser's fetch that answers as the database would, and keeps what was sent; one that `refuses` a keepalive request fails it, as an old Chrome did one that needed a preflight. */
const browser = (sent: Sent[], refuses = false) =>
  vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    sent.push({ url: String(input), init });
    if (refuses && init.keepalive) throw new TypeError("Failed to fetch");
    const fn = String(input).split("/rpc/")[1];
    return new Response(JSON.stringify(fn === "explored" || fn === "explore" ? null : row), { status: 200, headers: { "Content-Type": "application/json" } });
  });
const sb = createClient("https://gilbyy-test.supabase.co", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: keepingAlive },
});
const to = (fn: string) => (s: Sent) => s.url.endsWith(`/rpc/${fn}`);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the bank made as the page goes", () => {
  it("is sent kept alive, miles and map both, and the mark asking for that goes no further", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent));
    const store = await SupabaseStore.open(sb);
    store.addMiles(1.5);
    store.explore(42);
    await store.flush(true);
    const bank = sent.find(to("add_miles"))!;
    const fog = sent.find(to("explore"))!;
    for (const s of [bank, fog]) {
      expect(s.init.keepalive).toBe(true);
      const headers = new Headers(s.init.headers);
      expect(headers.has(KEEPALIVE)).toBe(false);
      expect(headers.get("apikey")).toBe("test-key");
      expect(headers.get("content-type")).toBe("application/json");
    }
    expect(JSON.parse(String(bank.init.body))).toEqual({ p_miles: 1.5 });
    expect(JSON.parse(String(fog.init.body))).toEqual({ p_cells: [42] });
    expect(store.get().balance).toBe(10);
  });

  it("but every other request goes the ordinary way", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent));
    const store = await SupabaseStore.open(sb);
    store.addMiles(1);
    await store.flush();
    expect(sent.map((s) => s.url.split("/rpc/")[1])).toEqual(["me", "explored", "add_miles"]);
    expect(sent.every((s) => !s.init.keepalive)).toBe(true);
  });

  it("reaches the browser's fetch before any timer could run, as it must while the page is going", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent));
    const store = await SupabaseStore.open(sb);
    store.addMiles(2);
    // Once pagehide's handler has run, a page that's going gets its promises settled and no
    // more: no timer, no later task. So the request has to be made by then.
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "setImmediate"] });
    const going = store.flush(true);
    for (let i = 0; i < 500 && !sent.some(to("add_miles")); i++) await Promise.resolve();
    expect(sent.filter(to("add_miles"))).toHaveLength(1);
    vi.useRealTimers();
    await going;
  });

  it("signed in, carries the session's token, and is still made before any timer could run", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent));
    // Kept as the browser keeps it, in storage that answers at once, and good for an hour.
    const kept = new Map([
      ["gilbyy-test-session", JSON.stringify({
        access_token: "token-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "me", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" },
      })],
    ]);
    const signedIn = createClient("https://gilbyy-test.supabase.co", "test-key", {
      auth: {
        persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "gilbyy-test-session",
        storage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v), removeItem: (k) => void kept.delete(k) },
      },
      global: { fetch: keepingAlive },
    });
    try {
      expect((await signedIn.auth.getSession()).data.session?.access_token).toBe("token-1");
      const store = await SupabaseStore.open(signedIn);
      store.addMiles(2);
      vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "setImmediate"] });
      const going = store.flush(true);
      for (let i = 0; i < 500 && !sent.some(to("add_miles")); i++) await Promise.resolve();
      const bank = sent.filter(to("add_miles"));
      expect(bank).toHaveLength(1);
      expect(bank[0].init.keepalive).toBe(true);
      expect(new Headers(bank[0].init.headers).get("authorization")).toBe("Bearer token-1");
      vi.useRealTimers();
      await going;
    } finally {
      await signedIn.auth.dispose();
    }
  });

  it("hid, then closed a moment later: the bank on hiding has the miles, and closing sends no second one to be refused", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent));
    const store = await SupabaseStore.open(sb);
    store.addMiles(1);
    store.explore(7);
    const hid = store.flush(true);
    const closed = store.flush(true);
    await Promise.all([hid, closed]);
    expect(sent.filter(to("add_miles"))).toHaveLength(1);
    expect(sent.filter(to("explore"))).toHaveLength(1);
  });

  it("goes the ordinary way when the browser won't keep it alive", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", browser(sent, true));
    const store = await SupabaseStore.open(sb);
    store.addMiles(1);
    await store.flush(true);
    expect(sent.filter(to("add_miles")).map((s) => Boolean(s.init.keepalive))).toEqual([true, false]);
    // It got there: nothing is left waiting to be banked again.
    expect(store.get().balance).toBe(10);
  });
});

describe("the client's fetch", () => {
  it("hands an unmarked request straight to the browser", async () => {
    const sent: Sent[] = [];
    const fetch = browser(sent);
    vi.stubGlobal("fetch", fetch);
    const init = { method: "POST", headers: { apikey: "k" }, body: "{}" };
    await keepingAlive("https://gilbyy-test.supabase.co/rest/v1/rpc/me", init);
    expect(fetch).toHaveBeenCalledWith("https://gilbyy-test.supabase.co/rest/v1/rpc/me", init);
  });

  it("doesn't send again a request that was stopped on purpose", async () => {
    const tries: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: unknown, init: RequestInit) => {
        tries.push(init);
        throw new DOMException("stopped", "AbortError");
      }),
    );
    await expect(keepingAlive("https://gilbyy-test.supabase.co/", { headers: { [KEEPALIVE]: "1" } })).rejects.toThrow("stopped");
    expect(tries).toHaveLength(1);
  });
});

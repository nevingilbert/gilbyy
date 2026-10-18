import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, vi } from "vitest";
import { ACHIEVEMENTS, achievementsOf } from "./achievements";
import { currentGoal, GOALS } from "./goals";
import { COUNTDOWN, crossed, startRun, tick } from "./mission-run";
import type { Mission } from "./missions";
import {
  AWAY_HIDDEN, AWAY_IDLE, HEARTBEAT, MAX_PLAYERS, PoseGate, PresenceBudget, SupabaseNet, chatTopic, guessPose, isAway, poseInterval, readPeer, settle, staleAfter,
  type ChatLine, type NetHandlers, type Peer, type Pose,
} from "./net";
import { makeCar, noInput, step, yawRateOf, STOCK, type Car } from "./physics";
import { STOCK_LOADOUT } from "./shop";
import { CLAIM_WAITS, LocalStore, NAME_PATTERN, SupabaseStore } from "./store";
import { VEHICLES } from "./vehicles";

const peer = (id: string, tent: number, joined: number): Peer => ({ id, name: id, vehicle: "bluff", loadout: STOCK_LOADOUT, tent, joined });

describe("tents", () => {
  it("keeps your tent if no one earlier has it", () => {
    expect(settle([peer("a", 3, 1), peer("b", 5, 2)], peer("b", 5, 2))).toEqual({ tent: 5 });
  });

  it("moves whoever arrived later off a shared tent", () => {
    const a = peer("a", 4, 1);
    const b = peer("b", 4, 2);
    expect(settle([a, b], a)).toEqual({ tent: 4 });
    const moved = settle([a, b], b);
    expect("tent" in moved && moved.tent).not.toBe(4);
  });

  it("turns away the thirty-first player", () => {
    const here = Array.from({ length: MAX_PLAYERS }, (_, i) => peer(`p${i}`, i, i));
    expect(settle([...here, peer("late", 0, 100)], peer("late", 0, 100))).toEqual({ full: true });
    // An earlier arrival is still in, even with a crowd behind them.
    expect(settle([...here, peer("late", 0, 100)], here[29])).toEqual({ tent: 29 });
  });
});

describe("pose sending", () => {
  const pose = (x: number, speed: number, heading = 0): Pose => ({ x, y: 0, z: 0, heading, pitch: 0, roll: 0, speed, steer: 0, turn: 0 });

  it("sends nothing while parked, and little while cruising straight", () => {
    const gate = new PoseGate();
    expect(gate.due(pose(0, 0), 0, 2)).toBe(true);
    gate.sent(pose(0, 0), 0);
    expect(gate.due(pose(0, 0), 10, 2)).toBe(false);

    // Heading 0 is +z, so cruise along z at 10 m/s, exactly as predicted.
    gate.sent({ ...pose(0, 10), z: 0 }, 20);
    let sends = 0;
    for (let t = 0.1; t < 2.9; t += 0.1) if (gate.due({ ...pose(0, 10), z: 10 * t }, 20 + t, 2)) sends++;
    expect(sends).toBe(0);
  });

  it("sends when the truck turns away from the guess", () => {
    const gate = new PoseGate();
    gate.sent(pose(0, 10), 0);
    expect(gate.due({ ...pose(0, 10, 0.3), z: 5 }, 0.5, 2)).toBe(true);
  });

  it("guesses round a bend at the speed and turn it last had", () => {
    // Heading 0 faces +z and a positive turn swings it toward +x: a quarter circle ends
    // one radius along each, facing +x.
    const g = guessPose({ ...pose(0, 10), turn: 0.5 }, Math.PI);
    expect(g.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(g.x).toBeCloseTo(20, 6);
    expect(g.z).toBeCloseTo(20, 6);
  });

  it("sends little while driving round a steady bend", () => {
    const flat = { height: () => 0, waterAt: () => -100, obstaclesNear: () => [], slipAt: () => 0, limit: 1000 };
    const car = makeCar(flat, 0, 0, 0);
    const drive = (seconds: number) => {
      for (let i = 0; i < seconds * 120; i++) step(car, { ...noInput(), gas: true, left: true }, 1 / 120, flat, STOCK);
    };
    const poseOf = (c: Car): Pose => ({ ...c, turn: yawRateOf(c, STOCK), stuck: false });
    drive(20); // Up to speed, and settled into the circle.
    const gate = new PoseGate();
    gate.sent(poseOf(car), 0);
    let sends = 0;
    for (let t = 0.1; t < HEARTBEAT - 0.05; t += 0.1) {
      drive(0.1);
      if (gate.due(poseOf(car), t, 2)) sends++;
    }
    expect(Math.abs(car.speed)).toBeGreaterThan(5);
    expect(sends).toBe(0);
  });

  it("keeps carrying a quiet truck forward until its next pose is due", () => {
    for (const players of [2, 5, 10, 20, 30]) {
      expect(staleAfter(players)).toBeGreaterThan(Math.max(HEARTBEAT, poseInterval(players)));
    }
  });

  it("sends less often the more players there are", () => {
    const busy = new PoseGate();
    busy.sent(pose(0, 10), 0);
    expect(busy.due({ ...pose(0, 10, 1), z: 5 }, 0.5, 10)).toBe(false);
    expect(busy.due({ ...pose(0, 10, 1), z: 5 }, 2.6, 10)).toBe(true);
  });

  it("names a chat channel the same from either side", () => {
    expect(chatTopic("b", "a")).toBe(chatTopic("a", "b"));
  });
});

describe("giving a tent back", () => {
  it("happens to a tab left out of sight, sooner than to a game left untouched", () => {
    expect(isAway(0, 60)).toBe(false);
    expect(isAway(AWAY_HIDDEN - 1, AWAY_HIDDEN - 1)).toBe(false);
    expect(isAway(AWAY_HIDDEN, AWAY_HIDDEN)).toBe(true);
    // Showing, but nobody has touched it for a long while.
    expect(isAway(0, AWAY_IDLE - 1)).toBe(false);
    expect(isAway(0, AWAY_IDLE)).toBe(true);
    expect(AWAY_HIDDEN).toBeLessThan(AWAY_IDLE);
  });
});

describe("names", () => {
  it("can be as short as two characters", async () => {
    const store = new LocalStore();
    expect(await store.setName("T")).not.toBeNull();
    expect(await store.setName(" TJ ")).toBeNull();
    expect(store.get().name).toBe("TJ");
    expect(await store.setName("x".repeat(21))).not.toBeNull();
  });

  it("follow the same rule on the server", () => {
    const sql = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261007180000_short_names.sql"), "utf8");
    expect(sql).toContain(`'${NAME_PATTERN.source}'`);
  });
});

describe("presence updates", () => {
  // Realtime closes the channel on a sixth update inside thirty seconds.
  const SERVER_LIMIT = 5;

  it("never sends more than the server allows in any thirty seconds", () => {
    const budget = new PresenceBudget();
    const sent: number[] = [];
    // A player flicking through paints: something to announce twice a second for two minutes.
    for (let now = 0; now < 120; now += 0.5) {
      if (budget.wait(now) > 0) continue;
      budget.spent(now);
      sent.push(now);
    }
    for (const t of sent) expect(sent.filter((s) => s >= t && s < t + 30).length).toBeLessThanOrEqual(SERVER_LIMIT - 1);
    expect(sent.length).toBeGreaterThan(8);
  });

  it("says how long to hold the next one", () => {
    const budget = new PresenceBudget();
    for (const now of [0, 1, 2, 3]) {
      expect(budget.wait(now)).toBe(0);
      budget.spent(now);
    }
    expect(budget.wait(10)).toBe(20);
    expect(budget.wait(30)).toBe(0);
  });

  it("waits a whole window after the server closes the channel", () => {
    const budget = new PresenceBudget();
    budget.drain(100);
    expect(budget.wait(101)).toBe(29);
    expect(budget.wait(130)).toBe(0);
  });
});

/**
 * Just enough of Supabase for SupabaseNet: channels that join at once, and whose presence
 * and broadcasts the test says.
 */
function fakeRealtime() {
  type Handler = { type: string; event: string; cb: (msg: { payload?: unknown }) => void };
  const channels = new Map<string, { handlers: Handler[]; presence: Record<string, unknown[]> }>();
  const sb = {
    realtime: { setAuth: async () => {} },
    channel(topic: string) {
      const c = { handlers: [] as Handler[], presence: {} as Record<string, unknown[]> };
      channels.set(topic, c);
      const ch = {
        state: "joined",
        on(type: string, filter: { event: string }, cb: Handler["cb"]) {
          c.handlers.push({ type, event: filter.event, cb });
          return ch;
        },
        subscribe(cb?: (status: string) => void) {
          cb?.("SUBSCRIBED");
          return ch;
        },
        presenceState: () => c.presence,
        track: async () => "ok",
        send: async () => "ok",
        httpSend: async () => ({ success: true }),
      };
      return ch;
    },
    removeChannel: async () => "ok",
  };
  const fire = (topic: string, type: string, event: string, msg: { payload?: unknown }) => {
    for (const h of channels.get(topic)?.handlers ?? []) if (h.type === type && h.event === event) h.cb(msg);
  };
  return {
    sb: sb as unknown as SupabaseClient,
    /** Who is here on `topic`, as the server says it when anyone comes or goes. */
    present(topic: string, state: Record<string, unknown[]>) {
      channels.get(topic)!.presence = state;
      fire(topic, "presence", "sync", {});
    },
    broadcast: (topic: string, event: string, payload: unknown) => fire(topic, "broadcast", event, { payload }),
  };
}

const ignore = (): NetHandlers => ({
  peers() {}, pose() {}, wanted() {}, asked() {}, friended() {}, chat() {}, convoy() {}, winched() {}, towed() {},
});

describe("other players", () => {
  it("are read from presence with a rig and every part, whatever was left out", () => {
    expect(readPeer({ id: "a", name: "A", tent: 1, joined: 2 })).toEqual({ id: "a", name: "A", vehicle: VEHICLES[0].id, loadout: STOCK_LOADOUT, tent: 1, joined: 2 });
    // A part left out, or that isn't a name, is the stock one: a tab from before the winch names no winch.
    expect(readPeer({ ...peer("a", 1, 2), loadout: { paint: "midnight", tyres: 7 } })?.loadout).toEqual({ ...STOCK_LOADOUT, paint: "midnight" });
    expect(readPeer({ ...peer("a", 1, 2), vehicle: "hovercraft", loadout: null })).toMatchObject({ vehicle: VEHICLES[0].id, loadout: STOCK_LOADOUT });
    expect(readPeer({ ...peer("a", 1, 2), vehicle: "summit" })?.vehicle).toBe("summit");
    expect(readPeer({ name: "A", tent: 1, joined: 2 })).toBeNull();
    expect(readPeer(null)).toBeNull();
  });

  it("are all drawn when one of them says nothing of their rig", async () => {
    vi.useFakeTimers();
    try {
      const rt = fakeRealtime();
      const seen: Peer[][] = [];
      const net = new SupabaseNet(rt.sb, "me", { ...ignore(), peers: (list) => void seen.push(list) });
      const joining = net.join({ id: "me", name: "Me", vehicle: "bluff", loadout: STOCK_LOADOUT });
      await vi.advanceTimersByTimeAsync(5000);
      expect(await joining).toHaveProperty("tent");
      rt.present("world", { ana: [peer("ana", 1, 1)], bare: [{ id: "bare", name: "Bare", tent: 2, joined: 2 }], cy: [peer("cy", 3, 3)] });
      expect(seen.at(-1)).toEqual([peer("ana", 1, 1), { ...peer("bare", 2, 2), name: "Bare", vehicle: VEHICLES[0].id }, peer("cy", 3, 3)]);
      net.leave();
    } finally {
      vi.useRealTimers();
    }
  });

  it("are heard in chat as the friend whose channel it came on, whoever the line says it's from", () => {
    const rt = fakeRealtime();
    const heard: ChatLine[] = [];
    const net = new SupabaseNet(rt.sb, "bea", { ...ignore(), chat: (line) => void heard.push(line) });
    net.listen(["al", "cy"]);
    // Only Al and Bea can send on their channel, so this is Al, saying it's Cy.
    rt.broadcast(chatTopic("al", "bea"), "say", { from: "cy", text: "meet me at the café" });
    expect(heard).toEqual([{ from: "al", text: "meet me at the café" }]);
    rt.broadcast(chatTopic("bea", "cy"), "say", { from: "cy", text: "hello" });
    expect(heard.at(-1)).toEqual({ from: "cy", text: "hello" });
    // A line in Bea's own name is from her other tab, not from Al.
    rt.broadcast(chatTopic("al", "bea"), "say", { from: "bea", text: "hi" });
    expect(heard).toHaveLength(2);
  });
});

const course: Mission = {
  id: "test", name: "Test", blurb: "", start: { x: 0, z: -10, heading: 0 },
  gates: [{ x: 0, z: 0, heading: 0, width: 8 }, { x: 0, z: 20, heading: 0, width: 8 }],
  reward: 1, repeatReward: 0.5, cooldown: 600, minSeconds: 1, minMiles: 0, crew: 1, race: false,
};

describe("missions", () => {
  it("counts a gate only when driven through between the flags", () => {
    const g = course.gates[0];
    expect(crossed(g, { x: 0, z: -1 }, { x: 0, z: 1 })).toBe(true);
    expect(crossed(g, { x: 9, z: -1 }, { x: 9, z: 1 })).toBe(false);
    expect(crossed(g, { x: 0, z: 1 }, { x: 0, z: -1 })).toBe(false);
  });

  it("counts down, then times the gates to the finish", () => {
    const run = startRun(course);
    expect(tick(run, COUNTDOWN - 0.1, { x: 0, z: -10 }, { x: 0, z: -10 })).toBeNull();
    expect(tick(run, 0.2, { x: 0, z: -10 }, { x: 0, z: -10 })).toEqual({ kind: "go" });
    expect(tick(run, 1, { x: 0, z: -1 }, { x: 0, z: 1 })).toEqual({ kind: "gate", index: 0 });
    const end = tick(run, 1, { x: 0, z: 19 }, { x: 0, z: 21 });
    expect(end?.kind).toBe("finish");
    expect(end && "seconds" in end && end.seconds).toBeCloseTo(2.1);
  });

  it("keeps the longest the truck was off the ground in one go, once the run is on", () => {
    const run = startRun(course);
    const here = { x: 0, z: -10 };
    // In the air during the countdown doesn't count.
    tick(run, COUNTDOWN - 0.1, here, here, false);
    expect(run.air).toBe(0);
    tick(run, 0.2, here, here);
    for (let i = 0; i < 5; i++) tick(run, 0.1, here, here, false);
    tick(run, 0.1, here, here);
    for (let i = 0; i < 12; i++) tick(run, 0.1, here, here, false);
    tick(run, 0.1, here, here);
    for (let i = 0; i < 3; i++) tick(run, 0.1, here, here, false);
    expect(run.air).toBeCloseTo(1.2);
    tick(run, 1, { x: 0, z: -1 }, { x: 0, z: 1 });
    expect(tick(run, 1, { x: 0, z: 19 }, { x: 0, z: 21 })).toMatchObject({ kind: "finish", air: run.air });
  });

  it("gives up when you wander off", () => {
    const run = startRun(course);
    run.clock = 1;
    expect(tick(run, 0.1, { x: 0, z: -10 }, { x: 500, z: 0 })).toEqual({ kind: "lost" });
  });
});

describe("single player progress", () => {
  it("banks miles, buys only what you can afford, and pays missions once per cooldown", async () => {
    const s = new LocalStore();
    s.addMiles(3);
    expect(await s.buy("tyres:mud")).toMatch(/not enough/i);
    expect(await s.buy("tyres:allTerrain")).toBeNull();
    expect(s.get().balance).toBeCloseTo(1);
    expect(s.get().lifetime).toBeCloseTo(3);
    expect(await s.equip("bluff", { ...STOCK_LOADOUT, tyres: "mud" })).toMatch(/own/);
    expect(await s.equip("bluff", { ...STOCK_LOADOUT, tyres: "allTerrain" })).toBeNull();

    expect(await s.completeMission(course, 0.5)).toHaveProperty("error");
    expect(await s.completeMission(course, 5)).toEqual({ paid: 1 });
    expect(await s.completeMission(course, 5)).toHaveProperty("error");
  });

  it("pays a convoy only with a friend in it", async () => {
    const s = new LocalStore("me");
    const convoy: Mission = { ...course, id: "convoy", crew: 2 };
    expect(await s.completeMission(convoy, 5)).toHaveProperty("error");
    expect(await s.completeMission(convoy, 5, ["me"])).toHaveProperty("error");
    expect(await s.completeMission(convoy, 5, ["stranger"])).toHaveProperty("error");
    await s.requestFriend("you");
    s.noteAsked("you");
    expect(await s.completeMission(convoy, 5, ["you", "stranger"])).toEqual({ paid: 1 });
  });

  it("needs both players to ask before they're friends", async () => {
    const s = new LocalStore("me");
    expect(await s.requestFriend("you")).toBe("pending");
    expect(await s.friends()).toEqual([]);
    s.noteAsked("you");
    expect((await s.friends()).map((f) => f.id)).toEqual(["you"]);
  });

  it("guides a newcomer one thing at a time", () => {
    expect(currentGoal([], false)?.id).toBe("garage");
    // The compass mark leads to a garage, then the café, then goes away.
    expect(currentGoal(["garage"], false)?.target).toBe("cafe");
    // With a pin down the mark is on the pin, so the line doesn't send them after it.
    expect(currentGoal([], false)?.text).toMatch(/Follow the mark/);
    expect(currentGoal([], false, true)?.text).toMatch(/Take up your pin/);
    expect(currentGoal([], false, true)?.target).toBe("garage");
    expect(currentGoal(["garage"], true, true)?.text).toMatch(/friends/);
    expect(currentGoal(["garage"], false)?.text).not.toMatch(/friends/);
    expect(currentGoal(["garage"], true)?.text).toMatch(/friends/);
    expect(currentGoal(["garage", "cafe"], true)?.target).toBeNull();
    expect(currentGoal(["garage", "cafe", "buy"], false)?.target).toBeNull();
    expect(currentGoal(["garage", "cafe", "buy", "mission"], true)).toBeNull();
  });

  it("turns the first garage and the café into achievements, and nothing else", async () => {
    expect(ACHIEVEMENTS.every((a) => GOALS.some((g) => g.id === a.goal))).toBe(true);
    expect(achievementsOf([]).map((a) => a.name)).toEqual([]);
    expect(achievementsOf(["cafe", "buy", "made-up", "garage"]).map((a) => a.name)).toEqual(["First garage", "First café"]);
    const s = new LocalStore("me");
    s.markGoal("garage");
    expect(achievementsOf((await s.leaderboard())[0].goals).map((a) => a.name)).toEqual(["First garage"]);
  });
});

describe("a finished course's claim, signed in", () => {
  const row = { id: "me", name: "Me", lifetime: 10, balance: 10, owned: [], vehicle: "bluff", loadout: STOCK_LOADOUT, goals: [], discovered: [], world: "valley" };
  /** A request that had no answer: what supabase-js says when the fetch itself fails. */
  const lost = { error: { message: "TypeError: Failed to fetch" }, status: 0 };
  /** A database whose claims are answered with each of `answers` in turn, and paid 12 once one isn't. */
  const database = (answers: { error?: { message: string }; status: number }[]) => {
    const claims: unknown[] = [];
    const rpc = async (fn: string, args: unknown) => {
      if (fn === "me") return { data: row, error: null, status: 200 };
      if (fn === "explored") return { data: null, error: null, status: 200 };
      claims.push(args);
      const a = answers.shift() ?? { status: 200 };
      return a.error ? { data: null, error: a.error, status: a.status } : { data: { ...row, lifetime: 22, balance: 22 }, error: null, status: 200 };
    };
    return { sb: { rpc } as unknown as SupabaseClient, claims };
  };
  const waited = CLAIM_WAITS.reduce((a, b) => a + b);

  it("is sent again when it had no answer", async () => {
    vi.useFakeTimers();
    try {
      const db = database([lost, lost]);
      const store = await SupabaseStore.open(db.sb);
      const claim = store.completeMission(course, 60);
      await vi.advanceTimersByTimeAsync(waited);
      expect(await claim).toEqual({ paid: 12 });
      expect(db.claims).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("but not when the database refused it", async () => {
    const db = database([{ error: { message: "come back later" }, status: 400 }]);
    const store = await SupabaseStore.open(db.sb);
    expect(await store.completeMission(course, 60)).toEqual({ error: "come back later" });
    expect(db.claims).toHaveLength(1);
  });

  it("and gives up after a while, saying why", async () => {
    vi.useFakeTimers();
    try {
      const db = database([lost, ...CLAIM_WAITS.map(() => lost)]);
      const store = await SupabaseStore.open(db.sb);
      const claim = store.completeMission(course, 60);
      await vi.advanceTimersByTimeAsync(waited);
      expect(await claim).toEqual({ error: expect.stringMatching(/couldn't reach/i) });
      expect(db.claims).toHaveLength(CLAIM_WAITS.length + 1);
      expect(waited).toBeLessThanOrEqual(15000);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { currentGoal } from "./goals";
import { COUNTDOWN, crossed, startRun, tick } from "./mission-run";
import type { Mission } from "./missions";
import { AWAY_HIDDEN, AWAY_IDLE, MAX_PLAYERS, PoseGate, PresenceBudget, chatTopic, isAway, settle, type Peer, type Pose } from "./net";
import { STOCK_LOADOUT } from "./shop";
import { LocalStore, NAME_PATTERN } from "./store";

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
  const pose = (x: number, speed: number, heading = 0): Pose => ({ x, y: 0, z: 0, heading, pitch: 0, roll: 0, speed, steer: 0 });

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

const course: Mission = {
  id: "test", name: "Test", blurb: "", start: { x: 0, z: -10, heading: 0 },
  gates: [{ x: 0, z: 0, heading: 0, width: 8 }, { x: 0, z: 20, heading: 0, width: 8 }],
  reward: 1, repeatReward: 0.5, cooldown: 600, minSeconds: 1,
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
    expect(currentGoal(["garage"], false)?.text).not.toMatch(/friends/);
    expect(currentGoal(["garage"], true)?.text).toMatch(/friends/);
    expect(currentGoal(["garage", "cafe"], true)?.target).toBeNull();
    expect(currentGoal(["garage", "cafe", "buy"], false)?.target).toBeNull();
    expect(currentGoal(["garage", "cafe", "buy", "mission"], true)).toBeNull();
  });
});

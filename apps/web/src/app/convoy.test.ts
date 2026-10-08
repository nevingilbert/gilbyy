import { describe, it, expect } from "vitest";
import { CALL_EVERY, CONVOY_MAX, CONVOY_SILENCE, Convoys, lineUp, readConvoy, type ConvoyEvent, type ConvoyMsg } from "./convoy";
import type { Mission } from "./missions";
import { CAFE, CAMP_GATE, buildWorld } from "./world";

const course: Mission = {
  id: "convoy", name: "Convoy", blurb: "", start: { x: 0, z: 0, heading: 0 },
  gates: [{ x: 0, z: 40, heading: 0, width: 14 }, { x: 0, z: 80, heading: 0, width: 14 }, { x: 0, z: 120, heading: 0, width: 14 }],
  reward: 4, repeatReward: 1.2, cooldown: 600, minSeconds: 1, crew: 2, race: false,
};

/**
 * Players on one broadcast channel. Messages arrive after the call that sent them has
 * returned, as they would over a network, and reach everyone else unless `drop` says
 * otherwise. `friends` lists who counts whom as a friend.
 */
function valley(ids: string[], friends: [string, string][], courses: Mission[] = [course]) {
  const events = new Map<string, ConvoyEvent[]>(ids.map((id) => [id, []]));
  const isFriend = (me: string) => (id: string) => friends.some(([a, b]) => (a === me && b === id) || (b === me && a === id));
  let now = 0;
  let drop: (from: string, msg: ConvoyMsg) => boolean = () => false;
  const queue: [string, ConvoyMsg][] = [];
  const players = new Map<string, Convoys>();
  for (const id of ids) players.set(id, new Convoys(() => id, (msg) => void (drop(id, msg) || queue.push([id, msg])), courses));
  const deliver = () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [from, msg] = next;
      for (const [other, p] of players) if (other !== from) events.get(other)!.push(...p.hear(msg, now, isFriend(other)));
    }
  };
  return {
    /** A player, once everything already said has arrived. */
    p: (id: string) => {
      deliver();
      return players.get(id)!;
    },
    /** Events each player has seen since last asked. */
    seen: (id: string) => {
      deliver();
      return events.get(id)!.splice(0);
    },
    /** Runs every player's frame for `seconds`, ten times a second. */
    wait(seconds: number) {
      for (let t = 0; t < seconds; t += 0.1) {
        now += 0.1;
        for (const [id, p] of players) events.get(id)!.push(...p.tick(now));
        deliver();
      }
    },
    get now() {
      return now;
    },
    dropWhen(f: typeof drop) {
      drop = f;
    },
  };
}

/** Ana gathers, Ben joins, and they're ready to set off. */
function gathered() {
  const v = valley(["ana", "ben", "cy"], [["ana", "ben"]]);
  v.p("ana").gather(course, v.now);
  expect(v.seen("ben")).toEqual([{ kind: "called", leader: "ana", mission: course }]);
  const call = v.p("ben").callFor("convoy");
  expect(call?.leader).toBe("ana");
  v.p("ben").join(call!.id, v.now);
  expect(v.seen("ana")).toEqual([{ kind: "joined", who: "ben", mission: course }]);
  expect(v.seen("ben")).toEqual([{ kind: "joined", who: "ben", mission: course }]);
  return v;
}

describe("gathering a convoy", () => {
  it("lets a friend join and sets off together, each in their own place in the line", () => {
    const v = gathered();
    const [go] = v.p("ana").go(v.now);
    expect(go).toMatchObject({ kind: "go", slot: 0 });
    expect(v.seen("ben")).toEqual([{ kind: "go", mission: course, slot: 1, crew: ["ana", "ben"] }]);
    const a = lineUp(course, 0);
    const b = lineUp(course, 1);
    // Side by side behind the arch, clear of its posts at ±4 m.
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(4.4);
    expect(a.z).toBeLessThan(course.start.z);
    expect(Math.abs(a.x)).toBeLessThan(3);
  });

  it("can't set off alone", () => {
    const v = valley(["ana", "ben"], [["ana", "ben"]]);
    v.p("ana").gather(course, v.now);
    expect(v.p("ana").go(v.now)).toEqual([]);
    expect(v.p("ana").state?.phase).toBe("gathering");
  });

  it("is only heard by the gatherer's friends, and only takes friends", () => {
    const v = gathered();
    expect(v.seen("cy")).toEqual([]);
    expect(v.p("cy").callFor("convoy")).toBeNull();
    // Cy asks anyway, knowing the id.
    v.p("ana").hear({ kind: "join", id: v.p("ana").state!.id, from: "cy" }, v.now, () => false);
    expect(v.p("ana").state!.crew.map((d) => d.id)).toEqual(["ana", "ben"]);
  });

  it("takes no more than four", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const v = valley(ids, ids.slice(1).map((id) => ["a", id] as [string, string]));
    v.p("a").gather(course, v.now);
    for (const id of ids.slice(1)) v.p(id).join(v.p(id).callFor("convoy")!.id, v.now);
    expect(v.p("a").state!.crew).toHaveLength(CONVOY_MAX);
    v.p("a").go(v.now);
    expect(v.p("e").state).toBeNull();
    expect(v.seen("e").map((e) => e.kind)).toContain("off");
  });

  it("is called off when the gatherer leaves, or goes quiet", () => {
    const v = gathered();
    v.p("ana").leave();
    expect(v.seen("ben")).toEqual([{ kind: "off", leader: "ana", mission: course }]);
    expect(v.p("ben").state).toBeNull();
    expect(v.p("ben").callFor("convoy")).toBeNull();

    const w = gathered();
    w.dropWhen((from) => from === "ana");
    w.wait(CONVOY_SILENCE + 1);
    expect(w.seen("ben")).toContainEqual({ kind: "off", leader: "ana", mission: course });
    expect(w.p("ben").state).toBeNull();
  });

  it("forgets a joiner who goes quiet, and keeps calling", () => {
    const v = gathered();
    let calls = 0;
    v.dropWhen((from, msg) => {
      if (msg.kind === "open") calls++;
      return from === "ben";
    });
    v.wait(CONVOY_SILENCE + 1);
    expect(v.seen("ana")).toContainEqual({ kind: "left", who: "ben", mission: course });
    expect(v.p("ana").state!.crew.map((d) => d.id)).toEqual(["ana"]);
    expect(calls).toBeGreaterThanOrEqual(Math.floor((CONVOY_SILENCE + 1) / CALL_EVERY) - 1);
  });

  it("gets a joiner in even if their first ask is lost", () => {
    const v = valley(["ana", "ben"], [["ana", "ben"]]);
    v.p("ana").gather(course, v.now);
    v.seen("ben");
    let lost = false;
    v.dropWhen((_, msg) => msg.kind === "join" && !lost && (lost = true));
    v.p("ben").join(v.p("ben").callFor("convoy")!.id, v.now);
    expect(v.p("ana").state!.crew).toHaveLength(1);
    v.wait(CALL_EVERY + 1);
    expect(v.p("ana").state!.crew.map((d) => d.id)).toEqual(["ana", "ben"]);
    expect(v.seen("ben")).toContainEqual({ kind: "joined", who: "ben", mission: course });
  });
});

describe("driving as a convoy", () => {
  it("sets off anyone who missed the word to go, as soon as the gatherer counts", () => {
    const v = gathered();
    v.dropWhen((_, msg) => msg.kind === "go");
    v.p("ana").go(v.now);
    expect(v.p("ben").state?.phase).toBe("gathering");
    v.wait(1.5);
    expect(v.seen("ben")).toContainEqual({ kind: "go", mission: course, slot: 1, crew: ["ana", "ben"] });
    expect(v.p("ben").state?.phase).toBe("running");
  });

  it("is home only when everyone is through the finish, and says who with", () => {
    const v = gathered();
    v.p("ana").go(v.now);
    v.seen("ben");
    for (let n = 1; n <= course.gates.length; n++) expect(v.p("ana").passed(n, v.now)).toEqual([]);
    v.wait(10);
    expect(v.seen("ana")).toEqual([]);
    expect(v.p("ana").others()).toEqual([expect.objectContaining({ id: "ben", passed: 0 })]);
    v.p("ben").passed(1, v.now);
    expect(v.p("ana").others()[0].passed).toBe(1);
    v.p("ben").passed(2, v.now);
    expect(v.p("ben").passed(3, v.now)).toEqual([{ kind: "home", mission: course, with: ["ana"], times: [] }]);
    expect(v.seen("ana")).toEqual([{ kind: "home", mission: course, with: ["ben"], times: [] }]);
    expect(v.p("ana").state).toBeNull();
    expect(v.p("ben").state).toBeNull();
  });

  it("catches up on counts that went missing", () => {
    const v = gathered();
    v.p("ana").go(v.now);
    v.dropWhen((from, msg) => from === "ben" && msg.kind === "pass" && msg.passed < 3);
    v.p("ben").passed(1, v.now);
    v.p("ben").passed(2, v.now);
    expect(v.p("ana").others()[0].passed).toBe(0);
    v.dropWhen(() => false);
    v.wait(6);
    expect(v.p("ana").others()[0].passed).toBe(2);
  });

  it("carries on without someone who leaves or goes quiet, and still comes home", () => {
    const v = valley(["ana", "ben", "cy"], [["ana", "ben"], ["ana", "cy"]]);
    v.p("ana").gather(course, v.now);
    v.p("ben").join(v.p("ben").callFor("convoy")!.id, v.now);
    v.p("cy").join(v.p("cy").callFor("convoy")!.id, v.now);
    v.p("ana").go(v.now);
    for (const id of ["ana", "ben", "cy"]) v.seen(id);
    v.p("ben").leave();
    expect(v.seen("ana")).toEqual([{ kind: "left", who: "ben", mission: course }]);
    for (let n = 1; n <= 3; n++) v.p("ana").passed(n, v.now);
    v.dropWhen((from) => from === "cy");
    v.wait(CONVOY_SILENCE + 1);
    const seen = v.seen("ana");
    expect(seen).toContainEqual({ kind: "left", who: "cy", mission: course });
    // Everyone who set off is named, gone or not.
    expect(seen).toContainEqual({ kind: "home", mission: course, with: ["ben", "cy"], times: [] });
  });

  it("takes back someone who went quiet and comes back", () => {
    const v = gathered();
    v.p("ana").go(v.now);
    v.dropWhen((from) => from === "ben");
    v.wait(CONVOY_SILENCE + 1);
    expect(v.p("ana").others()).toEqual([]);
    v.dropWhen(() => false);
    v.p("ben").passed(1, v.now);
    expect(v.p("ana").others()).toEqual([expect.objectContaining({ id: "ben", passed: 1 })]);
    expect(v.p("ana").state!.with).toEqual(["ben"]);
  });
});

describe("convoy messages", () => {
  it("are checked before they're believed", () => {
    expect(readConvoy({ kind: "open", id: "x", mission: "convoy", crew: ["a", "b"] })).toEqual({ kind: "open", id: "x", mission: "convoy", crew: ["a", "b"] });
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 3 })).toEqual({ kind: "pass", id: "x", from: "a", passed: 3 });
    expect(readConvoy({ kind: "open", id: "x", mission: "convoy", crew: [] })).toBeNull();
    expect(readConvoy({ kind: "open", id: "x", mission: "convoy", crew: ["a", "b", "c", "d", "e"] })).toBeNull();
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 3, seconds: 92.5 })).toEqual({ kind: "pass", id: "x", from: "a", passed: 3, seconds: 92.5 });
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 3, seconds: -1 })).toBeNull();
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 3, seconds: "fast" })).toBeNull();
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 1.5 })).toBeNull();
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: -1 })).toBeNull();
    expect(readConvoy({ kind: "join", id: "x" })).toBeNull();
    expect(readConvoy({ kind: "steal", id: "x", from: "a" })).toBeNull();
    expect(readConvoy(null)).toBeNull();
    expect(readConvoy("open")).toBeNull();
  });
});

describe("racing", () => {
  const racecourse: Mission = { ...course, id: "race", race: true };
  const raceValley = () => {
    const players = ["ana", "ben", "cy"];
    const v = valley(players, [["ana", "ben"], ["ana", "cy"]], [racecourse]);
    v.p("ana").gather(racecourse, v.now);
    v.p("ben").join(v.p("ben").callFor("race")!.id, v.now);
    v.p("cy").join(v.p("cy").callFor("race")!.id, v.now);
    v.p("ana").go(v.now);
    for (const id of players) v.seen(id);
    return v;
  };

  it("says where everyone is: flags passed while racing, then times through the finish", () => {
    const v = raceValley();
    v.p("ben").passed(1, v.now);
    v.p("ben").passed(2, v.now);
    v.p("cy").passed(1, v.now);
    expect(v.p("ben").place()).toBe(1);
    expect(v.p("cy").place()).toBe(2);
    expect(v.p("ana").place()).toBe(3);
    v.p("ben").passed(3, v.now, 70);
    for (let n = 1; n <= 3; n++) v.p("ana").passed(n, v.now, n === 3 ? 65 : undefined);
    // Ana was quicker from her own "go", so she's ahead of Ben, who crossed first.
    expect(v.p("ana").place()).toBe(1);
    expect(v.p("ben").place()).toBe(2);
    expect(v.p("cy").place()).toBe(3);
  });

  it("ends with everyone's times, quickest first, the same for all", () => {
    const v = raceValley();
    for (let n = 1; n <= 3; n++) v.p("ben").passed(n, v.now, n === 3 ? 70 : undefined);
    for (let n = 1; n <= 3; n++) v.p("cy").passed(n, v.now, n === 3 ? 90 : undefined);
    const last = (() => {
      for (let n = 1; n < 3; n++) v.p("ana").passed(n, v.now);
      return v.p("ana").passed(3, v.now, 65);
    })();
    const times = [{ id: "ana", seconds: 65 }, { id: "ben", seconds: 70 }, { id: "cy", seconds: 90 }];
    expect(last).toEqual([{ kind: "home", mission: racecourse, with: ["ben", "cy"], times }]);
    expect(v.seen("ben")).toContainEqual({ kind: "home", mission: racecourse, with: ["ana", "cy"], times });
    expect(v.seen("cy")).toContainEqual({ kind: "home", mission: racecourse, with: ["ana", "ben"], times });
  });

  it("gets a time through even if the word of it was lost", () => {
    const v = raceValley();
    v.dropWhen((from, msg) => from === "ben" && msg.kind === "pass" && msg.seconds !== undefined);
    for (let n = 1; n <= 3; n++) v.p("ben").passed(n, v.now, n === 3 ? 70 : undefined);
    expect(v.p("ana").others().find((d) => d.id === "ben")?.seconds).toBeUndefined();
    v.dropWhen(() => false);
    v.wait(6);
    expect(v.p("ana").others().find((d) => d.id === "ben")?.seconds).toBe(70);
  });
});

describe("the courses for friends", () => {
  const world = buildWorld();
  const together = world.missions.filter((m) => m.crew > 1);
  const convoy = together.find((m) => !m.race)!;
  const race = together.find((m) => m.race)!;
  /** Points every 10 m along a course, from the start arch through every flag. */
  const line = (m: Mission) => {
    const pts = [m.start, ...m.gates];
    return pts.slice(1).flatMap((b, i) => {
      const a = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10);
      return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }));
    });
  };

  it("are a convoy and a race, each for two to four", () => {
    expect(together.map((m) => [m.id, m.crew, m.race])).toEqual([["convoy", 2, false], ["race", 2, true]]);
  });

  it("start a short drive from the café and the camp, and come back round", () => {
    expect(Math.hypot(convoy.start.x - CAFE.x, convoy.start.z - CAFE.z)).toBeLessThan(300);
    expect(Math.hypot(race.start.x - CAMP_GATE.x, race.start.z - CAMP_GATE.z)).toBeLessThan(300);
    for (const m of together) {
      const first = m.gates[0];
      const last = m.gates[m.gates.length - 1];
      expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(1);
    }
  });

  it("have flags wide enough for two abreast, and line-ups on dry, clear ground", () => {
    for (const m of together) {
      expect(m.gates.every((g) => g.width >= 12)).toBe(true);
      for (let slot = 0; slot < CONVOY_MAX; slot++) {
        const p = lineUp(m, slot);
        expect(world.height(p.x, p.z)).toBeGreaterThan(world.waterAt(p.x, p.z) + 0.3);
        expect(world.obstaclesNear(p.x, p.z).filter((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 3)).toEqual([]);
      }
    }
  });

  it("keep away from every other course", () => {
    for (const m of together) {
      const mine = line(m);
      for (const other of world.missions.filter((o) => o !== m)) {
        const theirs = line(other);
        const closest = Math.min(...mine.map((p) => Math.min(...theirs.map((q) => Math.hypot(p.x - q.x, p.z - q.z)))));
        expect(closest).toBeGreaterThan(25);
      }
    }
  });
});

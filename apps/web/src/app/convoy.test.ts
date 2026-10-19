import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CALL_EVERY, CONVOY_MAX, CONVOY_SILENCE, Convoys, FLAGS_MAX, ID_MAX, LINE_UP_BACK, TIME_MAX, countEvery, flagGap, lineUp, readConvoy,
  type ConvoyEvent, type ConvoyMsg,
} from "./convoy";
import { buildIsland } from "./island";
import { TOO_QUICK, type Mission } from "./missions";
import { buildVegas } from "./vegas";
import { CAFE, CAMP_GATE, buildWorld } from "./world";

const course: Mission = {
  id: "convoy", name: "Convoy", blurb: "", start: { x: 0, z: 0, heading: 0 },
  gates: [{ x: 0, z: 40, heading: 0, width: 14 }, { x: 0, z: 80, heading: 0, width: 14 }, { x: 0, z: 120, heading: 0, width: 14 }],
  reward: 4, repeatReward: 1.2, cooldown: 600, minSeconds: 1, minMiles: 0, crew: 2, race: false,
};

/**
 * Players on one broadcast channel. Messages arrive after the call that sent them has
 * returned, as they would over a network, and reach everyone else unless `drop` says
 * otherwise. `friends` lists who counts whom as a friend. `online` is how it is signed in
 * (ADR 0025): the server writes its sender's own id into every message, whatever it said,
 * and sends it to everyone, the sender too.
 */
function valley(ids: string[], friends: [string, string][], courses: Mission[] = [course], online = false) {
  const events = new Map<string, ConvoyEvent[]>(ids.map((id) => [id, []]));
  const isFriend = (me: string) => (id: string) => friends.some(([a, b]) => (a === me && b === id) || (b === me && a === id));
  let now = 0;
  let drop: (from: string, msg: ConvoyMsg) => boolean = () => false;
  const queue: [string, ConvoyMsg][] = [];
  const players = new Map<string, Convoys>();
  for (const id of ids) players.set(id, new Convoys(() => id, (msg) => void (drop(id, msg) || queue.push([id, msg])), courses));
  const deliver = () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [from, said] = next;
      const msg = online ? { ...said, from } : said;
      for (const [other, p] of players) if (online || other !== from) events.get(other)!.push(...p.hear(msg, now, isFriend(other)));
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
    /**
     * Puts `msg` on the channel as `from` says it: anyone in the world can send anything, in
     * any name, but online it goes out in `from`'s own.
     */
    forge(from: string, msg: ConvoyMsg) {
      queue.push([from, msg]);
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

  it("takes no more than ten", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    const v = valley(ids, ids.slice(1).map((id) => ["a", id] as [string, string]));
    v.p("a").gather(course, v.now);
    for (const id of ids.slice(1)) v.p(id).join(v.p(id).callFor("convoy")!.id, v.now);
    expect(CONVOY_MAX).toBe(10);
    expect(v.p("a").state!.crew.map((d) => d.id)).toEqual(ids.slice(0, 10));
    v.p("a").go(v.now);
    expect(v.p("k").state).toBeNull();
    expect(v.seen("k").map((e) => e.kind)).toContain("off");
    // The ten are lined up two abreast in five rows, each in a place of its own.
    expect(v.seen("j")).toContainEqual(expect.objectContaining({ kind: "go", slot: 9, crew: ids.slice(0, 10) }));
  });

  it("lines ten up behind the arch, two abreast, with room between them", () => {
    const spots = Array.from({ length: CONVOY_MAX }, (_, slot) => lineUp(course, slot));
    for (const [i, p] of spots.entries()) {
      // Behind the arch, between its posts, facing the first flag.
      expect(p.z).toBeLessThanOrEqual(-8);
      expect(p.z).toBeGreaterThanOrEqual(-LINE_UP_BACK);
      expect(Math.abs(p.x)).toBeLessThan(3);
      expect(p.heading).toBe(course.start.heading);
      for (const q of spots.slice(i + 1)) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(4.3);
    }
    expect(Math.min(...spots.map((p) => p.z))).toBe(-LINE_UP_BACK);
    // The first four are where a crew of four always was, bar the second row standing closer.
    expect(spots.slice(0, 2).map((p) => [p.x, p.z])).toEqual([[-2.2, -8], [2.2, -8]]);
  });

  it("has a big crew say less each, so ten trucks through one flag don't all shout at once", () => {
    expect(flagGap(2)).toBe(0);
    expect(flagGap(4)).toBe(0);
    expect(flagGap(10)).toBeGreaterThanOrEqual(4);
    expect(countEvery(4)).toBe(5);
    expect(countEvery(10)).toBeGreaterThan(5);
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const sent: ConvoyMsg[] = [];
    const v = valley(ids, ids.slice(1).map((id) => ["a", id] as [string, string]));
    v.p("a").gather(course, v.now);
    for (const id of ids.slice(1)) v.p(id).join(v.p(id).callFor("convoy")!.id, v.now);
    v.p("a").go(v.now);
    v.wait(2);
    v.dropWhen((_, msg) => (sent.push(msg), false));
    // Everyone through the first flag in the same second: nobody has anything to add yet.
    for (const id of ids) v.p(id).passed(1, v.now);
    expect(sent.filter((m) => m.kind === "pass")).toEqual([]);
    // But they all hear in the end, and the finish is never held back.
    v.wait(countEvery(10) + 1);
    expect(v.p("a").others().every((d) => d.passed === 1)).toBe(true);
    sent.length = 0;
    v.p("b").passed(3, v.now, 41);
    expect(sent).toEqual([expect.objectContaining({ kind: "pass", from: "b", passed: 3, seconds: 41 })]);
    // Nobody is taken for gone just for counting less often.
    v.wait(CONVOY_SILENCE + 2);
    expect(v.p("a").others()).toHaveLength(9);
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

  it("sets off with the crew its gatherer took, whatever anyone else calls out for it", () => {
    const v = gathered();
    const ana = v.p("ana");
    const id = ana.state!.id;
    // Calls and the word to go only ever come from the gatherer, so these, for Ana's own
    // convoy, are someone else's: whatever name they carry, and whoever they put first.
    ana.hear({ kind: "open", id, from: "ben", mission: course.id, crew: ["ben", "cy"] }, v.now, () => true);
    ana.hear({ kind: "go", id, from: "cy", mission: course.id, crew: ["ana", "cy"] }, v.now, () => true);
    ana.hear({ kind: "go", id, from: "ana", mission: course.id, crew: ["ana", "cy"] }, v.now, () => true);
    expect(ana.state).toMatchObject({ phase: "gathering", leader: "ana" });
    expect(ana.state!.crew.map((d) => d.id)).toEqual(["ana", "ben"]);
    ana.go(v.now);
    expect(ana.state!.with).toEqual(["ben"]);
  });

  it("takes a call or the word to go only from the one gathering, and joiners keep to the one they joined", () => {
    // Cy is Ben's friend, not Ana's, so Ana's calls mean nothing to her. She has the convoy's
    // id, though: every message goes to everyone in the world.
    const v = valley(["ana", "ben", "cy"], [["ana", "ben"], ["ben", "cy"]]);
    v.p("ana").gather(course, v.now);
    v.p("ben").join(v.p("ben").callFor("convoy")!.id, v.now);
    for (const who of ["ana", "ben", "cy"]) v.seen(who);
    const id = v.p("ana").state!.id;
    // A call for Ana's convoy with Cy at its head, a go in Ana's name that Cy sends, and one
    // with Ana first that says it's from Cy.
    v.forge("cy", { kind: "open", id, from: "cy", mission: course.id, crew: ["cy", "ben"] });
    v.forge("cy", { kind: "go", id, from: "cy", mission: course.id, crew: ["ana"] });
    v.forge("cy", { kind: "go", id, from: "cy", mission: course.id, crew: ["ana", "cy"] });
    expect(v.seen("ben")).toEqual([]);
    expect(v.p("ben").state).toMatchObject({ id, leader: "ana", phase: "gathering" });
    expect(v.p("ben").state!.crew.map((d) => d.id)).toEqual(["ana", "ben"]);
    expect(v.p("ben").callFor("convoy")?.leader).toBe("ana");
  });

  it("keeps a friend's call in mind whoever else counts in it", () => {
    const v = gathered();
    const id = v.p("ana").state!.id;
    v.p("cy").hear({ kind: "open", id, from: "ana", mission: course.id, crew: ["ana", "ben"] }, v.now, () => true);
    // Only its gatherer counting would mean it had set off.
    v.forge("ben", { kind: "pass", id, from: "ben", passed: 1 });
    expect(v.p("cy").callFor("convoy")?.leader).toBe("ana");
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

  it("doesn't wait for a stranger who counts in it, however long they keep it up", () => {
    const v = gathered();
    v.p("ana").go(v.now);
    const id = v.p("ana").state!.id;
    for (const who of ["ana", "ben", "cy"]) v.seen(who);
    // Cy is a friend of neither, but every call goes to everyone, so she has the convoy's
    // id. She counts in it every five seconds, in her own name and a few made-up ones.
    const forge = () => {
      for (const name of ["cy", "eve", "mallory", "trent"]) v.forge("cy", { kind: "pass", id, from: name, passed: 0 });
    };
    for (let i = 0; i < 4; i++) {
      forge();
      v.wait(5);
    }
    expect(v.p("ana").others().map((d) => d.id)).toEqual(["ben"]);
    expect(v.p("ana").state!.with).toEqual(["ben"]);
    expect(v.p("ben").state!.with).toEqual(["ana"]);
    // So it's home when the two of them are through.
    for (let n = 1; n <= course.gates.length; n++) v.p("ana").passed(n, v.now);
    forge();
    for (let n = 1; n < course.gates.length; n++) v.p("ben").passed(n, v.now);
    expect(v.p("ben").passed(course.gates.length, v.now)).toEqual([{ kind: "home", mission: course, with: ["ana"], times: [] }]);
    expect(v.seen("ana")).toContainEqual({ kind: "home", mission: course, with: ["ben"], times: [] });
  });

  it("takes no count in my name but my own, nor a leave", () => {
    const v = gathered();
    v.p("ana").go(v.now);
    const id = v.p("ana").state!.id;
    for (const who of ["ana", "ben"]) v.seen(who);
    // Someone tells Ana she's through the finish before she has passed a flag.
    expect(v.p("ana").hear({ kind: "pass", id, from: "ana", passed: course.gates.length }, v.now, () => false)).toEqual([]);
    expect(v.p("ana").mine()?.passed).toBe(0);
    // So it isn't home when Ben is through: Ana still has the course to drive.
    for (let n = 1; n <= course.gates.length; n++) v.p("ben").passed(n, v.now);
    expect(v.seen("ana")).toEqual([]);
    expect(v.p("ana").state?.phase).toBe("running");
    // Nor can anyone else take her out of it, so its end isn't claimed as a run alone.
    v.p("ana").hear({ kind: "leave", id, from: "ana" }, v.now, () => false);
    expect(v.p("ana").mine()).not.toBeNull();
    // It's home once she is through herself, and her claim names Ben.
    for (let n = 1; n < course.gates.length; n++) v.p("ana").passed(n, v.now);
    expect(v.p("ana").passed(course.gates.length, v.now)).toEqual([{ kind: "home", mission: course, with: ["ben"], times: [] }]);
    expect(v.seen("ben")).toContainEqual({ kind: "home", mission: course, with: ["ana"], times: [] });
  });

  it("goes the same online, where all that's said comes back to its sender, in their own name", () => {
    const v = valley(["ana", "ben", "cy"], [["ana", "ben"]], [course], true);
    v.p("ana").gather(course, v.now);
    // Her own call comes back to her, and is nothing new.
    expect(v.seen("ana")).toEqual([]);
    expect(v.seen("ben")).toEqual([{ kind: "called", leader: "ana", mission: course }]);
    v.p("ben").join(v.p("ben").callFor("convoy")!.id, v.now);
    expect(v.seen("ana")).toEqual([{ kind: "joined", who: "ben", mission: course }]);
    expect(v.seen("ben")).toEqual([{ kind: "joined", who: "ben", mission: course }]);
    v.p("ana").go(v.now);
    expect(v.seen("ben")).toEqual([{ kind: "go", mission: course, slot: 1, crew: ["ana", "ben"] }]);
    for (let n = 1; n <= course.gates.length; n++) v.p("ana").passed(n, v.now);
    for (let n = 1; n < course.gates.length; n++) v.p("ben").passed(n, v.now);
    expect(v.p("ben").passed(course.gates.length, v.now)).toEqual([{ kind: "home", mission: course, with: ["ana"], times: [] }]);
    expect(v.seen("ana")).toContainEqual({ kind: "home", mission: course, with: ["ben"], times: [] });
    expect(v.seen("cy")).toEqual([]);
  });

  it("online, can't be called off, set off, counted or left in anyone's name but the sender's", () => {
    const v = valley(["ana", "ben", "cy"], [["ana", "ben"], ["ben", "cy"]], [course], true);
    v.p("ana").gather(course, v.now);
    v.p("ben").join(v.p("ben").callFor("convoy")!.id, v.now);
    const id = v.p("ana").state!.id;
    // While it gathers, Cy says Ana has called it off, and sets it off without Ben.
    v.forge("cy", { kind: "leave", id, from: "ana" });
    v.forge("cy", { kind: "go", id, from: "ana", mission: course.id, crew: ["ana"] });
    expect(v.p("ben").state).toMatchObject({ id, phase: "gathering" });
    v.p("ana").go(v.now);
    for (const who of ["ana", "ben", "cy"]) v.seen(who);
    // Once they're off, she says Ben is through the finish, and then that he has left.
    v.forge("cy", { kind: "pass", id, from: "ben", passed: course.gates.length, seconds: 1 });
    v.forge("cy", { kind: "leave", id, from: "ben" });
    expect(v.p("ana").others()).toEqual([expect.objectContaining({ id: "ben", passed: 0 })]);
    expect(v.seen("ana")).toEqual([]);
    // So Ana through the finish isn't home: Ben has still to come.
    for (let n = 1; n <= course.gates.length; n++) v.p("ana").passed(n, v.now);
    expect(v.p("ana").state?.phase).toBe("running");
  });
});

describe("convoy messages", () => {
  const relay = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261018120000_convoy_relay.sql"), "utf8");
  const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  /** How Postgres writes jsonb out, which is what the server measures: a space after every colon and comma. */
  const asJsonb = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(asJsonb).join(", ")}]`
    : v !== null && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${asJsonb(x)}`).join(", ")}}`
    : JSON.stringify(v);

  it("are checked before they're believed", () => {
    expect(readConvoy({ kind: "open", id: "x", from: "a", mission: "convoy", crew: ["a", "b"] })).toEqual({ kind: "open", id: "x", from: "a", mission: "convoy", crew: ["a", "b"] });
    expect(readConvoy({ kind: "pass", id: "x", from: "a", passed: 3 })).toEqual({ kind: "pass", id: "x", from: "a", passed: 3 });
    expect(readConvoy({ kind: "open", id: "x", from: "a", mission: "convoy", crew: [] })).toBeNull();
    // Every kind says who it's from, a call as much as a count: the server writes it in.
    expect(readConvoy({ kind: "open", id: "x", mission: "convoy", crew: ["a", "b"] })).toBeNull();
    const ten = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(readConvoy({ kind: "go", id: "x", from: "a", mission: "convoy", crew: ten })).toEqual({ kind: "go", id: "x", from: "a", mission: "convoy", crew: ten });
    expect(readConvoy({ kind: "open", id: "x", from: "a", mission: "convoy", crew: [...ten, "k"] })).toBeNull();
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

  it("carry nothing the server doesn't take, and are held to the same limits there", () => {
    expect(relay).toContain(`length(p_message->>'id') not between 1 and ${ID_MAX}`);
    expect(relay).toContain(`jsonb_array_length(p_message->'crew') not between 1 and ${CONVOY_MAX}`);
    expect(relay).toContain(`::numeric not between 0 and ${FLAGS_MAX}`);
    expect(relay).toContain(`::numeric not between 0 and ${TIME_MAX}`);
    // What the server lets each kind carry.
    const takes = new Map([...relay.matchAll(/when '(\w+)' then array\[([^\]]*)\]/g)].map(([, kind, list]) => [kind, list.split(",").map((f) => f.trim().replace(/'/g, ""))]));
    expect([...takes.keys()].sort()).toEqual(["go", "join", "leave", "open", "pass"]);
    // Everything the game says over a race, from gathering to coming home, and one called off.
    const said: ConvoyMsg[] = [];
    const race: Mission = { ...course, id: "race", race: true };
    const v = valley(["ana", "ben"], [["ana", "ben"]], [race]);
    v.dropWhen((_, msg) => (said.push(msg), false));
    v.p("ana").gather(race, v.now);
    v.p("ben").join(v.p("ben").callFor("race")!.id, v.now);
    v.wait(CALL_EVERY + 1);
    v.p("ana").go(v.now);
    v.wait(2);
    for (const who of ["ana", "ben"]) for (let n = 1; n <= race.gates.length; n++) v.p(who).passed(n, v.now, n === race.gates.length ? 60 : undefined);
    v.p("ana").gather(race, v.now);
    v.p("ana").leave();
    expect(new Set(said.map((m) => m.kind))).toEqual(new Set(["open", "join", "go", "pass", "leave"]));
    expect(said.some((m) => m.kind === "pass" && m.seconds !== undefined)).toBe(true);
    for (const m of said) expect(Object.keys(m).every((k) => takes.get(m.kind)!.includes(k)), JSON.stringify(m)).toBe(true);
  });

  it("are never longer than the server takes, even a call with ten in the crew", () => {
    const cap = Number(relay.match(/octet_length\(p_message::text\) > (\d+)/)?.[1]);
    expect(cap).toBeGreaterThan(0);
    // Everything in it as long as it may be.
    const biggest: ConvoyMsg = { kind: "open", id: `${uuid(0)}:`.padEnd(ID_MAX, "z"), from: uuid(0), mission: "m".repeat(ID_MAX), crew: Array.from({ length: CONVOY_MAX }, (_, i) => uuid(i)) };
    expect(readConvoy(biggest)).toEqual(biggest);
    expect(asJsonb(biggest).length).toBeLessThan(cap);
    // What the game itself sends is shorter still: at most a call for ten, on the course with the longest name.
    const ids = Array.from({ length: CONVOY_MAX }, (_, i) => uuid(i));
    const prix: Mission = { ...course, id: "grand-prix-race" };
    const said: ConvoyMsg[] = [];
    const v = valley(ids, ids.slice(1).map((id) => [ids[0], id] as [string, string]), [prix]);
    v.dropWhen((_, msg) => (said.push(msg), false));
    v.p(ids[0]).gather(prix, v.now);
    for (const id of ids.slice(1)) v.p(id).join(v.p(id).callFor(prix.id)!.id, v.now);
    v.wait(1);
    expect(said.filter((m) => m.kind === "open").at(-1)).toMatchObject({ crew: ids });
    expect(Math.max(...said.map((m) => asJsonb(m).length))).toBeLessThan(600);
  });

  it("name the gatherer at the head of a convoy's id and first in its crew, as the server checks", () => {
    const c = new Convoys(() => uuid(7), () => {}, [course]);
    c.gather(course, 0);
    expect(c.state!.id.startsWith(`${uuid(7)}:`)).toBe(true);
    expect(c.state!.crew[0].id).toBe(uuid(7));
    expect(relay).toContain("starts_with(p_message->>'id', me::text || ':')");
    expect(relay).toContain("p_message->'crew'->>0 <> me::text");
  });

  it("are never said faster than the server lets a player, by ten gathering at once or two racing the Grand Prix flat out", () => {
    const burst = Number(relay.match(/burst constant int := (\d+);/)?.[1]);
    const perSecond = Number(relay.match(/per_second constant numeric := ([\d.]+);/)?.[1]);
    expect(burst).toBeGreaterThan(0);
    expect(perSecond).toBeGreaterThan(0);
    /** Whether the server would refuse any of a player's messages, said at `times`. */
    const refused = (times: number[]) => {
      let spare = burst;
      let last = -Infinity;
      return times.some((t) => {
        spare = Math.min(burst, spare + (t - last) * perSecond) - 1;
        last = t;
        return spare < 0;
      });
    };
    const prix = buildVegas().missions.find((m) => m.id === "grand-prix-race")!;
    for (const crew of [CONVOY_MAX, 2]) {
      const ids = Array.from({ length: crew }, (_, i) => `p${i}`);
      const v = valley(ids, ids.slice(1).map((id) => ["p0", id] as [string, string]), [prix], true);
      const when = new Map(ids.map((id) => [id, [] as number[]]));
      v.dropWhen((from) => (when.get(from)!.push(v.now), false));
      // Everyone asks at once, and they wait a while to set off.
      v.p("p0").gather(prix, v.now);
      for (const id of ids.slice(1)) v.p(id).join(v.p(id).callFor(prix.id)!.id, v.now);
      v.wait(20);
      v.p("p0").go(v.now);
      // Then every truck through every flag together, at a speed no rig can average.
      const pts = [prix.start, ...prix.gates];
      let at = v.now;
      for (const [i, g] of prix.gates.entries()) {
        at += Math.hypot(g.x - pts[i].x, g.z - pts[i].z) / TOO_QUICK;
        v.wait(at - v.now);
        for (const id of ids) v.p(id).passed(i + 1, v.now, i + 1 === prix.gates.length ? v.now : undefined);
      }
      v.wait(5);
      expect(v.p("p0").state).toBeNull();
      for (const id of ids) expect(refused(when.get(id)!), `${id} of ${crew}`).toBe(false);
    }
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
  const convoy = together.find((m) => m.id === "convoy")!;
  const race = together.find((m) => m.id === "race")!;
  /** Points every 10 m along a course, from the start arch through every flag. */
  const line = (m: Mission) => {
    const pts = [m.start, ...m.gates];
    return pts.slice(1).flatMap((b, i) => {
      const a = pts[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10);
      return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }));
    });
  };

  const island = buildIsland();
  const ashore = island.missions.filter((m) => m.crew > 1);
  const comesRound = (m: Mission) => Math.hypot(m.gates[0].x - m.gates[m.gates.length - 1].x, m.gates[0].z - m.gates[m.gates.length - 1].z) < 1;

  it("are five convoys and five races in the valley, and two of each on the island, each for two to ten", () => {
    expect(together.map((m) => [m.id, m.crew, m.race])).toEqual([
      ["convoy", 2, false], ["race", 2, true], ["grand-tour", 2, false], ["hill-race", 2, true],
      ["barn-round", 2, false], ["lakehead-race", 2, true], ["snowline", 2, false], ["two-lakes-race", 2, true],
      ["trackside", 2, false], ["flat-out", 2, true],
    ]);
    expect(ashore.map((m) => [m.id, m.crew, m.race])).toEqual([
      ["coast-convoy", 2, false], ["sand-race", 2, true], ["tideline", 2, false], ["dune-derby", 2, true],
    ]);
  });

  // The sandbar's course (ADR 0020) is one more to drive alone, when the tide lets you.
  it("are as many as the courses to drive alone, in both worlds, the sandbar aside", () => {
    expect(world.missions.filter((m) => m.crew === 1)).toHaveLength(together.length);
    expect(island.missions.filter((m) => m.crew === 1 && m.ebb === undefined)).toHaveLength(ashore.length);
  });

  it("start a short drive from the café and the camp, and all but three come back round", () => {
    expect(Math.hypot(convoy.start.x - CAFE.x, convoy.start.z - CAFE.z)).toBeLessThan(300);
    expect(Math.hypot(race.start.x - CAMP_GATE.x, race.start.z - CAMP_GATE.z)).toBeLessThan(300);
    // Three are runs of flags from one place to another; the rest are loops.
    expect([...together, ...ashore].filter((m) => !comesRound(m)).map((m) => m.id)).toEqual(["trackside", "flat-out", "tideline"]);
    // The island's convoy sets off from by its café, where friends are made.
    const coast = ashore[0];
    expect(Math.hypot(coast.start.x - island.cafe.x, coast.start.z - island.cafe.z)).toBeLessThan(350);
  });

  it("have flags wide enough for two abreast, and line-ups for ten on dry, clear ground", () => {
    for (const [ground, courses] of [[world, together], [island, ashore]] as const) {
      for (const m of courses) {
        expect(m.gates.every((g) => g.width >= 12), m.id).toBe(true);
        for (let slot = 0; slot < CONVOY_MAX; slot++) {
          const p = lineUp(m, slot);
          expect(ground.height(p.x, p.z), m.id).toBeGreaterThan(ground.waterAt(p.x, p.z) + 0.3);
          expect(ground.obstaclesNear(p.x, p.z).filter((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 3), m.id).toEqual([]);
        }
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

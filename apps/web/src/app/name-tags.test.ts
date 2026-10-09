import { describe, it, expect } from "vitest";
import { TAG_GAP, TAG_STAY, stackTags, type TagBox } from "./name-tags";

const tag = (id: string, x: number, y: number, far: number, w = 80, h = 16): TagBox => ({ id, x, y, w, h, far });

/** Where each tag ends up drawn: its box after the lift. */
const drawn = (boxes: TagBox[], lifts: Map<string, number>) =>
  boxes.map((b) => {
    const bottom = b.y - lifts.get(b.id)!;
    return { id: b.id, left: b.x - b.w / 2, right: b.x + b.w / 2, top: bottom - b.h, bottom };
  });

const overlapping = (boxes: TagBox[], lifts: Map<string, number>) => {
  const d = drawn(boxes, lifts);
  const out: string[] = [];
  for (let i = 0; i < d.length; i++) {
    for (let j = i + 1; j < d.length; j++) {
      const [a, b] = [d[i], d[j]];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${a.id}/${b.id}`);
    }
  }
  return out;
};

describe("name tags", () => {
  it("leaves tags that are apart where they are", () => {
    const boxes = [tag("a", 200, 300, 30), tag("b", 400, 300, 32), tag("c", 200, 200, 60)];
    const lifts = stackTags(boxes);
    for (const b of boxes) expect(lifts.get(b.id)).toBe(0);
  });

  it("lifts the further of two friends driving abreast clear of the nearer", () => {
    // Seen from the side, two trucks a lane apart: their tags land almost on one another.
    const boxes = [tag("far", 330, 302, 44), tag("near", 300, 300, 40)];
    const lifts = stackTags(boxes);
    expect(lifts.get("near")).toBe(0);
    expect(lifts.get("far")).toBe(302 - (300 - 16 - TAG_GAP));
    expect(overlapping(boxes, lifts)).toEqual([]);
  });

  it("stacks a whole line-up, nearest at the bottom, with nothing overlapping", () => {
    const boxes = [tag("d", 305, 296, 52), tag("b", 295, 300, 44), tag("a", 300, 300, 40), tag("c", 310, 298, 48)];
    const lifts = stackTags(boxes);
    expect(overlapping(boxes, lifts)).toEqual([]);
    const tops = drawn(boxes, lifts).sort((p, q) => q.bottom - p.bottom).map((p) => p.id);
    expect(tops).toEqual(["a", "b", "c", "d"]);
  });

  it("only lifts a tag as far as it needs to", () => {
    // `c` overlaps nothing but `a`, which is low on the screen: it goes just above `a`
    // and stops, under the far-off `b`, which is out of its way.
    const boxes = [tag("a", 300, 300, 30), tag("b", 300, 200, 90), tag("c", 340, 305, 35)];
    const lifts = stackTags(boxes);
    expect(lifts.get("a")).toBe(0);
    expect(lifts.get("b")).toBe(0);
    expect(lifts.get("c")).toBe(305 - (300 - 16 - TAG_GAP));
    expect(overlapping(boxes, lifts)).toEqual([]);
  });

  it("lifts a tag past one stacked above it in turn", () => {
    // `c` first clears `a`, which puts it on `b`, so it goes above `b` too.
    const boxes = [tag("a", 300, 300, 30), tag("b", 360, 282, 32), tag("c", 330, 300, 40)];
    const lifts = stackTags(boxes);
    expect(overlapping(boxes, lifts)).toEqual([]);
    expect(lifts.get("c")).toBe(300 - (282 - 16 - TAG_GAP));
  });

  it("doesn't swap which tag is on top while two trucks keep about level", () => {
    const at = (nearA: number, nearB: number) => [tag("a", 300, 300, nearA), tag("b", 320, 300, nearB)];
    let lifts = stackTags(at(40, 41));
    expect(lifts.get("b")).toBeGreaterThan(0);
    // `b` creeps a little nearer than `a`: its tag stays on top.
    lifts = stackTags(at(40, 40 - TAG_STAY / 2), lifts);
    expect(lifts.get("a")).toBe(0);
    expect(lifts.get("b")).toBeGreaterThan(0);
    // Clearly nearer now: the tags change places.
    lifts = stackTags(at(40, 40 - TAG_STAY * 2), lifts);
    expect(lifts.get("b")).toBe(0);
    expect(lifts.get("a")).toBeGreaterThan(0);
  });

  it("copes with no tags at all", () => {
    expect(stackTags([]).size).toBe(0);
  });
});

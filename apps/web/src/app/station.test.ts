import { beforeAll, describe, expect, it } from "vitest";
import { buildCity } from "./city";
import { loadCityData } from "./city-streets";
import { BED, FLAT_FROM_HEAD, carsOn, linePoint } from "./rail";
import { OUT, WAGON, arrival, departure, inEnd, outEnd } from "./rail-trip";
import { CONSIST } from "./track";
import { buildWorld, type World } from "./world";

const worlds: Record<"valley" | "city", World> = { valley: buildWorld(), city: undefined! };
// The city's ground and streets are fetched on their own (ADR 0022).
beforeAll(async () => {
  await loadCityData();
  worlds.city = buildCity();
}, 30000);

const STEP = 0.05;
const half = CONSIST[CONSIST.length - 1].length / 2;

describe.each(["valley", "city"] as const)("the %s's station", (id) => {
  const world = () => worlds[id];
  const st = () => world().station!;

  it("keeps its platform clear of the flat wagon, wherever it stands, so a truck can get round to the ramp", () => {
    const s = st();
    // Leaving, the wagon is the back of a train with its front at `head`; just in, of one with its front at `arrive`, facing the platform.
    const leaving = s.head - s.facing * FLAT_FROM_HEAD;
    const arrived = s.arrive + FLAT_FROM_HEAD;
    for (const w of [leaving, arrived]) {
      const [a, b] = s.platform;
      expect(w + half < a || w - half > b, `wagon at ${w} beside platform ${a}–${b}`).toBe(true);
    }
    expect(carsOn(s.line, s.head, s.facing).at(-1)!.kind).toBe("flat");
  });

  it("puts the tunnel's mouth where the hill stands over the rails, on a level floor", () => {
    const s = st();
    const w = world();
    for (let d = s.portal - 30; d <= s.portal; d += 1) {
      const p = linePoint(s.line, d);
      expect(w.height(p.x, p.z) - (p.y - BED.under)).toBeLessThan(0.06);
    }
    const inside = linePoint(s.line, s.portal + 25);
    expect(w.height(inside.x, inside.z) - inside.y).toBeGreaterThan(4);
    // The valley's goes in at the mountains round its edge, out past the foothills.
    if (id === "valley") expect(Math.hypot(linePoint(s.line, s.portal).x, linePoint(s.line, s.portal).z)).toBeGreaterThan(2400);
  });

  it("films the way out: the truck round to the ramp and up onto the wagon, and the train into the dark", () => {
    const s = st();
    const ground = (x: number, z: number) => world().height(x, z);
    const from = { ...s.board, heading: s.board.heading + 0.5 };
    let last = departure(s, from, ground, 0);
    for (let t = STEP; t <= outEnd(s) + 1e-9; t += STEP) {
      const f = departure(s, from, ground, t);
      // Never a jump within a shot: the truck drives, and once aboard rides the wagon. Between shots the film cuts.
      if (f.truck && last.truck && f.camera.shot === last.camera.shot) expect(Math.hypot(f.truck.x - last.truck.x, f.truck.z - last.truck.z)).toBeLessThan(1.2);
      // The camera's never under the ground.
      expect(f.camera.from.y).toBeGreaterThan(ground(f.camera.from.x, f.camera.from.z));
      last = f;
    }
    // Aboard by the time the ramp comes up, on the deck in the middle of the wagon.
    const aboard = departure(s, from, ground, OUT.rampUp[0]);
    const w = aboard.cars.at(-1)!;
    expect(Math.hypot(aboard.truck!.x - w.x, aboard.truck!.z - w.z)).toBeLessThan(0.5);
    expect(aboard.truck!.base).toBeCloseTo(w.y + WAGON.deck, 1);
    expect(last.dark).toBe(1);
    expect(last.truck).toBeNull();
  });

  it("films the way in: out of the tunnel to the platform, and the truck backed off and left beside it", () => {
    const s = st();
    const ground = (x: number, z: number) => world().height(x, z);
    expect(arrival(s, ground, 0).dark).toBe(1);
    let last = arrival(s, ground, 0);
    for (let t = STEP; t <= inEnd(s) + 1e-9; t += STEP) {
      const f = arrival(s, ground, t);
      if (f.camera.shot === last.camera.shot) expect(Math.hypot(f.truck!.x - last.truck!.x, f.truck!.z - last.truck!.z)).toBeLessThan(1.2);
      expect(f.camera.from.y).toBeGreaterThan(ground(f.camera.from.x, f.camera.from.z));
      last = f;
    }
    expect(last.dark).toBe(0);
    expect(Math.hypot(last.truck!.x - s.leave.x, last.truck!.z - s.leave.z)).toBeLessThan(0.5);
    expect(Math.cos(last.truck!.heading - s.leave.heading)).toBeGreaterThan(0.99);
    // Left on the ground, clear of the track.
    expect(last.truck!.base).toBeCloseTo(ground(s.leave.x, s.leave.z), 1);
  });
});

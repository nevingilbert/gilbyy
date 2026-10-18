import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCity, type CityWorld } from "./city";
import { deckPoint } from "./city-bridges";
import { loadCityData } from "./city-streets";
import type { Peer, Pose } from "./net";
import { createRemotes } from "./remote";
import { STOCK_LOADOUT, specFor } from "./shop";
import { sampleGrid } from "./world";

let city: CityWorld;
beforeAll(async () => {
  await loadCityData();
  city = buildCity();
}, 60000);

const ground = (x: number, z: number) => sampleGrid(city.heights, x, z);
const peer = (id: string, tent = 0): Peer => ({ id, name: id, vehicle: "overlander", loadout: STOCK_LOADOUT, tent, joined: 0 });
const SPEC = specFor("overlander", STOCK_LOADOUT);

/** A place where a deck stands high over dry ground you can drive across, square to it, from open ground on one side to the other. */
function underDeck() {
  for (const d of city.city.decks) {
    for (let s = 40; s < d.length - 40; s += 10) {
      const p = deckPoint(d, s);
      const g = ground(p.x, p.z);
      if (p.y - g < 9 || g < city.waterAt(p.x, p.z) + 0.5) continue;
      const across = { x: p.fz, z: -p.fx };
      const line = Array.from({ length: 13 }, (_, i) => -30 + i * 5).map((k) => ({ k, x: p.x + across.x * k, z: p.z + across.z * k }));
      const dry = line.every((q) => ground(q.x, q.z) > city.waterAt(q.x, q.z) + 0.5 && Math.abs(ground(q.x, q.z) - g) < 6);
      const open = line.filter((q) => Math.abs(q.k) >= 25).every((q) => city.city.deckIndex.roadAt(q.x, q.z) === null);
      if (dry && open) return { p, ground: g, across, heading: Math.atan2(across.x, across.z) };
    }
  }
  return null;
}

/** Drives the drawn trucks a frame at a time for `seconds`, checking each frame. */
function frames(remotes: ReturnType<typeof createRemotes>, from: number, seconds: number, check: (t: number) => void) {
  for (let t = 0; t <= seconds; t += 1 / 30) {
    remotes.update(1 / 30, from + t, 0);
    check(t);
  }
}

const pose = (x: number, z: number, y: number, heading: number, speed: number): Pose => ({ x, y, z, heading, pitch: 0, roll: 0, speed, steer: 0, turn: 0 });

describe("a friend's truck where a bridge crosses over (ADR 0022)", () => {
  it("stays on the ground as it's carried in under the deck between poses, and out the other side", () => {
    const spot = underDeck();
    expect(spot, "a deck high over dry ground").not.toBeNull();
    const { p, across, heading } = spot!;
    const remotes = createRemotes(new THREE.Scene(), city);
    remotes.sync([peer("friend")]);
    // Heading in under the deck at 8 m/s, heard of 25 m short of it, then not again for a while.
    const start = { x: p.x - across.x * 25, z: p.z - across.z * 25 };
    remotes.pose("friend", pose(start.x, start.z, ground(start.x, start.z) + SPEC.ride, heading, 8), 100);
    let under = 0;
    frames(remotes, 100, 4.4, () => {
      const { car } = remotes.truck("friend")!;
      if (city.city.deckIndex.roadAt(car.x, car.z) !== null) under++;
      expect(car.y - ground(car.x, car.z), `at ${car.x.toFixed(0)}, ${car.z.toFixed(0)}`).toBeCloseTo(SPEC.ride, 1);
    });
    expect(under).toBeGreaterThan(10);
    remotes.dispose();
  });

  it("isn't drawn underground after coming out, when the last pose was sent under the deck", () => {
    const { p, ground: g, heading } = underDeck()!;
    const remotes = createRemotes(new THREE.Scene(), city);
    remotes.sync([peer("friend")]);
    remotes.pose("friend", pose(p.x, p.z, g + SPEC.ride, heading, 8), 100);
    let out = 0;
    frames(remotes, 100, 4.4, () => {
      const { car } = remotes.truck("friend")!;
      if (city.city.deckIndex.roadAt(car.x, car.z) === null) out++;
      expect(car.y - ground(car.x, car.z)).toBeCloseTo(SPEC.ride, 1);
    });
    expect(out).toBeGreaterThan(10);
    // Its name tag is over it too, not up on the bridge.
    const tag = remotes.tags()[0];
    expect(tag.y - remotes.truck("friend")!.car.y).toBeLessThan(4);
    remotes.dispose();
  });

  it("stays up on the deck when it's driving along it", () => {
    const { p } = underDeck()!;
    const remotes = createRemotes(new THREE.Scene(), city);
    remotes.sync([peer("friend")]);
    remotes.pose("friend", pose(p.x, p.z, p.y + SPEC.ride, Math.atan2(p.fx, p.fz), 15), 100);
    frames(remotes, 100, 2, () => {
      const { car } = remotes.truck("friend")!;
      const road = city.city.deckIndex.roadAt(car.x, car.z);
      expect(road).not.toBeNull();
      expect(car.y - road!).toBeCloseTo(SPEC.ride, 1);
    });
    remotes.dispose();
  });
});

describe("other players' trucks", () => {
  it("are all drawn when one of them can't be: a presence with no loadout gets a stock truck, and one that throws is left out", () => {
    const remotes = createRemotes(new THREE.Scene(), city);
    const bare = { id: "bare", name: "bare", vehicle: "mule", tent: 2, joined: 0 } as unknown as Peer;
    const broken = {
      ...peer("broken", 3),
      loadout: {
        get paint(): string {
          throw new Error("not a loadout");
        },
      },
    } as unknown as Peer;
    remotes.sync([peer("first", 1), bare, broken, peer("last", 4)]);
    expect(remotes.truck("first")).not.toBeNull();
    expect(remotes.truck("bare")).not.toBeNull();
    expect(remotes.truck("broken")).toBeNull();
    expect(remotes.truck("last")).not.toBeNull();
    expect(remotes.positions().map((p) => p.id).sort()).toEqual(["bare", "first", "last"]);
    // And again, the next time presence changes: nothing is stuck behind the bad one.
    remotes.sync([peer("first", 1), broken, bare, peer("later", 5)]);
    expect(remotes.positions().map((p) => p.id).sort()).toEqual(["bare", "first", "later"]);
    remotes.update(1 / 30, 1, 0);
    remotes.dispose();
  });
});

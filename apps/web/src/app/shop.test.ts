import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CONVOY_MAX } from "./convoy";
import { PARTS, STOCK_LOADOUT, freshProgress, itemKey, owns, priceOf, specFor, type PartCategory } from "./shop";
import { STARTERS, VEHICLES } from "./vehicles";
import { buildIsland } from "./island";
import { buildWorld } from "./world";

const dir = resolve(__dirname, "../../../../supabase/migrations");
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(resolve(dir, f), "utf8"));
/**
 * Every row of `table` as the migrations leave it, keyed by `key`, as column → value. A
 * later insert of the same key (`on conflict … do update`) replaces the earlier row's
 * columns, as it does in the database.
 */
const rows = (table: string, key: string) => {
  const out = new Map<string, Record<string, string>>();
  for (const sql of migrations) {
    for (const [, cols, block] of sql.matchAll(new RegExp(`insert into public\\.${table} \\(([^)]*)\\) values([\\s\\S]*?)(?:on conflict[\\s\\S]*?)?;`, "g"))) {
      const names = cols.split(",").map((c) => c.trim());
      for (const m of block.matchAll(/\(([^()]*)\)/g)) {
        const values = m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
        const row = Object.fromEntries(names.map((n, i) => [n, values[i]]));
        out.set(row[key], { ...out.get(row[key]), ...row });
      }
    }
  }
  return [...out.values()];
};

describe("the shop and the server agree", () => {
  it("on every price", () => {
    const server = new Map(rows("shop_items", "key").map((r) => [r.key, Number(r.price)]));
    const client = new Map<string, number>();
    for (const v of VEHICLES) client.set(itemKey("vehicle", v.id), v.price);
    for (const cat of Object.keys(PARTS) as PartCategory[]) for (const p of PARTS[cat]) client.set(itemKey(cat, p.id), p.price);
    expect(server).toEqual(client);
  });

  it("on every mission's rewards and limits, and which world it's in", () => {
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    const server = rows("missions", "id").map((r) => ({
      id: r.id, reward: +r.reward, repeat: +r.repeat_reward, cooldown: +r.cooldown_seconds, min: +r.min_seconds, crew: +(r.crew ?? 1), miles: +(r.min_miles ?? 0),
      world: r.world ?? "valley",
    }));
    // The valley's courses and the island's.
    const client = [buildWorld(), buildIsland()].flatMap((w) => w.missions.map((m) => ({
      id: m.id, reward: m.reward, repeat: m.repeatReward, cooldown: m.cooldown, min: m.minSeconds, crew: m.crew, miles: m.minMiles, world: w.id as string,
    })));
    expect(server.sort(byId)).toEqual(client.sort(byId));
  });

  it("on how many can drive a convoy or a race", () => {
    // The last word on it: how many others the newest complete_convoy() lets a driver name.
    const limits = migrations.flatMap((sql) => [...sql.matchAll(/cardinality\(others\) > (\d+)/g)].map((m) => +m[1]));
    expect(limits.at(-1)).toBe(CONVOY_MAX - 1);
    expect(migrations.at(-1)).toContain(`a convoy is two to ${["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][CONVOY_MAX]} drivers`);
  });
});

describe("the shop", () => {
  it("offers free starters and prices everything else", () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(3);
    expect(VEHICLES.filter((v) => !v.starter).every((v) => v.price > 0)).toBe(true);
    expect(priceOf("vehicle:nope")).toBe(Infinity);
  });

  it("treats free things as owned", () => {
    const p = freshProgress();
    expect(owns(p, "vehicle:bluff")).toBe(true);
    expect(owns(p, "tyres:road")).toBe(true);
    expect(owns(p, "tyres:mud")).toBe(false);
  });

  it("never lets a rig ford the rivers without a snorkel", () => {
    for (const v of VEHICLES) {
      for (const t of PARTS.tyres) {
        expect(specFor(v.id, { ...STOCK_LOADOUT, tyres: t.id }).wade).toBeLessThan(2.2);
        expect(specFor(v.id, { ...STOCK_LOADOUT, tyres: t.id, snorkel: "snorkel" }).wade).toBeGreaterThan(2.2);
      }
    }
  });

  it("makes snow tyres and chains grip in snow country", () => {
    expect(specFor("ridgeback", STOCK_LOADOUT).snowGrip).toBeLessThan(0.5);
    expect(specFor("ridgeback", { ...STOCK_LOADOUT, tyres: "studded" }).snowGrip).toBeGreaterThan(0.8);
    expect(specFor("ridgeback", { ...STOCK_LOADOUT, winter: "chains" }).snowGrip).toBeGreaterThan(0.8);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { PARTS, STOCK_LOADOUT, freshProgress, itemKey, owns, priceOf, specFor, type PartCategory } from "./shop";
import { STARTERS, VEHICLES } from "./vehicles";
import { buildIsland } from "./island";
import { buildWorld } from "./world";

const dir = resolve(__dirname, "../../../../supabase/migrations");
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(resolve(dir, f), "utf8"));
/** Every row inserted into `table` across the migrations, in order, as column → value. */
const rows = (table: string) =>
  migrations.flatMap((sql) =>
    [...sql.matchAll(new RegExp(`insert into public\\.${table} \\(([^)]*)\\) values([\\s\\S]*?);`, "g"))].flatMap(([, cols, block]) => {
      const names = cols.split(",").map((c) => c.trim());
      return [...block.matchAll(/\(([^()]*)\)/g)].map((m) => {
        const values = m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
        return Object.fromEntries(names.map((n, i) => [n, values[i]]));
      });
    }),
  );

describe("the shop and the server agree", () => {
  it("on every price", () => {
    const server = new Map(rows("shop_items").map((r) => [r.key, Number(r.price)]));
    const client = new Map<string, number>();
    for (const v of VEHICLES) client.set(itemKey("vehicle", v.id), v.price);
    for (const cat of Object.keys(PARTS) as PartCategory[]) for (const p of PARTS[cat]) client.set(itemKey(cat, p.id), p.price);
    expect(server).toEqual(client);
  });

  it("on every mission's rewards and limits", () => {
    const server = rows("missions").map((r) => ({
      id: r.id, reward: +r.reward, repeat: +r.repeat_reward, cooldown: +r.cooldown_seconds, min: +r.min_seconds, crew: +(r.crew ?? 1),
    }));
    // The valley's courses, then the island's, in the order the migrations added them.
    const client = [...buildWorld().missions, ...buildIsland().missions].map((m) => ({ id: m.id, reward: m.reward, repeat: m.repeatReward, cooldown: m.cooldown, min: m.minSeconds, crew: m.crew }));
    expect(server).toEqual(client);
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

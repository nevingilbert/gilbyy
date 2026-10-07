import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { PARTS, STOCK_LOADOUT, freshProgress, itemKey, owns, priceOf, specFor, type PartCategory } from "./shop";
import { STARTERS, VEHICLES } from "./vehicles";
import { buildWorld } from "./world";

const migration = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261007000000_gilbyy_game.sql"), "utf8");
const rows = (table: string) => {
  const block = migration.match(new RegExp(`insert into public\\.${table} \\([^)]*\\) values([\\s\\S]*?);`))?.[1] ?? "";
  return [...block.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "")));
};

describe("the shop and the server agree", () => {
  it("on every price", () => {
    const server = new Map(rows("shop_items").map(([key, price]) => [key, Number(price)]));
    const client = new Map<string, number>();
    for (const v of VEHICLES) client.set(itemKey("vehicle", v.id), v.price);
    for (const cat of Object.keys(PARTS) as PartCategory[]) for (const p of PARTS[cat]) client.set(itemKey(cat, p.id), p.price);
    expect(server).toEqual(client);
  });

  it("on every mission's rewards and limits", () => {
    const server = rows("missions").map(([id, reward, repeat, cooldown, min]) => ({ id, reward: +reward, repeat: +repeat, cooldown: +cooldown, min: +min }));
    const client = buildWorld().missions.map((m) => ({ id: m.id, reward: m.reward, repeat: m.repeatReward, cooldown: m.cooldown, min: m.minSeconds }));
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

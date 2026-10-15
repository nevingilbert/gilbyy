import type { WorldId } from "./terrain";

/**
 * The worlds there are to drive in, what each is called, and what it costs to get there in
 * miles. The plane goes between the valley's airstrip and the island's (ADR 0014); the
 * train between the valley's station and San Francisco's (ADR 0022); the ferry between the
 * island's dock and the marina on Lake Mead (ADR 0023). Whichever way, the truck goes along.
 * The fares must match `public.worlds`, and the ways `public.routes`, in the migrations
 * (flight.test.ts checks).
 */
export const WORLDS: Record<WorldId, { name: string; fare: number }> = {
  valley: { name: "the valley", fare: 150 },
  island: { name: "the island", fare: 150 },
  city: { name: "San Francisco", fare: 150 },
  vegas: { name: "Las Vegas", fare: 150 },
};
export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
export const isWorld = (v: unknown): v is WorldId => typeof v === "string" && Object.hasOwn(WORLDS, v);

/** How you get from one world to another, and what carries the truck. */
export type Way = "plane" | "train" | "boat";
export const ROUTES: readonly { from: WorldId; to: WorldId; way: Way }[] = [
  { from: "valley", to: "island", way: "plane" },
  { from: "island", to: "valley", way: "plane" },
  { from: "valley", to: "city", way: "train" },
  { from: "city", to: "valley", way: "train" },
  { from: "island", to: "vegas", way: "boat" },
  { from: "vegas", to: "island", way: "boat" },
];
/** Where the plane, the train or the ferry goes from here: null if there's none. */
export const wayFrom = (from: WorldId, way: Way): WorldId | null => ROUTES.find((r) => r.from === from && r.way === way)?.to ?? null;
/** Whether anything goes straight from one world to the other. */
export const goesTo = (from: WorldId, to: WorldId) => ROUTES.some((r) => r.from === from && r.to === to);

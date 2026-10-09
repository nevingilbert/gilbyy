import type { WorldId } from "./terrain";

/**
 * The worlds there are to drive in, what each is called, and what the flight to it costs
 * in miles. A flight goes from one world's airstrip to another's and takes the truck
 * along (ADR 0014). The fares must match `public.worlds` in the migrations
 * (flight.test.ts checks).
 */
export const WORLDS: Record<WorldId, { name: string; fare: number }> = {
  valley: { name: "the valley", fare: 150 },
  island: { name: "the island", fare: 150 },
};
export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
export const isWorld = (v: unknown): v is WorldId => typeof v === "string" && Object.hasOwn(WORLDS, v);
/** Where the plane goes from here. There are two worlds, so it is the other one. */
export const flightFrom = (id: WorldId): WorldId => (id === "valley" ? "island" : "valley");

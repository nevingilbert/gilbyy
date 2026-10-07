/**
 * First-time guidance: one quiet line under the title until each thing has been done
 * once. The first two, a garage and then the café, also put a mark on the compass;
 * after that the mark goes away. Signed in, they're remembered on your profile; in
 * single player they start again each visit, like everything else.
 */
export type GoalId = "garage" | "buy" | "mission" | "cafe";
export type Goal = { id: GoalId; text: string; solo?: string; target: "garage" | "cafe" | null };

export const GOALS: Goal[] = [
  { id: "garage", text: "Find a garage. Follow the mark on the compass.", target: "garage" },
  { id: "cafe", text: "Now find the café by camp. Meet friends there to add them.", solo: "Now find the café by camp.", target: "cafe" },
  { id: "buy", text: "Drive a few miles, then spend them in a garage.", target: null },
  { id: "mission", text: "Try a challenge: drive up to a start arch and press E.", target: null },
];

/** The first goal not yet done, worded for how you're playing, or null once there's nothing left to show. */
export function currentGoal(done: readonly string[], online: boolean) {
  const g = GOALS.find((x) => !done.includes(x.id));
  if (!g) return null;
  return !online && g.solo ? { ...g, text: g.solo } : g;
}

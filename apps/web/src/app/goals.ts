/**
 * First-time guidance: one quiet line under the title until each thing has been done
 * once. The first two, a garage and then the café, also put a mark on the compass;
 * after that the mark goes away. Signed in, they're remembered on your profile; in
 * single player they start again each visit, like everything else. A pin of the player's
 * own (pin.ts) takes the mark while it's down, so `pinned` is the wording for then.
 */
export type GoalId = "garage" | "buy" | "mission" | "cafe";
export type Goal = { id: GoalId; text: string; solo?: string; pinned?: string; target: "garage" | "cafe" | null };

export const GOALS: Goal[] = [
  { id: "garage", text: "Find a garage. Follow the mark on the compass.", pinned: "Find a garage. Take up your pin and the compass leads to one.", target: "garage" },
  { id: "cafe", text: "Now find the café by camp. Meet friends there to add them.", solo: "Now find the café by camp.", target: "cafe" },
  { id: "mission", text: "Try a course: drive up to a start arch and press E. Courses pay best.", target: null },
  { id: "buy", text: "Spend your miles in a garage.", target: null },
];

/** The first goal not yet done, worded for how you're playing, or null once there's nothing left to show. */
export function currentGoal(done: readonly string[], online: boolean, pinned = false) {
  const g = GOALS.find((x) => !done.includes(x.id));
  if (!g) return null;
  if (pinned && g.pinned) return { ...g, text: g.pinned };
  return !online && g.solo ? { ...g, text: g.solo } : g;
}

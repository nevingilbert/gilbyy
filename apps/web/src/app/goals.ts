/**
 * First-time guidance: one quiet line under the title, and a mark on the compass,
 * until each thing has been done once. Signed in, they're remembered on your profile;
 * in single player they start again each visit, like everything else.
 */
export type GoalId = "garage" | "buy" | "mission" | "cafe";
export type Goal = { id: GoalId; text: string; online?: boolean; target: "garage" | "mission" | "cafe" | null };

export const GOALS: Goal[] = [
  { id: "garage", text: "Find a garage. Follow the mark on the compass.", target: "garage" },
  { id: "buy", text: "Drive a few miles, then spend them in a garage.", target: "garage" },
  { id: "mission", text: "Try a challenge: drive up to a start arch and press E.", target: "mission" },
  { id: "cafe", text: "Meet friends at the café by camp to add them.", online: true, target: "cafe" },
];

/** The first goal not yet done, or null once there's nothing left to show. */
export function currentGoal(done: readonly string[], online: boolean) {
  return GOALS.find((g) => !done.includes(g.id) && (online || !g.online)) ?? null;
}

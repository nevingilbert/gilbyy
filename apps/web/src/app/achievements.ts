import type { GoalId } from "./goals";

/**
 * Achievements: things done once, shown under your name on the friends leaderboard.
 * Each one is a first-time goal (goals.ts), so it is earned the moment that step of the
 * guidance is done and saved the same way, by `mark_goal`. They pay nothing and unlock
 * nothing. See docs/decisions/0009-achievements.md.
 */
export type Achievement = { goal: GoalId; name: string };

export const ACHIEVEMENTS: Achievement[] = [
  { goal: "garage", name: "First garage" },
  { goal: "cafe", name: "First café" },
];

export const achievementFor = (goal: string) => ACHIEVEMENTS.find((a) => a.goal === goal) ?? null;

/** The achievements among `goals`, in list order. Other goals count for nothing. */
export const achievementsOf = (goals: readonly string[]) => ACHIEVEMENTS.filter((a) => goals.includes(a.goal));

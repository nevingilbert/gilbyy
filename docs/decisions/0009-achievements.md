# 0009 — Achievements for the first garage and the café

Date: 2026-10-07
Status: Accepted. Adds to `0007` and `0008`; changes nothing in them.

## Context

The compass mark now leads a new player to their first garage, then to the café, and
then goes away. The owner asked for an achievement for each of those two steps, and for
the leaderboard to show which achievements each player has (or a count, if that was
simpler).

## Decision

- **An achievement is a first-time goal** (`goals.ts`), named in `achievements.ts`:
  "First garage" for driving into a garage and "First café" for reaching the café. It
  is earned at the moment the guidance moves on, so the toast and the mark agree.
- **Nothing new is stored.** Goals are already saved on the profile by `mark_goal`.
  `leaderboard()` now also returns each player's `goals`, and the client shows the ones
  `achievements.ts` names. Any other goal is ignored.
- **They show in two quiet places:** a toast, "Achievement: First garage", once the
  truck is back on the road, and small yellow chips under each name on the leaderboard,
  in the compass mark's colour. The leaderboard shows the achievements themselves, not a
  count; with two, a count would say less in the same space.
- **They pay nothing and unlock nothing**, like found places (`0008`).

## Consequences

- Achievements are only as trustworthy as `mark_goal`, which takes the client's word.
  A modified client could claim both, and would gain two chips among its own friends.
- Single player shows the toast but keeps nothing, like everything else in single
  player. The leaderboard needs sign-in already.
- A new achievement that isn't a goal (a mission, a distance) needs its own source of
  truth on the server first; it should not be written by the client as a goal.
- If achievements start to feel like a list to complete, drop the chips before adding
  more (`CLAUDE.md`, "don't add pressure").

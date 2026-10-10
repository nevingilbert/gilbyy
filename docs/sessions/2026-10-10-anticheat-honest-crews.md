# 2026-10-10 — Anticheat: honest crews

## Topic

Caught two live players scripting the database functions, and closed the three holes
they were using (ADR 0018), without touching anyone's miles.

## Decisions made

- **Rishi (rchillerz) and Eshan (sixseveshan) were cheating by direct RPC**, watched
  live through `private.drive_log`: an `add_miles(10000)` loop (Eshan peaked at ~42
  calls/second, 4.18M miles asked, 8.46 paid), course claims with round made-up times
  (`p_seconds` of exactly `300.00`), and Eshan claimed a convoy naming a friend
  (gilbyy, Rev or spr — Rishi isn't his friend) who never ran one. The 0017-era clamps
  held, so the economy was never compromised; the real damage was free-tier request
  load and `drive_log` row growth. Full case notes in auto-memory
  (`cheaters-rchillerz-sixseveshan.md`).
- **Their miles stay.** The owner's call, same reasoning as ADR 0017: the fake gains
  were small (~50 miles of standard course rewards for Eshan, ~27 for Rishi) and a
  clawback would make the ledger lie about what was paid.
- **A crew claim is only as good as its crew** (ADR 0018). `complete_convoy` passes the
  named crew to `private.pay_run`, which pays only if at least `crew − 1` of them
  banked the course's `min_miles` over the same look-back as the claimer. One who set
  off and went quiet early doesn't block the rest. The crew is stored on the run
  (`mission_runs.crew`) for reading the ledger later.
- **Courses are world-gated.** `missions.world` (default `'valley'`; `beach-run`,
  `dune-dash`, `jungle-loop` are `'island'`) mirrors `shop_items.world`, and `pay_run`
  refuses a claim from the wrong world. Before this, Jungle Loop (35 miles) was
  claimable from the valley by direct RPC.
- **One breath between banks.** `add_miles` refuses a second bank within 2 seconds —
  no row, no payout. Safe because the client flushes every 15 s and `store.ts` restores
  pending miles on any failed call. An AFK truck circling still banks miles; that stays
  accepted per ADR 0017.
- **`pay_run` grew a fourth argument** (`p_crew uuid[] default null`), so the
  three-argument version was dropped, not replaced.
- **`game.test.sql` now matches test players by the full id tail** (`like
  '%00000000000a'`, not `like '%a'`): real profiles' ids now end in `a`, `b` and `c`
  (poo, zeetushar/Shmid, sixseveshan/Devin/Teresa), so the old single-character
  patterns would have swept up real rows — the hazard the tests' README warned about.
- **The migration is applied to the live project** (`apqlumghzqkklmpwizex`) and PR #15
  is open against main with all checks green — same pattern as the island: live first,
  merged the same day. Both scripters fell back to the honest rate the moment it landed.

## Files changed

- `supabase/migrations/20261010080000_honest_crews.sql` — new: `missions.world`,
  `mission_runs.crew`, `pay_run(p, m, p_seconds, p_crew)` with world and crew checks,
  `complete_convoy` passing the crew through, `add_miles` with the 2-second breath.
- `docs/decisions/0018-honest-crews.md` — new ADR: context (the two scripters), the
  three checks, why nobody's miles were clawed back.
- `supabase/tests/game.test.sql` — new checks (a flooding bank refused, a crew that
  never drove refused, wrong-world claims refused both ways, the island pays its own
  courses, the kept crew); id patterns pinned to full tails; miles-section arithmetic
  updated for the breath rule.
- `supabase/tests/README.md` — the id-collision warning replaced with the fix.
- `apps/web/src/app/shop.test.ts` — the mission sync now also holds `missions.world`
  against which builder (`buildWorld` vs `buildIsland`) laid the course out.

No client code changed: `store.ts` already handles the new refusals.

## Open questions

- PR #15 (`fix/game-honest-crews`) is green and mergeable but **not merged** — waiting
  on the owner, as with past PRs.
- A scripter naming a friend who happens to be out driving can still slip a crew claim
  through; accepted because their own banked miles are spent on it, so it pays no
  better than driving (the 0017 bar). Revisit only if it's actually abused.
- The two cheaters were never confronted or banned; watch `private.miles_hourly` if
  either finds a new angle.
- Real-device frame rate is still unmeasured (carried over).

## Exact next step

Merge PR #15 (https://github.com/nevingilbert/gilbyy/pull/15 — checks green, migration
already live, so merging is just making the repo match production). Then pick up the
previous checkpoint's plan (`docs/sessions/2026-10-09-airports-and-the-island.md`):
found-counts for the world you're in that also count its airstrip and the valley's four
easter eggs, shown on the leaderboard — needs its own ADR reversing "don't count them"
in `CLAUDE.md`, changes to `places.ts` and `leaderboard()` in a new migration.

## Tokens advisory

Stopped at a natural break — investigation, fix, live deploy and PR all landed; context
was nowhere near its limit.

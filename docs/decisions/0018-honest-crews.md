# 0018 — Honest crews: a convoy pays the drivers who drove

Date: 2026-10-10
Status: Accepted. Tightens how `0010`/`0011` (convoys and races) and `0017` (every
course) are paid, and how `drive_log` banking (`20261009000000`) is called. Their rules
stand: miles are the one currency, courses never fail beyond giving up, every finisher
of a convoy or a race is paid the same, and nobody's banked miles are ever taken back.

## Context

On 2026-10-10 two signed-in players ran scripts straight at the database functions,
watched live through `private.drive_log`:

- One called `add_miles(10000)` in a loop, peaking around forty calls a second —
  41,876 calls in sixteen minutes asking for 4.18 million miles. The clamp from `0017`'s
  era held (it paid 8.46 miles, the honest driving rate), but every call wrote a
  `drive_log` row and spent free-tier requests. The flood had a second use: it kept
  banked miles trickling in, which satisfied `pay_run`'s `min_miles` check without
  anyone at the wheel.
- Both claimed courses with `p_seconds` of exactly `300.00` — round made-up times that
  cleared `min_seconds`.
- One called `complete_convoy` naming a friend who was never in a convoy. The server
  checked the friendship and the claimer's own banked miles, but took the crew's word
  for the crew.

The `0017` stance holds: the server can't see trucks, so it doesn't try to prove a run —
it checks what it can and keeps cheating from paying better than driving. Three checks
were missing.

## Decision

- **A crew claim is only as good as its crew.** `complete_convoy` passes the named crew
  to `pay_run`, which pays only if at least `crew - 1` of them banked the course's
  `min_miles` over the same look-back it already applies to the claimer. A friend who
  set off and went quiet early doesn't block the rest; a crew of names that never drove
  pays nothing. The crew is kept on the run (`mission_runs.crew`), so the ledger can be
  read later. A scripter naming a friend who happens to be out driving can still slip a
  claim through — but their own banked miles are spent on it, so it pays no better than
  driving the course, which is the `0017` bar.
- **A course pays only in its world.** `missions.world` names where each course is
  (mirroring `shop_items.world`), and `pay_run` refuses a claim from anywhere else.
  Before this, the island's Jungle Loop (35 miles) was claimable from the valley by
  calling the function directly.
- **One breath between banks.** `add_miles` refuses a call within two seconds of the
  last bank — no row, no payout, and an error the client already handles by keeping the
  miles for the next bank (store.ts restores them on any failed call; it flushes every
  15 s and once more as it claims). The allowance still accrues against
  `last_drive_at`, so an honest player loses nothing; a flood now buys nothing but its
  own HTTP bill.

## Consequences

- The two scripters keep every mile they were paid. The clamps meant the flood earned
  pennies and the fake claims paid standard course rewards; clawing that back would
  make the ledger lie about what was paid, for at most a few dozen miles.
- An AFK truck circling on its own still banks miles and still feeds `min_miles`; that
  was accepted in `0017` and is unchanged. The ceiling on any script is now what a
  perfect driver could earn, in the world they are actually in, with friends who were
  actually out driving.
- `pay_run` grew a fourth argument (the crew, null for a course driven alone), so the
  old three-argument function is dropped and recreated rather than replaced.
- `shop.test.ts` now also holds `missions.world` and the code's two course lists
  together, and `game.test.sql` plays the new refusals: a flooding bank, a crew that
  never drove, and a course claimed from the wrong world.

# 0010 — A daily allowance of miles

Date: 2026-10-08
Status: Accepted. Adds to `0007`; the rest of its economy stands.

## Context

The owner asked that people not be able to use their agents to pile up miles.

The server can't tell a player from a program. Every write goes through a checked
function (`0007`), but the checks only bound what a client *claims*, and anything
holding a player's sign-in can make the same calls the game does. The repo is public
(`0001`), so the calls are no secret. As of `0007`:

- `add_miles` banked up to 0.02 mi for every second since the last call, around the
  clock. That is 72 mph, faster than any rig (the Duneclaw tops out at 51.5 mph), and
  needs no game running: about 1,700 miles a day from a loop that calls it every few
  minutes.
- `complete_mission` paid a repeat reward to any run no faster than believable, once
  per mission per ten minutes: about 400 more miles a day across the four courses.
- Everything in the shop costs 236 miles in all, which takes a person roughly ten hours
  of driving (at about 25 mph, a fair average for a starter that tops out at 36). A script would have it in an afternoon, and would top its friends'
  leaderboard by any margin it liked.

An agent driving the real game in a real browser (holding the throttle, steering in
circles) is the same problem in a slower form: every mile it drives is a real one.

## Decision

- **Bound what any account can bank, rather than try to prove a person is driving.**
  Each account has an allowance of up to **100 miles** that refills at **50 a day**.
  Driving spends it in `add_miles`, and so do repeat mission rewards in
  `complete_mission`. With nothing left, the truck drives on as before and its miles
  bank as the allowance refills, at about two an hour. The 72 mph check stays as it
  is; it no longer matters much.
- **A mission's first finish always pays in full.** It pays once per account, ever
  (9 miles across all four), so there is nothing to farm.
- **The numbers mean that nothing out-earns a keen player.** 100 miles is about four
  hours of non-stop driving, so a long first evening doesn't hit it. 50 a day is about
  two hours a day, every day. A script running around the clock earns that too, and no
  more.
- **It lives in the database.** `allowance_now()` in
  `supabase/migrations/20261008000000_miles_allowance.sql` is the rule; `profiles` gains
  `allowance` and `allowance_at`. The client mirrors it (`ALLOWANCE` and
  `allowanceAfter()` in `store.ts`, kept in step by `shop.test.ts`), so the odometer
  stops where the server would rather than jumping back after a flush.
- **It is quiet.** Nothing shows until it runs out. Then one toast says "That's a long
  day's driving. Miles bank slowly from here until tomorrow." It isn't repeated until
  the allowance has refilled a good way. A mission run that pays nothing says it was
  "just for fun". There is no meter, no countdown and no reset at midnight. It refills
  continuously, so there is no moment to log in for, and an unused allowance doesn't
  pile up past 100, so there is no streak to keep.
- **Single player has no allowance.** It keeps nothing, so there is nothing to farm.

### Considered and not done

- **Proof of driving** (sending positions and checking the path on the server): a
  client that can read the repo forges positions as easily as miles.
- **A CAPTCHA such as Cloudflare Turnstile** before miles bank: it needs server-side
  verification (an edge function, or HTTP calls from Postgres), interrupts a calm game,
  and agents in real browsers increasingly pass them. Supabase's built-in CAPTCHA
  guards its own sign-in forms, not Google sign-in, and wouldn't stop a script running
  on a session someone already signed in.
- **Spotting automation in the browser** (`navigator.webdriver`): that only stops the
  most naive tools, and anyone who can read the repo can delete the check.
- **A tighter speed check** alone: it slows a script down but doesn't bound it, since a
  script never sleeps.

## Consequences

- A person who drives more than about four hours in one go, or two hours a day for days
  on end, banks miles slowly after that. If players report hitting it, raise the
  numbers: they are the two literals in `allowance_now()` and `ALLOWANCE` in
  `store.ts`, plus the column default, and `shop.test.ts` keeps them together.
- Agents can still play. What they earn is what a dedicated person earns, so automation
  is no shortcut. Miles can't move between accounts, so running many accounts doesn't
  pool them, and the leaderboard is friends only (`0007`), so a bot can only rank among
  people who met it at the café.
- Anything new that pays miles must go through the allowance. Found places (`0008`) and
  achievements (`0009`) pay nothing, and that must stay so.
- Existing players start with a full allowance when the migration is applied. A client
  that reaches a database without the migration treats the allowance as always full, so
  the order of deploying the two doesn't matter.

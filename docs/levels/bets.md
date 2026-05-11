# Level: Bets

A web app where party guests use their phones to create and accept prop bets with freeform stakes ("take a shot," "do 10 pushups," $5).

## Problem

At parties, people make bets verbally and forget them. Existing betting apps assume monetary stakes and require KYC. We want a low-friction way to track bets with arbitrary stakes among a small known group, projected on a TV for fun.

## Users and roles

- **Guest:** can create bets, accept bets, comment, resolve their own bets.
- **Host / Admin:** one per party. Can resolve or delete any bet, undo accepts, configure party settings (expiration timers, etc.). Inherits all guest abilities.

A "party" is the unit of isolation: a session with one host, an invite, and a set of guests. A user can be a guest in many parties over time.

## Core flow

1. Host creates a party. Party gets a short code and a QR.
2. Guests join the party (QR or code).
3. Anyone creates a bet: a yes/no proposition + a stake + the side they're taking. Bet enters **Open** state.
4. Another guest accepts the opposite side. Bet enters **Accepted**, both sides locked.
5. Either side proposes a resolution (yes/no/draw). Counterparty confirms. Bet enters **Resolved**.
6. Loser marks the stake fulfilled. Bet enters **Completed**.

Side states: **Cancelled** (creator cancels before accept), **Expired** (timer ran out, no acceptor), **Disputed** (resolution rejected, host adjudicates).

## Auth approach

All party participants — host and guests alike — are full gilbyy accounts. No anonymous path. This was a deliberate decision; see `docs/decisions/0002-bets-full-accounts.md`.

The first-time UX is "Sign in with Google" → one click → arrive at the map → enter the party code. Returning users just log back in and their party state is restored from the server (parties they're members of, bets they created, bets they accepted, comments they posted).

Persistence falls out for free: every row in the Bets schema is foreign-keyed to `auth.users`. Closing the tab loses nothing; reopening + logging in restores everything via `bets.party_members.user_id = auth.uid()`.

### Joining a party

1. Host creates the party. Gets a short code and a QR.
2. Guest scans QR or visits `gilbyy.com/bets/join/[code]`.
3. If not logged in: gated to the login screen, signs in (Google or magic-link), redirected back to the join URL.
4. Server inserts a `bets.party_members` row for that user + party.
5. Guest lands inside the party, ready to create or accept bets.

The join URL is *not* exempt from the auth gate — the gate redirects through it cleanly. This is the standard pattern and avoids the security complexity of an exempted route.

## Big-screen dashboard

A `/bets/[party]/screen` route designed for a TV: live ticker of new bets, recent activity feed, leaderboard / shame board (most won, most lost, most outrageous stake fulfilled). Realtime via Supabase Realtime.

## Data model (sketch)

Schema: `bets`.

```
bets.parties              (id, code, host_user_id, name, settings_jsonb, created_at)
bets.party_members        (party_id, user_id, display_name, role, joined_at)
bets.bets                 (id, party_id, creator_id, proposition, stake, creator_side, state, expires_at, ...)
bets.acceptances          (bet_id, acceptor_id, accepted_at)
bets.resolutions          (bet_id, proposed_by, proposed_outcome, confirmed_by, confirmed_at)
bets.fulfillments         (bet_id, marked_by, marked_at, evidence_url nullable)
bets.comments             (id, bet_id, user_id, body[280], created_at)
bets.bet_views            (bet_id, user_id, viewed_at)   -- for trending score
```

Trending score = recent comments + recent views + recency, computed in a server function or a materialized view.

## Future ideas (after MVP)

- **Mixed odds:** asymmetric stakes for unlikely propositions (creator stakes "shot," acceptor stakes "10 shots"). Adds `creator_stake` and `acceptor_stake` columns.
- **Open markets:** multiple guests on one side. New `bets.pairings` table joining one bet to many acceptors with per-pairing stake.
- **Comments thread realtime** with reactions.
- **Trending indicator** computed from comments + views + recency.
- **Admin-configurable expiration timers.**
- **Web Push notifications** with VAPID keys via the `web-push` library — free server-side.
- **Idle nudge reminders** ("you have an unaccepted bet").
- **QR-code join, sound effects, post-party export** — polish.

## Free-tier landmines

- **SMS auth isn't free.** Resolved by defaulting to anonymous-with-handle. The Android-SMS-gateway path is documented but optional.
- **Realtime:** 200 concurrent connections free is plenty for parties under 50 guests.
- **Partiful guest-list sync** would have to be unofficial scraping, which is brittle and arguably violates ToS. Not in plan.

## MVP cut

The smallest version that's actually fun:

1. Host creates party, gets a code + QR.
2. Guests sign in (Google or magic-link), join party via QR or `/bets/join/[code]`. Display name comes from their gilbyy profile.
3. Create / accept / resolve / complete a bet.
4. Live feed of bets, sorted recent-first.
5. TV dashboard route.
6. Returning users see their party state restored after re-login.
7. No comments, no trending, no expiration timers, no mixed odds, no open markets, no notifications.

Should fit into one weekend after Meals is shipped (Bets builds on the auth and patterns proven by Meals).

## Open questions

- Do we want photo evidence on stake fulfillment? Adds friction, cute payoff. Probably no for MVP.
- One-host model vs. co-hosts? One for MVP.
- Should bets be visible to non-party-members? No — the party is the privacy unit.
- How aggressive is auto-expiration? Default off in MVP; configurable later.

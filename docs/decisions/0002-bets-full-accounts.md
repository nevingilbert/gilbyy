# 0002 — Bets: full gilbyy accounts for all participants

Date: 2026-04-30
Status: Accepted

## Context

The site is gated end-to-end (see `docs/architecture.md`). Every route except the login page requires a Supabase session. Bets — a party-prop-bet platform — originally wanted frictionless party joining (scan QR, type a handle, you're in), which conflicted with the site-wide gate.

We considered a *narrow middleware exception*: exempt the route `/bets/join/[partyCode]` from the gate, use Supabase anonymous sign-in to give the guest a real auth row without an email, and require an account upgrade if they ever wanted to navigate away from the party. That preserved the original UX but added a security boundary, an account-upgrade flow, and a class of RLS edge cases involving anonymous rows.

## Decision

Drop the exception entirely. **All Bets participants — hosts and guests alike — are full gilbyy accounts.** The first-time guest signs in with Google or magic-link before joining the party. There is no anonymous path anywhere on the site.

## Why

- **OAuth makes the friction trivial.** "Sign in with Google" is one click. Most party guests already have a Google account on the phone they're using.
- **Persistence becomes free.** Closing the browser and returning later just works: log in, see your parties, resume. No anonymous-account-restoration logic, no "claim your old anonymous account" flow.
- **RLS gets simpler.** Every row is keyed by `auth.uid()` with standard policies. No conditional logic for anonymous users.
- **One fewer security boundary.** No exempt route to harden, no upgrade flow to test.
- **Uniformity.** All other levels (Meals, Karts) already require full accounts. Bets matching them removes a special case.
- **Cleaner data model.** `bets.party_members(party_id, user_id, role)` is purely relational, no nullable identity columns.

## Consequences

Positive: everything in "Why" above.

Negative:

- The very first time a guest joins a party, they create a gilbyy account before joining. This adds ~10 seconds compared to the anonymous-with-handle flow.
- Hosts have to convince guests to "sign in" rather than "type a name." Mitigated by Google OAuth being one tap.

The product hypothesis is that this trade is worth it given how much complexity it removes elsewhere. If the friction proves too high in practice, revisiting this is cheap — re-introducing an exempt route is contained work.

## Alternatives considered

- **Middleware exception with anonymous-with-handle** — rejected. The complexity cost (RLS on anonymous rows, upgrade flow, security boundary on the exempt route) is not justified by the marginal UX improvement.
- **Magic-link only, no OAuth** — rejected. Magic-link's "wait for email" round-trip is exactly the friction we're trying to avoid for first-time party guests. OAuth solves this.

## Implementation notes

- Enable Google OAuth in Supabase Auth → Providers as part of Phase 2 of the roadmap.
- Add `/bets/join/[partyCode]` as a *normal* gated route. The gate redirects unauthenticated visitors to login with `?next=/bets/join/[partyCode]`, then back to the join URL after auth.
- `bets.party_members` is the source of truth for who's in a party.

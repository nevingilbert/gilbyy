# Vision

Gilbyy is a website at gilbyy.com that gathers a growing collection of small apps under
a single playful roof. Instead of a typical landing page, the home page is a game: a
rudimentary cartoon open-world driving game where you drive around a small map and each
destination takes you into a real, working app of its own (a betting platform, a meal
planner, a Mario Kart dashboard).

## Why this shape

Three reasons.

First, it lets one person ship many small ideas without each idea needing its own brand
and its own front door. They all live under gilbyy.com and benefit from each other's
traffic.

Second, the driving game turns the home page into something worth looking at on its
own. "Drive around and find the apps" is a feature, not just a router. New destinations
showing up over time gives the site a sense of life.

Third, it keeps the apps honest about being independent. Each one has to stand alone,
because each one literally is a separate deployment.

## What counts as a level

A level is a small, independently usable app. It must:

- Stand on its own (a stranger could use it without context from another level).
- Have a single, clear purpose statable in one sentence.
- Be reachable as a destination in the driving game.

Levels do not share data, schemas, or deployments. What they share is a domain and a
visual identity.

## How levels are hosted

Each level is **its own repo and its own Vercel project**, served from a subdomain:

| Level | Subdomain | Repo |
| --- | --- | --- |
| Bets | `bets.gilbyy.com` | `nevingilbert/friendlybets` |
| Meals | `meals.gilbyy.com` | `nevingilbert/wellness-planner` |
| Karts | `karts.gilbyy.com` | `nevingilbert/beeriokart-dashboard` |

This repo builds gilbyy.com itself and nothing else. See
`decisions/0003-levels-as-standalone-apps.md` for why this changed, and what it cost.

## The landing page is public

gilbyy.com is a public front door. Anyone can land on it and drive around. Gating
happens inside each level, on its own terms — wellness-planner has a private allowlist,
friendlybets has full accounts, and they do not have to agree with each other.

This is a reversal of the original design, in which gilbyy.com was a login screen and
the map only rendered for authenticated users. A driving game nobody can see until they
sign up is a worse front door than one they can play with immediately.

## Known gap: there is no single gilbyy account

Each level authenticates separately against its own backend. Signing into Meals does
not sign you into Bets. This is a real cost of the split and it is not solved; see the
consequences section of `decisions/0003-levels-as-standalone-apps.md` for what
unifying it would actually take.

## Out of scope (for now)

- Mobile apps. Everything is mobile-web.
- Cross-level features (combined leaderboard, single feed, etc.).
- Single sign-on across levels.
- Payment / monetization.
- Anything that isn't free to run, with the gilbyy.com domain as the sole paid line item.

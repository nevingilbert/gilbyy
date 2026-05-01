# Vision

Gilbyy is a website at gilbyy.com that hosts a growing collection of small apps under a single playful roof. Instead of a typical landing page, the home page is an Overcooked-inspired map: a hub in the center, paths branching off to individual "levels," each level being a fully working app of its own (a betting platform, a meal planner, a Mario Kart dashboard, etc.).

## Why this shape

Three reasons.

First, it lets one person ship many small ideas without each idea needing its own brand, domain, and hosting. They all live at gilbyy.com, share auth, share visual identity, and benefit from each other's traffic.

Second, the Overcooked metaphor turns the home page into something worth looking at on its own. The "browse the map" interaction is a feature, not just a router. New levels showing up over time gives the site a sense of life.

Third, it's a forcing function for clean architecture. If every idea has to fit into the "level" abstraction, then I have to keep them isolated, which means I can iterate on any one without the others breaking.

## What counts as a level

A level is a small, independently usable app. It must:

- Stand on its own (a stranger could use it without context from another level).
- Have a single, clear purpose statable in one sentence.
- Be reachable from a path off the map.

Levels do not need to share data. They share auth (one gilbyy account works everywhere) and UI primitives, but their schemas, jobs, and product surfaces are theirs alone.

## Map shape

The home page is a top-down map with a central hub. Each level is a node connected to the hub by a road. Sub-paths along a road can house related sub-features (`bets/screen`, `bets/leaderboard`) so the road metaphor extends past the entry point.

The map should be designed assuming new levels will be added. Adding a level means: write a level doc, scaffold a route group, add a node to the map.

## Initial levels

- **Bets** (`/bets`) — party prop-bet platform with freeform stakes. See `levels/bets.md`.
- **Meals** (`/meals`) — JSON meal-plan validator with macro lookup, grocery list, and leftover calculator. See `levels/meals.md`.
- **Karts** (`/karts`) — Mario Kart score dashboard with image-import sessions across friend groups. See `levels/karts.md`.

## Out of scope (for now)

- Mobile apps. Everything is mobile-web.
- Cross-level features (combined leaderboard, single feed, etc.).
- Payment / monetization.
- Anything that isn't free to run, with the gilbyy.com domain as the sole paid line item.

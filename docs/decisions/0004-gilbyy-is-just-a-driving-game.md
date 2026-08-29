# 0004 — gilbyy.com is a driving game, not a hub

Date: 2026-08-28
Status: Accepted. Narrows `0003-levels-as-standalone-apps.md`, which still assumed the
landing page would navigate to the levels.

## Context

Every version of the vision so far treated gilbyy.com as a *router with a personality*:
first an Overcooked map whose nodes were route groups, then a map whose nodes linked out
to subdomains, then a driving game whose buildings you drove into to enter a level. The
metaphor kept changing; the job — "get the visitor to one of the apps" — did not.

That job is the part that turned out to be unwanted. The apps are found and used
directly; nobody needs a game to reach a meal planner, and making the game a menu makes
it worse at being a game.

## Decision

gilbyy.com is a driving game and nothing else. You load the site, you drive around.

- No level buildings, no proximity prompts, no "enter" affordance.
- No links from the game to friendlybets, wellness-planner or beeriokart-dashboard.
- The world is scenery — roads, houses, trees, water — with no destination semantics.
- It gets better over time as a game. That is the whole roadmap for this repo.

The apps still get `<name>.gilbyy.com` subdomains, because a shared domain is tidy and
free. That is a DNS convenience, not a product relationship: gilbyy.com does not know
those apps exist.

## Consequences

The word "level" no longer means anything here, and is gone from the code. `levels.ts`
is deleted; `world.ts` replaces it and describes terrain, not destinations.

This repo has no dependency of any kind on the other three — no shared auth, no shared
data, no links, no coupled deploys. Changing or deleting any of those apps cannot affect
gilbyy.com.

Success is now judged as a game: does it feel decent to drive? Nothing else.

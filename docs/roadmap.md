# Roadmap

Path from where we are to "gilbyy.com live, with the apps hanging off it as
subdomains." Update the **You are here** marker as you progress.

> **You are here:** Levels retired and auth removed (2026-08-28). The `(bets)`,
> `(karts)` and `(meals)` route groups, `lib/meals`, `docs/levels/`, the magic-link
> login, the middleware and the Supabase client are all deleted. The app is now a
> single static page at `/` that links out to the standalone apps. Design docs
> rewritten to match — see `decisions/0003-levels-as-standalone-apps.md`.
>
> A first pass at the driving game landed the same day (Phase C), then was rebuilt once
> the intent got clearer: gilbyy.com is **just** a driving game, with no links to the
> other apps at all (ADR 0004). **Next:** buy gilbyy.com and attach the subdomains
> (Phase B), and keep improving the game.
>
> Phase A is complete: the Supabase project is deleted and the stale env vars are off
> the Vercel project.

## History (done)

Phases 0–3 shipped: repo skeleton and design docs, Next.js scaffold in `apps/web`,
Supabase auth gate with a magic-link login and a gated SVG map, first Vercel deploy,
and CI with typecheck/lint/Vitest on every PR.

Phase 5 (Meals as a level inside this repo) was started — a 512-line schema applied to
the gilbyy Supabase project — and then **abandoned** in favour of the standalone
`wellness-planner` app, which had overtaken it. That work is deleted.

## Phase A — Decommission what the split leaves behind

Code side: **done** (2026-08-28). Removed `src/proxy.ts`, `src/app/(marketing)`,
`src/app/auth`, `src/app/actions/`, `src/lib/supabase`, the `(authed)` group, and both
`@supabase/*` dependencies. The map moved from `/map` to `/`.

Dashboard side: **done** (2026-08-28). The Supabase project `dcxqaooehisluvdjniyb`
("gilbyy") is deleted, and the stale `NEXT_PUBLIC_SUPABASE_*` env vars are off the
`gilbyy-web` Vercel project. The org's Supabase projects are now `wellness-planner`,
`friendlybets` and `festival-planner-dev`.

`festival-planner-dev` (`gjdtoxbwcubrqfwsrvej`) is a paused project with no repo in
`~/projects`. **Deliberately left alone** — it is not part of this cleanup. Revisit it
if you ever hit the org's free-project cap.

Nothing on Vercel was deleted — all five projects are apps we are keeping.

## Phase B — Wire up gilbyy.com

Buy the domain. Buying it **through Vercel** is the least fiddly option, since DNS is
then managed for you and each subdomain is one click; Cloudflare Registrar is cheaper
(at-cost, ~$10/yr) if you would rather point nameservers at Vercel yourself.

Then, in each Vercel project, Settings → Domains:

| Project | Domain |
| --- | --- |
| `gilbyy-web` | `gilbyy.com` + `www.gilbyy.com` |
| `friendlybets` | `bets.gilbyy.com` |
| `wellness-planner` | `meals.gilbyy.com` |
| `beeriokart-dashboard` | `karts.gilbyy.com` |
| `times-tables` | `times.gilbyy.com` |

No code changes are needed for any of this.

Worth knowing: every project has Vercel SSO protection set to
`all_except_custom_domains`, so all the `.vercel.app` URLs bounce strangers to a Vercel
login. Attaching a custom domain is exempt from that protection, so each app becomes
publicly reachable the moment its subdomain is live — no setting needs changing.

Afterwards, in each level's own Supabase project, add its new subdomain to the Auth
**Site URL** and redirect allowlist, or magic-link callbacks will bounce to the old
`.vercel.app` URL.

## Phase C — The driving game

**This is the product**, not a placeholder for one. See
`decisions/0004-gilbyy-is-just-a-driving-game.md`.

First pass done (2026-08-28): a 3200×2400 town on a road grid, deterministic houses,
trees and ponds, a car with arcade handling, a following camera, a minimap and a speedo.
Touch controls under `sm`. The static world is painted once to an offscreen canvas, so
each frame is a blit plus the car.

- `src/world.ts` — world data and the deterministic generator.
- `src/physics.ts` — pure `step()`, unit-tested in `physics.test.ts`.
- `src/Game.tsx` — canvas, input, render loop, HUD.

Not done, roughly in order of how much they'd add:

- Collision with buildings and trees. Right now you drive through everything, which is
  the single biggest thing making the world feel fake.
- Tyre marks, dust, an engine note.
- More to look at — a coastline, hills, level crossings, traffic.
- Something to do — a delivery, a time trial, something to collect.

Note for whoever picks this up: `requestAnimationFrame` does not run while the tab is
backgrounded, so the game looks frozen in a hidden preview pane and timed input does
nothing. That is the browser, not a bug. The physics is a pure function precisely so it
can be tested without a visible tab; to eyeball motion, hold a key and take several
screenshots, since each capture forces a frame.

## Phase D — Monitoring

- **CodeRabbit** GitHub app on the repos — free AI review on public repos.
- **Sentry** for error tracking, DSN into Vercel env. 5k errors/month free.
- **BetterStack** uptime monitor on gilbyy.com and each subdomain.

## Phase E — Add another app under the domain

See "How to add a new app under gilbyy.com" in `architecture.md`: a new repo, a new
Vercel project, a new subdomain. It does **not** get added to the game.

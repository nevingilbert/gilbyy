# Roadmap

Path from where we are to "gilbyy.com live, with the apps hanging off it as
subdomains." Update the **You are here** marker as you progress.

> **You are here:** Levels retired and auth removed (2026-08-28). The `(bets)`,
> `(karts)` and `(meals)` route groups, `lib/meals`, `docs/levels/`, the magic-link
> login, the middleware and the Supabase client are all deleted. The app is now a
> single static page at `/` that links out to the standalone apps. Design docs
> rewritten to match — see `decisions/0003-levels-as-standalone-apps.md`.
>
> gilbyy.com bought at Cloudflare and all six hostnames attached to their Vercel
> projects (Phase B). **Next:** add the six CNAME records at Cloudflare — all set to
> "DNS only", never proxied — then keep improving the game (Phase C).
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

**Domain bought 2026-08-28 at Cloudflare Registrar** (~$10/yr, at cost, renews at cost).
All six hostnames are attached to their Vercel projects. What remains is adding the DNS
records at Cloudflare.

### Why DNS lives at Cloudflare, not Vercel

Cloudflare Registrar only sells domains that stay on Cloudflare's own nameservers — that
is a condition of the at-cost pricing. So delegating nameservers to Vercel is **not an
option** while the registration lives there. DNS records are managed at Cloudflare and
point at Vercel.

### The records

Vercel issues a **different CNAME target per project**, so these cannot be guessed or
copied between rows. Regenerate them with
`vercel domains verify <host> --scope nevin-gilbert-s-projects` if they ever need
checking.

| Type | Name | Target | Project |
| --- | --- | --- | --- |
| CNAME | `@` | `652261f006c82422.vercel-dns-017.com` | gilbyy-web |
| CNAME | `www` | `652261f006c82422.vercel-dns-017.com` | gilbyy-web |
| CNAME | `bets` | `413a6f3d733a65d3.vercel-dns-017.com` | friendlybets |
| CNAME | `meals` | `d5d2bcaa5f11007e.vercel-dns-017.com` | wellness-planner |
| CNAME | `karts` | `068667bdb5488786.vercel-dns-017.com` | beeriokart-dashboard |
| CNAME | `times` | `3042d8a78fd13ff1.vercel-dns-017.com` | times-tables |

A `CNAME` at the apex works because Cloudflare flattens it. If a provider ever refuses a
root CNAME, the fallback for the apex is `A @ 76.76.21.21`.

### The one thing that will break it

**Every record must be "DNS only" — the grey cloud, not the orange one.** Vercel returns
`disableProxy: true` on all six for a reason: if Cloudflare proxies the traffic, Vercel
cannot issue its TLS certificate and you get certificate errors or redirect loops.
This is the single most common way this setup fails, and it looks like a Vercel problem
when it is a Cloudflare toggle.

### Afterwards

Certificates issue automatically within a few minutes of the records resolving.

Then, in **friendlybets'** and **wellness-planner's** own Supabase projects, add the new
subdomain to Auth → URL Configuration (Site URL + redirect allowlist). Until that is
done, magic links keep sending people back to the old `.vercel.app` addresses.

Every project has Vercel SSO protection set to `all_except_custom_domains`, so all the
`.vercel.app` URLs bounce strangers to a Vercel login. Custom domains are exempt, so each
app becomes publicly reachable the moment its record resolves — no setting to change.

No code changes are needed for any of this.

## Phase C — The driving game

**This is the product**, not a placeholder for one. See
`decisions/0004-gilbyy-is-just-a-driving-game.md`.

First pass done (2026-08-28): a 3200×2400 town on a road grid, deterministic houses,
trees and ponds, a car with arcade handling, a following camera, a minimap and a speedo.
Touch controls under `sm`. The static world is painted once to an offscreen canvas, so
each frame is a blit plus the car.

The visual target is a lightweight take on _Over the Hill_ — see `art-direction.md`,
which is the standing brief for anything visual. A first palette pass (2026-08-28) moved
off the initial saturated greens and primaries to muted earth tones and added a vignette.

- `src/world.ts` — world data and the deterministic generator.
- `src/palette.ts` — every colour, in one place. Tune here, not in render code.
- `src/physics.ts` — pure `step()`, unit-tested in `physics.test.ts`.
- `src/Game.tsx` — canvas, input, render loop, HUD.

Not done, roughly in order of how much they'd add:

- Collision with buildings and trees. Right now you drive through everything, which is
  the single biggest thing making the world feel fake.
- Atmosphere, which is where the Over the Hill feel actually lives: directional light
  instead of flat fills, haze/depth falloff, softer and less geometric silhouettes, and
  some ambient motion. `art-direction.md` lists the specific gaps.
- Tyre marks, dust, an engine note.
- More to look at — a coastline, hills, level crossings.
- Something to do, as long as it stays calm — a delivery, a scenic route. No timers or
  scores; those are ruled out by the art direction.

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

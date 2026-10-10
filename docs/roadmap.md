# Roadmap

Path from where we are to "gilbyy.com live, with the apps hanging off it as
subdomains." Update the **You are here** marker as you progress.

> **You are here:** Phase C, the game. 3D on three.js since 2026-10-06
> (`decisions/0005`, `0006`). On 2026-10-07 came accounts, the shared valley and a shop
> (`decisions/0007`): a 6 km map with a snow plateau, a 30-tent campground and a café,
> eight rigs, missions, and a shop that spends miles. With no sign-in it's single
> player.
> The online setup is done (2026-10-07): the Supabase project `gilbyy` is connected and
> the game was played signed in from two browsers on `feat/multiplayer`
> (`sessions/2026-10-07-connect-supabase.md`).
> Found garages and cafés now stay on the map and are counted there and on the
> leaderboard (`decisions/0008`). The compass mark leads to a first garage and then the
> café, and each of those is an achievement shown on the leaderboard (`decisions/0009`).
> It is all on `main` and live at gilbyy.com since 2026-10-07.
> A convoy and a race for two to four friends (`decisions/0010`, `0011`) were merged to
> `main` and went live at gilbyy.com on 2026-10-08. Their migrations are on the live
> project and the database tests pass against it
> (`sessions/2026-10-08-convoy-race-deploy.md`).
> On 2026-10-09 came an airstrip hidden over the river, a flight each way (300 miles, 150 since later that day), and
> an island with its own camp, garage and rig (`decisions/0014`). Its migration is on
> the live project and it was merged to `main` the same day
> (`sessions/2026-10-09-airports-and-the-island.md`).
> Later that day, the island's second pass (`decisions/0016`): two more garages, a café
> and three courses there, and found-counts per world that include the airstrip and
> the easter eggs. Merged to `main` as pull request 10, its migration on the live
> project. And animals in both worlds (`decisions/0015`,
> `sessions/2026-10-09-wildlife.md`), client only.
> On 2026-10-10, photo mode (`decisions/0018`): P stops the world, the camera goes
> round the truck, the shutter saves a picture. Client only; merged to `main` as pull
> request 14 (`sessions/2026-10-10-photo-mode.md`).
> Built on 2026-10-09 and not merged yet (`decisions/0019`,
> `sessions/2026-10-09-more-courses.md`): twelve more courses, so each world has as many
> for friends as to drive alone, a jump told for its time in the air, and convoys and
> races for up to ten. It is pull request 16. Its migration,
> `20261010120000_more_courses.sql`, passed a rolled-back dry run against the live
> project but is not applied yet. Honest crews (`decisions/0018-honest-crews.md`, pull
> request 15) was merged the same night, and this builds on it.
> **Next:** apply that migration (the steps are in the session file) and merge. Then
> play one convoy and one race signed in from two Google accounts on the live
> site; neither has been played over Supabase yet, only over `?net=local`. Still open:
> the frame rate on a real phone and laptop. Sign-in is Google only (the email link was
> removed), and an idle tab now gives its tent back.
>
> Phases A and B are complete: levels retired and auth removed (2026-08-28), the
> Supabase project deleted, and all six hostnames live on gilbyy.com with Google
> sign-in working on all four apps.

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

Certificates issue automatically within a few minutes of the records resolving. All six
hostnames were live and serving the right app within ~10 minutes on 2026-08-28.

**Each app's own auth has to be repointed — and how depends on which auth it uses.**
This bit the migration, so it is worth stating plainly:

| App | Auth | What the domain change breaks |
| --- | --- | --- |
| bets (friendlybets) | Supabase | Nothing at Google. Only the Supabase redirect allowlist. |
| meals (wellness-planner) | Supabase | Same. |
| karts (beeriokart-dashboard) | Auth.js / NextAuth | Google OAuth breaks. |
| times (times-tables) | Auth.js / NextAuth | Google OAuth breaks. |

**Supabase apps are unaffected at Google.** Google redirects back to
`https://<ref>.supabase.co/auth/v1/callback` — the Supabase host, which does not change.
Only the last hop (Supabase → your app) uses the new domain, and that is governed by
Auth → URL Configuration. Set Site URL to the new subdomain and add
`https://<sub>.gilbyy.com/**` to the redirect allowlist. Use `**`, not `*`: a single
star does not match across path separators, so `/auth/callback` would be rejected.

**Auth.js apps break at Google** (both were fixed on 2026-08-28), because their callback
lives on their *own* domain:
`https://<sub>.gilbyy.com/api/auth/callback/google`. Google rejects any `redirect_uri`
not on its registered list, giving `Error 400: redirect_uri_mismatch`. Two things to fix:

1. Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client ID →
   **Authorized redirect URIs** → add the new callback. Keep the old `.vercel.app` one
   so preview deployments still work.
2. The **`AUTH_URL`** env var on the Vercel project, which still points at the old
   `.vercel.app` host. Auth.js builds the callback it sends to Google from `AUTH_URL`,
   so fixing Google alone is not enough. Both apps set `trustHost: true`, so the
   cleanest fix is to **delete `AUTH_URL`** — Auth.js then infers the host from the
   request, which works on the custom domain *and* on preview deployments. Setting it
   to the new domain also works but pins it.

To check the fix without clicking through a sign-in, `GET /api/auth/providers` on the
app returns the callback URL Auth.js is actually generating — if that still says
`.vercel.app`, the env change has not taken effect. Following the sign-in redirect one
hop further shows the `redirect_uri` Google receives; Google answers a good one with a
302 to `accounts.google.com/v3/signin/identifier` and a bad one with a 400 error page.

Every project has Vercel SSO protection set to `all_except_custom_domains`, so all the
`.vercel.app` URLs bounce strangers to a Vercel login. Custom domains are exempt, so each
app becomes publicly reachable the moment its record resolves — no setting to change.

No code changes are needed for any of this.

## Phase C — The driving game

**This is the product**, not a placeholder for one. See
`decisions/0004-gilbyy-is-just-a-driving-game.md`.

First pass (2026-08-28): a top-down 2D canvas town. Replaced on 2026-10-06 by a 3D
rebuild on three.js after the 2D approach was judged unable to reach the Over the Hill
look (see `decisions/0005-go-3d-with-threejs.md`).

Now (2026-10-06, second pass): a 4 km valley with two lakes, two rivers that cut off the
east side until you fit a snorkel, a railway loop (trestle bridges, four level crossings
with barriers) with a train on it, day and night on a fifteen-minute clock, six garages
in different styles with tiered upgrades (paint, tyres, lights, snorkel) unlocked by
miles driven, and a map that starts greyed out and fills in as you drive. See
`architecture.md` for the file-by-file layout.

Not done, roughly in order of how much they'd add:

- **Measure on real devices**, a phone especially. Levers if slow: grass radius, tree
  count, pixel ratio, shadow map size, the number of spotlights.
- Weather: rain, fog banks, a storm at night.
- Dust, tyre tracks, an engine note.
- Water that reads as water: shoreline foam, rivers that visibly flow.
- Dirt trails between the garages.
- ~~Buildings that link to other gilbyy.com pages.~~ Done 2026-10-08 as four easter
  eggs (`decisions/0012-easter-egg-buildings.md`), merged to `main` the same day.

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

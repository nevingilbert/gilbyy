# Architecture

This document captures the technical decisions and the constraints that drove them. When you make a non-obvious decision later, write it as a short ADR in `docs/decisions/`.

## Stack at a glance

- **Frontend & SSR:** Next.js (App Router) + TypeScript.
- **Styling:** Tailwind CSS.
- **Hosting:** Vercel free tier (Hobby), one project per app.
- **Domain:** gilbyy.com — the only paid line item. The landing page is the apex;
  each level gets a subdomain.
- **CI:** GitHub Actions (free tier).

This repo builds **gilbyy.com**, which is a driving game and nothing else (see
`decisions/0004-gilbyy-is-just-a-driving-game.md`). Its only links out are four
easter-egg buildings (`decisions/0012-easter-egg-buildings.md`). Since
2026-10-07 it can also sign you in, to save progress and share the valley with other
players, on one free Supabase project (see
`decisions/0007-accounts-multiplayer-and-a-shop.md`). With no session it's single
player, entirely in the browser.

This stack is chosen specifically because every piece has a free tier that covers a
hobby project.

## Why separate apps, not one app with route groups

This reverses the original decision. See `decisions/0003-levels-as-standalone-apps.md`
for the full reasoning and the costs.

Short version: all three levels were built as standalone repos with their own Vercel
projects and their own backends, while the route groups in this repo never got past
"coming soon" stubs. The docs were describing a plan that reality had already
overtaken, so the docs changed rather than the reality.

The trade we accepted: independent deploys and independent schemas, at the price of
losing a single shared login. There is no one gilbyy account.

## Repository layout

```
gilbyy/
├── apps/
│   └── web/                  # the landing page (Next.js)
├── packages/                 # shared code, still empty
├── docs/                     # design docs (this folder)
├── .claude/                  # slash commands and project Claude setup
└── pnpm-workspace.yaml
```

Packages start empty. Don't create one until two places need the same thing — and note
that with levels in their own repos, "two places" now means two directories inside
*this* repo, which is a high bar. A shared UI kit across levels would have to be a
published package, and that is not worth it at this scale.

The game lives under `apps/web/src/app/` (3D since 2026-10-06, see
`decisions/0005-go-3d-with-threejs.md` and `0006-garages-and-quiet-progression.md`).

Pure modules, no three.js, all unit-tested:

- `terrain.ts`: the valley as fields on a 600×600 grid over 6 km. The fields are
  heights, water surface height, forest, snow and ice, and distances to the railway,
  rivers, roads, the camp and garage yards. It also:
  - lays the railway loop with graded earthworks;
  - runs two rivers downhill into the big lake;
  - finds bridges and level crossings;
  - levels the 30-pitch campground and the café;
  - raises the snow plateau in the north, with a frozen lake;
  - floods the grid from the spawn at stock and snorkel wading depths, to find the
    ground that needs the snorkel;
  - places eight garage sites.

  `sampleGrid()` interpolates any field using the same triangulation as the mesh.
- `missions.ts`: lays out the challenge courses on the real terrain at load (a forest
  slalom, a ridge climb, a lake loop, an ice drift, the convoy loop by the café and the
  race loop by the camp; the last two come from one loop planner, `loopNear()`).
  `planMissions()` lays out the thirteen courses the valley had first; `planMore()` the
  seven added since, after the easter eggs and the airstrip are chosen, so adding a
  course moves nothing that was there (`decisions/0019`).
  `mission-run.ts`: the countdown, gates and finish of a run, and the longest the truck
  was off the ground in it, which is what the jump is told for.
- `ramp.ts`: the jump's timber ramp. The height grid's cells are 10 m, too coarse for
  one, so its deck is a function laid over the ground: `World.height` adds it for the
  physics, the camera and the grass, and `ramp-model.ts` builds the boards from the same
  surface. Its fence and the boards under its lip are obstacles; the boards have a
  `top`, so only a truck on the ground behind is stopped by them.
- `convoy.ts`: a convoy or race of two to ten friends, agreed among their clients over
  the `world` channel: gathering at the arch, setting off, flag counts, finish times,
  places, and coming home. Every message is safe to hear twice and is repeated until
  answered (`decisions/0010-convoys.md`, `0011-races.md`).
- `world.ts`: trees, rocks and bushes scattered over all that, a bucketed obstacle
  lookup (each obstacle has a height, so tyres can decide what to climb), and the
  `Ground` interface the physics reads, including how slippery the ground is.
- `physics.ts`: `step(car, input, dt, ground, spec)`. Springs for height, pitch and
  roll chase the four wheels. Rocks under the tyres' clearance are bumps under the
  wheels. Sideways slip decays fast on dirt, slowly on snow and very slowly on ice,
  scaled by the tyres' snow grip.
- `vehicles.ts` (the eight rigs, and the Sandfly, which only the island's garage sells)
  and `shop.ts` (parts, prices, and `specFor()`, which turns a rig and its loadout into
  a `CarSpec`).
- The second world and the way to it (`decisions/0014-airports-and-the-island.md`):
  - `worlds.ts`: the worlds there are and what the flight to each costs.
  - `airport.ts`: an airstrip (a 260 m runway and an apron) in "field space", the search
    that sites one (`findField`), the valley's hidden one (`valleyAirfield`, placed last
    so nothing else in the valley moves), and the bank and screen of pines round it.
  - `island.ts`: `buildIsland()` returns the same `World` shape as the valley's
    `buildWorld()`, on the same grid: sea, beach, dunes and jungle, thirty pitches in a
    row on the beach, an airstrip, three garages and a café. It has an empty track and
    no rivers. `planCourses()` lays out its eight courses, four of them for friends
    (`decisions/0016`, `0019`). After the scatter, `raiseSandbar()` lifts a hooked spit
    out of the seabed off the camp and `sandbarCourse()` lays a ninth course along it
    (`decisions/0020`).
  - `tide.ts`: the island's tide. `ebbAt(time)` is how far the sea stands below high
    water, on a ten-minute cycle; `untilEbb()` is how long until it's next out far
    enough. `World.setTide()` moves the island's `waterAt`; the valley's does nothing.
    `scene.ts` moves the sea's sheet to match and tells the terrain's shader, which
    paints bared seabed as wet sand.
  - `flight.ts`: the flight as a film. `departure()` and `arrival()` give one frame for
    a time: the plane's pose, its ramp and wheels, where the truck is, the camera, and
    how much is lost in cloud. Also the plane's measurements, which the model shares,
    and the parked plane's colliders.
- `wildlife.ts`: the animals (`decisions/0015-wildlife.md`). `SPECIES` says which world
  each kind lives in and how it behaves, `habitat()` where a herd can make its home,
  `placeHerds()` puts every herd down from a fixed seed (the first ones in front of the
  camp, for the opening shot), and `stepWildlife()` moves the herds within about 320 m
  of the truck: grazing, following the herd, and running from trucks and the train, off
  to the side of their path when they're coming this way. Birds fly off together and
  settle again; macaws and dolphins go where the time says. Not shared between players.
- `store.ts`: progress behind one interface. `LocalStore` is in memory for single
  player; `SupabaseStore` calls the database functions.
- `net.ts`: presence, tents, poses, friend requests and chat. `SupabaseNet` runs over
  Supabase Realtime; `LocalNet` runs over a `BroadcastChannel`, for testing across
  tabs.
- `winch.ts`: the rules for pulling a stuck truck off a rock (ADR 0021). The sticking
  itself is in `physics.ts`; who is stuck travels in the poses, and hooking on is one
  broadcast.
- `tow.ts`: BBB's tow truck. Its fee (taken by `call_tow()`), how long it takes to
  come, the clear line it drives in on (`approachLine()`), and where it is at each
  moment (`towVisit()`, `towLeaving()`). It is placed, not driven by the physics, so
  one broadcast of its line lets every player near draw the same truck.
- `goals.ts` (first-time guidance), `achievements.ts` (which goals are achievements), `track.ts` (train and crossings as functions of
  time, and the bridges' solid parts: a trespass guard on each approach that the train
  rolls over and no truck can cross, concrete abutments under the ends too low to drive
  beneath, and the trestle legs), `daylight.ts` (hour and sky).

Rendering and UI:

- `scene.ts` assembles a world and runs the chase camera. What belongs to one world
  (ground, scatter, buildings, other players' trucks) is a stage that `setWorld()` takes
  down and puts up again; the sky, the truck and the plane stay. During a flight
  `render()` is handed the film's frame, which places the plane and directs the camera.
  The pieces:
  - terrain and water: `terrain-mesh.ts` (chunked terrain, lakes and rivers as one
    water mesh, grass near the car), `scenery.ts` (instanced trees, bushes and rocks
    in culling tiles), `sky.ts`;
  - the railway: `railway.ts`, `train-model.ts`, `crossing-model.ts`;
  - vehicles: `car-model.ts` with `vehicle-models.ts` (nine bodies);
  - buildings: `garages.ts`, `campground-model.ts`, `coffee-shop-model.ts`;
  - flying: `airport-model.ts` (runway, paint, lights, windsock, terminal) and
    `plane-model.ts` (the jet, its ramp and its wheels);
  - missions: `mission-models.ts`;
  - animals: `animal-models.ts`, each species built from faceted lumps and sticks and
    cut into the parts that move, one instanced mesh per part. `scene.ts` steps them
    each frame from the truck, other players' trucks and the train;
  - other players' trucks: `remote.ts`, carried forward between poses along the bend
    they were taking (`guessPose` in `net.ts`), with any correction faded in;
  - the garage interior: `showroom.ts`.
- `map.ts`: a parchment topo map of the world you're in, drawn once when that world
  goes up, under a fog layer cleared as you drive. The garages and café you've found (`places.ts`) are drawn over it regardless,
  and signed in they are saved (`decisions/0008-found-places.md`). So is the fog, as
  the cells of a coarse grid the truck has been in (`fog.ts`,
  `decisions/0013-saved-fog.md`), a set per world; single player's fog lasts the
  visit. The airstrip is part of the sheet, so it shows where the fog has cleared.
- `Game.tsx`: a fixed 120 Hz physics loop, the modes (picking a rig, driving, garage,
  map, flying) and the HUD. `enterWorld()` swaps the world, its map and its courses. `GarageMenu.tsx` is the shop. `Panels.tsx` holds the starter
  picker, the single-player banner, sign-in, the name prompt and the leaderboard.

Runtime dependencies beyond React: three.js (MIT, ~144 KB gzipped) and
`@supabase/supabase-js` (MIT). There are no asset files: the world you're in is
generated at load (~1.5 s), and the other one in the cloud of a flight.

The other apps (`friendlybets`, `wellness-planner`, `beeriokart-dashboard`) share the
domain via subdomains and share nothing else. This repo references other projects in
one place: the four hostnames in `apps/web/src/app/landmarks.ts`, shown on the
easter-egg cards (`decisions/0012-easter-egg-buildings.md`).

## Auth and the database

One Supabase project, used only by this repo: Postgres for profiles and the shop, Auth
for sign-in (Google only), and Realtime for the shared valley. See
`decisions/0007-accounts-multiplayer-and-a-shop.md`.

- The schema, policies and functions are in
  `supabase/migrations/20261007000000_gilbyy_game.sql`. The client holds only the
  publishable key. Players can read profiles but can't write them; every change is a
  `security definer` function that checks it (miles no faster than driving, prices
  from `shop_items`, mission payouts and cooldowns from `missions`).
- `20261007060000_advisor_followups.sql` came out of Supabase's advisors on the real
  project: it takes `handle_new_user()` and `is_chat_member()` out of the public API
  and indexes the friend tables from both sides. The advisor still warns that
  signed-in users can execute the nine game functions; that is the design.
- `20261007120000_found_places.sql` adds the `places` list, `profiles.discovered`,
  `discover()`, and the found counts on `leaderboard()`.
- `20261007200000_achievements.sql` has `leaderboard()` return each player's goals too,
  so friends see each other's achievements (ADR 0009).
- `20261007210000_convoy.sql` adds `missions.crew`, the convoy course, and
  `complete_convoy()`, which pays only when a friend is among the crew;
  `complete_mission()` now refuses courses that take a crew (ADR 0010).
- `20261007230000_race.sql` adds the race's row; `complete_convoy()` pays it (ADR 0011).
- `20261009000000_drive_log.sql` logs every `add_miles()` call to `private.drive_log`
  (claimed, paid, seconds since the last bank, rig) and sums driving and course miles per
  player per hour in `private.miles_hourly`. The `private` schema isn't exposed by the
  API and no game role can use it, so only the owner reads it, from the SQL editor or
  the MCP. `me()` now locks the caller's row: before, calls sent at once each read the
  same profile, so twenty `add_miles` calls in flight paid 20 miles instead of 5 and
  ten mission claims paid five times.
- `20261009120000_saved_fog.sql` adds the `fog` table, `explore()` and `explored()`,
  which save the map's fog (ADR 0013).
- `20261009180000_island.sql` adds `worlds` (the fares), `profiles.world`, `fly()` and
  `private.flight_log`; `shop_items.world` and the Sandfly, with `buy()` checking where
  you are; a row of `fog` per world, with `explore()` and `explored()` taking the world;
  and the policies that let only players on the island use `world:island` (ADR 0014).
  Applied to the live project on 2026-10-09 with `supabase db push`, after it and the
  whole of `game.test.sql` passed a dry run there that rolled back
  (`supabase/tests/README.md` says how); the checks pass against the migrated project
  too. The advisors' new notices are the expected ones and were left alone: `fly`,
  `explore`, `explored` and `is_in_world` are callable by signed-in players, which is
  the design; `private.flight_log` has no policies because only the owner reads it;
  and the foreign keys to `worlds` have no index, because it has two rows that are
  never deleted.
- `20261009233000_cheaper_flights.sql` lowers both fares in `worlds` to 150 miles each
  way, the owner's call (ADR 0014).
- `20261010000000_courses_pay.sql` raises prices fivefold, all but the first upgrade
  of each kind (the Sandfly's too, but not the fares), and every course's payout
  eightfold or more, the island's included; adds the seven new valley courses; and adds
  `missions.min_miles`. Both `complete_mission()` and `complete_convoy()` now pay
  through `private.pay_run()`, which also refuses a run that overlaps the last one or
  banked less than `min_miles` since it (ADR 0017).
- `20261010080000_honest_crews.sql` gives each course its world (`missions.world`) and
  has `pay_run()` refuse a claim from another, pays a convoy only if enough of the crew
  it names banked the course's miles (kept in `mission_runs.crew`), and has `add_miles()`
  refuse a second bank within two seconds (`decisions/0018-honest-crews.md`).
- `20261010120000_more_courses.sql` builds on that: twelve more courses, every course's
  `min_seconds` lowered (27 m/s, not 23, which the Sandfly beat), and
  `complete_convoy()` taking up to nine others (ADR 0019).
- `20261010180000_sandbar.sql` adds one row to `missions`, the island's Sandbar course
  (ADR 0020). The tide is the browser's and the server isn't told it. Applied to the
  live project on 2026-10-10, after it and the whole of `game.test.sql` passed a dry run
  there that rolled back; the checks pass against the migrated project too. Not with
  `supabase db push`, which refuses while `20261010090000_cartier_chains.sql` (put on by
  hand) is missing from the project's migration history: its SQL was run with
  `supabase db query --linked -f`, and `supabase migration repair --status applied
  20261010180000` recorded it. `supabase db push --include-all` would record the
  Cartier chains file too and change nothing else.
- `supabase/tests/game.test.sql` plays three accounts against all of it, on a plain
  local Postgres or against the linked project in a transaction that rolls back (see
  `supabase/tests/README.md`).
- There is no Next.js middleware and no server route. The page is still static, and
  the browser talks to Supabase directly.

### Online setup

**Done on 2026-10-07.** The project is `gilbyy`, ref `apqlumghzqkklmpwizex`, in the
Gilbyy org (free plan), region `us-west-1`. Every migration is applied (the convoy and
race ones on 2026-10-08), and it was played signed in from two browsers; see
`sessions/2026-10-07-connect-supabase.md`.
The convoy and the race were merged to `main` and deployed on 2026-10-08, after the
database tests passed against the live project (`supabase/tests/README.md`). Neither
has been played from two accounts over Supabase yet; see
`sessions/2026-10-08-convoy-race-deploy.md`.
To do it again from nothing:

1. Create a project on the free plan: `supabase projects create gilbyy --org-id <org>
   --region us-west-1 --db-password <generated>`. (The Supabase MCP's `create_project`
   refused with a cost-confirmation error; the CLI works.)
2. `supabase link --project-ref <ref>`, then `supabase db push`. Run the security and
   performance advisors afterwards.
3. Realtime → Settings: turn **off** "Allow public access", so only signed-in players
   can join the private `world` and `chat:` channels. A signed-out client then gets
   `PrivateOnly` on any public channel.
4. Authentication → URL Configuration: Site URL `https://gilbyy.com`, and these
   redirect URLs:
   - `https://gilbyy.com/**` and `https://www.gilbyy.com/**` (`www` serves the site
     itself rather than redirecting, so a sign-in started there comes back there);
   - `http://localhost:3000/**`;
   - `https://gilbyy-*-nevin-gilbert-s-projects.vercel.app/**`, which covers both
     shapes of preview URL (`gilbyy-<hash>-…` and `gilbyy-web-git-<branch>-…`).
5. Authentication → Sign In / Providers → Google, with a Google Cloud OAuth client
   (type *Web application*; the one in use is "gilbyy world" in the `gilbyy-projects`
   Google Cloud project) whose only redirect URI is
   `https://<ref>.supabase.co/auth/v1/callback`. The game offers no other way in, so
   the Email provider on that same page can be turned off.
6. In the Vercel project `gilbyy-web`, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key, never the secret
   one) for Production and Preview. Locally, put the same two in `apps/web/.env.local`.

Without those two variables, the game is single player and shows no sign-in button.

Two things are only on the machine that did the setup, both gitignored: the database
password in `supabase/.env`, and the CLI's link in `supabase/.temp/`. Neither is needed
to run the game; reset the password in the dashboard if it's ever wanted.

## Hosting and deploys

Vercel Hobby, **one project per app**:

| Vercel project | Repo | Domain |
| --- | --- | --- |
| `gilbyy-web` | `gilbyy` | `gilbyy.com`, `www.gilbyy.com` |
| `friendlybets` | `friendlybets` | `bets.gilbyy.com` |
| `wellness-planner` | `wellness-planner` | `meals.gilbyy.com` |
| `beeriokart-dashboard` | `beeriokart-dashboard` | `karts.gilbyy.com` |
| `times-tables` | `times-tables` | `times.gilbyy.com` |

Subdomains need no code changes — no `basePath`, no rewrites. Point gilbyy.com's
nameservers at Vercel (or buy the domain through Vercel), then add the hostname in each
project's Settings → Domains and the DNS is written automatically. If DNS stays
elsewhere, each subdomain is a `CNAME` to `cname.vercel-dns.com`.

Production deploys from `main`. Preview deploys from every PR (free). Environment
variables live in Vercel project settings; nothing real in the repo.

If we outgrow Vercel free, Cloudflare Pages is the fallback.

## CI

GitHub Actions. The repo is **public** — see `docs/decisions/0001-public-repo.md`. This gives unlimited Actions minutes and unlimited CodeRabbit reviews, and it doubles as a portfolio piece.

Pipeline on PR: install → typecheck → lint → unit tests → build. Add Playwright e2e once any level is past MVP.

CodeRabbit free tier handles AI PR review (their quota, not ours). Sentry free for error tracking and BetterStack free for uptime get wired up after the first deploy.

## What requires API spend (deferred)

- Anthropic API for autonomous agents (Telegram-controlled feature requests, AI
  generating code in CI, scheduled AI jobs).
- Twilio or any commercial SMS provider.

Anything level-specific (vision APIs for Karts' OCR, USDA lookups for Meals) is now
that repo's problem, not this one's.

## Free-tier limits to watch

- **Supabase free:** 500 MB DB, 50k MAU per project, and **a cap on how many free
  projects one org may have**. Projects pause after a week with no activity
  (revivable in one click), so a quiet month means the first sign-in fails until
  someone resumes the project.
  `private.drive_log` is the one table that grows with play: a row per bank, every
  15 s while a truck moves, about 240 rows (roughly 30 kB) per hour of driving. A
  thousand hours of play is around 30 MB, so nothing prunes it yet.
- **Supabase Realtime free:**
  - **200 concurrent connections, 100 messages a second, and 2 million messages a
    month.** A broadcast counts once when it's sent and once for each player who
    receives it.
  - Exceeding the limits restricts the service; there is no surprise bill.
  - This is what really limits the shared valley:
    - `PoseGate` in `net.ts` keeps players² × send rate under about 40 messages a
      second;
    - it sends nothing while a truck is parked;
    - while cruising straight or round a steady bend it sends only a heartbeat every
      3 s, because the others' dead reckoning already has the truck in the right
      place. Each pose carries the truck's turn rate so the guess can follow a bend;
      the sender and the others use the same `guessPose`, so they agree on when the
      guess has gone wrong. The others keep a quiet truck moving for a little longer
      than the heartbeat (`staleAfter`), or it would stop and lurch on between
      heartbeats.
  - **Presence has its own limit: five updates per client in thirty seconds, or
    Realtime closes that client's channel** (`ClientPresenceRateLimitReached` in the
    Realtime logs). Presence carries each player's tent, name and rig, so
    `PresenceBudget` in `net.ts` holds announcements to four per thirty seconds and
    sends a burst as one. If the channel is closed anyway, `SupabaseNet` rejoins and
    announces again after a full window. Nothing that changes often belongs in
    presence.
  - There are only thirty tents, so a player who isn't really there gives theirs back:
    after five minutes with the tab out of sight, or fifteen without touching the game
    (`isAway` in `net.ts`, checked on a timer in `Game.tsx` because a hidden tab draws
    no frames). They take a tent again the moment they return. It also lets the
    Realtime connection close.
  - A parked truck sends no poses, so a player who has just arrived asks for them
    (the `where` broadcast) and everyone answers once.
  - Each world has its own channel (`worldTopic` in `net.ts`: `world` for the valley,
    `world:island` for the island) and its own thirty tents, so a pose is only ever
    delivered to players in the same world. The limits above are per project, though:
    both channels draw on the same budget.
  - Convoys and races (`convoy.ts`) are broadcasts too, received by everyone in the valley: while
    gathering, a call every 3 s and a reply every 3 s from each joiner; while running,
    each driver's flag count on every flag and every 5 s. A two-minute convoy of two
    with four players in the valley is a few hundred messages, less than their poses.
    A crew can be ten (ADR 0019), and ten trucks through one flag in the same second
    would be ten broadcasts to up to thirty players, past the hundred a second. So past
    four in a crew each truck waits half a second per truck between flag counts
    (`flagGap`; the finish always goes at once) and repeats every 0.8 s per truck
    (`countEvery`). A ten-truck convoy in a full world is on the order of ten thousand
    messages.
  - Getting stuck and getting out (ADR 0021) cost next to nothing: a pose when a truck
    sticks, one when a cable takes and one when it's free, each sent at once and past
    `PoseGate`'s pacing; a single `winch` broadcast per rescue by a player; and a single
    `tow` broadcast when BBB's truck comes into sight. Nothing about any of it goes in
    presence.
  - The first private-channel join on a new or just-restored project can be refused
    with `MissingPartition` while Realtime creates its message partitions;
    `SupabaseNet.open()` tries three times.
  - Roughly: two friends driving for an hour cost on the order of 10–25k messages, so
    the monthly budget covers about a hundred such hours. Thirty players at once would
    hit the per-second cap; the tent limit is 30, but the comfortable number is under
    ten.
- **Supabase Auth email:** the built-in mailer sends only a few emails an hour, and
  only to addresses that are members of the Supabase org; anyone else gets "Email
  address not authorized". That is why sign-in is Google only: the email-link option
  was removed on 2026-10-07 because it could not work for the public. Bringing it back
  means a custom SMTP sender, which is a new service and so a decision for the owner
  under the free-tier rule.
- **Vercel Hobby:** 100 GB bandwidth/month, 100 GB-hr serverless. Realistic for hobby; watch images.
- **Sentry free:** 5k errors/month.
- **GitHub Actions:** 2k minutes/month on private; unlimited on public.
- **CodeRabbit:** unlimited reviews on public repos; limited on private.

## How to add a new app under gilbyy.com

1. Create a **new repo** for it. It is its own app, not a folder in this one.
2. Build it, with whatever stack suits it. It does not have to match this one.
3. Deploy it as its own Vercel project.
4. Add `<name>.gilbyy.com` in that project's Settings → Domains.
5. Add a row to the hosting table above.

Do **not** add it to the game as a menu entry or a marked destination. gilbyy.com is
not a menu — see `decisions/0004-gilbyy-is-just-a-driving-game.md`. A hidden building
with a card is allowed, under the rules in `decisions/0012-easter-egg-buildings.md`.

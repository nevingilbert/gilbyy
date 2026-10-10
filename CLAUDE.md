# CLAUDE.md

This file orients Claude Code (and Cowork) when working in this repo. Read this before doing anything else in the repo.

## What this project is

Gilbyy is a **driving game** at gilbyy.com. You load the site and drive a 4x4 around a
low-poly 3D valley: rivers, a railway, snow country, day and night, garages that sell
rigs and parts for the miles you drive, optional missions, and a map you uncover as you
go. With no sign-in it is single player and nothing is saved. Signed in, progress
persists and everyone shares the valley: you spawn at a 30-tent campground, make friends
by meeting at the café, chat with friends nearby (ADR 0007), and drive a convoy course
together (ADR 0010) or race each other (ADR 0011). Over the river, hidden, is an
airstrip: 150 miles buys a flight, truck and all, to an island of beach, dunes and
jungle, and 150 more buys the flight home (ADR 0014). Both places have animals that keep
out of your way: deer, hares, reindeer and ducks in the valley; crabs, gulls, boar,
macaws and dolphins on the island (ADR 0015). That is the entire product.

It is not a hub, a menu, or a launcher. See `docs/vision.md` and
`docs/decisions/0004-gilbyy-is-just-a-driving-game.md` — this has been misunderstood
repeatedly, so treat it as a hard constraint rather than a preference. The one
exception is four easter-egg buildings (a bank, a church, a school, a casino) hidden in
the valley, each with a card that links to one of the owner's other projects (ADR
0012). They are not on the map, pay nothing, and are the only links out. Looking
inside one counts it as found (ADR 0016).

**The look and feel to aim for is a lightweight version of _Over the Hill_**, the indie
driving game: a few saturated colours held together by warm haze, a low sun, calm and
unhurried, a nearly absent HUD. Read `docs/art-direction.md` before changing anything
visual. It was written from the actual footage and covers what we borrow and what we
deliberately don't. The game went 3D on 2026-10-06; see
`docs/decisions/0005-go-3d-with-threejs.md`.

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos that
happen to share the gilbyy.com domain via subdomains. If a request is about one of those
apps, you are in the wrong repo.

## Layout

- `apps/web/` — the Next.js app. The game lives in `src/app/`:
  - Pure, no three.js, unit-tested:
    - `terrain.ts`: the valley as grid fields (heights, water, snow, ice, distances), the
      railway's earthworks, the rivers, the campground and café, garage sites, and which
      ground needs the snorkel.
    - `world.ts`: scatter (trees, rocks, bushes), obstacles, and the `Ground` the physics
      reads.
    - `physics.ts`: a pure `step(car, input, dt, ground, spec)`.
    - `vehicles.ts` (the eight rigs, and the Sandfly, sold only on the island), `shop.ts` (parts, prices, `specFor`),
      `missions.ts` and `mission-run.ts` (courses and runs), `goals.ts` (first-time
      guidance: the compass mark leads to a garage, then the café), `achievements.ts`
      (those two steps as achievements, ADR 0009).
    - `convoy.ts`: how two to ten friends gather, set off and come home together on a
      convoy course, or race, agreed over broadcasts (ADR 0010, 0011, 0019).
    - `ramp.ts`: the jump's timber ramp, which is not in the height grid: its deck is
      laid over the ground for whoever asks how high the ground is (ADR 0019).
    - `name-tags.ts`: keeps the name tags over other players' trucks off one another;
      a further truck's tag is lifted above a nearer one's.
    - `track.ts` (train, crossings, and the bridges' guards, abutments and legs), `daylight.ts`
      (time of day), `noise.ts`.
    - `places.ts`: things to find, world by world (garages, the café, the airstrip, the
      easter eggs), and how they're counted (ADR 0008, ADR 0016).
    - `landmarks.ts`: the four easter-egg buildings, what each card says and links to,
      and where they stand (ADR 0012).
    - `worlds.ts`: the worlds there are (the valley and the island) and what the flight
      to each costs (ADR 0014).
    - `airport.ts`: an airstrip's runway and apron in "field space", where the valley's
      is hidden (`valleyAirfield`), and the bank and screen of pines that hide it.
    - `island.ts`: the island as the same `World` shape as the valley: sea, beach, dunes,
      jungle, thirty pitches on the beach, its airstrip, its café, its three garages and
      its three courses.
    - `flight.ts`: the flight as a film, each frame a pure function of the airstrip and
      the time (the plane, its ramp, the truck, the camera), and the plane's measurements.
    - `wildlife.ts`: the animals of each world, where their herds live, and how they
      graze, wander and get out of the way of trucks and the train (ADR 0015).
  - Online, also unit-tested:
    - `store.ts`: progress, either `LocalStore` (in memory) or `SupabaseStore`
      (database functions).
    - `net.ts`: presence, tents, poses, friend requests and chat, either `SupabaseNet`
      or `LocalNet` (tabs of one browser, `?net=local`).
    - `supabase.ts`: the client and sign-in.
  - `palette.ts`: every colour, in one place, including the sky keyframes.
  - three.js:
    - `scene.ts` assembles everything.
    - Ground and sky: `terrain-mesh.ts`, `scenery.ts`, `sky.ts`.
    - Railway: `railway.ts`, `train-model.ts`, `crossing-model.ts`.
    - Vehicles: `car-model.ts` with `vehicle-models.ts`, and `remote.ts` for other
      players' trucks.
    - Buildings: `garages.ts`, `campground-model.ts`, `coffee-shop-model.ts`,
      `landmark-models.ts` (the bank, church, school and casino), `showroom.ts` (the
      garage interior).
    - Flying: `airport-model.ts` (runway, lights, terminal), `plane-model.ts` (the jet and
      its ramp).
    - Missions: `mission-models.ts`, and `ramp-model.ts` (the jump, built from the same
      surface the physics drives on).
    - Animals: `animal-models.ts`, one instanced mesh per moving part of each species.
  - `map.ts`: the 2D map of the world you're in, its fog of war, and the found places
    that show through it. `fog.ts` (pure, unit-tested) is the grid the fog is saved as
    (ADR 0013), kept per world.
  - React: `Game.tsx` (loop, modes, HUD), `GarageMenu.tsx` (the shop), `Panels.tsx`
    (starter picker, banner, sign-in, name, leaderboard).
- `supabase/`: the migrations (schema, RLS, the functions every write goes through,
  realtime policies) and their SQL tests.
- `packages/` — empty. Add a package only when two directories *in this repo* need the same thing, which is now a high bar.
- `docs/` — design docs.
  - `vision.md` — the why
  - `art-direction.md` — **the visual brief: a lightweight Over the Hill. Read before any visual change.**
  - `roadmap.md` — phased plan from skeleton to live site, with a "you are here" marker
  - `architecture.md` — the how (stack, hosting, subdomains, deploy, free-tier rules)
  - `decisions/` — short ADRs for non-obvious choices ("why X over Y")
  - `sessions/` — checkpoint files written at the end of each session
- `.claude/commands/` — project-scoped slash commands

## Stack

Next.js (App Router) + TypeScript + Tailwind, on Vercel free tier, plus one free Supabase project (auth, Postgres, Realtime) used straight from the browser. **No middleware, no server routes, no runtime dependencies beyond React, three.js and `@supabase/supabase-js`.** The whole app is one static page rendering a WebGL canvas. Without the two `NEXT_PUBLIC_SUPABASE_*` env vars it is single player only. See `docs/architecture.md` and ADR 0007.

## Commands

- `pnpm dev` — run the web app locally
- `pnpm build` — production build
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest

## Conventions

- Commits: conventional commits (`feat(game): add building collision`, `fix(world): stop trees spawning on roads`).
- Branch names: `feat/game-collision`, `fix/world-gen`.
- Add new dependencies to the package that needs them, not to root.

## Free-tier rule

This project has a hard "no spending money" constraint except for the gilbyy.com domain. Before introducing a service or library:

1. Check that its free tier covers our expected use.
2. If a decision is constrained by free-tier limits, note it in `docs/architecture.md`.
3. If a paid service would be a meaningful upgrade, write it as an ADR in `docs/decisions/` and ask before adopting.

## Don't

- Don't commit `.env` or any secret. Use `.env.local` (gitignored).
- Don't add a paid service without explicit confirmation.
- Don't add links, menus, or navigation to the other apps. gilbyy.com is a game, not a launcher. The four easter-egg cards (ADR 0012) are the only links out; don't put those buildings on the map or the compass, or pay for finding them. They are counted, as "easter eggs found", once you've looked inside (ADR 0016).
- Don't let the client write progress directly. Every change to miles, purchases and friendships goes through a checked `security definer` function in `supabase/migrations/`; keep prices and mission payouts in sync with `shop.ts`/`missions.ts`/`island.ts`, and how many can drive a convoy with `CONVOY_MAX` (`shop.test.ts` enforces both). Only the publishable key ever reaches the browser.
- Don't move what's already in the valley when adding a course. New courses are planned after the older ones, the easter eggs and the airstrip (`planMore()` in `missions.ts`), and `courses.test.ts` pins where those are (ADR 0019).
- Don't let the client say which world it's in. A flight goes through `fly()`, which takes the fare; the fares live in `worlds.ts` and `public.worlds`, and what's sold in one world only in `vehicles.ts` and `shop_items.world` (`flight.test.ts` holds both together). A course is paid only in the world it's in (`missions.world`, ADR 0019). The valley's airstrip is hidden: don't put it on the compass. It is counted ("0/1 airport found"), so players know to look for one, and goes on the map once found (ADR 0016).
- Don't make sign-in required. Single player with no account must keep working, and say clearly that nothing is saved.
- Don't reach for a game engine, a physics engine, react-three-fiber or a post-processing stack. three.js is the one rendering dependency (ADR 0005); the physics is ours and stays a pure, tested function. Anything more needs its own ADR.
- Don't put hex literals in render code. Colours go in `src/app/palette.ts`.
- Don't add pressure. Miles are the one currency, missions are optional and never fail beyond giving up (they pay far better than plain driving, ADR 0017), and the leaderboard is you and your friends only (ADR 0007). Two to ten friends can drive a convoy together (ADR 0010) or race (ADR 0011, 0019), but every finisher is paid the same, winning pays nothing extra, and race results are a line on screen that isn't stored or ranked anywhere. The jump is the same: its time in the air is a line on screen, there is no bar to clear, and it pays the same however long it was (ADR 0019). Keep it that way unless a new ADR says otherwise. The leaderboard also says how many garages and cafés each of you has found (ADR 0008); finding them pays nothing and must stay that way. The same goes for the achievements beside each name (ADR 0009). Animals are scenery: they can't be hit, hunted, counted or collected, and they aren't on the map (ADR 0015). The game is meant to be calm; see `docs/art-direction.md`.
- Don't spend the Realtime budget carelessly. Supabase's free plan counts every broadcast once per receiver; poses go through `PoseGate` in `net.ts` for that reason. Presence is stricter still: Realtime closes a client's channel after five presence updates in thirty seconds, so announcements go through `PresenceBudget`, and nothing that changes often goes in presence. See the free-tier notes in `docs/architecture.md`.
- Don't judge frame rate from headless screenshots. Headless Chromium renders WebGL in software at ~3 fps; screenshots are fine for looks, nothing else.
- Don't run autonomous agents that hit the Anthropic API without confirming first — currently we're staying in interactive Claude Code sessions only.

## Sessions and the token budget

The user is on Claude Pro and is intentionally avoiding API costs. To survive token limits across days:

1. **Scope each session narrowly.** "Today we add collision with buildings" is good. "Today we work on the whole repo" is bad.
2. **Run `/checkpoint` before context gets heavy** or at the end of any working session. It writes `docs/sessions/YYYY-MM-DD-{topic}.md` capturing decisions made, files changed, open questions, and the exact next step.
3. **The first thing a new session does** is read the latest file in `docs/sessions/`.

## When to use what

- **CLAUDE.md (this file)** — project-wide orientation. Read first.
- **Skills** — for a workflow you've done twice and want one keystroke for. Candidates: checkpoint-session, scaffold-a-new-level-repo.
- **MCPs** — for live data access. The Vercel and Supabase MCPs are wired up. The Supabase project for this repo is `gilbyy` (ref `apqlumghzqkklmpwizex`); the org's other projects belong to the other apps.
- **Subagents (Task tool)** — for parallel/isolated work in one session. Examples: "write tests for X while I keep iterating on Y," verify a finished change against acceptance criteria.
- **New session** — different concern, or context cluttered, or picking up the next day from a checkpoint.

## Status

The app is one static page. The game is 3D on three.js (since 2026-10-06), and since 2026-10-07:
- a 6 km valley with lakes, two rivers that need the snorkel, a snow plateau with a frozen lake, and a railway loop with a train and level crossings;
- day and night;
- a 30-tent campground spawn and a café;
- eight rigs, and eight garages that sell rigs and parts for miles;
- ten courses to drive alone, one of them a jump told for its time in the air, and five convoys and five races for two to ten friends (ADR 0010, 0011, 0017, 0019), and first-time guidance;
- a map with fog of war, where the garages and café you've found stay marked and are counted (ADR 0008), and signed in the cleared fog is saved too (ADR 0013);
- achievements for the first garage and the café, shown on the leaderboard (ADR 0009);
- optional sign-in for saved progress, a shared valley, friends, chat and a leaderboard (ADR 0007);
- since 2026-10-08: a bank, a church, a school and a casino hidden in the valley, each linking to one of the owner's other projects (ADR 0012).
- since 2026-10-09: an airstrip hidden over the river, a flight for 150 miles each way (300 until later that day), and an island (beach, dunes, jungle, tents on the beach, one garage) where the Sandfly dune buggy is sold (ADR 0014). Its migration is on the live project and it was merged to `main` the same day. Nobody has flown signed in yet: the fare is more miles than any player has.
- since 2026-10-09: two more garages on the island (the Dune Outpost, the Jungle Lodge), a café on its beach, three courses there (Beach Run, Dune Dash, Jungle Loop), and found-counts for the world you're in that also count its airstrip and, in the valley, the four easter eggs (found when you look inside), shown on the leaderboard too (ADR 0016). Merged to `main` as pull request 10, and `20261009230000_island_second_pass.sql` is on the live project.
- since 2026-10-09: animals in both worlds, nine species, each browser simulating its own (ADR 0015). Client only; no migration.
- since 2026-10-09: prices five times higher bar the first upgrade of each kind, courses paying far more than plain driving (the island's too), seven new valley courses, snow chains you can see, and a server check that a run drove its course (ADR 0017). Merged to `main` and deployed, and `20261010000000_courses_pay.sql` is on the live project; not yet played signed in.
- built 2026-10-09, not merged or deployed yet (ADR 0019): twelve more courses, so each world has as many for friends as to drive alone (ten and ten in the valley, four and four on the island); one of them a jump, Big Air, told for its time in the air off a timber ramp; and convoys and races for up to ten. `20261010120000_more_courses.sql` is **not on the live project**, and its database checks have never been run (there is no Postgres on the owner's machine; the dry run against the live project in `supabase/tests/README.md` needs the owner's go-ahead). Until it is applied the new courses can be driven but not paid. See `docs/sessions/2026-10-09-more-courses.md`.

The online half is connected (2026-10-07): the Supabase project `gilbyy` has every migration in `supabase/migrations/` bar that last one (the convoy and race ones since 2026-10-08), Google sign-in works, and the whole list (name, tent, seeing each other, friending at the café, chat, leaderboard, a purchase and a mission payout that persist) was played from two browsers. It was merged to `main` the same day, so gilbyy.com offers sign-in. The convoy and the race were merged to `main` and went live on 2026-10-08; the database tests pass against the live project, but neither has been played signed in from two accounts yet. A tab left hidden for five minutes, or untouched for fifteen, gives its tent back and takes one again on return. Sign-in is Google only; the email-link option was removed because Supabase's built-in mailer only reaches members of the Supabase org. Real-device frame rate is still unmeasured. See `docs/roadmap.md`, and always check `docs/sessions/` for the most recent checkpoint before starting.

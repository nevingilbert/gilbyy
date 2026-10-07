# 2026-10-07 — Accounts, a shared valley, rigs, a shop, missions, snow

## Topic

The owner's big list:
- login to save progress;
- a leaderboard with friends;
- starter and premium rigs inspired by real 4x4s;
- spending miles in a shop;
- a single-player banner with no persistence;
- a shared multiplayer valley when signed in;
- friending at a café, and proximity chat between friends;
- a 30-tent campground spawn with a cap;
- onboarding guidance and missions;
- a bigger map, and a snow biome that slides without snow tyres.

The mission brainstorm the owner asked for comes after all of this, in chat.

## Decisions made

- **ADR 0007** (`docs/decisions/0007-accounts-multiplayer-and-a-shop.md`) reverses "no
  auth, no database, no currencies" at the owner's explicit request, and partly
  supersedes 0006. ADR 0004 still stands: nothing links to the other apps.
- **Supabase, browser-only.** No middleware and no server routes. The client holds only
  the publishable key, from `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. When they're missing, `onlineConfigured` is
  false: single player only, with no sign-in button. Sign-in is Google OAuth or an
  email magic link (`supabase.ts`); on any session change the page reloads.
- **Server-checked economy** (`supabase/migrations/20261007000000_gilbyy_game.sql`):
  - Profiles can't be written directly. The `security definer` RPCs are `me`,
    `set_name`, `add_miles`, `buy`, `equip`, `complete_mission`, `mark_goal`,
    `request_friend` and `leaderboard`.
  - `add_miles` clamps to `elapsed * 0.02` and at most 5 per call.
  - `complete_mission` checks `min_seconds` and the cooldown, and pays `reward` the
    first time and `repeat_reward` after that.
  - Prices and missions are seeded in the SQL. `shop.test.ts` parses the SQL and fails
    if it disagrees with `shop.ts` or `missions.ts`.
  - `supabase/tests/game.test.sql` runs 39 checks on plain Postgres 16 with
    `local-stubs.sql`.
- **Two stores, one interface** (`store.ts`):
  - `LocalStore` is in memory, applies the same rules, and resets each visit.
  - `SupabaseStore` batches miles (`addMiles` each second, `flush` every 15 s and
    before purchases and missions).
- **Lifetime vs balance.** Lifetime only goes up, and the leaderboard shows it. Balance
  is what you spend. Bought items are kept forever and every part fits every rig.
- **Rigs** (`vehicles.ts`): Ridgeback (XJ), Bluff (FJ) and Mule ('80s pickup) are free
  starters. Then Overlander 8, Prairie (Tundra) 18, Highland (Range Rover) 28, Summit
  (LC300) 40 and Duneclaw (Raptor) 55. They have their own names because the real ones
  are trademarks. `specFor(vehicle, loadout)` in `shop.ts` builds the `CarSpec`.
- **Multiplayer** (`net.ts`):
  - **Transports:**
    - Online: one private Realtime channel, `world`. Presence keyed by user id carries
      `Peer {id, name, vehicle, loadout, tent, joined}`; broadcast events are `pose`,
      `ask` and `friended`.
    - Chat: per-pair private channels, `chat:<a>:<b>` (`chatTopic`), allowed by RLS on
      `realtime.messages`.
    - `LocalNet`: the same over a `BroadcastChannel`, with a 1.5 s heartbeat and 12 s
      expiry, for `?net=local` testing.
  - **Tents:** `settle()` lets the earliest arrival keep a tent and turns away the 31st
    player, with a retry every 60 s.
  - **Poses:** `PoseGate` sends one only when dead reckoning drifts more than 1.2 m or
    0.08 rad, plus a 3 s heartbeat while moving. The interval is at least
    `players²/40` seconds. `forget()` forces a send when a newcomer appears, so parked
    trucks show up in the right place.
  - **Remote trucks** (`remote.ts`) interpolate and extrapolate, and count as two
    obstacle circles. They remember their last pose if a player drops and comes back.
  - **Shared clock:** signed in, `time = Date.now()/1000 - SHARED_EPOCH`, so the sun and
    the train agree.
  - **Friending:** both players must be within `cafe.r + 6` of the café's meet spot and
    within 16 m of each other; F asks or accepts. Chat (T) reaches friends within
    `CHAT_RANGE = 90`. Bubbles and a log fade out.
- **World v3** (`terrain.ts`, `world.ts`, `missions.ts`):
  - 6 km square, 600 segments. Lakes are listed in `LAKES`.
  - The snow plateau lies north of `SNOWLINE_Z = -1250`, and `FROZEN` is an ice lake.
  - The campground `CAMP` has 30 pitches (`campPitches()`, with parking bays facing
    +z), roads in `world.roads`, and the café `CAFE` (levelled out to z+28).
  - There are eight garage sites, including the hangar and the ranch.
  - Four missions are generated on the terrain: forest-slalom, ridge-run,
    lakeshore-loop and ice-drift.
  - `slipAt` is 0 on dirt, 1 on snow and 2 on ice.
- **Physics:** sideways slip decays at a rate set by the surface and the tyres'
  `snowGrip`: road 0.2, studded 0.95, chains 0.85.
- **Missions** (`mission-run.ts`): E at the start arch lines you up, then a 3 s
  countdown holds the brakes. `crossed()` checks each gate in order. Wandering 320 m
  from the next gate abandons the run, and so does Esc. Rewards go through
  `store.completeMission`. Gates have no colliders; the arches do.
- **Guidance** (`goals.ts`): one line at a time (garage → buy → mission → café when
  online), plus a gold mark under the compass pointing at the nearest target or the
  next gate.
- **Debug URL params** (not linked): `?rig=`, `?miles=` (single player only),
  `?net=local`, plus the existing `?hour`, `?garage` and `?at`. Online, `?at` and
  `?garage` skip the tent spawn.

## Files changed

| Path | Change |
| --- | --- |
| `supabase/migrations/20261007000000_gilbyy_game.sql` | **Created**: schema, RLS, RPCs, realtime policies |
| `supabase/tests/*` | **Created**: stubs, 39 SQL checks, README |
| `apps/web/src/app/vehicles.ts`, `shop.ts`, `shop.test.ts` | **Created**: rigs, parts, prices, `specFor`; price sync test |
| `apps/web/src/app/store.ts`, `supabase.ts`, `net.ts`, `remote.ts` | **Created**: progress stores, auth, transports, remote trucks |
| `apps/web/src/app/missions.ts`, `mission-run.ts`, `goals.ts`, `play.test.ts` | **Created**: courses, runs, guidance, tests |
| `apps/web/src/app/vehicle-models.ts`, `campground-model.ts`, `coffee-shop-model.ts`, `mission-models.ts` | **Created** (helper agents): eight bodies, tents/camp/gate, café, arches/gates |
| `apps/web/src/app/garages.ts` | Hangar and ranch styles; `Kit.strut`; exports `prism`, `roof`, `pane`, `ring` |
| `apps/web/src/app/terrain.ts`, `world.ts` | World v3: 6 km, snow and ice, camp, café, roads, eight sites |
| `apps/web/src/app/physics.ts`, `physics.test.ts` | Vehicle specs, snow and ice traction |
| `apps/web/src/app/car-model.ts`, `showroom.ts` | Any rig; loadout-driven extras; wheel tuck capped at 0.1 m |
| `apps/web/src/app/scene.ts` | Camp (pitches merged by material), café, missions, remotes, `setRig`, `project` |
| `apps/web/src/app/terrain-mesh.ts`, `scenery.ts`, `railway.ts`, `map.ts`, `palette.ts` | Snow drifts and ice, frosted pines, camp roads, map icons and players |
| `apps/web/src/app/Game.tsx`, `GarageMenu.tsx`, `Panels.tsx` | Loop rewrite; shop UI; picker, banner, sign-in, name, leaderboard |
| `apps/web/src/app/upgrades.ts` | **Deleted** (superseded by `shop.ts`) |
| `apps/web/package.json`, `pnpm-lock.yaml` | `@supabase/supabase-js` |
| `CLAUDE.md`, `docs/*` | ADR 0007; architecture (online setup, Realtime free-tier notes), vision, art direction, roadmap, ADR 0006 status |

## Open questions

- **No Supabase project is connected yet.** The owner is retiring one to free a slot.
  `SupabaseStore`/`SupabaseNet` typecheck and mirror the tested SQL, but they have never
  run against a real project.
- **The café rule and the 30-tent cap are client-side only**, which is fine for a
  courtesy limit. A modified client could ignore them, but it can't touch the economy.
- **Real-device frame rate is still unmeasured.** The camp merges to about 20 draw
  calls, but every remote truck adds about 25.
- **Mission flags** use `PALETTE.flag` orange on orange grass. They read fine in
  screenshots; recolour if they don't on real screens.
- **The leaderboard in `?net=local`** shows only you, because `LocalStore` doesn't know
  friends' miles.

## Exact next step

Connect Supabase:
1. Create the project.
2. Run `supabase/migrations/20261007000000_gilbyy_game.sql`.
3. Turn off Realtime "Allow public access".
4. Enable the Google provider and the redirect URLs.
5. Set the two `NEXT_PUBLIC_SUPABASE_*` vars in Vercel and `apps/web/.env.local`.

The steps are in `docs/architecture.md` → *Online setup*. Then sign in from two devices
and walk through it: name prompt → tent → meet at the café → F on both → T to chat →
L for the leaderboard → buy something → reload and check it persisted. Fix whatever
`SupabaseNet.open()` or the RPC calls in `store.ts` trip on.

## Tokens advisory

This was a long session that resumed once from a compacted context. It stopped at a
natural break, with everything built, verified headlessly, documented and pushed.

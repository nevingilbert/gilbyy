# 2026-10-07 — Connect Supabase, and what broke on first contact

## Topic

Wire the online game on `feat/multiplayer` to a real Supabase project, play it signed in
from two browsers, and fix what broke.

## Decisions made

- **The project is `gilbyy`, ref `apqlumghzqkklmpwizex`**, in the Gilbyy org (free
  plan), `us-west-1`. Created with the CLI (`supabase projects create`), because the
  Supabase MCP's `create_project` refused with a cost-confirmation error. `friendlybets`
  is paused, which is what freed the slot.
- **Migrations go through `supabase db push`**, so the remote history matches the file
  names. The database password was generated into `supabase/.env` (gitignored) and
  never printed.
- **Advisor fixes are a second migration**, `20261007060000_advisor_followups.sql`:
  - `handle_new_user()` and `is_chat_member()` were callable by signed-out visitors,
    because Supabase grants execute on every new `public` function. Revoked;
    `is_chat_member` stays executable by `authenticated`, since the realtime policies
    run as the player.
  - Indexes on `friendships(b)` and `friend_requests(to_id)`.
  - Left alone on purpose: the "signed-in users can execute security definer function"
    warning for the nine game RPCs (that is the API, ADR 0007), and no index on
    `mission_runs.mission`.
- **The SQL tests run against the live project** in one transaction that always rolls
  back (`supabase/tests/README.md`), because this Mac has no local Postgres. All checks
  pass there, including four new privilege checks. The Realtime part needs today's
  `realtime.messages` partition, which exists once anything has connected to Realtime.
- **Dashboard settings were done by the owner**, because `supabase.com` is blocked in
  Claude's browser pane: Realtime "Allow public access" off; Site URL
  `https://gilbyy.com`; redirect URLs for the apex, `www`, `localhost:3000` and
  `https://gilbyy-*-nevin-gilbert-s-projects.vercel.app/**`; Google provider with the
  OAuth client "gilbyy world" in the `gilbyy-projects` Google Cloud project.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (the `sb_publishable_…` key) are in `apps/web/.env.local` and in Vercel `gilbyy-web`
  for Production and Preview.
- **Presence is rationed.** Realtime closes a client's channel after five presence
  updates in thirty seconds. The game announced on every rig looked at in the starter
  picker and every part fitted, so the first signed-in session was kicked within half
  a minute, never rejoined, and sent 166 poses as REST calls. Now, in `net.ts`:
  - `PresenceBudget` allows four announcements per thirty seconds, and `update()`
    waits 1.5 s (`announceSoon`) so a burst goes out as one;
  - looking at a rig in the picker doesn't announce (`fitRig(v, l, false)` in
    `Game.tsx`);
  - `SupabaseNet.subscribe()` keeps listening to the channel's status: `SUBSCRIBED`
    again means re-announce, and `CLOSED` after joining means `reopen()` (rejoin with
    backoff, budget drained so the next announcement waits a whole window);
  - `emit()` only sends over a joined channel, so nothing falls back to REST silently.
    Chat uses `httpSend()` explicitly when its channel isn't joined yet.
- **`SupabaseNet.open()` tries three times.** The first private join on a new project
  was refused with `MissingPartition`; a project restored from a pause would do the
  same.
- **Newcomers ask where everyone is.** A parked truck sends no poses and only re-sent
  on seeing a new player id; a second tab or a quick reload arrives under a known id.
  `Base.join()` now broadcasts `where`, and `NetHandlers.wanted` answers through
  `sharePose(now, true)` in `Game.tsx`, at once and not on the next frame, because a
  background tab draws no frames.
- **The opening is a flyover that ends on the truck** (the owner's call: they liked the
  accidental camera flight but wanted it first). `scene.ts` has `flyIn()` (hang high
  over `CAMP`, drifting, truck hidden), `land()` (glide down over `GLIDE_TIME`) and
  `cut()` (snap). `Game.tsx` starts the opening at load when online is configured,
  lands once the tent is known or after `HOVER_LIMIT` (4 s), and `dip()`s to black for
  any later move of the truck. The fade element is black from the first paint.
- **Minimap fix:** `sizeCanvas` sets width and height independently and runs every
  frame. A new canvas is 300×150 and 300 was exactly the wanted width on desktop
  retina, so the old width-only check left it half height (an egg).
- **L and Esc close the leaderboard** (`Panels.tsx`); the button already said so.
- **`supabase/.temp` is no longer tracked** (it pointed at a deleted project), and
  `.claude/launch.json` starts `pnpm dev` for the preview pane.

## Added after the first checkpoint (same day)

- **Found places (ADR 0008).** The owner settled the open question: "barn" meant
  garage, friends as dots are fine, and garages and cafés should always show once
  found. Built: `places.ts` (keys `garage:<style>` and `cafe:camp`, `countFound`,
  `foundLine`), `Store.discover()`, `createMap(world, onFound)` with `setFound()`,
  the count under the full map and under each leaderboard name, and migration
  `20261007120000_found_places.sql` (`places`, `profiles.discovered`, `discover()`,
  `leaderboard()` now returns `garages` and `cafes`). The column is `discovered`
  because `found` is a special variable inside a database function.
- **The café is no longer on the map until found.**
- **Frame time-steps can't be negative** (`Game.tsx`, `frame`). The first frame's
  timestamp can precede the moment the effect stored, and the opening's fade, started
  at zero, went below zero on that frame and never ran: a black screen. This was live
  in the first push of the opening and is fixed.
- **`game.test.sql` counts only its own three accounts** in its first check, so it
  still runs against the project now that it has real players.
- **The stale `SUPABASE_SERVICE_ROLE_KEY` was removed** from Vercel `gilbyy-web` with
  `vercel env rm`, at the owner's request.
- Seen working in the browser: the opening (over the camp, then down to the truck)
  signed out, and the single-player map ("1/8 garages · 0/1 café found", café hidden
  until found). **Not seen:** the signed-in path of `discover()` from a browser (the
  pane had been signed out); the SQL checks for it pass on the live project.

## Played and confirmed (two browsers, two Google accounts)

Name prompt and tent; each sees the other ("2 here", name tags); F at the café from
both makes a `friendships` row and a ★; chat both ways; the leaderboard shows both;
banked miles persist; a Forest Slalom run (29.9 s) paid 1.5 mi; Desert Cream was bought
for 0.5 mi and survived a reload. Live checks of the presence fix: 13 rig changes in
20 s made 5 presence updates with the channel still open, and a forced `phx_close` was
rejoined in 2 s and re-announced 30 s later.

## Files changed

| Path | Change |
| --- | --- |
| `supabase/migrations/20261007060000_advisor_followups.sql` | **Created**: revokes and two indexes |
| `supabase/tests/game.test.sql`, `README.md` | Four privilege checks; how to run against the linked project |
| `apps/web/src/app/net.ts` | `PresenceBudget`, `announceSoon`, join retry, `reopen()`, `where` request, no REST fallback |
| `apps/web/src/app/play.test.ts` | Three tests for `PresenceBudget` (63 tests in all) |
| `apps/web/src/app/Game.tsx` | Opening (`land`, `dip`), `sharePose`, `wanted`, quiet rig previews, minimap sizing |
| `apps/web/src/app/scene.ts` | `flyIn`, `land`, `cut`; camera `follow()` with the glide |
| `apps/web/src/app/Panels.tsx` | Leaderboard closes on L and Esc |
| `.gitignore`, `supabase/.temp/*`, `.claude/launch.json` | Untrack CLI link state; dev-server launch config |
| `CLAUDE.md`, `docs/architecture.md`, `docs/roadmap.md` | Online setup done, presence limit, mailer limit, next steps |
| `apps/web/.env.local`, `supabase/.env` | **Not committed** (gitignored): public keys; database password |

## Open questions

- **The opening's feel is the owner's to judge.** It has been seen running signed out
  (see above), not signed in. The numbers to tune are `GLIDE_BACK`, `GLIDE_UP`,
  `HOVER_DRIFT` and `GLIDE_TIME` in `scene.ts`.
- **The `where` fix is only half observed:** a newcomer was seen sending it. The reply
  was not watched arriving in a second client.
- **`feat/multiplayer` is not merged**, so gilbyy.com is still single player. The owner
  asked not to merge or open a PR without being asked. Sign-in on a Vercel preview URL
  is untested.
- **Magic links only reach members of the Supabase org** (built-in mailer). Google is
  the only sign-in that works for the public. A custom SMTP sender is a new service:
  ask first.
- **An inactive tab keeps its tent.** It stays connected and present; only closing the
  tab or losing the connection frees the tent. There is no idle timeout.
- **One account in two tabs** sends poses from both under one id, so others see that
  truck jump between them.
- **`reopen()` was tested with a simulated close**, not a real rate-limit kick.
- Two test accounts exist in the project: "Devin" and "gilbyy" (the owner's).

## Exact next step

First ask the owner to look at the opening and say whether to merge `feat/multiplayer`.

The four requests below were built later the same day (see *Added after the first
checkpoint*), so what is left of them is one check: sign in, drive to the café and a
garage, reload, and confirm both are still on the map and counted on the leaderboard.
The original notes are kept for the reasoning.

1. *Friends on the map.* `map.ts` already draws every online player as a dot, friends
   in `PALETTE.map.friend`. Ask whether that is enough or friends should stand out
   more (a name, a bigger mark) or be the only players shown.
2. *Found garages and cafés stay on the map.* Today `seen` in `createMap()` is in
   memory and resets every visit, and the café is always marked. Persist discoveries:
   a migration adding something like `profiles.found text[]` and a `security definer`
   `discover(p_key text)` checked against a list of real place keys (the client
   reports it, as `mark_goal` does; the server can't see positions). `LocalStore`
   needs the same method. Feed the stored set into `createMap()` instead of `seen`.
3. *Counts*, such as "3/8 garages found", in the map view or under the minimap.
4. *On the leaderboard:* extend `public.leaderboard()` to return each friend's counts
   and show them in `Leaderboard` in `Panels.tsx`. Check this against CLAUDE.md's
   "don't add pressure" rule and ADR 0007 (the leaderboard is miles, friends only); it
   likely wants a line added to ADR 0007 or a short new ADR.

Keep `supabase/tests/game.test.sql` and `shop.test.ts` passing, and run the SQL tests
against the linked project as `supabase/tests/README.md` describes.

## Tokens advisory

A long session with many round trips to the owner for dashboard clicks and sign-ins.
It stopped at a natural break: everything asked for is done and pushed, with the new
feature requests left for a fresh session.

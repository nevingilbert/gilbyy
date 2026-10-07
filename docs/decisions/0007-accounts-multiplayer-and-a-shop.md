# 0007 — Accounts, a shared valley, and a shop that spends miles

Date: 2026-10-07
Status: Accepted. Supersedes the "no auth, no database" line in `CLAUDE.md` and
`architecture.md`, the `localStorage` persistence and mileage tiers in `0006`, and the
"no currencies" rule. Keeps `0004`: the game still links to no other app.

## Context

The owner asked for a much bigger game on the same page:

- sign in to save progress, with a leaderboard comparing miles with friends;
- several starter rigs inspired by real entry-level 4x4s (Cherokee, FJ Cruiser), and
  pricier ones further up (Raptor, Tundra, Land Cruiser, Range Rover);
- a shop where miles are *spent*, not just unlocked, so the game lasts longer;
- the page stays playable with no login, with a banner saying it's single player and
  nothing is saved;
- signed in, everyone drives the same valley together;
- friends are made by meeting at a coffee shop, and friends get proximity text chat;
- the spawn is a campground with 30 tents; when all 30 are taken, no one else joins;
- first-time guidance, missions that pay miles (a slalom through trees), a bigger map,
  and a snow biome where the truck slides unless it has snow tyres.

That reverses three standing rules: no auth, no database, no currencies. The owner
asked for each explicitly, so this records the change instead of working around it.

## Decision

- **Supabase for accounts, progress and realtime.** One free project, on the owner's
  account; one was retired to make room. Sign-in is Google OAuth or an email magic
  link. The client uses only the publishable key. Every write goes through
  `security definer` functions in `supabase/migrations/20261007000000_gilbyy_game.sql`,
  and players can't update their own rows directly:
  - `add_miles` banks at most what could physically have been driven since the last
    bank (0.02 mi per second elapsed, 5 mi per call);
  - `buy` charges the server's price from `shop_items`;
  - `equip` only fits things you own;
  - `complete_mission` pays the first finish in full, then a smaller repeat reward,
    no more than once per cooldown, and only for runs no faster than is believable.
  Prices and mission payouts live in both `shop.ts`/`missions.ts` and the migration;
  `shop.test.ts` fails if they drift apart.
- **Single player is the default and stays first-class.** With no session, or when the
  Supabase environment variables are missing, the game runs entirely in memory
  (`LocalStore`) under the same rules, and a banner says nothing is saved. Without the
  variables the sign-in button doesn't appear.
- **Miles are money.** Lifetime miles only go up and are what the leaderboard shows.
  Balance is lifetime minus spending. Everything bought stays yours, and every part
  fits every rig. Mission rewards add to both.
- **The shared valley is Supabase Realtime, not a game server.** There is one private
  channel, `world`, that only signed-in players can join:
  - presence says who's there and which tent is theirs;
  - broadcast carries poses and friend requests.
  Chat between two friends goes over a private channel of its own,
  `chat:<id>:<id>`, which RLS on `realtime.messages` lets only those two use.
  Poses use dead reckoning and are only sent when the truck strays from where the
  others would guess it is. The rate falls with the square of the player count,
  because Supabase counts each message once per receiver. Everyone shares one wall
  clock, so the sun and the train agree.
- **The 30-tent cap is enforced in the client from presence:** earliest arrival keeps
  its tent, and the 31st player is turned away and retried every minute. It's a
  courtesy limit, not a security one. The real ceiling is Supabase's free-tier
  message budget (see `architecture.md`).
- **Friending needs both players.** Each side has to ask (`request_friend`); the
  second ask makes the friendship. The café rule (both trucks at the coffee shop) is
  checked in the client only, since the server doesn't know where trucks are.
- **Rigs are inspired by real vehicles but named for themselves.** The real names
  are trademarks.
- **Links to other gilbyy.com apps are still not built.** `0004` stands.

## Consequences

- New runtime dependency: `@supabase/supabase-js`. three.js is still the only rendering
  dependency.
- Setup needs a Supabase project, the migration applied, Realtime's "Allow public
  access" turned off, a Google OAuth client, and two Vercel environment variables. See
  `architecture.md` → *Online setup*.
- Multiplayer can be tested without a project: `?net=local` plays across tabs of one
  browser over a `BroadcastChannel`.
- The free tier realistically supports a handful of players at once, not thirty. If
  the valley gets busy, moving to a paid plan or a small websocket relay needs its own
  ADR and the owner's go-ahead.

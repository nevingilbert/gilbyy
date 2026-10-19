# 2026-10-18 — The loose ends after the full review

## Topic

Everything left over from the review (`2026-10-18-full-review.md`), all of it: three
agents in parallel on files that didn't overlap (the convoy relay; the city's streets,
alleys and decks; the game's way out, banks and frame-rate readout), and the rest here.

## Decisions made

- **Convoy messages go through the server** (ADR 0025). `say_convoy(jsonb)` stamps the
  caller's id as the sender, checks the message is one the game sends, throttles (thirty
  at once, then one a second) and broadcasts with `realtime.send()` on `convoy:<world>`,
  which a world's players can hear and nobody can send on. Pages hear convoys only there.
  `20261018120000_convoy_relay.sql` went on the live project before the pages that use it,
  after a rolled-back dry run; the checks pass against the migrated project. Poses and
  presence are still unverified: ADR 0025 says what a forger could do with them.
- **San Francisco's streets.** `NOT_STREETS` in `city.ts` takes out stairways the map data
  has as streets (the Greenwich and Filbert Steps, the Oakhurst Lane stairway) and cliff
  crossings it has that life doesn't (Telegraph Hill's Union, Alta, Montgomery and
  Lombard). The rest are eased to 38 degrees along themselves (`easeRoads` in `roads.ts`),
  49 points of ground; the tunnel mouth moved 5 m so 18th Street keeps its ground. 38
  houses that stood on or against a street, alleys included, are gone. A deck is tarmac
  only for a truck on it (`pavedAt` takes the asker's height). The courses didn't move.
- **Stranded in the city on an old browser**: the train home (`fly('valley')`, film
  unseen) or sign out and drive solo, from the opening shot.
- **Banks outlive the page**: miles and fog are sent with fetch's keepalive
  (`supabase.ts`), falling back to an ordinary request where a browser won't.
- **`?fps`**, in production too: frames a second, the slowest frames, the pixel ratio,
  draw calls and triangles, for measuring real devices.
- **No players' names in the docs**: the anticheat note keeps what happened, not who.
- **The live migration history matches the repo**: `20261010090000_cartier_chains.sql`
  was applied by hand on 2026-10-10 and is now recorded (`migration repair`), its one row
  checked first.

## Open questions

- The two players' names are still in the git history. Taking them out means rewriting
  `main` (`git filter-repo`), force-pushing, and asking GitHub Support to purge cached
  views and pull-request refs. Not done without the owner's go-ahead.
- Nothing from this batch or the review was seen in a browser: the Browser pane blocks
  gilbyy.com, and its preview runs the shared checkout, whose `main` hadn't been pulled.
- Real-device frame rate: open gilbyy.com/?fps on a phone (after deploy) and read it.
- Signed-in play, which only the owner can do. The list:
  1. Two accounts in two browsers: names, a tent each, friends at the café (F), chat (T).
  2. A convoy at a crew course's arch: gather (E), join (E), set off, all the flags, home,
     both paid. A race the same; a winner held as "paid when the others are through" is
     paid when they are.
  3. Stuck on a boulder (20 mph or more): a friend's winch, then BBB's tow (E). Nothing
     else goes see-through while the tow truck fades in.
  4. At night: the tow truck's and a friend's nearby truck's beams light the road.
  5. The trips: the plane, the train to San Francisco, the ferry, the helicopter.
  6. Red Rock Race, Round the Lake and Paddy Dykes finish as you drive through them; a
     cliff can't be climbed; the leaderboard shows friends only.

## Next step

Merge the pull request, then the play list above.

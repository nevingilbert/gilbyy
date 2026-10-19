# Database tests

`game.test.sql` plays three accounts against the game migration and checks every rule:
miles can't be banked faster than driving, purchases are priced by the server, missions
pay once per cooldown, players can't write their own profile, a player can read only
their own profile and their friends', friending needs both players, a convoy pays only
when a friend in it drove, only friends can use their chat channel, a flight to the island
costs its fare and moves you there, only players on the island can use its channel, a
winch has to be bought before it can be fitted, a tow from BBB takes its fee, and a convoy
message goes out through `say_convoy()` in its sender's own name, on the convoy channel of
their world, only if it's a message the game sends and no faster than thirty at once and
then one a second. Nobody can send on a convoy channel directly, and only a world's players
can hear its convoy channel (the valley's, like its own channel, anyone signed in).

It runs on a plain local Postgres, with `local-stubs.sql` standing in for the bits of
Supabase it needs (`auth.users`, `auth.uid()`, `realtime.messages`, `realtime.topic()`,
`realtime.send()`):

```sh
createdb gilbyy_test
psql -d gilbyy_test -f supabase/tests/local-stubs.sql
for f in supabase/migrations/*.sql; do psql -d gilbyy_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d gilbyy_test -f supabase/tests/game.test.sql   # ends with "all checks passed"
```

The same checks also run against the real project without leaving anything behind, as
one transaction that always rolls back (the last line raises on purpose, so success
reads `ALL CHECKS PASSED` in the error):

```sh
{ grep -v '^\\set\|all checks passed' supabase/tests/game.test.sql
  echo "do \$\$ begin raise exception 'ALL CHECKS PASSED, rolling back'; end \$\$;"
} > /tmp/gilbyy-checks.sql
supabase db query --linked -f /tmp/gilbyy-checks.sql
```

A migration that isn't applied yet can be tried the same way, with nothing kept: put
`begin;` and the migration ahead of the checks in that file. The raise at the end rolls
back the migration along with everything else. Afterwards, check that it left nothing
(for `20261009180000_island.sql`, that there is still no `public.worlds`).

```sh
{ echo "begin;"; cat supabase/migrations/20261009180000_island.sql
  grep -v '^\\set\|all checks passed' supabase/tests/game.test.sql
  echo "do \$\$ begin raise exception 'ALL CHECKS PASSED, rolling back'; end \$\$;"
} > /tmp/gilbyy-checks.sql
supabase db query --linked -f /tmp/gilbyy-checks.sql
```

The checks pick out the three test players by the tail of their ids
(`like '%00000000000a'`), which no real profile's id can collide with. (They used to
match on the last character alone, which stopped being safe the day a real player's id
ended in `a`.)

The stubs are for testing only and are never applied to a real project. The price and
mission tables in the migration must match `shop.ts` and `missions.ts`;
`apps/web/src/app/shop.test.ts` checks that on every `pnpm test`.

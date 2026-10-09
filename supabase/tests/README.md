# Database tests

`game.test.sql` plays three accounts against the game migration and checks every rule:
miles can't be banked faster than driving, purchases are priced by the server, missions
pay once per cooldown, players can't write their own profile, friending needs both
players, only friends can use their chat channel, a flight to the island costs its fare
and moves you there, and only players on the island can use its channel.

It runs on a plain local Postgres, with `local-stubs.sql` standing in for the bits of
Supabase it needs (`auth.users`, `auth.uid()`, `realtime.messages`, `realtime.topic()`):

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

The checks pick out the three test players by the last character of their ids
(`like '%a'`), so before running against a project with real players, make sure no real
profile's id ends in `a`.

The stubs are for testing only and are never applied to a real project. The price and
mission tables in the migration must match `shop.ts` and `missions.ts`;
`apps/web/src/app/shop.test.ts` checks that on every `pnpm test`.

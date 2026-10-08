# Database tests

`game.test.sql` plays three accounts against the game migration and checks every rule:
miles can't be banked faster than driving or beyond the allowance, purchases are priced
by the server, missions pay once per cooldown and repeats come out of the allowance, players can't write their own profile, friending needs both
players, and only friends can use their chat channel.

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

The stubs are for testing only and are never applied to a real project. The price and
mission tables in the migration must match `shop.ts` and `missions.ts`;
`apps/web/src/app/shop.test.ts` checks that on every `pnpm test`.

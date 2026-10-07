# Database tests

`game.test.sql` plays three accounts against the game migration and checks every rule:
miles can't be banked faster than driving, purchases are priced by the server, missions
pay once per cooldown, players can't write their own profile, friending needs both
players, and only friends can use their chat channel.

It runs on a plain local Postgres, with `local-stubs.sql` standing in for the bits of
Supabase it needs (`auth.users`, `auth.uid()`, `realtime.messages`, `realtime.topic()`):

```sh
createdb gilbyy_test
psql -d gilbyy_test -f supabase/tests/local-stubs.sql
psql -d gilbyy_test -f supabase/migrations/20261007000000_gilbyy_game.sql
psql -d gilbyy_test -f supabase/tests/game.test.sql   # ends with "all checks passed"
```

The stubs are for testing only and are never applied to a real project. The price and
mission tables in the migration must match `shop.ts` and `missions.ts`;
`apps/web/src/app/shop.test.ts` checks that on every `pnpm test`.

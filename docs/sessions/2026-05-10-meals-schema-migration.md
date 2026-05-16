# Session: Meals Schema Migration

**Topic:** Wrote and applied the `meals.*` Postgres schema (Phase 5, migration-only session).

## Decisions made

- **Migration file location:** `apps/web/src/app/(meals)/migrations/0001_init.sql`. This is the level-scoped convention from the roadmap; it is NOT in a `supabase/migrations/` folder (no local Supabase stack is in use).
- **`meals.is_plan_member` must be declared AFTER `meals.plan_members`.** The function body references the table directly; Postgres resolves it at parse time (not call time) for SQL-language functions. First apply attempt failed with `relation "meals.plan_members" does not exist`. Fixed by moving the `create or replace function` block to after the `plan_members` DDL.
- **`plan_members` INSERT policy has an owner escape hatch.** Plain `is_plan_member(plan_id)` would block the owner from inserting their own first row (they're not a member yet). Policy reads: `is_plan_member(plan_id) OR owner_user_id = auth.uid()`. All other tables' INSERT policies are `is_plan_member`-only because by insert time the owner row already exists.
- **How to apply migrations:** `pnpm dlx supabase db query --linked --file <path>`. The `--local` flag is the default and targets a local Docker stack (port 54322); `--linked` targets the remote project via the Management API. No DB password needed.
- **Supabase project linked:** ref `dcxqaooehisluvdjniyb` (matches `NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local`). Link is stored in `.supabase/config.toml`.
- **10 tables, not 9.** The roadmap doc says "nine tables" but the schema section lists 10: `foods`, `plans`, `plan_members`, `recipes`, `recipe_ingredients`, `recipe_ingredient_portions`, `recipe_claimed_macros`, `grocery_items`, `cooking_events`, `consumption`. All 10 created.
- **RLS is default-deny on all 10 tables.** 40 policies total (4 per table: SELECT/INSERT/UPDATE/DELETE). Policies on tables that are 2+ joins away from `plan_id` (e.g., `recipe_ingredient_portions`, `consumption`) use inline `EXISTS` subqueries rather than calling `is_plan_member` to avoid needing additional SECURITY DEFINER functions.

## Files changed

| File | Action | Description |
|---|---|---|
| `apps/web/src/app/(meals)/migrations/0001_init.sql` | Created | Full meals schema: 10 tables, `is_plan_member` helper, 4 indexes, 40 RLS policies |

## Open questions

- **No `supabase/migrations/` tracking.** Migrations are applied via `db query --linked` and live in level directories. There is no migration history table. If we ever want idempotent re-runs or rollback tracking we'd need to adopt `supabase db push` + the standard `supabase/migrations/` structure — but that requires a local Docker stack. Fine for now.
- **Stale `apps/web/pnpm-lock.yaml`** noted in the previous session checkpoint — still not cleaned up.

## Exact next step

Generate TypeScript types from the live schema:

```bash
pnpm dlx supabase gen types typescript --linked --schema meals \
  > apps/web/src/lib/meals/types.ts
```

Then open a new session scoped to the **AI prompt generator** UI: `apps/web/src/app/(meals)/plans/new/generate/page.tsx`. Read `docs/levels/meals.md` §"AI-assisted plan generation" and §"JSON input format" first. The page needs: a form (plan name, duration, members, targets, dietary prefs, constraints), a `generatePrompt()` function in `apps/web/src/lib/meals/promptTemplate.ts`, a "Copy" button, and a textarea to paste the AI's JSON back in.

## Tokens advisory

Stopped at a natural break — session was short and single-purpose; no token pressure.

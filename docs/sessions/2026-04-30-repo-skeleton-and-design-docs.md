# Session: 2026-04-30 — Repo skeleton and design docs

## Topic

First working session. Set up the gilbyy monorepo skeleton and wrote design docs for the project and its first three levels (Bets, Meals, Karts).

## Decisions made

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, Supabase for Postgres + auth + realtime + storage, Vercel free tier for hosting, GitHub Actions for CI. Domain `gilbyy.com` is the only paid line item.
- **Repo shape:** monorepo with `apps/web` as the single Next.js app. Levels live as route groups (`app/(bets)`, `app/(meals)`, `app/(karts)`). `packages/` reserved for genuinely shared code; starts empty.
- **Database:** one Supabase project, schema-per-level (`bets`, `meals`, `karts`) referencing shared `auth.users`. Row Level Security on every table.
- **Migrations:** live next to each level at `apps/web/app/(<level>)/migrations/0001_init.sql`.
- **Auth:** magic-link email by default. Each level can override — Bets MVP will use Supabase anonymous-with-handle (no email/SMS) to keep party joins frictionless. SMS via self-hosted Android gateway is documented but optional, not the default.
- **AI dev loop:** stay on Claude Pro tokens only for now. No Anthropic API spend. CodeRabbit free tier handles AI PR review (their quota). Telegram-controlled feature loop is deferred until we accept API costs.
- **Build order:** Overcooked map landing first, then deep-dive on one level (TBD which) end-to-end.
- **Token-budget strategy:** narrow-scoped sessions; use the `/checkpoint` slash command at end of each session to write a session note in `docs/sessions/`.

## Files created

- `package.json` — root workspace, `pnpm@9` packageManager, basic scripts proxying to `apps/web`.
- `pnpm-workspace.yaml` — `apps/*` and `packages/*`.
- `.gitignore` — Node + Next + macOS + Claude cache dirs.
- `README.md` — pointer to docs.
- `CLAUDE.md` — project orientation: layout, stack, conventions, free-tier rule, sessions guidance, when to use skills/MCPs/subagents.
- `docs/vision.md` — the why (Overcooked map + level metaphor).
- `docs/roadmap.md` — phased plan from skeleton through first level shipped, with a "you are here" marker.
- `docs/architecture.md` — stack, schemas, hosting, free-tier limits, how to add a new level.
- `docs/levels/bets.md` — party prop bets MVP design.
- `docs/levels/meals.md` — JSON meal-plan macro validator MVP design.
- `docs/levels/karts.md` — Mario Kart score dashboard MVP design.
- `.claude/commands/checkpoint.md` — slash command body for session checkpoints.
- Empty placeholders: `apps/web/.gitkeep`, `packages/.gitkeep`, `docs/decisions/.gitkeep`, `docs/sessions/.gitkeep`.

## Open questions

- Which level to deep-dive end-to-end first after the map landing ships. Bets is the most fleshed-out; Meals is the lowest-risk "prove the stack."
- Whether to wire MCPs (Supabase, GitHub, Vercel) now or after first deploy. Recommend after.

## Resolved later in this session

- **Public vs. private GitHub repo →** Public. Documented in `docs/decisions/0001-public-repo.md`.

## Exact next step

Initialize `apps/web` with Next.js. From the repo root:

```
cd /Users/nevingilbert/Documents/gilbyy
pnpm dlx create-next-app@latest apps/web \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack
```

Then:

1. Move the marketing route to a route group: rename `apps/web/src/app/page.tsx` flow into `apps/web/src/app/(marketing)/page.tsx`.
2. Stub three empty route groups: `(bets)/page.tsx`, `(meals)/page.tsx`, `(karts)/page.tsx`, each rendering a placeholder.
3. Build the Overcooked map on `(marketing)/page.tsx` — SVG-based, central hub, three roads to the three level entry points.
4. Smoke-test with `pnpm dev`.

## Tokens advisory

Stopped at a natural break (skeleton + docs complete). Did not initialize Next.js — that's a separate, fresh-context-friendly chunk for the next session.

# Session: CI Pipeline & Vitest Setup

**Topic:** Added GitHub Actions CI workflow and configured Vitest with a smoke test for the marketing login page.

## Decisions made

- **GitHub Actions uses `pnpm/action-setup@v4`** with Node 20 and pnpm cache. Version is auto-detected from `"packageManager": "pnpm@9.0.0"` in root `package.json`. Steps run in order: `typecheck → lint → test → build` (fail-fast is GitHub's default per-step behavior).
- **`pnpm install --frozen-lockfile`** in CI uses the root `pnpm-lock.yaml`, which is the workspace-level lockfile. The `apps/web/pnpm-lock.yaml` is a stale artifact from `create-next-app` and is ignored in workspace mode.
- **Vitest config lives at `apps/web/vitest.config.ts`** (not at root). Uses `jsdom` environment, `globals: true`, and a `resolve.alias` mapping `@` → `./src` to mirror `tsconfig.json`'s `paths`.
- **Setup file is `apps/web/src/test/setup.ts`** — imports `@testing-library/jest-dom` to extend expect matchers globally.
- **`@types/testing-library__jest-dom` was removed** — it's deprecated; `@testing-library/jest-dom` v6+ ships its own types.
- **Smoke test mocks `@/app/actions/auth`** via `vi.mock(...)` since `sendMagicLink` is a server action that hits Supabase and would fail in a jsdom environment.
- **Added `typecheck` and `test` scripts to `apps/web/package.json`** — the root scripts (`pnpm typecheck`, `pnpm lint`, `pnpm test`) all proxy via `pnpm --filter web <script>`, so these were the missing link.

## Files changed

| File | Action | Description |
|---|---|---|
| `.github/workflows/ci.yml` | Created | CI workflow: PR → main, runs typecheck/lint/test/build |
| `apps/web/vitest.config.ts` | Created | Vitest config: jsdom env, globals, `@` alias, setup file |
| `apps/web/src/test/setup.ts` | Created | Imports `@testing-library/jest-dom` for matcher extensions |
| `apps/web/src/app/(marketing)/page.test.tsx` | Created | Smoke test: renders LoginPage, asserts email input and button present |
| `apps/web/package.json` | Modified | Added `typecheck: tsc --noEmit` and `test: vitest run` scripts; added vitest/testing devDependencies |
| `pnpm-lock.yaml` (root) | Modified | Updated by pnpm to include new devDependencies |

## Open questions

- The stale `apps/web/pnpm-lock.yaml` should probably be deleted to avoid confusion, but wasn't touched this session to avoid unintended side effects. Worth cleaning up.
- No lint or build pass was verified locally this session (only `typecheck` and `test`). CI will catch any issues on the first PR.
- Vitest `^4.1.5` is a very new major — if any React 19 / jsdom compatibility issues emerge, pinning closer to `4.1.x` is the escape hatch.

## Exact next step

The roadmap says the next phase after infrastructure is the **Overcooked map landing** (`app/(authed)/map/page.tsx`) and the **Bets level MVP** (`docs/levels/bets.md`). Start a new session scoped to one of these. Suggested: open `docs/levels/bets.md` and `docs/roadmap.md` to confirm which phase we're in, then begin the Supabase schema migration for the `bets` schema (tables: `contests`, `bets`, `legs` in a `bets` Postgres schema). The migration file should land at `apps/web/supabase/migrations/YYYYMMDDHHMMSS_bets_schema.sql`.

## Tokens advisory

Stopped at a natural break — session was short and focused; no token pressure.

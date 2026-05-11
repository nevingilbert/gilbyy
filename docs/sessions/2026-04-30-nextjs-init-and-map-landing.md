# Session: 2026-04-30 — Next.js init and map landing

## Topic

Phase 1: initialized `apps/web` with Next.js 16, scaffolded route groups for all four sections, and built the Overcooked-style SVG map landing page.

## Decisions made

- **Next.js 16 with Turbopack:** `create-next-app@latest` installed Next.js 16.2.4, which defaults to Turbopack in dev even when `--no-turbopack` is passed to the scaffolder. No action taken — Turbopack works fine for our use case.
- **Route group structure:** Each level lives in a route group with an inner path folder: `(bets)/bets/page.tsx` → `/bets`, `(meals)/meals/page.tsx` → `/meals`, `(karts)/karts/page.tsx` → `/karts`. The marketing map lives at `(marketing)/page.tsx` → `/`. This gives us room to add per-group `layout.tsx` files later without restructuring.
- **Map implementation:** Pure SVG for the road/hub/node layout within a responsive container (`max-w-2xl`, `w-full`). No external map library needed. Hub at (380,300), Bets at (640,100), Meals at (100,300), Karts at (380,510). Level nodes use `<a href>` inside SVG.
- **`pnpm-workspace.yaml` consolidation:** `create-next-app` generated a second `pnpm-workspace.yaml` inside `apps/web/` with `ignoredBuiltDependencies: [sharp, unrs-resolver]`. Moved that config into the root `pnpm-workspace.yaml` and deleted the inner file to silence Next.js's workspace-root warning.
- **No auth gate yet (deferred to Phase 2):** The Phase 1 build has the map publicly accessible with no login wall. The home hub node is labeled "home" as a placeholder for the future auth-gate metaphor. **Reconciliation note:** the roadmap was re-phased in a parallel Cowork session *during* this session (auth moved from Phase 5 to Phase 2). This Phase 1 work is unaffected, but the original "Exact next step" written below was based on the pre-update roadmap and has been corrected. See `docs/roadmap.md` Phase 2 and `docs/architecture.md` (Auth section), plus `docs/decisions/0002-bets-full-accounts.md`.

## Files changed

- `apps/web/` — entire directory created by `create-next-app` (Next.js 16, TypeScript, Tailwind, ESLint, App Router, `src/` layout, `@/*` alias)
- `apps/web/src/app/page.tsx` — **deleted** (replaced by route group)
- `apps/web/src/app/(marketing)/page.tsx` — **created** — Overcooked SVG map landing; hub + three level nodes with roads; links to `/bets`, `/meals`, `/karts`
- `apps/web/src/app/(bets)/bets/page.tsx` — **created** — placeholder for `/bets`
- `apps/web/src/app/(meals)/meals/page.tsx` — **created** — placeholder for `/meals`
- `apps/web/src/app/(karts)/karts/page.tsx` — **created** — placeholder for `/karts`
- `apps/web/src/app/layout.tsx` — updated `metadata.title` to "Gilbyy" and `metadata.description`
- `pnpm-workspace.yaml` (root) — added `ignoredBuiltDependencies: [sharp, unrs-resolver]`
- `apps/web/pnpm-workspace.yaml` — **deleted** (merged into root)
- `docs/roadmap.md` — updated "You are here" marker to Phase 1 complete

## Open questions

- Whether to wire MCPs (Supabase, GitHub, Vercel) now or after first level ships. Previous decision: after, but Phase 2 introduces Supabase, so wiring the Supabase MCP at the start of Phase 2 is now worth reconsidering.
- The map is not visually polished — emoji positioning in SVG varies by browser/OS. May need `dy` tuning or switch to image-based icons. Not a Phase 2 blocker.

## Already resolved (in parallel Cowork session, before this checkpoint was written)

- **First level priority:** Meals (changed from Bets earlier on 2026-04-30; logged in `docs/levels/meals.md` and `docs/roadmap.md`).
- **Bets auth:** full gilbyy accounts only, no anonymous flow. See `docs/decisions/0002-bets-full-accounts.md`.
- **Auth providers:** magic-link email + Google OAuth. Discord OAuth queued for Karts.

## Exact next step

**Phase 2: Supabase Auth + the gated map.** (The original draft of this section said "deploy to Vercel" — that was the *old* Phase 2 before the roadmap was re-phased. Vercel deploy is now Phase 3 and follows this work. See `docs/roadmap.md`.)

Concrete sequence for the next session:

1. Create a Supabase account (free, sign in with GitHub). Create a project named `gilbyy`. Note: the project pauses after a week of inactivity on the free tier — touch it weekly.
2. Save the project URL, `anon` key, and `service_role` key into `apps/web/.env.local` (gitignored) as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Install the Supabase SDK in `apps/web`: `pnpm add @supabase/supabase-js @supabase/ssr`.
4. Add server + browser Supabase clients following the `@supabase/ssr` patterns (`apps/web/src/lib/supabase/server.ts`, `apps/web/src/lib/supabase/browser.ts`).
5. Add `apps/web/src/middleware.ts` that requires a session on every route except `/` and `/auth/*`. Redirect missing sessions to `/`.
6. Restructure routes: the current public map at `(marketing)/page.tsx` becomes the *login screen* at `/`. Move the actual interactive map to a gated route — recommend `(authed)/map/page.tsx` (or similar) reachable via `/map`, with the middleware enforcing auth.
7. Login screen UI: "Sign in with Google" + "Email me a magic link" via Supabase Auth.
8. Wire Google OAuth in Supabase Auth → Providers → Google. One-time Google Cloud Console setup: new project, OAuth 2.0 Client ID for Web, add Supabase's callback URL as authorized redirect, paste Client ID + Secret into Supabase.
9. The home hub node on the map prompts a logout confirmation when clicked; on confirm, sign out and redirect to `/`.
10. Smoke-test the full loop: visit `/` while logged out → see login → sign in (try Google first, fall back to magic-link) → arrive at the map → drive to `/bets` → return to map → click hub → confirm logout → back at `/` logged out.

Background reading the next session should do first: `docs/roadmap.md` Phase 2, `docs/architecture.md` (Auth section), `docs/decisions/0002-bets-full-accounts.md`, and `docs/vision.md` ("The home spot is the auth gate" section).

## Tokens advisory

Stopped at a natural break — Phase 1 complete, all routes working locally (200 on `/`, `/bets`, `/meals`, `/karts`). No token pressure.

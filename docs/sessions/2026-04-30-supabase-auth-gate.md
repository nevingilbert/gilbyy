# Session: 2026-04-30 — Supabase auth gate (Phase 2)

## Topic

Wired up Supabase Auth (magic-link only) and gated the entire site behind `/`. The login screen lives at `/`, the interactive map moved to `/map` (authed-only).

## Decisions made

- **Next.js 16 renames `middleware.ts` → `proxy.ts`.** The exported function must be named `proxy` (not `middleware`). This is a breaking change from v15. Our auth gate is at `src/proxy.ts`.
- **All Next.js 16 Request APIs are fully async.** `cookies()`, `headers()`, `params`, `searchParams` — all must be `await`ed. No sync fallback.
- **Magic-link only for this session.** Google OAuth skipped per user instruction; can be added in a future session without restructuring anything — just add the provider in Supabase and a button in `(marketing)/page.tsx`.
- **Login screen at `/`, gated map at `/map`.** The old `(marketing)/page.tsx` SVG map became the login form. The interactive map moved to `(authed)/map/page.tsx` (route: `/map`). The `(bets)`, `(meals)`, `(karts)` level stubs stay at their existing paths.
- **Hub node = logout trigger.** Clicking the home hub on the map calls `window.confirm` (browser side) then the `signOut` server action. `HubNode.tsx` is a `'use client'` component; `map/page.tsx` is a Server Component that renders it inside the SVG.
- **Auth callback at `/auth/callback`.** `GET /auth/callback?code=...` exchanges the magic-link code for a session via `supabase.auth.exchangeCodeForSession(code)` and redirects to `/map`. The proxy exempts `/auth/*` from the session check.
- **Supabase redirect URLs must be configured manually** (can't be done in code). Required in Supabase dashboard → Authentication → URL Configuration: Site URL = `http://localhost:3000`, Redirect URLs = `http://localhost:3000/**`. When deploying to Vercel, add the production URL to the same list.
- **Proxy: redirect already-authed users away from `/`.** If a user with a valid session hits the login page, the proxy sends them to `/map` immediately.

## Files changed

- `apps/web/src/lib/supabase/server.ts` — **created** — async server-side Supabase client factory using `@supabase/ssr` + Next.js `cookies()`
- `apps/web/src/lib/supabase/browser.ts` — **created** — browser-side Supabase client factory using `createBrowserClient`
- `apps/web/src/proxy.ts` — **created** — Next.js 16 auth gate; exempts `/` and `/auth/*`; redirects unauthenticated users to `/`; redirects already-authed users from `/` to `/map`
- `apps/web/src/app/auth/callback/route.ts` — **created** — Route Handler that exchanges the magic-link code for a session and redirects to `/map`
- `apps/web/src/app/actions/auth.ts` — **created** — two server actions: `sendMagicLink(_, formData)` and `signOut()`
- `apps/web/src/app/(marketing)/page.tsx` — **rewritten** — now the login form (`'use client'`); uses `useActionState` with `sendMagicLink`; shows "Check your email" on success
- `apps/web/src/app/(authed)/map/page.tsx` — **created** — the gated interactive map (Server Component); same SVG as the old marketing page but hub delegates to `HubNode`
- `apps/web/src/app/(authed)/map/HubNode.tsx` — **created** — `'use client'` component; renders the home hub `<g>` in the SVG; on click calls `window.confirm` then `signOut` then `router.push('/')`
- `apps/web/package.json` — updated — added `@supabase/supabase-js ^2.105.1` and `@supabase/ssr ^0.10.2`

## Open questions

- **Google OAuth (deferred).** Architecture docs say to enable it; skipped this session. Add a "Sign in with Google" button in `(marketing)/page.tsx` and wire the Google provider in Supabase Auth → Providers when ready. One-time Google Cloud Console setup required.
- **Smoke-test with a real magic link.** Verified the auth gate redirects and the TypeScript compiles clean, but a full end-to-end test (send link → click → land on map → logout) requires the Supabase redirect URL configured in the dashboard first.
- **Level stubs at `/bets`, `/meals`, `/karts`.** They're still placeholder pages. No layout or auth-check at the level group level yet — the proxy handles that. Fine for now.
- **Supabase MCP wiring.** Roadmap deferred this to Phase 5, but Phase 2 introduces Supabase. Still reasonable to wait until a level ships.

## Exact next step

**Smoke-test the magic-link loop end-to-end.**

Prerequisites (manual, in Supabase dashboard):
1. Authentication → URL Configuration → Site URL: `http://localhost:3000`
2. Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/**`

Then:
1. `cd apps/web && pnpm dev`
2. Visit `http://localhost:3000` — should see the login form.
3. Enter a real email → "Send magic link" → should see "Check your email".
4. Click the link in the email → should land on `http://localhost:3000/map`.
5. Confirm the SVG map renders with the three level nodes and the home hub.
6. Click the home hub → confirm dialog → sign out → should land back at `/`.
7. Try navigating to `/map` directly (unauthenticated) → should redirect to `/`.

If smoke-test passes, the next work item is **Phase 3: Vercel deploy**. See `docs/roadmap.md`.

## Tokens advisory

Stopped at a natural break — Phase 2 auth wiring complete. No token pressure.

## Update: smoke test result

All seven smoke-test steps passed in a follow-up Cowork session on 2026-04-30. Supabase redirect URLs were configured (`Site URL = http://localhost:3000`, Redirect URLs include `http://localhost:3000/**`). Magic-link email arrived, callback redirected to `/map`, map rendered with hub + three level nodes, hub-click triggered logout confirmation and signed out cleanly, direct unauthenticated `/map` access redirected to `/`. Phase 2 is officially done.

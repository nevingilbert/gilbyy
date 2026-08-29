# 0003 — Levels are standalone apps on subdomains, not route groups

Date: 2026-08-28
Status: Accepted. Supersedes the "why monorepo, why one Next.js app" section of `architecture.md` as it stood before this date.

## Context

`architecture.md` originally called for one Next.js app with a route group per level
(`app/(bets)`, `app/(meals)`, `app/(karts)`), all levels sharing one Supabase project
and one session, all served from paths under gilbyy.com.

That is not what happened. Between the design docs being written and now, all three
levels were built as separate repos with their own Vercel projects and their own
backends:

| Level | Repo | Backend |
| --- | --- | --- |
| Bets | `nevingilbert/friendlybets` | Supabase `ickmpbuxgzxznalzjbdz` |
| Meals | `nevingilbert/wellness-planner` | Supabase `xtlmhsapegfmafbpzdoz` |
| Karts | `nevingilbert/beeriokart-dashboard` | plain Postgres |

Inside gilbyy the three route groups never got past 12-line "coming soon" stubs. The
only real work under them was the Meals schema — a 512-line migration applied to the
gilbyy Supabase project — which the standalone wellness-planner has since duplicated
and moved past.

So the choice was not "which architecture do we want" but "which of two existing
copies of each app do we keep."

## Decision

The standalone apps are the real ones. gilbyy stops hosting levels.

- Levels are separate repos, separate Vercel projects, reachable at
  `<name>.gilbyy.com`.
- gilbyy.com is the landing page only. It becomes a rudimentary open-world driving
  game — a cartoonish, Over-the-Hill-ish thing — that acts as the hub. The SVG map at
  `/map` stands in until that exists.
- The `(bets)`, `(karts)` and `(meals)` route groups, the generated `lib/meals` types,
  and `docs/levels/` are deleted from this repo.

## Consequences

**What we gain.** Each app ships on its own cadence with its own CI, its own schema,
and no shared-repo blast radius. This already reflects reality, so the docs stop lying
to whoever reads them next.

**What we lose.** The original design cited "cross-origin auth" as a reason to keep one
app, and that cost is now real. Each app has its own Supabase project, so each has its
own user table. **"One gilbyy account works everywhere" is no longer true** — a user
signs in separately on each subdomain.

Getting single sign-on back later is a data migration, not a config change: every app
would have to point at one Supabase project, and the session cookie would need
`cookieOptions: { domain: '.gilbyy.com' }` in `@supabase/ssr` so it is readable across
subdomains. Subdomains make that *possible* — cookies scoped to a parent domain work
across them, which is not true of unrelated domains — but nothing about it is automatic.

**Schema-per-level is gone.** There is no longer a single Supabase project holding
`bets.*`, `meals.*` and `karts.*`. Each app owns its own database outright.

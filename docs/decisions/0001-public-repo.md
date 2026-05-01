# 0001 — Public GitHub repo

Date: 2026-04-30
Status: Accepted

## Context

We need to host the codebase somewhere. Options were public GitHub repo or private GitHub repo. Both are free; the differences are in CI quotas, third-party tool quotas, and discoverability.

## Decision

Use a **public** GitHub repo for `gilbyy`.

## Consequences

Positive:

- Unlimited GitHub Actions minutes (private repos cap at 2,000/month).
- Unlimited CodeRabbit AI review (private repo tier is limited).
- Doubles as a public portfolio piece — the project is meant to be shown off when done.
- Easier to share specific commits/PRs with anyone for feedback.

Negative / things to be careful about:

- **Secrets management is not optional.** Anything in env vars must stay in env vars. `.env.local` is in `.gitignore`; verify before every push.
- **Don't commit fixtures or seed data with real user content.** Anonymize Bets parties, Meals plans, Karts sessions if used for tests.
- **Issue and PR titles are public.** No customer names, no embarrassing TODOs that we'd regret being indexable.
- **Supabase anon key vs. service_role key:** the anon key is safe to be in client code (RLS protects data). The `service_role` key is *never* in the repo, only in Vercel env.

## Alternatives considered

- **Private repo** — rejected. The CI/CodeRabbit quotas matter more than the (low) sensitivity of a hobby project, and we want this to be shareable.
- **Public repo with a separate private fork for secrets** — overkill. Vercel env vars solve this without splitting the repo.

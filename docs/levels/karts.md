# Level: Karts

A dashboard where a friend group records Mario Kart results across many sessions and sees who's winning over time, with stats on character/kart combos and per-meetup sub-sessions.

## Problem

Friend groups play Mario Kart for years. Nobody tracks the results. We want a friction-light way to record races and see trends, that handles the messy reality of how people actually play (some races have two friends, some have one, scores are reported in different formats, sometimes nobody remembers exact placements).

## Users and structure

- **Friend group session** ("super-session"): the long-lived container. One per friend group, lives forever.
- **Sub-session** ("meetup"): created when the group physically gets together. Races recorded inside a meetup are also tagged to the super-session so they roll up.
- **Solo result:** if a member plays alone and uploads results, they normalize into the super-session. They don't count toward any meetup.

## Flow

1. Someone creates the super-session, invites friends.
2. Optionally creates a meetup ("Saturday at Dan's") that members opt into.
3. Members record races. A race captures: track, mode (50/100/150/200/Mirror), participants, character + kart per participant, finishing positions, points awarded, and (optionally) a screenshot of the in-game scoreboard.
4. Stats roll up: per-player win rate, average position, character/kart effectiveness, head-to-head records.

## Scoring formats supported

Real-world reporting is messy. The system accepts:

- **Position-only:** "I came 3rd of 12 in 150cc." Points computed via a default Mario Kart points table (15/12/10/9/8/7/6/5/4/3/2/1).
- **Game-reported points:** the player just types the points the game showed.
- **Cup result:** four races aggregated.
- **Free-text + parser:** "P1 = Dan, P2 = me, …" parsed into structured rows.

All formats normalize internally to per-player points + position.

## Auth approach

Magic-link email or OAuth (Discord is a natural fit for gaming friend groups). Both free at Supabase's tier. Whichever the group prefers — pick one for MVP.

## Data model (sketch)

Schema: `karts`.

```
karts.super_sessions          (id, name, created_by, created_at)
karts.super_session_members   (super_session_id, user_id, display_name, joined_at)
karts.meetups                 (id, super_session_id, name, started_at, ended_at)
karts.meetup_members          (meetup_id, user_id)
karts.races                   (id, super_session_id, meetup_id nullable, track, cc, mode, source ['manual'|'image'|'parsed'], notes)
karts.race_results            (race_id, user_id, display_name, position, points, character, kart_body, kart_tires, kart_glider)
karts.images                  (id, race_id, user_id, storage_path, ocr_status, ocr_raw_text)
```

If two friends play in the same race they both get rows. If a member plays with strangers we record only their own row.

## OCR for screenshots — the hard part on free tier

The headline feature is "submit a picture, the app extracts the scoreboard." This is the single hardest thing on a free budget.

- **Tesseract.js (free, in-browser):** decent for clean text, struggles on Mario Kart's stylized fonts and colored highlights. Not reliable enough alone.
- **Cloudflare Workers AI free tier:** has vision models (LLaVA-class). Generous free request quota. More accurate than Tesseract for stylized UIs but we're at the mercy of which models stay on the free plan.
- **OpenAI / Anthropic vision APIs:** best accuracy, costs money. Off the table per the no-spend rule.

**MVP path:** manual entry only. Add an "import from image" affordance that uses Tesseract.js + a hand-tuned regex parser as a v2 nice-to-have. Even if the OCR fills in 60% of fields, that's a win over typing.

## Stats to compute

- Wins, podiums, average position per player, scoped by super-session and meetup.
- Head-to-head: in races where A and B both played, who won more?
- Character + kart-body + tire + glider combo effectiveness (avg position when used).
- Per-track records.

Materialized views in Postgres are fine for these — recompute on race insert.

## Free-tier landmines

- **OCR** — covered above.
- **Image storage** — Supabase free 1 GB. Compress aggressively client-side; we don't need 4K screenshots.
- **Realtime** isn't strictly required; meetup views can refresh on demand.

## MVP cut

1. Create super-session, invite by code.
2. Create meetup (optional).
3. Manual entry: add a race with track, mode, participants, positions.
4. Per-player win/podium/avg-position stats over the super-session.
5. Head-to-head view.
6. No image import. No combo stats. No solo-result normalization.

## Future ideas

- Image import (Tesseract.js → regex parser, optional Cloudflare Workers AI fallback).
- Solo race results normalized into super-session stats.
- Combo (character + kart-body + tires + glider) effectiveness.
- Track records ("fastest podium on Rainbow Road").
- Streaks ("Dan has won 4 in a row").
- Export per-meetup recap.

## Open questions

- Default points table: stick with Mario Kart's actual table or let groups override?
- How do we handle CPU/"ghost" racers? Probably ignore.
- If the same person plays under two names across meetups, do we let them merge later? Yes — admin merge tool, deferred.

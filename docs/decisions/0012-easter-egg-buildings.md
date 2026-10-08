# 0012 — Four easter-egg buildings point at the owner's other projects

Date: 2026-10-08
Status: Accepted. Supersedes the "no links, no proximity prompts" part of
`0004-gilbyy-is-just-a-driving-game.md`, narrowly. The rest of `0004` stands: gilbyy.com
is still a driving game and still not a hub.

## Context

`0004` took every link to another app out of the game, because each earlier version had
been a menu wearing a costume and the menu was the unwanted part. Since then the owner
has floated buildings that point at other gilbyy.com pages (`vision.md`, `roadmap.md`),
and on 2026-10-08 asked for four of them as easter eggs:

| Building | Project | Address |
|---|---|---|
| A bank | Deal or No Deal | `deal.gilbyy.com` |
| A church | Salem, a remake of Town of Salem | `salem.gilbyy.com` |
| A school | Times Tables, timed maths against friends | `times.gilbyy.com` |
| A casino | Friendly Bets, bet anything on anything at a hangout | `bets.gilbyy.com` |

## Decision

Four buildings stand out in the valley. Stop at a door and the usual prompt offers to
look in; pressing E shows a small card naming the project, one line about it, and a
link that opens in a new tab.

What keeps this from being the hub `0004` got rid of:

- **They are found, not offered.** They are not on the map, the minimap or the compass,
  the first-time guidance never mentions them, and there is no list of them anywhere.
- **They are not places** in the sense of `0008`: not counted, not saved, nothing on
  the leaderboard, no achievement, no miles. There is nothing to collect.
- **Nothing happens until you ask twice.** The prompt only appears when the truck has
  nearly stopped at the door, and the card's link is a link: it is never followed for
  you, and it opens a new tab so the valley is still there.
- **It is one-way and static.** Four names, blurbs and hostnames in `landmarks.ts`. No
  shared auth, data or deploys; if one of those apps goes away, its card has a dead link
  and nothing else breaks.

The sites are chosen in `landmarks.ts` with their own random stream and levelled after
the rest of the valley is scattered, so adding them moved no tree, garage or course.
All four are on ground a stock truck can reach.

## Consequences

- "The game must not link to any other app" becomes "the game links out only from
  these four cards". `CLAUDE.md`, `vision.md` and `architecture.md` say so.
- A fifth building is a row in `LANDMARKS`, a model in `landmark-models.ts` and an entry
  in the placement plan. It does not need a new ADR as long as it follows the four rules
  above; a marker on the map, a count, a reward or a menu would.
- The wording on each card is the owner's to change; the blurbs were written from a
  one-line description of each project.

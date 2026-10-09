# 0013 — The map's fog is saved

Date: 2026-10-08
Status: Accepted. Changes one line of `0008`: the fog is no longer forgotten each visit.

## Context

The map's fog lived in memory, so every visit began with the whole valley fogged again,
however much of it you'd driven. `0008` kept the garages and café you'd found but left
the fog as it was. The owner asked for the explored areas to survive a reload.

## Decision

- **Signed in, the fog is saved.** Single player keeps it for the visit, like
  everything else, and the banner already says nothing is saved.
- **It is saved as a coarse grid, not a picture** (`fog.ts`): 128 cells a side over the
  valley, about 47 m each, one bit per cell the truck has been in. That is 2 KB a
  player. On the next visit the map clears its fog around the middle of each saved
  cell, which lands within a few pixels of where the truck really cleared it.
- **It goes through checked functions, like all progress.** `explore(p_cells)` adds
  cells and `explored()` reads them back. Cells are only ever added, so two devices
  can't undo each other. The server can't see where a truck is, so like `discover` it
  takes the client's word; it checks only that the cells are on the grid and that one
  call carries at most 512.
- **New cells ride along with the miles**, every fifteen seconds and when the page is
  left. No Realtime is involved.
- **It lives in its own table, `fog`**, with no policies. Every game function returns
  the caller's profile and other players can read profiles, so a 2 KB column there
  would be paid for on every call and shown to everyone.
- **Mission starts show wherever the fog has cleared**, saved or not. They used to be
  forgotten with the fog.

## Consequences

- A modified client could clear its whole map. It gains a map with no fog and nothing
  else: explored area isn't counted, shown to anyone, or paid for, and must stay that
  way (`CLAUDE.md`, "don't add pressure").
- Closing the tab can lose up to fifteen seconds of fog, the same as miles.
- The grid's size is in `fog.ts` and in `20261009120000_saved_fog.sql`; `fog.test.ts`
  fails if they differ. Changing it means a migration that rewrites what's saved.
- If the migration isn't applied, sign-in still works and the map just starts fogged.

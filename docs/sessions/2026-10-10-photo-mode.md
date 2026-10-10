# 2026-10-10 — Photo mode

## Topic

The owner asked for "a photo mode which freezes the screen, lets you rotate the camera
around and take a picture. Not eligible while in a mission." ADR
`docs/decisions/0018-photo-mode.md`.

## Decisions made

- **A new `Mode`, `"photo"`, in `Game.tsx`.** Entered from `"drive"` only, with P or the
  phone's photo button; P, Esc or "back" returns to `"drive"` through `view.cut()`
  (the chase camera snaps back behind the truck rather than easing, which could pass
  through the ground).
- **Not on a course**: `actions.current.photo` refuses while `running` or
  `convoys.state` is set (a run, or a convoy or race from gathering to home), with a
  toast. `canPhoto` (React state, refreshed every half second beside `canChat`) hides
  the phone's button and adds "not on a course" to the P line of the key list. The
  reason: a solo run's clock lives in `runOn`, which photo mode doesn't call, so photo
  mode would be a pause button for the timer; and the others in a convoy don't stop.
- **The freeze**: the frame loop's `"photo"` branch calls only `view.photo()`, never
  `view.render()`, so nothing in the world is updated (sun, train, animals, grass,
  water, remote trucks, the truck's physics, the odometer). Single player, `time` stops
  as for the map; signed in, the shared clock carries on and the world catches up on
  exit. A snap taken 8 s after freezing matched the screen pixel for pixel.
- **Others see the truck stopped**: entering photo mode sends one pose with
  `speed: 0, turn: 0` (`sharePose` zeroes them in photo mode), so `guessPose` doesn't
  carry it on down the road for them.
- **The camera** (`photo.ts`, pure): an `Orbit` `{ yaw, pitch, dist }` about the truck
  at `LOOK_UP` 0.5 m. `orbitFrom()` starts it exactly where the chase camera was;
  `dragOrbit()` turns it like a turntable (`DRAG_TURN` 0.006 rad/px); `zoomOrbit()`;
  `clampOrbit()` keeps `NEAREST` 4.5 m ≤ dist ≤ `FURTHEST` 60 m and `LOWEST` −0.25 ≤
  pitch ≤ `HIGHEST` 1.45; `cameraAt()` keeps it `CLEARANCE` 0.6 m over the ground or
  the water (scene.ts passes `max(height, waterAt)`); `easeOrbit()` goes round the
  short way. Arrows (`KEY_TURN` 1.4 rad/s) move the camera the way they point; the
  wheel, +/− and a two-finger pinch zoom.
- **`scene.ts`**: `photoStart(car)` returns the starting orbit; `photo(car, want, dt)`
  eases the shown orbit and the aim (from the chase camera's point 4 m ahead to the
  truck) and draws only when the camera has moved or the canvas was resized (`stale`);
  `snap()` renders and returns `canvas.toDataURL("image/png")` in the same task, before
  the drawing buffer is cleared.
- **Keeping the picture** (`keepPicture` in `Game.tsx`): decoded synchronously to a
  `File` so `navigator.share` still has the tap's user activation. Coarse pointer and
  `canShare({ files })` → the share sheet (Save Image puts it in Photos); otherwise, or
  if sharing fails other than by cancelling, a download. Named by `photoName()`:
  `gilbyy-YYYY-MM-DD-HHMMSS.png`, local time. A soft cream flash (`flashRef`).
- **Canvas pointers**: the showroom's one-pointer drag became `canvasDrag`, tracking
  pointers by id with `setPointerCapture`; one pointer turns the showroom (garage) or
  the photo camera, two pinch in photo mode. Wheel is a native non-passive listener so
  a trackpad pinch (ctrl+wheel) doesn't zoom the page.
- **On a phone the photo button sits under the odometer**, top right: added to the
  bottom row it made the row 416 px wide on a 390 px iPhone and pushed ▲ off screen.
- **Nothing on screen in photo mode** but a shutter, "back" and one line of how-to;
  the title is hidden too.
- **Not stored anywhere, pays nothing**: no upload, no Supabase, no migration.
  `CLAUDE.md`'s "Don't add pressure" now says so.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/photo.ts` | **New.** `Orbit`, `clampOrbit`, `orbitFrom`, `dragOrbit`, `zoomOrbit`, `easeOrbit`, `cameraAt`, `photoName` and their constants |
| `apps/web/src/app/photo.test.ts` | **New.** 6 tests: no jump from the chase camera, limits, turntable drag, never under a steep bowl's floor, easing the short way, file names |
| `apps/web/src/app/scene.ts` | `photoStart`, `photo`, `snap`; `stale` set on resize |
| `apps/web/src/app/Game.tsx` | `"photo"` mode, actions (`photo`, `turnPhoto`, `zoomPhoto`, `snap`), keys, frame branch, `keepPicture`, `canvasDrag`, wheel, flash, photo bar, phone button, key list line, `canPhoto` |
| `docs/decisions/0018-photo-mode.md` | **New.** The ADR |
| `CLAUDE.md`, `docs/art-direction.md`, `docs/roadmap.md` | Product line, layout, "Don't add pressure", status; "What we borrow" |

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (209 passing: 203 + 6),
`pnpm build`. Headless Chromium at 1280×800 and as an iPhone 13: enter with P and with
the button, drag, arrows, wheel, Space saves `gilbyy-…png` with no HUD in it, Esc back
to the chase camera, P on Forest Slalom's start line refused with the toast. Frame rate
not judged (headless is ~3 fps).

## Open questions

- **Not tried on a real phone**: the share sheet, pinch, and whether Save Image lands
  in Photos on iOS were not exercised (headless has no `navigator.share`, so it took
  the download path).
- Whether the owner wants more in photo mode, as _Over the Hill_ has: hide the truck,
  change the time of day, a wider or narrower lens, a free camera that leaves the truck.
- The picture is at the screen's resolution (pixel ratio capped at 1.75). A
  higher-resolution render for the shot is possible but would reallocate the canvas.
- Not played signed in from two browsers: the other player should see the truck stop
  where it is, then drive on when photo mode is put away.

## Exact next step

The owner asked for it to be merged, so it went to `main` as pull request 14 (client
only, no migration). First thing next session: try it on a real phone at gilbyy.com: tap "photo" under the odometer, drag and pinch, tap the shutter, and check the
share sheet's Save Image. If iOS doesn't offer the sheet, the fallback is in
`keepPicture` in `apps/web/src/app/Game.tsx`.

## Follow-up: everyone's names in the picture

The owner then asked to "make sure everyone's names persist in the photo". Before
this, photo mode hid the name tags (the tags layer showed only while driving) and the
picture was the WebGL canvas alone, so names were in neither.

- `drawTags` now runs in photo mode too (called after `view.photo()` in the frame
  loop) and the tags layer shows in `"photo"` as well as while driving. In photo mode it
  shows names only, no chat bubbles, and adds the player's own name over their truck
  when they have one (`store.get().name`; single player has none).
- `view.snap()` now renders and returns the canvas; `picture()` in `Game.tsx` copies it
  to a 2D canvas and draws each visible tag's name at its on-screen box
  (`getBoundingClientRect`), scaled by the canvas's pixel ratio, in the tag's computed
  font, letter spacing, colour and `filter` (its drop shadow), at the tag's opacity.
  `keepPicture` gets that canvas's PNG.
- Verified with three `?net=local` tabs (Juniper photographing Maple and Rowan): all
  three names on screen and in the saved PNG, where they were on screen. Single player:
  photo mode and the picture as before, no tags. `pnpm typecheck`, `pnpm lint`,
  `pnpm test` (246) pass. Restarted the branch from `main` (b27baeb) first, as pull
  request 14 was merged.
- Not tried: Safari before 18 ignores a canvas `filter`, so its names would come out
  without the drop shadow (still drawn).

## Tokens advisory

Natural break: built, tested and screenshotted; no token limit was hit.

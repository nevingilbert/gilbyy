# 0018 — Photo mode: stop the world, walk round the truck, keep the picture

Date: 2026-10-10
Status: Accepted.

## Context

The owner asked for "a photo mode which freezes the screen, lets you rotate the camera
around and take a picture. Not eligible while in a mission." The valley and the island
are worth a picture at golden hour, and the chase camera only ever shows the truck from
behind and above.

_Over the Hill_ has a photo mode too, and a photo compendium: a list of sights to
photograph. The compendium is a collection, so it stays on the art direction's "What we
don't" list. Photo mode is only a camera.

## Decision

- **P from driving, or the photo button on a phone** (under the odometer: the row of
  driving buttons has no room for a third). P, Esc or "back" puts it away; the chase
  camera is straight back behind the truck.
- **Not during a run, a convoy or a race**, from gathering one to coming home. A run's
  clock would stop with the world, which would hand every course a pause button, and
  the others in a convoy or a race don't stop for anyone. Pressing P then says why; the
  key list says "not on a course" and the phone's button isn't there.
- **The world stops, for this browser only.** The sun, the train, the animals, the
  grass, the water and the other players' trucks stand where they were; the truck too,
  mid-air if that's where it was, and it carries on as it was when photo mode is put
  away. Single player the clock stops as it does on the map. Signed in, the shared clock
  keeps going, so the sun and the train catch up on the way out. The others see the
  truck stopped where it is (its pose is sent once with no speed), not guessed on down
  the road.
- **The camera goes round the truck** (`photo.ts`, pure and tested): drag or the arrows
  to go round, the wheel, a pinch or +/− to go nearer or further, between 4.5 m (close
  enough to fill the picture with the longest rig, not inside it) and 60 m, from a
  little below level to nearly overhead. It never goes under the ground or the water,
  and it starts exactly where the chase camera was, so nothing jumps. Dragging turns the
  truck with the finger, like a turntable.
- **The picture is the world only**: the canvas, drawn again and read straight back, at
  its own resolution, with no HUD, name tags or chat. It is a PNG named by when it was
  taken (`gilbyy-2026-10-10-173205.png`). A phone gets the share sheet, where Save Image
  puts it with the player's photos; anything else downloads it. A soft flash says it
  was taken.
- **Pictures go nowhere else.** They aren't uploaded, stored, shared with friends,
  counted or listed, and taking one pays nothing. No Supabase Storage, no Realtime, no
  migration.
- **Nearly nothing on screen**: a shutter, "back", and one line on how to work it. The
  title goes too.
- **Drawn only while the camera moves.** A still picture is the same picture, and a
  phone composing a shot shouldn't spend its battery redrawing it.

## Consequences

- Somebody can stop and look at the world from any side, which the high chase camera
  never allows, and keep what they see.
- A truck frozen at speed carries on at speed, which is what a pause is.
- If the campground was full and a tent comes free during photo mode, the retry waits
  until it's put away. If a tent is found for a truck that was waiting at the camp, the
  truck isn't moved to it while it's being photographed.
- The picture is at most as sharp as the screen (the pixel ratio is capped at 1.75).
  Drawing it bigger would be the next step if anyone wants prints.

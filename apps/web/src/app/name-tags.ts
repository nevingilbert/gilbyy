/**
 * Keeping the name tags over other players' trucks apart. Friends drive close together,
 * abreast at a convoy's or a race's start and side by side on the course, and seen from
 * the side their tags land on one another and neither can be read. So each tag is lifted
 * just clear of the ones nearer the camera: the nearest truck's tag stays where it is and
 * a further one sits above it. Pure, in screen pixels, so it's tested without a page.
 */

/** A tag where it would sit with nothing in the way. */
export type TagBox = {
  id: string;
  /** Its bottom centre on screen, in CSS pixels, y downward. */
  x: number;
  y: number;
  /** Its size in CSS pixels. */
  w: number;
  h: number;
  /** Metres from the camera. */
  far: number;
};

/** Pixels between a tag and the one stacked on it. */
export const TAG_GAP = 2;
/**
 * A tag lifted last time counts as this many metres further away, so two trucks at about
 * the same distance don't keep swapping which of their tags is on top.
 */
export const TAG_STAY = 2;

/**
 * How far up to draw each tag, in pixels, by id, so that no two overlap. `was` is the
 * answer from last time.
 */
export function stackTags(boxes: readonly TagBox[], was: ReadonlyMap<string, number> = new Map()): Map<string, number> {
  const depth = (b: TagBox) => b.far + ((was.get(b.id) ?? 0) > 0 ? TAG_STAY : 0);
  const order = [...boxes].sort((a, b) => depth(a) - depth(b));
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const lifts = new Map<string, number>();
  for (const b of order) {
    const left = b.x - b.w / 2;
    const right = b.x + b.w / 2;
    let bottom = b.y;
    // Each move puts it above one tag already placed, and it only goes up, so no tag
    // moves it twice and this ends.
    for (let moved = true; moved; ) {
      moved = false;
      for (const p of placed) {
        if (right <= p.left || left >= p.right) continue;
        if (bottom - b.h >= p.bottom + TAG_GAP || bottom <= p.top - TAG_GAP) continue;
        bottom = p.top - TAG_GAP;
        moved = true;
      }
    }
    placed.push({ left, right, top: bottom - b.h, bottom });
    lifts.set(b.id, b.y - bottom);
  }
  return lifts;
}

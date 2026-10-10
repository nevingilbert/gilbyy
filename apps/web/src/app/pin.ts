/**
 * The pin: a spot the player picks on the map for the compass to lead them to. There is
 * one at a time, it is theirs alone and it isn't saved: it lasts until they get there,
 * take it up again, fly to the other world or close the page. It can go anywhere on the
 * sheet, fog or no fog, and shows nothing that wasn't already showing. Pure, so where a
 * click lands and what the compass follows are tested without a page.
 */
export type Spot = { x: number; z: number };

/** Metres from the pin at which you've got there, and it's taken up. */
export const PIN_REACH = 30;
/**
 * The pin as the full map draws it, in fractions of the sheet's width: how far its head
 * stands over the spot it marks, and the head's radius. The map draws from these and a
 * click is judged by them, so the two can't disagree.
 */
export const PIN_STEM = 0.03;
export const PIN_HEAD = 0.013;
/** A click within this many CSS pixels of the drawn pin takes it up instead of moving it: a fingertip's worth. */
export const PIN_GRAB = 18;

/** The spot on the ground under a click on the full map. `fx` and `fy` are 0–1 across the sheet, which shows `span` metres about the world's middle. */
export function pinAt(fx: number, fy: number, span: number): Spot {
  return { x: (fx - 0.5) * span, z: (fy - 0.5) * span };
}

/** Whether a click on a sheet `px` pixels wide is on the pin: anywhere from its point up to its head. */
export function onPin(pin: Spot, fx: number, fy: number, span: number, px: number) {
  const tipX = (pin.x / span + 0.5) * px;
  const tipY = (pin.z / span + 0.5) * px;
  const up = Math.max(0, Math.min(PIN_STEM * px, tipY - fy * px));
  return Math.hypot(fx * px - tipX, fy * px - (tipY - up)) <= Math.max(PIN_GRAB, PIN_HEAD * px);
}

export function reached(pin: Spot, x: number, z: number) {
  return Math.hypot(pin.x - x, pin.z - z) < PIN_REACH;
}

/**
 * Where the pin shows on the round minimap, which reaches `radius` metres from the truck:
 * where it is, or, further off than that, held at the rim on the way to it (`far`).
 */
export function onMini(pin: Spot, car: Spot, radius: number): Spot & { far: boolean } {
  const dx = pin.x - car.x;
  const dz = pin.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d <= radius) return { x: pin.x, z: pin.z, far: false };
  return { x: car.x + (dx / d) * radius, z: car.z + (dz / d) * radius, far: true };
}

/**
 * What the compass mark leads to when no flag of a course is next. Nothing while a course
 * is being counted in or a convoy gathers (`busy`). Then a friend calling a convoy or a
 * race, which lasts only until they set off; then the pin; and the first-time guidance
 * only when there's neither.
 */
export function markFor(busy: boolean, call: Spot | null, pin: Spot | null, guide: Spot | null): Spot | null {
  return busy ? null : (call ?? pin ?? guide);
}

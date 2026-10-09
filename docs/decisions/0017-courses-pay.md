# 0017 — Courses pay; driving around is the slow way

Date: 2026-10-09
Status: Accepted. Changes the numbers in `0007` (prices, mission payouts), `0010`/`0011`
(convoy and race payouts), `0014` (the Sandfly's price, not the fares) and `0016` (the
island's course payouts), and adds a check to how every course is paid. Their rules
stand: miles are the one currency, courses are optional and never fail beyond giving
up, and every finisher of a convoy or a race is paid the same.

## Context

On 2026-10-09 a player held the throttle and a steering key down from the browser's
devtools and left the truck circling at its top speed for an hour or more. Every metre
counted, and he banked the 55 miles for the Duneclaw while away from the keyboard. The
server can't see trucks, and anything a client does a devtools user can fake, so no
check stops a truck circling on its own.

The owner chose not to fight that, but to make it not worth doing: make the courses
the better use of time, add more of them, make everything cost more, and pay courses
much more.

## Decision

- **Prices are five times what they were,** bar the first upgrade of each kind. The
  Duneclaw is 275 miles; a starter circling at its top speed (17 m/s, 38 mph) needs
  over seven hours for it. The island's Sandfly (`0014`) is priced like the other rigs,
  150. The flight's fare is not a shop price: it stays the owner's number (150 each way
  since `20261009233000_cheaper_flights.sql`).
- **The first upgrade of each kind keeps its old price,** so a newcomer who only drives
  around still gets somewhere: the Overlander (8), Desert Cream and Rust Red paint
  (0.5), all-terrain tyres (2) and halogen bulbs (1). Each is within a quarter of an
  hour's driving on a starter. The owner's call: the snorkel and the snow gear (chains,
  studded tyres) are not in that set, and go up with the rest.
- **Courses pay eight to ten times more,** the island's three too. A first finish pays
  12 to 40 miles and a repeat 4 to 12, still no more than once per course every ten
  minutes. Even a repeat pays at least five times the miles the course covers; the first
  finish of every valley course together is more than the Duneclaw costs. A player who
  drives the courses gets the best rig in an evening; one who leaves the laptop
  circling, overnight.
- **Snow chains show.** They were the one part with nothing to see: now a steel ring
  runs down each sidewall with ten cross chains over the tread, turning with the wheel
  (`car-model.ts`), on your truck, in the showroom and on friends' trucks.
- **Thirteen courses, from six.** New to drive alone: Deep Woods (a second slalom),
  High Ridge (a second climb), Southern Shore (a loop by the south lake), Snowfield
  (needs chains or studded tyres) and Far Bank (along the river's far bank, so it needs a
  snorkel; it follows the water, never more than 110 m out, so it can't take the hollow
  the valley's airstrip hides in).
  New for friends: Grand Tour (a long convoy from the big lake) and Hill Race (a second
  race, hillier, by the roadside workshop). The six courses that were there are laid out
  first and haven't moved; each new one keeps clear of the rest. The two that need gear
  give the snorkel, chains and studs something to pay for.
- **A course is paid only for a run that drove it, one at a time.** The server now
  also refuses a claim when:
  - another run finished while this one was on (`one course at a time`), or
  - the miles banked during the run (`private.drive_log`, kept since
    `20261009000000_drive_log.sql`) come to less than three fifths of the course's line
    (`missions.min_miles`), counting only miles banked since the last paid run.

  An honest run banks about 1.7 times that (`courses.test.ts` drives every course with a
  starter rig to check). A convoy is claimed when the last friend is home, so a crew run
  looks back ten minutes further. Single player skips this check: nothing there is kept.
- **First-time guidance points at the courses before the shop**, since past the first
  upgrades, driving around and spending is now the slow way.

## Consequences

- Balances already banked keep their miles but, past the first upgrades, buy a fifth as
  much. Nothing owned is taken away. Nobody's balance was scaled up: that would have handed the Duneclaw to the
  player who circled for it.
- The check stops a console script claiming courses with the truck parked, or claiming
  thirteen at once. It doesn't stop a script that claims while the truck circles on its
  own: miles are miles to the server. That player is limited to what a perfect driver
  could earn, each course once per ten minutes, and `private.miles_hourly` shows it
  (course miles arriving faster than anyone could drive between the starts).
- The four easter-egg buildings (`0012`) moved, because they're placed clear of every
  course. The airstrip didn't: it is chosen last, and Far Bank stays out of its way.
- The island's courses (`0016`) pay on this scale too: Beach Run 15/5, Dune Dash 20/6,
  Jungle Loop 35/12, with the same miles check.
- Laying out seven more courses adds about 0.2 s to building the world at load.

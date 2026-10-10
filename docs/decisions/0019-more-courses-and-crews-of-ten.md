# 0019 — More courses, as many for friends as alone, a jump, and crews of ten

Date: 2026-10-09
Status: Accepted. Changes `0010` and `0011` (a convoy or a race is two to ten drivers,
not two to four) and one number in `0017` (the quickest believable run). Their rules
stand: every finisher is paid the same, winning pays nothing extra, and nothing about
a race or a jump is stored or ranked.

## Context

The owner asked for more courses in both worlds, then for three things about them: one
should be about the air time of a jump, there should be as many courses for friends as
courses to drive alone, and a course for friends should take up to ten people.

Before this the valley had nine courses to drive alone and four for friends, and the
island three to drive alone and none for friends.

## Decision

- **Twenty courses in the valley and eight on the island, half of each for friends.**
  Of the ones for friends, half are driven together (convoys) and half against each
  other (races): five and five in the valley, two and two on the island.
  - Valley, alone: **Big Air**, the jump.
  - Valley, for friends: **Barn Round** and **Snowline** (loops, together; Snowline
    dips into the first of the snow), **Lakehead Race** and **Two Lakes Race** (loops,
    against), **Trackside** (eight flags beside the railway, together) and **Flat Out**
    (eight flags over open ground, against).
  - Island, alone: **Hilltop**, straight up through the jungle to the top of the island,
    which is kept bald for the view.
  - Island, for friends: **Coast Convoy** (from by the café along the beach past the
    shack and home through the dunes), **Tideline** (in and out of the wet sand,
    together), **Sand Race** (a lap of the beach below the outpost) and **Dune Derby**
    (a lap over the north-east dunes).
- **A course for friends no longer has to be a loop.** Trackside, Flat Out and Tideline
  run from one place to another. The convoy and race rules never needed a loop.
- **The jump is told for its time in the air, and paid like any other course.** Big Air
  is a straight run at a timber ramp on a levelled pad by the big lake. The line at the
  top of the screen shows the longest the truck has been off the ground instead of the
  clock, and the finish says "Big Air: 1.07 s in the air", with your longest since the
  page loaded. A starter rig gets a little over a second, the quickest nearly a second
  and a half. The payout is the same however long the jump was: the server can't see a
  truck in the air, so an air time is only ever a line on screen, like a race's result.
  There is no bar to clear, so the course still can't be failed.
- **The ramp is not in the height grid**, whose cells are 10 m. Its deck is added on top
  of the ground wherever something asks how high the ground is (`ramp.ts`,
  `World.height`), and the model is built from that same function (`ramp-model.ts`), so
  the boards are where the wheels roll. A fence down each side and boards under the
  lip are obstacles; the boards have a `top`, so a truck on the deck or in the air
  passes over them and only one on the ground behind is stopped. That is the one
  addition to the physics: an obstacle can say how high its top is.
- **Nothing that was already there moved.** The thirteen older valley courses are
  planned first, then the easter eggs and the airstrip are chosen from those alone, as
  they always were, and only then the new courses, each keeping 150 m from every course
  before it (100 m for a loop), 260 m from the four buildings and 500 m from the
  airstrip. `courses.test.ts` pins where the older courses, the eggs and the airstrip
  are. Trees do shift: the scatter is one random stream, and a new corridor through it
  moves everything after.
- **A convoy or a race is two to ten drivers.** `CONVOY_MAX` is 10 and
  `complete_convoy()` accepts up to nine others. The gatherer still takes only friends,
  and one of the crew must be a friend to be paid.
  - Ten line up two abreast in five rows, 6.5 m apart (it was 9 m), which fits the
    ground the older courses already had checked behind their arches. The scatter now
    keeps that far back clear at every course for friends.
  - **A big crew says less each.** Up to four, each truck broadcasts its flag count on
    every flag and every five seconds, as before. Beyond that it waits half a second per
    truck in the crew between counts (the finish always goes out at once) and repeats
    every 0.8 s per truck, and a truck is taken for gone after three missed counts
    rather than fifteen seconds. Ten trucks through one flag would otherwise be ten
    broadcasts to everyone in the world in the same second, past Realtime's free
    hundred a second.
  - The top line names up to three others; a bigger crew is "4 of 9 others through". A
    race's result names the first three and you.
- **The quickest believable run is 27 m/s round a course, not 23.** The island's own
  Sandfly does 24.5: flat out along Beach Run it finished in 45 s against a limit of 46
  and was refused as too fast to be true. Every course's `min_seconds` comes down a
  little. The cooldown and the miles check are what limit a cheat, not this.
- **A course is in one world, and is paid only to a player who is there**
  (`missions.world`, checked in `pay_run()`). Before this a client in the valley could
  claim the island's courses without paying the fare. It follows the rule already in
  `CLAUDE.md`: the client doesn't say which world it's in.

## Consequences

- A first finish of every valley course is now 500 miles (195 of it alone), and of
  every island course 220. Courses for friends pay more a metre than ones driven alone,
  as they already did.
- One course that was planned was dropped: a descent from a hilltop, for friends, had
  nowhere to line ten trucks up. A course back and forth across a river was tried too;
  no stretch of either river has room for it between the snow, the airstrip, the bank
  and the courses already there.
- Lakehead Race passes 520 m from the hidden airstrip, on the near bank. The bank and
  the pines still hide it, and the river is still in the way.
- A ten-truck convoy with a full world of thirty is on the order of ten thousand
  messages. Poses are still the bigger cost (`docs/architecture.md`).
- The code can ship before the migration: until then the new courses can be driven but
  the server answers "no such mission", a crew of more than four is refused, and the
  Sandfly is still refused on Beach Run.
- Building the valley takes about 0.1 s longer at load, and the island about 0.01 s.
- Still not built: the jump for friends (an air time each would need to travel with the
  flag counts), and first-time guidance on the island.

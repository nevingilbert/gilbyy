# The dev panel: testing without signing in

Everything in the game can be tried in a development build (`pnpm dev`) with no account.
Nothing here ships: a production build (`pnpm build`, what Vercel deploys) leaves the
panel out altogether, and it only works in single player, where nothing is saved. Signed
in, it says so and does nothing.

## Opening it

Press the backtick key (`` ` ``), or tap the small **dev** chip by the wordmark on a phone.
It stays open while you drive.

## What it does

- **Readout**: the world, where the truck is and which way it faces, the ground's height,
  the water over it against how deep the rig can wade, paved or not, slip, speed, the
  hour, and the nearest thing the truck could run into and how far off it is.
- **World**: jump straight to any of the five worlds. The fare is given and then paid, as
  a trip would; no plane, train, ferry or helicopter needed.
- **Go to**: every place worth testing in the world you're in: the camp, each garage's
  door, the café, the airstrip, station, dock or helipad, every course's start and the
  easter eggs. Or **shift-click the open map** to drop the truck anywhere. It's put on the
  nearest spot clear of anything it would hit, and shallow enough to wade.
- **Rig**: any rig and any part, fitted at once. The panel owns everything for you.
- **Time** and, on the island, **Tide**: set the hour; hold the tide out or in, or let it
  come and go.
- **+1,000 mi**, **Clear the fog**, **Find every place**.
- **Show what the truck runs into**: red drums for round things (trees, rocks, posts,
  legs), at their real size and height; orange posts along walls. A wall where nothing is
  drawn, or a building with no wall, shows at a glance.
- **Rocks can catch the truck, as signed in**: single player can't get hung up on a
  boulder (ADR 0021); this lets it, to test that. Jumping anywhere frees it.
- **Two drivers, in two tabs**: reloads this tab and opens another as two drivers in
  this browser (`?net=local`), with no account. That's how to test friends, chat at the
  café, convoys, races, the winch and BBB's tow.
- **Check this world**: the sweep, on the world as built, with every model's colliders in
  (garages, tents, arches, landmarks): every place the game puts a truck down has room for
  every rig, and a bot drives every course from start to finish. Anything wrong is listed;
  click it to go there.

## The sweep in the tests

`src/app/sweep.test.ts` runs the same checks in every world on each `pnpm test`, without
the scene's models. It also keeps every course out of the campground, so a tent the test
can't see is still kept off a course. The checks themselves are in `src/app/dev.ts`:
`spawnSpots` and `spotProblems` (where a truck is put down), `wayThrough` (a way a truck
could drive between two points, found on a 2 m grid and following whichever surface it's
on, a bridge's deck or the road under it) and `driveCourse` (the bot).

## From the browser's console

In a development build, `window.gilbyyDev` has the world as built (`world()`), the truck
(`car`), its spec (`spec()`), `specFor`, the panel's controls (`panel`: `go`, `jump`,
`fit`, `hour`, `tide`, `check` and the rest) and the sweep's tools (`tools`). For example:

```js
const { world, panel, tools, specFor } = gilbyyDev;
panel.jump({ x: -1016, z: -232, heading: 1.2 });
tools.driveCourse(world(), world().missions[0], specFor("summit", { /* a loadout */ }));
```

## The address still works

The query parameters are unchanged, and handy for a screenshot or a link to a bug:
`?world=`, `?rig=`, `?miles=`, `?hour=`, `?tide=low|high`, `?at=x,z,heading`,
`?garage=n`, `?airport`, `?station`, `?dock`, `?pad`, `?winch`, `?net=local`.

# 0021 — Getting stuck, the winch, and BBB

Date: 2026-10-10 (the sticking and the winch were built on 2026-10-09, BBB the day after)
Status: Accepted. Amends the "don't add pressure" line in `CLAUDE.md`, and takes
winching off the list of things `art-direction.md` and `0005` said we don't borrow from
Over the Hill.

## Context

The owner asked whether a truck could ever be truly stuck, and for it to be possible if
not. It couldn't. A truck dropped at 2,100 spots in the valley (half of them in among
the rocks) drove out of every one: rocks and trees only push it back, reverse always
works, deep water stops it at the edge, it never rolls over, and a slope too steep to
climb rolls it back down. So this is a new rule, and the first thing in the game that
can end a drive.

The owner ruled out water for now: you can't see how deep it is, so you couldn't know
what would catch you. Whatever the rule is, the driver has to be able to see it coming.

The owner then set what a stuck driver can do, and it is these three and no others:

1. reload, and start again from the tent;
2. be winched off by a friend;
3. ring BBB (think of a motoring club's breakdown line), which costs miles: a tow truck
   leaves the nearest garage, there's a short film of it going, then a note of how far
   off it is, and it winches the truck out.

## Decision

### Getting stuck

- **A truck gets hung up on a boulder it rams.** Rocks no taller than a rig's clearance
  are bumps and always were; taller ones are walls. Now a boulder up to half a metre
  taller than the clearance (`HANG` in `physics.ts`) is a wall only at low speed. Hit
  nose first at 20 mph or more (`RAM`), with the rock between the wheels and not off to
  one side, and the truck is carried up onto it and stays: nose up, leaning, wheels
  spinning in the air when the throttle is pressed. Nothing the driver does moves it.
- **What you can see is what catches you.** It takes a boulder, speed and a square hit.
  Driving slowly near rocks is always safe, reversing never does it, and a rock standing
  in water doesn't. Only boulders do it: they are marked as such (`Obstacle.boulder`),
  because fence posts and the boards under the jump have heights of their own and must
  only ever stop a truck. Bigger tyres raise the clearance, so they roll over what would
  have caught the stock ones and are caught only by boulders bigger and rarer.
- **How often.** A truck driven flat out in straight lines with no steering at all, the
  worst driver there could be, is caught about once in 12 miles on stock tyres and once
  in 21 on the biggest. Someone steering round the rocks they can see will meet it far
  less. `RAM` and `HANG` are the two numbers to turn if that is wrong.
- **Not in single player.** With no account nothing is saved and nobody else is there,
  so a reload would cost everything. There the same boulders stop the truck as they
  always did (`hang: 0` on the spec `Game.tsx` drives). `?net=local` counts as shared.
- **Getting stuck on a course ends the run**, and takes you out of a convoy or race so
  the others aren't left waiting.

### The three ways out

- **Reload.** A signed-in player comes back at their tent with everything they had;
  miles driven are banked the moment the truck sticks, so nothing is lost but the
  place. There is no button for it.
- **A winch pulls someone else off** (`winch.ts`). It is a part like the snorkel, 10 mi,
  shown on the front bumper. With one fitted, stop within 22 m of a stuck truck and
  press E: a cable runs between the two, the winching truck holds still, and the stuck
  one is hauled toward it at walking pace until it is clear of the rock, usually a few
  seconds. The winch does nothing for the truck it's bolted to. Anyone with a winch can
  pull anyone off, friend or not; friends are the ones who are told. When a friend gets
  stuck, the others in that world get a line saying so, and those with a winch get the
  compass mark pointing at them. A stuck truck's name tag says so, and its dot on the
  map has a ring round it.
- **BBB tows for 5 mi** (`tow.ts`). Stuck, with the miles to pay, E rings it. The fee is
  taken by the server (`call_tow()`), and then:
  - a film of about four seconds: the door of the nearest garage goes up, a white pickup
    with a recovery boom and an amber lamp pulls out and away, and the door comes down;
  - back at the truck, the line at the bottom reads "BBB is on its way" and how far off
    it is, counting down. The truck is not driven across the valley: the distance closes
    at 22 m/s, for never less than 8 seconds or more than 75;
  - for the last stretch it is really there. It comes into sight up to 60 m off, down a
    straight line chosen to be dry, clear and not too steep (`approachLine()`), from the
    garage's side if there's a way in from there, and pulls up 11 m short. The camera
    turns to watch it come;
  - its winch goes on and the truck is hauled off exactly as by a friend's (the same
    `pull` in the physics), and then it backs away and is gone.
- **No other way.** No self-recovery with your own winch and no free way back to the
  tent but a reload. The fee is not refunded if a friend gets there first.

### Prices

Both are mine, not the owner's, set against `0017`: the winch at 10 mi is in with the
first upgrades because it's bought for other people; a tow at 5 mi is about what the
cheapest course pays for a repeat run. A call is always the same price however far the
garage is.

## How it travels

- A pose gains a tenth number: 0, 1 for stuck, 2 for stuck with a winch on it. A stuck
  truck is parked and would otherwise say nothing, so `PoseGate` treats a change in
  either as news, and the game sends it at once.
- Hooking on is one broadcast on the world's channel, `winch {from, to}`. The stuck
  driver's game decides whether to believe it: the sender must be here, have a winch in
  the loadout it announced, and be within the cable's length. It then does the pulling
  itself and says so in its next pose, which is how the winching truck and anyone
  watching know the cable took. If no such pose comes in four seconds, the winching
  driver is told it didn't take.
- BBB's truck is one more broadcast, `tow {from, x, z, heading, length}`, sent as it
  comes into sight: the line it drives in on. Where the truck is after that is a pure
  function of the line and the time (`towVisit()`), so every player near draws the same
  truck arriving, hooking on and leaving, and nothing more is sent. The film of it
  leaving the garage is shown only to the driver who rang.
- A page loaded before this ignores the tenth number and hears neither message; its
  truck can't be stuck and it draws a stuck one where its pose says, tilted on its rock.

## Consequences

- This is pressure of a kind the game hasn't had: a mistake that costs you where you
  were, or five miles, or a wait for a friend. It is kept to that. It can't happen in
  single player, and the way to avoid it is to drive the way the game already wants,
  unhurried.
- BBB makes the winch less necessary than it was for a day. What a friend's winch still
  offers is that it's free and usually quicker. If nobody buys one, that is the reason.
- The server can't see a truck on a rock, so `call_tow()` takes the caller's word that
  there is one. All a made-up call can do is spend the caller's own miles.
- Everything else is the client's word too. A modified client could free itself, or
  claim to be stuck; either gains nothing.
- The tow truck is placed, not driven. It never gets stuck itself, but where trees or
  rocks crowd a stuck truck on every side its run-in shrinks, and in the worst case it
  simply appears where it pulls up. In the valley more than six stuck trucks in ten can
  be given a run of 20 m or more.
- It backs away along the line it came in on, further than that line was checked, so it
  may pass through something as it fades.
- A truck let go on a slope rolls down it, like any truck left alone on one.
- Not done: getting stuck in water, mud or snow; a sound or dust when it happens; the
  winching truck being dragged if it's the lighter one; BBB coming for anything but a
  truck on a rock.

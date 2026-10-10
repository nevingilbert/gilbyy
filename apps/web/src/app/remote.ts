import * as THREE from "three";
import { buildCar, type CarModel } from "./car-model";
import { guessPose, staleAfter, type Peer, type Pose } from "./net";
import { makeCar, type Car, type CarSpec } from "./physics";
import { specFor } from "./shop";
import type { Obstacle, World } from "./world";

/** How fast a correction fades, per second: the truck drifts back onto its true path rather than jumping. */
const SETTLE = 6;

/** How far the drawn truck is from where its poses say, fading away. */
type Offset = { x: number; y: number; z: number; heading: number };
const still = (): Offset => ({ x: 0, y: 0, z: 0, heading: 0 });

type Remote = {
  peer: Peer;
  model: CarModel;
  spec: CarSpec;
  car: Car;
  last: Pose | null;
  heardAt: number;
  off: Offset;
  look: string;
};

const lookOf = (p: Peer) => p.vehicle + JSON.stringify(p.loadout);
const angleBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Everyone else's trucks. Poses arrive a few times a second at most, and only every few
 * seconds while a truck holds its line, so between them each truck carries on as it was
 * going, round the bend if it was turning. When a pose shows the guess was off, the truck
 * keeps being drawn where it was and the difference fades, so it never jumps.
 */
export function createRemotes(scene: THREE.Scene, world: World) {
  const pitches = world.pitches;
  const remotes = new Map<string, Remote>();
  /** Where each player was last heard of, kept after they drop out in case they reconnect. */
  const lastKnown = new Map<string, Pose>();

  /** At their last known spot, or at their tent if they've not been heard from yet. */
  function place(r: Remote) {
    const known = lastKnown.get(r.peer.id);
    const bay = pitches[r.peer.tent]?.parking ?? pitches[0].parking;
    r.car = makeCar(world, known?.x ?? bay.x, known?.z ?? bay.z, known?.heading ?? bay.heading, r.spec);
    r.off = still();
    if (known) {
      r.car.y = known.y;
      // Back after a reload, it's at its tent and free, whatever it was when it left.
      r.last = { ...known, speed: 0, turn: 0, stuck: false, hooked: false };
      r.heardAt = performance.now() / 1000;
    }
  }

  function add(peer: Peer) {
    const model = buildCar(peer.vehicle);
    model.setLoadout(peer.loadout);
    scene.add(model.object);
    const spec = specFor(peer.vehicle, peer.loadout);
    const r: Remote = { peer, model, spec, car: makeCar(world, 0, 0, 0, spec), last: null, heardAt: 0, off: still(), look: lookOf(peer) };
    place(r);
    remotes.set(peer.id, r);
  }

  function drop(id: string) {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.model.object);
    r.model.dispose();
    remotes.delete(id);
  }

  /** Brings the trucks in line with who's here and what they're driving. */
  function sync(peers: Peer[]) {
    const ids = new Set(peers.map((p) => p.id));
    for (const id of [...remotes.keys()]) if (!ids.has(id)) drop(id);
    for (const p of peers) {
      const r = remotes.get(p.id);
      if (!r) add(p);
      else if (r.peer.vehicle !== p.vehicle) {
        const keep = { car: r.car, last: r.last, heardAt: r.heardAt, off: r.off };
        drop(p.id);
        add(p);
        Object.assign(remotes.get(p.id)!, keep);
      } else {
        if (lookOf(p) !== r.look) {
          r.model.setLoadout(p.loadout);
          r.spec = specFor(p.vehicle, p.loadout);
          r.look = lookOf(p);
        }
        r.peer = p;
      }
    }
  }

  function pose(id: string, p: Pose, now: number) {
    lastKnown.set(id, p);
    const r = remotes.get(id);
    if (!r) return;
    const c = r.car;
    // Far from where we had it (just joined, or back from a garage): jump there.
    if (!r.last || Math.hypot(p.x - c.x, p.z - c.z) > 40) {
      Object.assign(c, { x: p.x, y: p.y, z: p.z, heading: p.heading });
      r.off = still();
    } else r.off = { x: c.x - p.x, y: c.y - p.y, z: c.z - p.z, heading: angleBetween(p.heading, c.heading) };
    r.last = p;
    r.heardAt = now;
  }

  /**
   * Puts a truck somewhere at once instead of easing it there. For a convoy lining up:
   * eased, it would slide through the trucks between its old spot and its new one.
   */
  function jump(id: string, x: number, z: number, heading: number, now: number) {
    const r = remotes.get(id);
    const y = world.height(x, z) + (r?.spec.ride ?? 0);
    const p: Pose = { x, y, z, heading, pitch: 0, roll: 0, speed: 0, steer: 0, turn: 0 };
    lastKnown.set(id, p);
    if (!r) return;
    Object.assign(r.car, { x, y, z, heading, speed: 0 });
    r.off = still();
    r.last = p;
    r.heardAt = now;
  }

  function update(dt: number, now: number, night: number) {
    const ease = 1 - Math.exp(-8 * dt);
    const fade = Math.exp(-SETTLE * dt);
    const stale = staleAfter(remotes.size + 1);
    for (const r of remotes.values()) {
      const p = r.last;
      const c = r.car;
      if (p) {
        // Past `stale` the guess stops: the truck coasts to a stop where it was last expected.
        const age = Math.min(now - r.heardAt, stale);
        const g = guessPose(p, age);
        const o = r.off;
        o.x *= fade;
        o.y *= fade;
        o.z *= fade;
        o.heading *= fade;
        c.x = g.x + o.x;
        c.z = g.z + o.z;
        // Keep the height it had above the ground, wherever the guess has carried it.
        c.y = world.height(g.x, g.z) + (p.y - world.height(p.x, p.z)) + o.y;
        c.heading = g.heading + o.heading;
        c.pitch += (p.pitch - c.pitch) * ease;
        c.roll += (p.roll - c.roll) * ease;
        c.speed = now - r.heardAt > stale ? c.speed * (1 - ease) : p.speed;
        c.steer = p.steer;
      }
      c.grounded = true;
      r.model.update(c, world, dt, r.spec);
      r.model.setLights(night);
    }
  }

  /** Other trucks are solid: two circles each, front and back. */
  function obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const { car, spec } of remotes.values()) {
      const off = spec.wheelbase * 0.32;
      const fx = Math.sin(car.heading) * off;
      const fz = Math.cos(car.heading) * off;
      out.push({ x: car.x + fx, z: car.z + fz, r: spec.radius, h: Infinity }, { x: car.x - fx, z: car.z - fz, r: spec.radius, h: Infinity });
    }
    return out;
  }

  /** Where to hang each player's name tag. */
  function tags() {
    return [...remotes.values()].map((r) => ({ id: r.peer.id, name: r.peer.name, x: r.car.x, y: r.car.y + r.model.top + 1.1, z: r.car.z, stuck: Boolean(r.last?.stuck) }));
  }

  /** `stuck` and `hooked` are what its last pose said: hung up on a rock, and whether a winch has hold of it (ADR 0021). */
  const positions = () =>
    [...remotes.values()].map((r) => ({
      id: r.peer.id, x: r.car.x, z: r.car.z, heading: r.car.heading, speed: r.car.speed, stuck: Boolean(r.last?.stuck), hooked: Boolean(r.last?.hooked),
    }));

  /** One player's truck as drawn, and its size, for running a winch cable to it. */
  const truck = (id: string) => {
    const r = remotes.get(id);
    return r ? { car: r.car, spec: r.spec } : null;
  };

  function dispose() {
    for (const id of [...remotes.keys()]) drop(id);
  }

  return { sync, pose, jump, update, obstacles, tags, positions, truck, dispose };
}

export type Remotes = ReturnType<typeof createRemotes>;

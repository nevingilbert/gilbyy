import * as THREE from "three";
import { buildCar, type CarModel } from "./car-model";
import type { Peer, Pose } from "./net";
import { makeCar, type Car, type CarSpec } from "./physics";
import { specFor } from "./shop";
import { campPitches, type Obstacle, type World } from "./world";

/** Older than this, a pose isn't carried forward any further: the truck coasts to a stop. */
const STALE = 1.5;
const pitches = campPitches();

type Remote = {
  peer: Peer;
  model: CarModel;
  spec: CarSpec;
  car: Car;
  last: Pose | null;
  heardAt: number;
  look: string;
};

const lookOf = (p: Peer) => p.vehicle + JSON.stringify(p.loadout);
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/**
 * Everyone else's trucks. Poses arrive a few times a second at most, so between them each
 * truck carries on as it was going and eases toward where it should be.
 */
export function createRemotes(scene: THREE.Scene, world: World) {
  const remotes = new Map<string, Remote>();
  /** Where each player was last heard of, kept after they drop out in case they reconnect. */
  const lastKnown = new Map<string, Pose>();

  /** At their last known spot, or at their tent if they've not been heard from yet. */
  function place(r: Remote) {
    const known = lastKnown.get(r.peer.id);
    const bay = pitches[r.peer.tent]?.parking ?? pitches[0].parking;
    r.car = makeCar(world, known?.x ?? bay.x, known?.z ?? bay.z, known?.heading ?? bay.heading, r.spec);
    if (known) {
      r.car.y = known.y;
      r.last = { ...known, speed: 0 };
      r.heardAt = performance.now() / 1000;
    }
  }

  function add(peer: Peer) {
    const model = buildCar(peer.vehicle);
    model.setLoadout(peer.loadout);
    scene.add(model.object);
    const spec = specFor(peer.vehicle, peer.loadout);
    const r: Remote = { peer, model, spec, car: makeCar(world, 0, 0, 0, spec), last: null, heardAt: 0, look: lookOf(peer) };
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
        const keep = { car: r.car, last: r.last, heardAt: r.heardAt };
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
    // Far from where we had it (just joined, or back from a garage): jump there.
    if (!r.last || Math.hypot(p.x - r.car.x, p.z - r.car.z) > 40) Object.assign(r.car, { x: p.x, y: p.y, z: p.z, heading: p.heading });
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
    const p: Pose = { x, y, z, heading, pitch: 0, roll: 0, speed: 0, steer: 0 };
    lastKnown.set(id, p);
    if (!r) return;
    Object.assign(r.car, { x, y, z, heading, speed: 0 });
    r.last = p;
    r.heardAt = now;
  }

  function update(dt: number, now: number, night: number) {
    const ease = 1 - Math.exp(-8 * dt);
    for (const r of remotes.values()) {
      const p = r.last;
      const c = r.car;
      if (p) {
        const age = Math.min(now - r.heardAt, STALE);
        const tx = p.x + Math.sin(p.heading) * p.speed * age;
        const tz = p.z + Math.cos(p.heading) * p.speed * age;
        // Keep the height it had above the ground, wherever the guess has carried it.
        const ty = world.height(tx, tz) + (p.y - world.height(p.x, p.z));
        c.x += (tx - c.x) * ease;
        c.z += (tz - c.z) * ease;
        c.y += (ty - c.y) * ease;
        c.heading = turnToward(c.heading, p.heading, ease);
        c.pitch += (p.pitch - c.pitch) * ease;
        c.roll += (p.roll - c.roll) * ease;
        c.speed = now - r.heardAt > STALE ? c.speed * (1 - ease) : p.speed;
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
    return [...remotes.values()].map((r) => ({ id: r.peer.id, name: r.peer.name, x: r.car.x, y: r.car.y + r.model.top + 1.1, z: r.car.z }));
  }

  const positions = () => [...remotes.values()].map((r) => ({ id: r.peer.id, x: r.car.x, z: r.car.z, heading: r.car.heading }));

  function dispose() {
    for (const id of [...remotes.keys()]) drop(id);
  }

  return { sync, pose, jump, update, obstacles, tags, positions, dispose };
}

export type Remotes = ReturnType<typeof createRemotes>;

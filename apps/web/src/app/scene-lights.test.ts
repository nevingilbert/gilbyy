import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildCar, buildTowTruck, createBeamPool } from "./car-model";
import { STOCK as STOCK_SPEC, makeCar } from "./physics";
import { buildRailway } from "./railway";
import { createRemotes } from "./remote";
import { STOCK_LOADOUT } from "./shop";
import { trainCars } from "./track";
import { LOCO_LAMP } from "./train-model";
import { buildWorld } from "./world";

/** The lights the renderer counts: those in the scene with everything above them shown. */
function counted(root: THREE.Object3D) {
  const out: THREE.Light[] = [];
  root.traverseVisible((o) => {
    if (o instanceof THREE.Light) out.push(o);
  });
  return out;
}

// Every lit material is compiled for how many lights the scene has: one coming or going
// recompiles them all at once, a freeze each time. So the count stays put all session.
describe("the scene's real lights", () => {
  it("are the player's two beams, and stay in the scene, dark, while the truck is hidden", () => {
    const car = buildCar("overlander");
    car.setLoadout({ ...STOCK_LOADOUT, lights: "lightBar" });
    car.setLights(1);
    const beams = counted(car.object);
    expect(beams.length).toBe(2);
    expect(beams.every((l) => l instanceof THREE.SpotLight)).toBe(true);
    expect(beams.some((l) => l.intensity > 0)).toBe(true);
    // Hidden for the opening shot, or a film it's out of: no mesh drawn, the beams still there.
    car.show(false);
    expect(counted(car.object)).toEqual(beams);
    for (const l of beams) expect(l.intensity).toBe(0);
    let drawn = 0;
    car.object.traverseVisible((o) => void (o instanceof THREE.Mesh && drawn++));
    expect(drawn).toBe(0);
    car.show(true);
    expect(beams.some((l) => l.intensity > 0)).toBe(true);
  });

  it("aren't on other players' trucks, or on BBB's tow truck", () => {
    const tow = buildTowTruck();
    tow.setLights(1);
    let lights = 0;
    tow.object.traverse((o) => void (o instanceof THREE.Light && lights++));
    expect(lights).toBe(0);

    const world = buildWorld();
    const scene = new THREE.Scene();
    const remotes = createRemotes(scene, world);
    const before = counted(scene).length;
    remotes.sync(["a", "b", "c"].map((id, tent) => ({ id, name: id, vehicle: "prairie", loadout: STOCK_LOADOUT, tent, joined: 0 })));
    remotes.update(0.016, 1, 1);
    expect(scene.children.length).toBeGreaterThanOrEqual(3);
    expect(counted(scene).length).toBe(before);
    remotes.dispose();
  });

  it("include three beams lent to the nearest other trucks at night, whoever comes and goes", () => {
    const world = buildWorld();
    const scene = new THREE.Scene();
    const pool = createBeamPool(scene);
    const count = counted(scene).length;
    expect(count).toBe(3);
    // Five friends at their tents, side by side down a row; the camera at the first one.
    const remotes = createRemotes(scene, world);
    remotes.sync(["a", "b", "c", "d", "e"].map((id, tent) => ({ id, name: id, vehicle: "prairie", loadout: STOCK_LOADOUT, tent, joined: 0 })));
    remotes.update(0.016, 1, 1);
    const trucks = remotes.models().map((model) => ({ model, fade: 1 }));
    const from = trucks[0].model.object.position.clone();
    const byNearness = [...trucks].sort((p, q) => p.model.object.position.distanceTo(from) - q.model.object.position.distanceTo(from));

    pool.lend(trucks, from, 1);
    expect(counted(scene).length).toBe(count);
    const lit = pool.lights.filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(3);
    // Each on the nose of one of the three nearest, shining ahead of it and down.
    for (const [i, light] of lit.entries()) {
      const truck = byNearness[i].model.object;
      expect(light.position.distanceTo(truck.position)).toBeLessThan(4);
      expect(light.target.position.distanceTo(truck.position)).toBeGreaterThan(15);
      expect(light.target.position.y).toBeLessThan(light.position.y);
    }

    // By day they're dark; with fewer trucks, the rest are; BBB's fades in and out with it.
    pool.lend(trucks, from, 0);
    expect(pool.lights.every((l) => l.intensity === 0)).toBe(true);
    pool.lend(trucks.slice(0, 1), from, 1);
    expect(pool.lights.filter((l) => l.intensity > 0)).toHaveLength(1);
    const tow = buildTowTruck();
    tow.update(makeCar(world, from.x + 30, from.z, 0), world, 0.016, STOCK_SPEC);
    pool.lend([{ model: tow, fade: 1 }], from, 1);
    const full = pool.lights[0].intensity;
    pool.lend([{ model: tow, fade: 0.5 }], from, 1);
    expect(pool.lights[0].intensity).toBeCloseTo(full / 2);
    pool.lend([{ model: tow, fade: 0 }], from, 1);
    expect(pool.lights[0].intensity).toBe(0);

    // Everyone leaving changes nothing the renderer counts.
    remotes.sync([]);
    pool.lend(remotes.models().map((model) => ({ model, fade: 1 })), from, 1);
    expect(counted(scene).length).toBe(count);
    expect(pool.lights.every((l) => l.intensity === 0)).toBe(true);
    remotes.dispose();
  });

  it("include the train's lamp, which stays in the scene, dark, while the train is put away", () => {
    const world = buildWorld();
    const scene = new THREE.Scene();
    const lamp = new THREE.SpotLight();
    scene.add(lamp, lamp.target);
    const railway = buildRailway(world, new THREE.MeshLambertMaterial(), lamp);
    scene.add(railway.object);
    const time = 500;
    railway.update(time, 0.016, 1);
    expect(lamp.intensity).toBeGreaterThan(0);
    // It's on the loco's nose, pointing ahead along the rails.
    const loco = trainCars(world.track, time)[0];
    expect(Math.hypot(lamp.position.x - loco.x, lamp.position.z - loco.z)).toBeCloseTo(Math.hypot(LOCO_LAMP.x, LOCO_LAMP.z), 0);
    expect(lamp.target.position.x - lamp.position.x).toBeCloseTo(Math.sin(loco.yaw) * 30, -1);
    const lights = counted(scene);
    expect(lights).toContain(lamp);
    // The film's train is shown instead (ADR 0022): the timetable's goes, its lamp doesn't.
    railway.showTrain(false);
    railway.update(time + 1, 0.016, 1);
    railway.showTrain(false);
    expect(counted(scene)).toEqual(lights);
    expect(lamp.intensity).toBe(0);
    railway.showTrain(true);
    railway.update(time + 2, 0.016, 1);
    expect(lamp.intensity).toBeGreaterThan(0);
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildCar, buildTowTruck } from "./car-model";
import { isShared, lambert } from "./garages";
import { PALETTE } from "./palette";
import { TOW_RIG } from "./tow";

const materialsOf = (o: THREE.Object3D) => {
  const out = new Set<THREE.Material>();
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) for (const x of [m.material].flat()) out.add(x);
  });
  return [...out];
};

describe("BBB's tow truck as drawn (ADR 0021)", () => {
  it("fades on its own: every other truck, and the kit the world is built with, stays solid", () => {
    const tow = buildTowTruck();
    // Coming into sight, going solid, and backing away out of it, as drawTows has it.
    for (const fade of [0.0017, 0.4, 1, 0.3, 0.00057]) tow.setFade(fade);
    for (const vehicle of [TOW_RIG, "overlander", "robotaxi"] as const) {
      const truck = buildCar(vehicle);
      for (const m of materialsOf(truck.object)) {
        expect(m.transparent, `${vehicle}: ${m.type} #${(m as THREE.MeshLambertMaterial).color?.getHexString()}`).toBe(false);
        expect(m.opacity).toBe(1);
      }
    }
    // The kit's glass, which the garages, the station and the tents are built with too.
    expect(lambert(PALETTE.carGlass).transparent).toBe(false);
    expect(lambert(PALETTE.carGlass).opacity).toBe(1);
    expect(lambert(PALETTE.bumperBlack).opacity).toBe(1);
  });

  it("has none of the kit's materials, only its own copies of them", () => {
    const tow = buildTowTruck();
    const own = materialsOf(tow.object);
    expect(own.length).toBeGreaterThan(5);
    for (const m of own) expect(isShared(m)).toBe(false);
  });

  it("is drawn see-through while it fades, solid again after, and says so to the renderer each time it changes", () => {
    const tow = buildTowTruck();
    const mats = materialsOf(tow.object);
    const versions = () => mats.map((m) => m.version);
    const solid = versions();
    tow.setFade(0.2);
    for (const m of mats) {
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBe(0.2);
    }
    // Solid and see-through are different shaders: each material is marked for a new one.
    const faded = versions();
    faded.forEach((v, i) => expect(v).toBeGreaterThan(solid[i]));
    // Fading further changes only how see-through: no new shader.
    tow.setFade(0.1);
    expect(versions()).toEqual(faded);
    tow.setFade(1);
    for (const m of mats) {
      expect(m.transparent).toBe(false);
      expect(m.opacity).toBe(1);
    }
    versions().forEach((v, i) => expect(v).toBeGreaterThan(faded[i]));
  });

  it("gives its own materials back when it goes, and leaves the kit's alone", () => {
    const tow = buildTowTruck();
    const gone = new Set<THREE.Material>();
    const own = materialsOf(tow.object);
    for (const m of own) m.addEventListener("dispose", () => gone.add(m));
    const kit = [lambert(PALETTE.carGlass), lambert(PALETTE.carTrim), lambert(PALETTE.bumperBlack), lambert(PALETTE.chrome)];
    let kitGone = 0;
    for (const m of kit) m.addEventListener("dispose", () => kitGone++);
    tow.dispose();
    for (const m of own) expect(gone.has(m)).toBe(true);
    expect(kitGone).toBe(0);
  });
});

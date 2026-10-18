import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCity, type CityWorld } from "./city";
import { HOUSES_REACH, HOUSES_THIN, buildBuildings, housesReach } from "./city-model";
import { loadCityData, toGame } from "./city-streets";
import { PALETTE } from "./palette";

let city: CityWorld;
let built: ReturnType<typeof buildBuildings>;
beforeAll(async () => {
  await loadCityData();
  city = buildCity();
  built = buildBuildings(city.city.buildings, { night: { value: 0 }, camera: { value: new THREE.Vector3() }, truck: { value: new THREE.Vector3() } });
}, 60000);

/** The city's haze at noon and at night: the sky's, a third as thick (scene.ts's CITY_AIR). */
const hazeAt = (hour: number) => PALETTE.sky.find((k) => k.hour === hour)!.fogDensity * 0.32;
const NOON = hazeAt(13);
const NIGHT = hazeAt(0);

/** Each tile's meshes: its blocks, then its bays and cornices, if it has them. */
function tiles() {
  const out: { blocks: THREE.InstancedMesh; trim: THREE.InstancedMesh[] }[] = [];
  for (const o of built.object.children) {
    if (!(o instanceof THREE.InstancedMesh)) continue;
    if (o.geometry.getAttribute("aLook")) out.push({ blocks: o, trim: [] });
    else out[out.length - 1].trim.push(o);
  }
  return out;
}
const drawn = (m: THREE.InstancedMesh) => (m.visible ? m.count : 0);
const low = () => city.city.buildings.filter((b) => b.top - b.base < 20);

describe("San Francisco's houses in the distance (ADR 0022)", () => {
  it("reach as far as the haze lets them, but no further than a phone should draw", () => {
    expect(housesReach(NOON)).toBe(HOUSES_REACH);
    const night = housesReach(NIGHT);
    expect(night).toBeLessThan(HOUSES_REACH);
    expect(night).toBeGreaterThan(1500);
    // Where they end, the haze has taken two thirds of a house.
    expect(Math.exp(-((NIGHT * night) ** 2))).toBeCloseTo(1 / 3, 6);
  });

  it("thin out a few at a time as you drive away, never a whole tile at once", () => {
    const camp = city.camp;
    const far = toGame(-122.39, 37.79);
    const all = tiles();
    const band = housesReach(NOON) * (1 - HOUSES_THIN);
    const step = 10;
    const steps = Math.ceil(Math.hypot(far.x - camp.x, far.z - camp.z) / step);
    let last: number[] | null = null;
    let changed = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      built.cull(new THREE.Vector3(camp.x + (far.x - camp.x) * t, 100, camp.z + (far.z - camp.z) * t), NOON);
      const now = all.map((tile) => drawn(tile.blocks));
      if (last) {
        now.forEach((n, k) => {
          const most = Math.ceil((all[k].blocks.instanceMatrix.count * step) / band) + 1;
          expect(Math.abs(n - last![k]), `tile ${k} of ${all[k].blocks.instanceMatrix.count}`).toBeLessThanOrEqual(most);
          if (n !== last![k]) changed++;
        });
      }
      last = now;
    }
    expect(changed).toBeGreaterThan(100);
  });

  it("are all there near the camera, none far past the reach, and the skyline from anywhere", () => {
    const at = city.camp;
    built.cull(new THREE.Vector3(at.x, 80, at.z), NOON);
    const reach = housesReach(NOON);
    const total = tiles().reduce((n, t) => n + drawn(t.blocks), 0);
    const sky = city.city.buildings.length - low().length;
    const within = (r: number) => low().filter((b) => Math.hypot(b.x - at.x, b.z - at.z) < r).length;
    // A tile's buildings stand up to about 400 m from its middle.
    expect(total - sky).toBeGreaterThanOrEqual(within(reach * HOUSES_THIN - 400));
    expect(total - sky).toBeLessThanOrEqual(within(reach + 400));
    expect(total - sky).toBeGreaterThan(within(1600) * 0.9);
    // Far off the city's edge, only the skyline is left.
    built.cull(new THREE.Vector3(9000, 80, 9000), NOON);
    expect(tiles().reduce((n, t) => n + drawn(t.blocks), 0)).toBe(sky);
  });

  it("keep their bay windows and cornices only while they're drawn", () => {
    const at = city.camp;
    const all = tiles();
    for (const d of [0, 1300, 1500, 1650, 1750, 1900]) {
      built.cull(new THREE.Vector3(at.x + d, 80, at.z), NOON);
      for (const t of all) {
        const n = drawn(t.blocks);
        const full = t.blocks.instanceMatrix.count;
        for (const m of t.trim) {
          if (n === 0) expect(drawn(m)).toBe(0);
          if (n === full) expect(drawn(m)).toBe(m.instanceMatrix.count);
          expect(drawn(m)).toBeLessThanOrEqual(m.instanceMatrix.count);
        }
      }
    }
  });
});

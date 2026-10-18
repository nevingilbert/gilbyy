import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCity, type CityWorld } from "./city";
import { deckPoint } from "./city-bridges";
import { loadCityData } from "./city-streets";
import { buildGrass, makeSurface } from "./terrain-mesh";
import { sampleGrid } from "./world";

let city: CityWorld;
beforeAll(async () => {
  await loadCityData();
  city = buildCity();
}, 60000);

describe("the tall grass round the truck", () => {
  it("doesn't come up through the bridges' roads (ADR 0022): it grows on the ground, under a deck only where the deck is high over it", () => {
    const surface = makeSurface(city);
    const grass = buildGrass(city, surface);
    const mesh = grass.object;
    const ground = (x: number, z: number) => sampleGrid(city.heights, x, z);
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    let tufts = 0;
    let under = 0;
    let grassyUnderDecks = 0;
    // Along both bridges, their approaches and Yerba Buena Island, as a truck driving over them lays it.
    for (const d of city.city.decks) {
      for (let s = 0; s <= d.length; s += 40) {
        const p = deckPoint(d, s);
        // Somewhere under this stretch of road, grass would grow if the deck weren't there.
        const [kind] = surface(p.x, ground(p.x, p.z), p.z, 1);
        if (kind === "dryhill" || kind === "lawn" || kind === "cityfloor") grassyUnderDecks++;
        grass.update(p.x, p.z, s);
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          at.setFromMatrixPosition(m);
          const g = ground(at.x, at.z);
          tufts++;
          // On the ground, not on a deck...
          expect(at.y + 0.05, `a tuft at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`).toBeCloseTo(g, 3);
          // ...and not where a deck lies too low over it to stand under.
          expect(city.height(at.x, at.z, g), `a deck over a tuft at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`).toBeLessThanOrEqual(g + 0.05);
          if (city.city.deckIndex.roadAt(at.x, at.z) !== null) under++;
        }
      }
    }
    expect(grassyUnderDecks).toBeGreaterThan(5);
    expect(tufts).toBeGreaterThan(1000);
    // Under the high stretches, it grows on the ground below.
    expect(under).toBeGreaterThan(0);
  });
});

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildTrees } from "./scenery";
import { isShared, lambert } from "./garages";
import { PALETTE } from "./palette";
import { release } from "./scene";
import { buildVegas } from "./vegas";
import { buildVegasTown } from "./vegas-model";

/** Whether each thing has been disposed of, by its 'dispose' event. */
function watch<T extends THREE.EventDispatcher<{ dispose: object }>>(list: T[]) {
  const gone = new Set<T>();
  for (const t of list) t.addEventListener("dispose", () => gone.add(t));
  return gone;
}

describe("leaving a world", () => {
  it("gives back its instanced meshes' buffers and its textures, the Welcome sign's among them, and nothing that outlives it", () => {
    const windows = new THREE.MeshLambertMaterial();
    const lamps = new THREE.MeshLambertMaterial();
    const vegas = buildVegas();
    // jsdom has no 2D canvas: the sign's letters go unpainted, and its texture is made all the same.
    const paint = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const town = buildVegasTown(vegas, windows, lamps);
    paint.mockRestore();
    const group = new THREE.Group();
    group.add(town.object, buildTrees(vegas.trees.slice(0, 200)));
    // Something else draws one of its geometries too, as the station's train does the valley's.
    const kept = new THREE.BoxGeometry();
    group.add(new THREE.Mesh(kept, new THREE.MeshLambertMaterial()));

    const instanced: THREE.InstancedMesh[] = [];
    const geometries = new Set<THREE.BufferGeometry>();
    const own = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o instanceof THREE.InstancedMesh) instanced.push(o);
      geometries.add(o.geometry);
      for (const m of [o.material].flat()) {
        if (m === windows || m === lamps || isShared(m)) continue;
        own.add(m);
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      }
    });
    expect(instanced.length).toBeGreaterThan(2);
    // The sign's letters, painted on a canvas.
    expect([...textures].some((t) => t instanceof THREE.CanvasTexture)).toBe(true);

    const goneMeshes = watch(instanced);
    const goneGeometry = watch([...geometries]);
    const goneMaterials = watch([...own, windows, lamps, lambert(PALETTE.vegas.signWhite)]);
    const goneTextures = watch([...textures]);
    release(group, (m) => m === windows || m === lamps || isShared(m), new Set([kept]));

    for (const m of instanced) expect(goneMeshes.has(m)).toBe(true);
    for (const t of textures) expect(goneTextures.has(t)).toBe(true);
    for (const m of own) expect(goneMaterials.has(m)).toBe(true);
    for (const g of geometries) expect(goneGeometry.has(g)).toBe(g !== kept);
    // What outlives the world: the materials the view keeps, and the kit's.
    expect(goneMaterials.has(windows)).toBe(false);
    expect(goneMaterials.has(lamps)).toBe(false);
    expect(goneMaterials.has(lambert(PALETTE.vegas.signWhite))).toBe(false);
  });
});

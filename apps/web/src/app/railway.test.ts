import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PALETTE } from "./palette";
import { buildRailway } from "./railway";
import { buildWorld } from "./world";

describe("the railway's meshes", () => {
  // Hand-built strips: the ballast, rails, bridge deck and guard rails, and the dirt roads.
  const railway = buildRailway(buildWorld(), new THREE.MeshLambertMaterial());
  const strips: THREE.Mesh[] = [];
  const colours = [PALETTE.ballast, PALETTE.timber, PALETTE.dirt[0]].map((c) => new THREE.Color(c).getHex());
  railway.object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.geometry.index &&
      colours.includes((m.material as THREE.MeshLambertMaterial).color.getHex())) strips.push(m);
  });

  /** How many triangles face up and down. Front faces are counter-clockwise; three.js culls the rest. */
  const facing = (mesh: THREE.Mesh) => {
    const p = mesh.geometry.getAttribute("position");
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let up = 0;
    let down = 0;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1).sub(a);
      c.fromBufferAttribute(p, i + 2).sub(a);
      const y = b.cross(c).normalize().y;
      if (y > 0.5) up++;
      else if (y < -0.5) down++;
    }
    return { up, down };
  };

  it("faces the ballast, deck and roads up, so they show from above", () => {
    expect(strips.length).toBeGreaterThanOrEqual(4);
    for (const mesh of strips) {
      const { up, down } = facing(mesh);
      expect(up).toBeGreaterThan(0);
      // The road strips are single-sided; the ribbons are closed, a bottom under each top.
      expect(down === 0 || down === up).toBe(true);
    }
  });
});

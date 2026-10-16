import * as THREE from "three";
import { makeRandom } from "./noise";
import { PALETTE } from "./palette";

/** Where new bubbles come up: under the water at a truck's exhaust, and how many a second. */
export type BubbleSource = { x: number; z: number; water: number; rate: number };

/**
 * The bubbles behind a truck driving where only its snorkel lets it go: its exhaust is under
 * the water and the engine breathes through the snorkel, so it bubbles. Each one rises from
 * a little under the surface at the exhaust, bobs at the surface a moment and bursts; they
 * stay where they came up, so a truck leaves a trail of them.
 */
export function buildBubbles() {
  const N = 72;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.bubble, emissive: PALETTE.bubble, emissiveIntensity: 0.15, transparent: true, opacity: 0.8, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const rand = makeRandom(91);
  const live = Array.from({ length: N }, () => ({ x: 0, z: 0, water: 0, size: 0, rise: 0, age: 0, life: 0, wobble: 0 }));
  const m = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let next = 0;
  let owed = 0;
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, hidden);

  /** How far under the surface a bubble starts, how fast it rises, and how long it floats before it bursts. */
  const START = 0.5;
  const FLOAT = 0.45;
  return {
    object: mesh,
    /** Moves them on by `dt`; while there's a `from`, new ones come up there. */
    update(dt: number, from: BubbleSource | null) {
      if (from) {
        owed += from.rate * dt;
        while (owed >= 1) {
          owed -= 1;
          const b = live[next];
          next = (next + 1) % N;
          b.x = from.x + (rand() - 0.5) * 0.7;
          b.z = from.z + (rand() - 0.5) * 0.7;
          b.water = from.water;
          b.size = 0.06 + rand() * 0.1;
          b.rise = 0.9 + rand() * 0.6;
          b.wobble = rand() * Math.PI * 2;
          b.age = 0;
          b.life = START / b.rise + FLOAT;
        }
      } else owed = 0;
      for (let i = 0; i < N; i++) {
        const b = live[i];
        if (b.age >= b.life) {
          mesh.setMatrixAt(i, hidden);
          continue;
        }
        b.age += dt;
        // Up to the surface, swelling a little as it comes; there, a dome bobbing until it bursts.
        const y = Math.min(b.water + 0.02, b.water - START + b.age * b.rise);
        const atTop = Math.max(0, b.age - START / b.rise) / FLOAT;
        const s = b.size * (1 + 0.6 * Math.min(1, b.age * b.rise / START)) * (atTop > 0.85 ? 1 + (atTop - 0.85) * 4 : 1);
        const sway = Math.sin(b.age * 9 + b.wobble) * 0.04;
        m.makeScale(s, s * (atTop > 0 ? 0.7 : 1), s).setPosition(b.x + sway, y, b.z + sway);
        mesh.setMatrixAt(i, b.age >= b.life ? hidden : m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildVegas, fromResort, resortFrame, resortMasses, type Resort } from "./vegas";
import { buildResort } from "./vegas-model";

const vegas = buildVegas();
const mats = {
  windows: new THREE.MeshLambertMaterial(),
  lamps: new THREE.MeshLambertMaterial(),
  neon: Array.from({ length: 6 }, () => new THREE.MeshLambertMaterial()),
};
/** How high over the ground the model is cut through: a truck's bumper. */
const BUMPER = 1.2;

/** Where a resort's model meets the level `BUMPER` over its ground: points every half metre along every face that crosses it. */
function outline(r: Resort) {
  const built = buildResort(r, vegas.vegas.pool, mats)!;
  built.object.updateMatrixWorld(true);
  const level = r.y + BUMPER;
  const pts: { x: number; z: number }[] = [];
  built.object.traverse((o) => {
    // The fountains' jets are spray, and the wheel's cabins are up in the air.
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const pos = o.geometry.getAttribute("position");
    const index = o.geometry.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const v = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(t + j) : t + j).applyMatrix4(o.matrixWorld));
      const cross: THREE.Vector3[] = [];
      for (let e = 0; e < 3; e++) {
        const [p, q] = [v[e], v[(e + 1) % 3]];
        if ((p.y - level) * (q.y - level) < 0) cross.push(p.clone().lerp(q, (level - p.y) / (q.y - p.y)));
      }
      if (cross.length !== 2) continue;
      const steps = Math.max(1, Math.ceil(cross[0].distanceTo(cross[1]) / 0.5));
      for (let s = 0; s <= steps; s++) {
        const p = cross[0].clone().lerp(cross[1], s / steps);
        pts.push({ x: p.x, z: p.z });
      }
    }
  });
  return pts;
}

/** A resort's masses in the world: each box's middle, its turn and half-sizes; each round's middle and radius. */
function masses(r: Resort) {
  const { rot } = resortFrame(r);
  const { boxes, rounds } = resortMasses(r);
  return {
    boxes: boxes.map((b) => ({ ...fromResort(r, b.x, b.z), a: rot + b.rot, hw: b.hw, hd: b.hd })),
    rounds: rounds.map((o) => ({ ...fromResort(r, o.x, o.z), r: o.r })),
  };
}

/** How far a point is outside the nearest of a resort's masses: negative inside. */
function outside(m: ReturnType<typeof masses>, x: number, z: number) {
  let best = Infinity;
  for (const b of m.boxes) {
    const [dx, dz] = [x - b.x, z - b.z];
    // Into the box's frame: its +x is (cos a, −sin a), its +z (sin a, cos a), as Walls has them.
    const lx = Math.abs(dx * Math.cos(b.a) - dz * Math.sin(b.a)) - b.hw;
    const lz = Math.abs(dx * Math.sin(b.a) + dz * Math.cos(b.a)) - b.hd;
    best = Math.min(best, lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz));
  }
  for (const o of m.rounds) best = Math.min(best, Math.hypot(x - o.x, z - o.z) - o.r);
  return best;
}

/** Points every metre round each mass's edge. */
function edges(m: ReturnType<typeof masses>) {
  const out: { x: number; z: number }[] = [];
  for (const b of m.boxes) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const [lx, lz] = [sx * b.hw, sz * b.hd];
      return { x: b.x + lx * Math.cos(b.a) + lz * Math.sin(b.a), z: b.z - lx * Math.sin(b.a) + lz * Math.cos(b.a) };
    });
    for (let i = 0; i < 4; i++) {
      const [p, q] = [corners[i], corners[(i + 1) % 4]];
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z)));
      for (let s = 0; s < steps; s++) out.push({ x: p.x + ((q.x - p.x) * s) / steps, z: p.z + ((q.z - p.z) * s) / steps });
    }
  }
  for (const o of m.rounds) {
    const steps = Math.max(8, Math.ceil(2 * Math.PI * o.r));
    for (let s = 0; s < steps; s++) out.push({ x: o.x + Math.cos((s / steps) * 2 * Math.PI) * o.r, z: o.z + Math.sin((s / steps) * 2 * Math.PI) * o.r });
  }
  return out;
}

describe("Las Vegas's resorts", () => {
  it.each(vegas.vegas.resorts.map((r) => [`${r.kind} at ${r.x}, ${r.z}`, r] as const))("%s: a truck runs into what's drawn, and only that", (_, r) => {
    const drawn = outline(r);
    const m = masses(r);
    expect(drawn.length).toBeGreaterThan(20);
    // Nothing drawn at a truck's height is open to drive through...
    for (const p of drawn) expect(outside(m, p.x, p.z), `drawn but open at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeLessThan(0.75);
    // ...and no wall stands where nothing's drawn.
    const cells = new Map<string, { x: number; z: number }[]>();
    const key = (x: number, z: number) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
    for (const p of drawn) {
      const k = key(p.x, p.z);
      cells.set(k, [...(cells.get(k) ?? []), p]);
    }
    const near = (x: number, z: number) => {
      let best = Infinity;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const p of cells.get(key(x + i * 2, z + j * 2)) ?? []) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
        }
      }
      return best;
    };
    for (const e of edges(m)) expect(near(e.x, e.z), `a wall with nothing drawn at ${e.x.toFixed(1)}, ${e.z.toFixed(1)}`).toBeLessThan(1.5);
  });
});

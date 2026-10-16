import * as THREE from "three";
import { PALETTE } from "./palette";
import type { World } from "./world";

/**
 * The dev panel's collider view (DevPanel.tsx): what a truck runs into round it, drawn, so
 * a wall where nothing's built, or something built with no wall, shows at a glance. Round
 * things (trees, rocks, posts, legs) are red drums their own size and height; walls, which
 * the physics meets as one huge circle touching each, are orange posts along where they
 * stand. Development builds only.
 */
export function buildColliderView() {
  const object = new THREE.Group();
  object.visible = false;
  const MAX_ROUNDS = 800;
  const MAX_POSTS = 3000;
  const drum = new THREE.MeshBasicMaterial({ color: PALETTE.dev.collider, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  const post = new THREE.MeshBasicMaterial({ color: PALETTE.dev.wall, transparent: true, opacity: 0.75, depthWrite: false });
  const rounds = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0), drum, MAX_ROUNDS);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3).translate(0, 0.5, 0), post, MAX_POSTS);
  for (const mesh of [rounds, posts]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    object.add(mesh);
  }
  const m = new THREE.Matrix4();
  let shownAt = { x: Infinity, z: Infinity, world: null as World | null };

  return {
    object,
    /** Gathers what's round (x, z) again, if the truck has moved on a bit or the world changed. */
    update(world: World, x: number, z: number, reach = 40) {
      if (shownAt.world === world && Math.hypot(x - shownAt.x, z - shownAt.z) < 3) return;
      shownAt = { x, z, world };
      const seenRounds = new Set<string>();
      const seenPosts = new Set<string>();
      let nr = 0;
      let np = 0;
      for (let dz = -reach; dz <= reach; dz += 2) {
        for (let dx = -reach; dx <= reach; dx += 2) {
          const [sx, sz] = [x + dx, z + dz];
          for (const o of world.obstaclesNear(sx, sz)) {
            if (o.r < 25) {
              const key = `${o.x.toFixed(1)},${o.z.toFixed(1)},${o.r.toFixed(2)}`;
              if (seenRounds.has(key) || nr >= MAX_ROUNDS) continue;
              seenRounds.add(key);
              const h = Number.isFinite(o.h) ? Math.max(0.3, o.h) : 3;
              rounds.setMatrixAt(nr++, m.makeScale(o.r, h, o.r).setPosition(o.x, world.height(o.x, o.z), o.z));
            } else {
              // A wall: the point on its circle nearest where we asked, which is on the wall.
              const d = Math.hypot(sx - o.x, sz - o.z);
              if (d < 1e-6) continue;
              const px = o.x + ((sx - o.x) * o.r) / d;
              const pz = o.z + ((sz - o.z) * o.r) / d;
              const key = `${Math.round(px)},${Math.round(pz)}`;
              if (seenPosts.has(key) || np >= MAX_POSTS) continue;
              seenPosts.add(key);
              posts.setMatrixAt(np++, m.makeScale(1, 2.5, 1).setPosition(px, world.height(px, pz), pz));
            }
          }
        }
      }
      rounds.count = nr;
      posts.count = np;
      rounds.instanceMatrix.needsUpdate = true;
      posts.instanceMatrix.needsUpdate = true;
    },
    /** Shows it or puts it away; shown, it's gathered afresh. */
    show(on: boolean) {
      object.visible = on;
      shownAt = { x: Infinity, z: Infinity, world: null };
    },
  };
}

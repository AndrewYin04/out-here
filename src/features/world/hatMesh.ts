// Procedural hats parented to the Kenney Person "Head" bone (and the chibi fallback).
// Sizes are in head-local units; the Person node scale (~0.45) brings a ~0.35 dome to ~0.16 m.
import * as THREE from 'three';
import type { Hat } from './avatarLook';

function mat(color: string, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.userData.hat = true;
  m.frustumCulled = false;
  return m;
}

/** A hat group in head-local space, or null for `none`. */
export function buildHat(hat: Hat): THREE.Group | null {
  if (hat === 'none') return null;
  const g = new THREE.Group();
  g.name = `hat-${hat}`;
  g.userData.hat = true;
  if (hat === 'beanie') {
    const knit = mat('#F2A900', 0.95);
    const dome = mesh(new THREE.SphereGeometry(0.32, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), knit, 0, 0.06, 0);
    const fold = mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 20), knit, 0, 0.1, 0);
    fold.rotation.x = Math.PI / 2 - 0.15;
    const pom = mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#FFFFFF'), 0, 0.38, 0);
    g.add(dome, fold, pom);
  } else if (hat === 'cap') {
    const c = mat('#E8505B', 0.55);
    const crown = mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), c, 0, 0.05, 0);
    const brim = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), c, 0, 0.12, 0.18);
    brim.scale.set(1.35, 1, 1.15);
    g.add(crown, brim);
  } else if (hat === 'bucket') {
    const c = mat('#F2A900', 0.7);
    g.add(
      mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.2, 16), c, 0, 0.16, 0),
      mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.028, 16), c, 0, 0.07, 0),
    );
  } else if (hat === 'dumpling') {
    const c = mat('#F2A900', 0.8);
    g.add(
      mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), c, 0, 0.08, 0),
      mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#FFFFFF'), 0, 0.4, 0),
    );
  } else if (hat === 'crown') {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 6), mat('#F2A900', 0.4), 0, 0.28, 0));
  }
  return g;
}

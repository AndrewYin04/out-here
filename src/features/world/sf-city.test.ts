import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { moveMeters } from './math';
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  async loadAsync() {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 2, 1); geometry.translate(0, 1, 0);
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    return { scene };
  }
} }));
import { buildSfCity, cityDistrictLayout } from './sf-city';
const origin = { lat: 37.7895, lng: -122.4078 };

describe('authored SF kit districts', () => {
  it('has bounded deterministic placements, kit roads and open central walking streets', () => {
    for (let district = 0; district < 3; district++) {
      const layout = cityDistrictLayout(district);
      expect(layout).toEqual(cityDistrictLayout(district));
      expect(layout.length).toBeLessThan(260);
      expect(layout.some(p => p.asset === 'crossroad' && p.x === 0 && p.z === 0)).toBe(true);
      expect(layout.filter(p => p.building)).toHaveLength(24);
      expect(layout.filter(p => p.building).every(p => Math.abs(p.x) > 15 && Math.abs(p.z) > 15)).toBe(true);
      expect(layout.every(p => Math.abs(p.x) <= 100 && Math.abs(p.z) <= 100 && p.size > 0)).toBe(true);
      expect(layout.filter(p => p.asset.startsWith('tower'))).toHaveLength(8);
    }
    expect(cityDistrictLayout(1).some(p => p.asset.startsWith('house'))).toBe(true);
  });
  it('bounds model placement, blocks buildings, leaves spawn clear and owns disposal', async () => {
    const centers = [{ id: 'alex', center: origin }, { id: 'maya', center: moveMeters(origin, 400, 0) }, { id: 'leo', center: moveMeters(origin, 450, 130) }];
    const city = await buildSfCity(origin, centers);
    expect(city.bounds).toHaveLength(3); expect(city.stats.drawCalls).toBeLessThanOrEqual(90);
    expect(city.stats.instances).toBeGreaterThan(600); expect(city.stats.instances).toBeLessThan(780);
    for (const center of centers) {
      expect(city.isBlocked(center.center)).toBe(false);
      expect(city.isBlocked(moveMeters(center.center, 60, 0))).toBe(false);
      expect(city.isBlocked(moveMeters(moveMeters(center.center, 19, 90), 19, 180))).toBe(true);
    }
    const meshes: THREE.InstancedMesh[] = [];
    city.group.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.InstancedMesh); });
    for (const mesh of meshes) {
      const data = mesh.instanceMatrix.array;
      expect([...data].every(Number.isFinite)).toBe(true);
      expect(Math.max(...data.map(Math.abs))).toBeLessThan(250);
    }
    const geometry = meshes[0].geometry, material = meshes[0].material as THREE.Material;
    const disposeGeometry = vi.spyOn(geometry, 'dispose'), disposeMaterial = vi.spyOn(material, 'dispose');
    city.dispose();city.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(city.group.children).toHaveLength(0);
  });
});

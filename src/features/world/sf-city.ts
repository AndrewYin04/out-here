import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LatLng } from '@/shared';
import { offsetMeters, moveMeters } from './math';

const ASSETS = {
  shopA: 'commercial/building-a', shopC: 'commercial/building-c',
  shopF: 'commercial/building-f', shopH: 'commercial/building-h',
  shopK: 'commercial/building-k', shopM: 'commercial/building-m',
  towerA: 'commercial/building-skyscraper-a', towerB: 'commercial/building-skyscraper-b', towerD: 'commercial/building-skyscraper-d',
  houseB: 'suburban/building-type-b', houseF: 'suburban/building-type-f', houseJ: 'suburban/building-type-j',
  tree: 'suburban/tree-large', treeSmall: 'suburban/tree-small', planter: 'suburban/planter',
  road: 'roads/road-straight', crossing: 'roads/road-crossing', crossroad: 'roads/road-crossroad',
  lamp: 'roads/light-curved', signal: 'roads/traffic-light', stop: 'roads/road-sign-stop',
} as const;
type Asset = keyof typeof ASSETS;
export type CityCenter = { id: string; center: LatLng };
export type CityPlacement = {
  asset: Asset; x: number; z: number; rotation: number;
  /** Width in metres for buildings, overall height for trees/props, tile width for roads. */
  size: number; tint?: string; building?: boolean;
};
// Bright, saturated tints (they multiply the kit's colour atlas, so pastels read dusty).
// From the reference cities: Kenney orange, brick and brownstone, pastel row houses, toy-town brights.
// Fully saturated, since they multiply the kit's light walls.
const TINTS = ['#E86A3A', '#3D7DCA', '#F2C14E', '#2A9D8F', '#F07C6C', '#6EC6F0', '#C8553D', '#8FD3B6', '#F6A04D', '#F28FAD', '#9ED36A', '#E8E28A'];
const SHOPS: Asset[] = ['shopA', 'shopC', 'shopF', 'shopH', 'shopK', 'shopM'];
const HOUSES: Asset[] = ['houseB', 'houseF', 'houseJ'];
const TOWERS: Asset[] = ['towerA', 'towerB', 'towerD'];
const TILE = 11, HALF = 104.5;

/** Deterministic, bounded street blocks; spawn streets remain clear in all three scenes. */
export function cityDistrictLayout(index: number): CityPlacement[] {
  const placements: CityPlacement[] = [];
  const add = (asset: Asset, x: number, z: number, size: number, rotation = 0, tint?: string, building = false) =>
    placements.push({ asset, x, z, size, rotation, tint, building });
  // The original kit road tiles include kerbs and markings. Crossings replace complete tiles.
  for (const x of [-66, 0, 66]) for (let z = -99; z <= 99; z += TILE) {
    const intersection = [-66, 0, 66].includes(z);
    add(intersection ? 'crossroad' : Math.abs(z % 66) === 11 ? 'crossing' : 'road', x, z, TILE);
  }
  for (const z of [-66, 0, 66]) for (let x = -99; x <= 99; x += TILE) {
    if ([-66, 0, 66].includes(x)) continue;
    add(Math.abs(x % 66) === 11 ? 'crossing' : 'road', x, z, TILE, Math.PI / 2);
  }
  // Four interior blocks, with storefronts facing streets, gardens in the courtyards.
  let building = 0;
  for (const x of [-33, 33]) for (const z of [-33, 33]) {
    for (const [dx, dz, angle] of [[-14, -14, Math.PI], [14, -14, Math.PI], [-14, 14, 0], [14, 14, 0]]) {
      const n = building++;
      const house = index === 1 && n % 3 === 0;
      add(house ? HOUSES[(n + index) % HOUSES.length] : SHOPS[(n + index * 2) % SHOPS.length], x + dx, z + dz, house ? 14 : 16, angle, TINTS[(n + index) % TINTS.length], true);
    }
    for (const [dx, dz] of [[-5, -4], [6, 5], [0, 9]]) add('tree', x + dx, z + dz, 7.5 + (index % 2));
    add('planter', x, z - 7, 1.4);
  }
  // The skyline is behind the shopfronts, so towers do not enclose the spawn or chat camera.
  const skyline: [number, number, number][] = [[-89, -33, 21], [89, -33, 23], [-89, 33, 18], [89, 33, 19], [-33, -89, 20], [33, -89, 22], [-33, 89, 19], [33, 89, 21]];
  skyline.forEach(([x, z, width], n) => add(TOWERS[(n + index) % 3], x, z, width, x < 0 ? Math.PI / 2 : -Math.PI / 2, TINTS[(n + index * 2) % TINTS.length], true));
  for (const road of [-66, 0, 66]) for (const along of [-88, -44, -22, 22, 44, 88]) {
    // Six-metre trees and lights have pedestrian clearance from both road and building fronts.
    add('treeSmall', road - 8, along, 5.5);
    add('lamp', road + 7.8, along, 5.5, -Math.PI / 2);
    add('treeSmall', along, road + 8, 5.8);
  }
  for (const x of [-66, 0, 66]) for (const z of [-66, 0, 66]) {
    if (x === 0 && z === 0) continue;
    add('signal', x + 7.5, z + 7.5, 3.8, Math.PI);
    add('stop', x - 7.5, z - 7.5, 2.6);
  }
  return placements;
}

type Prototype = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; bounds: THREE.Box3 };
const prototypes = new Map<Asset, Promise<Prototype | null>>();
/** Cached CPU prototypes never enter a renderer. Each scene owns its clones and textures. */
function loadAsset(asset: Asset): Promise<Prototype | null> {
  let promise = prototypes.get(asset);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(`/models/sf-city/${ASSETS[asset]}.glb`).then(gltf => {
      gltf.scene.updateMatrixWorld(true);
      let result: Prototype | null = null;
      gltf.scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!result && !Array.isArray(mesh.material)) {
          const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          geometry.computeBoundingBox();
          result = { geometry, material: mesh.material as THREE.MeshStandardMaterial, bounds: geometry.boundingBox!.clone() };
        }
        mesh.geometry.dispose();
      });
      return result;
    }).catch(() => { prototypes.delete(asset); return null; });
    prototypes.set(asset, promise);
  }
  return promise;
}

export async function buildSfCity(origin: LatLng, centers: readonly CityCenter[]) {
  const group = new THREE.Group(); group.name = 'San-Francisco-demo-blocks';
  const layouts = centers.slice(0, 3).map((_, i) => cityDistrictLayout(i));
  const used = new Set(layouts.flatMap(items => items.map(p => p.asset)));
  // A small local asset pack; network/decode is bounded rather than one fetch per instance.
  const loaded = new Map<Asset, Prototype>();
  const names = [...used];
  for (let i = 0; i < names.length; i += 4) {
    const batch = names.slice(i, i + 4);
    await Promise.all(batch.map(async name => { const value = await loadAsset(name); if (value) loaded.set(name, value); }));
  }
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const collisions: THREE.Box3[] = [];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const stats = { instances: 0, triangles: 0, drawCalls: 0 };
  const bounds: number[][][] = [];
  const groundGeometry = new THREE.BoxGeometry(1, 1, 1); geometries.add(groundGeometry);
  const paving = new THREE.MeshStandardMaterial({ color: '#F0E7D5', roughness: 1 }); materials.add(paving);
  const lawn = new THREE.MeshStandardMaterial({ color: '#79C65C', roughness: 1 }); materials.add(lawn);
  const sidewalk = new THREE.MeshStandardMaterial({ color: '#F9F0DE', roughness: 1 }); materials.add(sidewalk);
  const protos = new Map<Asset, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; bounds: THREE.Box3 }>();
  for (const [name, prototype] of loaded) {
    const geometry = prototype.geometry.clone(), material = prototype.material.clone();
    material.roughness = .82; material.metalness = 0; material.side = THREE.FrontSide;
    material.emissive.set('#FFF4D8'); material.emissiveIntensity = .03;
    if (material.map) { material.map = material.map.clone(); material.map.needsUpdate = true; textures.add(material.map); }
    geometries.add(geometry); materials.add(material); protos.set(name, { geometry, material, bounds: prototype.bounds });
  }
  const boxMesh = (parent: THREE.Group, x: number, z: number, w: number, d: number, y: number, h: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(groundGeometry, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); stats.drawCalls++; stats.triangles += 12;
  };
  centers.slice(0, 3).forEach((center, district) => {
    const offset = offsetMeters(origin, center.center);
    const block = new THREE.Group(); block.name = `SF-${center.id}`; block.position.set(offset.east, 0, -offset.north); group.add(block);
    const southWest = moveMeters(moveMeters(center.center, HALF, 270), HALF, 180);
    const northEast = moveMeters(moveMeters(center.center, HALF, 90), HALF, 0);
    bounds.push([[southWest.lng, southWest.lat], [northEast.lng, southWest.lat], [northEast.lng, northEast.lat], [southWest.lng, northEast.lat], [southWest.lng, southWest.lat]]);
    boxMesh(block, 0, 0, HALF * 2, HALF * 2, -.18, .22, paving);
    for (const x of [-33, 33]) for (const z of [-33, 33]) {
      boxMesh(block, x, z, 54, 54, .12, .18, sidewalk);
      boxMesh(block, x, z, 17, 22, .23, .12, lawn);
    }
    const items = layouts[district];
    for (const [asset, prototype] of protos) {
      const placements = items.filter(p => p.asset === asset);
      if (!placements.length) continue;
      const mesh = new THREE.InstancedMesh(prototype.geometry, prototype.material, placements.length);
      mesh.name = `Kenney-${center.id}-${asset}`;
      const extent = prototype.bounds.getSize(size);
      const width = Math.max(extent.x, extent.z), height = extent.y;
      placements.forEach((p, i) => {
        const road = ['road', 'crossroad', 'crossing'].includes(asset);
        const factor = p.size / (p.building || road ? width : height);
        const y = road ? .005 : .24;
        quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rotation);
        matrix.compose(position.set(p.x, y - prototype.bounds.min.y * factor, p.z), quaternion, size.setScalar(factor));
        mesh.setMatrixAt(i, matrix);
        // Tints multiply the kit's walls, which darkens them: lift tinted colours above 1 so they stay bright.
        mesh.setColorAt(i, p.tint ? new THREE.Color(p.tint).multiplyScalar(1.55) : new THREE.Color('#FFFFFF'));
        if (p.building) {
          const box = prototype.bounds.clone().applyMatrix4(matrix).translate(block.position);
          box.expandByScalar(.5); collisions.push(box);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox(); block.add(mesh);
      stats.instances += placements.length; stats.drawCalls++;
      stats.triangles += (prototype.geometry.index?.count ?? prototype.geometry.getAttribute('position').count) / 3 * placements.length;
    }
  });
  const point = new THREE.Vector3();
  let disposed = false;
  return {
    group, bounds, stats,
    isBlocked(p: LatLng) {
      const at = offsetMeters(origin, p); point.set(at.east, 1, -at.north);
      return collisions.some(box => box.containsPoint(point));
    },
    dispose() {
      if (disposed) return; disposed = true;
      group.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear();
    },
  };
}

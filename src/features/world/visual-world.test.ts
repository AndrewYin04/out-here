import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { treeGeometry, buildTreeBatch } from './vegetation';
import { cameraFromProjection } from './cutaway';
import { placeStreetFurniture } from './street-furniture';
import { moveMeters } from './math';
it('recovers the actual camera in the shared map metre frame, including a shifted model origin', () => {
    const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 2000);
    camera.position.set(25, 16, -38);
    camera.lookAt(3, 1, 2);
    camera.updateMatrixWorld();
    const origin = new THREE.Matrix4().makeTranslation(11, 0, -8), full = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(origin), out = new THREE.Vector3();
    expect(cameraFromProjection(full, new THREE.Matrix4(), out, new THREE.Vector4())).toBe(true);
    expect(out.distanceTo(new THREE.Vector3(14, 16, -30))).toBeLessThan(1e-8);
});
it('every rounded tree prototype is grounded, metre-normalized, bounded and coloured', () => {
    for (const kind of [0, 1, 2, 3] as const) {
        const g = treeGeometry(kind), box = g.boundingBox!;
        expect(box.min.y).toBeCloseTo(0);
        expect(box.max.y).toBeCloseTo(1);
        expect(box.max.x - box.min.x).toBeLessThan(.95);
        expect(g.getAttribute('position').count / 3).toBeLessThan(600);
        expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
        g.dispose();
    }
});
it('instanced vegetation releases each owned GPU geometry and material', () => {
    const batch = buildTreeBatch([{ x: 0, y: 0, z: 0, height: 7, tone: .1 }, { x: 5, y: 0, z: 0, height: 5, tone: .9 }]), geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    let geoDisposed = 0, matDisposed = 0;
    batch.object.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) {
        geos.add(m.geometry);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material])
            mats.add(mat);
    } });
    geos.forEach(g => g.addEventListener('dispose', () => geoDisposed++));
    mats.forEach(m => m.addEventListener('dispose', () => matDisposed++));
    batch.dispose();
    expect(geoDisposed).toBe(geos.size);
    expect(matDisposed).toBe(mats.size);
});
it('selected imported Kenney GLBs have ground pivots, unit heights and no texture dependencies', async () => {
    for (const name of ['evergreen', 'streetlight']) {
        const bytes = await readFile(`public/models/world/${name}-v1.glb`);
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        const box = new THREE.Box3().setFromObject(gltf.scene);
        expect(box.min.y).toBeCloseTo(0, 5);
        expect(box.max.y).toBeCloseTo(1, 5);
        gltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) {
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
                expect((mat as THREE.MeshStandardMaterial).map).toBeNull();
                mat.dispose();
            }
            m.geometry.dispose();
        } });
    }
});
it('streetlights follow existing road edges, keep crossing space clear and stay deterministic', () => {
    const origin = { lat: 37.4847, lng: -122.1477 }, a = moveMeters(origin, 140, 270), b = moveMeters(origin, 140, 90), c = moveMeters(origin, 100, 0), d = moveMeters(origin, 100, 180), streets = [{ coords: [[a.lng, a.lat], [b.lng, b.lat]], spacing: 28, offset: 7, width: 5.5 }, { coords: [[c.lng, c.lat], [d.lng, d.lat]], spacing: 28, offset: 7, width: 5.5 }];
    const options = { origin, center: origin, streets, blockers: [], radiusM: 300, cap: 20 };
    const placed = placeStreetFurniture(options);
    expect(placed.length).toBeGreaterThan(1);
    expect(placeStreetFurniture(options)).toEqual(placed);
    for (const p of placed) {
        expect(p.height).toBe(6.5);
        expect(Number.isFinite(p.heading)).toBe(true);
    }
});
it('only real wall/roof intersections obstruct the sightline, respecting courtyards', async () => {
    const { blocksSightline } = await import('./cutaway');
    const box = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 9, 5));
    const ring = [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]].map(([x, z]) => new THREE.Vector2(x, z)), hole = [[-3, -3], [3, -3], [3, 3], [-3, 3], [-3, -3]].map(([x, z]) => new THREE.Vector2(x, z));
    expect(blocksSightline(new THREE.Vector3(0, 4, -12), new THREE.Vector3(0, 1, 10), box, [ring])).toBe(true);
    expect(blocksSightline(new THREE.Vector3(0, 15, 0), new THREE.Vector3(0, 1, 0), box, [ring, hole])).toBe(false);
    expect(blocksSightline(new THREE.Vector3(10, 4, -12), new THREE.Vector3(10, 1, 10), box, [ring])).toBe(false);
});

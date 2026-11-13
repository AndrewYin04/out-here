import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export type SceneryAssets = {
    evergreen: THREE.BufferGeometry | null;
    streetlight: THREE.BufferGeometry | null;
};
let pending: Promise<SceneryAssets> | null = null;
/** Immutable CPU prototypes only. Each owner clones its geometry and disposes GPU resources. */
export function loadSceneryAssets() {
    return pending ??= (async () => {
        const loader = new GLTFLoader();
        const load = async (name: string) => { try {
            const gltf = await loader.loadAsync(`/models/world/${name}-v1.glb`);
            gltf.scene.updateMatrixWorld(true);
            const parts: THREE.BufferGeometry[] = [];
            gltf.scene.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh)
                return; const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld); g.deleteAttribute('uv'); g.deleteAttribute('tangent'); if (!g.hasAttribute('color'))
                g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3)); parts.push(g); const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; mats.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }); });
            const joined = mergeGeometries(parts, false);
            parts.forEach(p => p.dispose());
            return joined;
        }
        catch {
            return null;
        } };
        const [evergreen, streetlight] = await Promise.all([load('evergreen'), load('streetlight')]);
        return { evergreen, streetlight };
    })();
}

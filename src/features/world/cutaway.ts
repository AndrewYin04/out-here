import * as THREE from 'three';
export type Sightline = {
    start: {
        value: THREE.Vector3;
    };
    end: {
        value: THREE.Vector3;
    };
    fades: {
        value: Float32Array;
    };
    boxes: THREE.Box3[];
    rings: THREE.Vector2[][][];
};
export function makeSightline(): Sightline { return { start: { value: new THREE.Vector3() }, end: { value: new THREE.Vector3() }, fades: { value: new Float32Array(32).fill(1) }, boxes: [], rings: [] }; }
/** Per-building fades on the existing merged campus geometry: no extra renderer or draw calls. */
export function applySightlineCutaway(object: THREE.Object3D, sight: Sightline) {
    sight.boxes = (object.userData.worldBuildingBounds as THREE.Box3[] | undefined) ?? [];
    sight.rings = (object.userData.worldBuildingRings as THREE.Vector2[][][] | undefined) ?? [];
    object.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh || !mesh.userData.worldOccluder)
        return; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; for (const mat of materials) {
        if (mat.userData.sightline)
            continue;
        mat.userData.sightline = true;
        mat.transparent = true;
        mat.forceSinglePass = true;
        const previous = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader, renderer) => { previous.call(mat, shader, renderer); shader.uniforms.uBuildingFade = sight.fades; shader.vertexShader = 'attribute float worldBuildingId;varying float vBuildingId;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBuildingId=worldBuildingId;'); shader.fragmentShader = 'varying float vBuildingId;uniform float uBuildingFade[32];\n' + shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a*=uBuildingFade[int(clamp(floor(vBuildingId+0.5),0.0,31.0))];\n#include <opaque_fragment>'); };
        mat.customProgramCacheKey = () => 'world-building-fade-v2';
        mat.needsUpdate = true;
    } });
}
/** Recover the perspective camera centre from the existing map's local-to-clip transform. */
export function cameraFromProjection(localToClip: THREE.Matrix4, inverse: THREE.Matrix4, out: THREE.Vector3, scratch: THREE.Vector4): boolean {
    inverse.copy(localToClip).invert();
    scratch.set(0, 0, 1, 0).applyMatrix4(inverse);
    if (Math.abs(scratch.w) < 1e-14)
        return false;
    out.set(scratch.x / scratch.w, scratch.y / scratch.w, scratch.z / scratch.w);
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
}
/** Exact wall/roof intersections avoid fading a whole U-shaped footprint across an open courtyard. */
export function blocksSightline(start: THREE.Vector3, end: THREE.Vector3, box: THREE.Box3, rings: THREE.Vector2[][]): boolean {
    const inside = (x: number, z: number) => { const ringContains = (ring: THREE.Vector2[]) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x)
            hit = !hit;
    } return hit; }; return !!rings.length && ringContains(rings[0]) && !rings.slice(1).some(ringContains); };
    if (inside(start.x, start.z) && start.y >= box.min.y && start.y <= box.max.y)
        return true;
    const dx = end.x - start.x, dz = end.z - start.z, dy = end.y - start.y;
    if (Math.abs(dy) > .0001) {
        const t = (box.max.y - start.y) / dy;
        if (t > 0 && t < .99 && inside(start.x + dx * t, start.z + dz * t))
            return true;
    }
    for (const ring of rings)
        for (let i = 1; i < ring.length; i++) {
            const a = ring[i - 1], b = ring[i], ex = b.x - a.x, ez = b.y - a.y, den = dx * ez - dz * ex;
            if (Math.abs(den) < .00001)
                continue;
            const ax = a.x - start.x, az = a.y - start.z, t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den, y = start.y + dy * t;
            if (t > 0 && t < .99 && u >= 0 && u <= 1 && y >= box.min.y && y <= box.max.y)
                return true;
        }
    return false;
}

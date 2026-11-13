import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export type TreeKind = 0 | 1 | 2 | 3;
export type LocalTree = {
    x: number;
    y: number;
    z: number;
    height: number;
    tone: number;
    kind?: TreeKind;
};
export type TreeBatch = {
    object: THREE.Group;
    dispose: () => void;
};
const LEAVES = ['#63845B', '#597C59', '#4D7355', '#769365'].map(c => new THREE.Color(c));
/** All prototypes are ground-pivoted and exactly one metre high; instances provide real metres. */
export function treeGeometry(kind: TreeKind, evergreen?: THREE.BufferGeometry | null, detail = 1): THREE.BufferGeometry {
    if (kind === 2 && evergreen)
        return evergreen.clone();
    const parts: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, scale: THREE.Vector3, pos: THREE.Vector3, wood = false) => {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        geo.dispose();
        g.scale(scale.x, scale.y, scale.z).translate(pos.x, pos.y, pos.z);
        g.deleteAttribute('uv');
        const points = g.getAttribute('position'), colors = new Float32Array(points.count * 3), c = new THREE.Color(), base = wood ? new THREE.Color('#887254') : LEAVES[kind];
        for (let i = 0; i < points.count; i++) {
            c.copy(base).multiplyScalar(wood ? 1 : .79 + Math.max(0, points.getY(i)) * .28);
            c.toArray(colors, i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        parts.push(g);
    };
    add(new THREE.CylinderGeometry(.012, .022, .49, 7), new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, .245, 0), true);
    if (kind === 2) {
        for (let n = 0; n < 3; n++)
            add(new THREE.ConeGeometry(.22 - n * .035, .4, 10), new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, .4 + n * .2, 0));
    }
    else {
        const broad = kind === 1 ? 1.25 : kind === 3 ? .84 : 1;
        for (const [x, y, z, r] of [[-.12, .64, .015, .22], [.11, .68, .015, .23], [.025, .76, -.1, .22], [-.01, .82, .055, .18], [.01, .58, .07, .22]])
            add(new THREE.IcosahedronGeometry(1, detail), new THREE.Vector3(r * broad, r * .9, r * .88 * broad), new THREE.Vector3(x * broad, y, z * broad));
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach(g => g.dispose());
    merged.computeBoundingBox();
    const b = merged.boundingBox!, h = b.max.y - b.min.y;
    merged.translate(0, -b.min.y, 0).scale(1 / h, 1 / h, 1 / h);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
}
/** Four instanced variants and one contact-shadow pass, including mapped campus trees. */
export function buildTreeBatch(trees: LocalTree[], evergreen?: THREE.BufferGeometry | null): TreeBatch {
    const object = new THREE.Group();
    object.name = 'world-vegetation';
    const owned: {
        dispose: () => void;
    }[] = [];
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
    owned.push(material);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), scale = new THREE.Vector3(), tint = new THREE.Color();
    for (let kind = 0; kind < 4; kind++)
        for (const detail of [0, 1]) {
            const list = trees.filter(t => (t.kind ?? Math.min(3, Math.floor(t.tone * 4))) === kind && (Math.hypot(t.x, t.z) < 120 ? 1 : 0) === detail);
            if (!list.length)
                continue;
            const geometry = treeGeometry(kind as TreeKind, evergreen, detail);
            owned.push(geometry);
            const mesh = new THREE.InstancedMesh(geometry, material, list.length);
            mesh.name = `trees-${kind}`;
            list.forEach((t, i) => { q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.tone * Math.PI * 2); v.set(t.x, t.y, t.z); scale.set(t.height * (.92 + t.tone * .15), t.height, t.height * (.95 + t.tone * .1)); m.compose(v, q, scale); mesh.setMatrixAt(i, m); mesh.setColorAt(i, tint.setRGB(.9 + t.tone * .1, .94 + t.tone * .06, .9 + t.tone * .1)); });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor)
                mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
            object.add(mesh);
            owned.push(mesh);
        }
    if (trees.length && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
            gradient.addColorStop(0, 'rgba(25,44,28,.18)');
            gradient.addColorStop(1, 'rgba(25,44,28,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 32, 32);
        }
        const texture = new THREE.CanvasTexture(canvas), geo = new THREE.PlaneGeometry(1, 1), mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
        owned.push(texture, geo, mat);
        const shadows = new THREE.InstancedMesh(geo, mat, trees.length);
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        trees.forEach((t, i) => { m.compose(v.set(t.x, t.y + .035, t.z), q, scale.set(t.height * .53, t.height * .53, 1)); shadows.setMatrixAt(i, m); });
        shadows.instanceMatrix.needsUpdate = true;
        shadows.computeBoundingSphere();
        object.add(shadows);
        owned.push(shadows);
    }
    return { object, dispose: () => owned.forEach(r => r.dispose()) };
}

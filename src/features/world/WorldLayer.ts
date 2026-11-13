// The three.js scene drawn inside MapLibre's WebGL context as a custom layer, so characters
// share depth with the 3D buildings. One scene, positioned in meters east/north of an origin
// point; the map's projection matrix times the origin's model transform is the camera.
//
// Local frame (after the transform below): x = east, y = up, z = south, in meters.
// A model faces +Z (south) unrotated, so a compass heading h is rotation.y = PI - h.
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';
import * as THREE from 'three';
import type { LatLng } from '@/shared';
import { makeAvatar, makePet, type Character, type ModelSet } from './characters';
import { characterScale, offsetMeters } from './math';
import { MuseTrail, type MuseTrailModeSetting } from './muse-trail';
import type { TreeSpot } from './trees';

export type ActorKind = 'avatar' | 'pet';
type Actor = {
  kind: ActorKind;
  seed: string;
  char: Character;
  pos: LatLng;
  heading: number;
  /** Meters above the ground, before the zoom scale. */
  altitude: number;
  /** The DOM label kept above this actor's head. */
  label: HTMLElement | null;
  labelLift: number;
  /** Muse's energy wake (pets only). Lives in the characters scene, in world space. */
  trail: MuseTrail | null;
};
export type BeaconSpec = { id: string; pos: LatLng; color: string; height: number; strong: boolean };
type Beacon = { spec: BeaconSpec; group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh };

const toRad = (d: number) => (d * Math.PI) / 180;

export class WorldLayer implements CustomLayerInterface {
  readonly id = 'oh-world';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  /** Trees and beacons: depth-tested against the 3D buildings. */
  private scene = new THREE.Scene();
  /** Characters: drawn after a depth clear, so a building never hides you (as in Pokémon GO). */
  private charScene = new THREE.Scene();
  private camera = new THREE.Camera();
  private actors = new Map<string, Actor>();
  private beacons = new Map<string, Beacon>();
  private beaconGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  private ringGeo = new THREE.RingGeometry(0.75, 1, 32);
  private origin: LatLng;
  private originMerc: MercatorCoordinate;
  private models: ModelSet | null = null;
  private clock = new THREE.Timer();
  private elapsed = 0;
  private full = new THREE.Matrix4();
  private tmp = new THREE.Vector4();
  private trailPos = new THREE.Vector3();
  private trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1, 6);
  private canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  private trunkMat = new THREE.MeshStandardMaterial({ color: '#8A6A4F', roughness: 0.9 });
  private canopyMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, flatShading: true });
  private trunks: THREE.InstancedMesh | null = null;
  private statics = new Map<string, THREE.Object3D>();
  private anchors = new Map<string, { pos: LatLng; altitude: number; el: HTMLElement }>();
  private canopies: THREE.InstancedMesh | null = null;
  /** Characters are drawn only at or above this zoom. */
  minZoom = 0;

  constructor(origin: LatLng) {
    this.origin = origin;
    this.originMerc = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8d8d8d', 2.2));
    this.charScene.add(new THREE.HemisphereLight('#ffffff', '#8d8d8d', 2.2));
    const sun2 = new THREE.DirectionalLight('#ffffff', 1.6);
    sun2.position.set(-40, 100, 60);
    this.charScene.add(sun2);
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-40, 100, 60);
    this.scene.add(sun);
  }

  /** Swap in loaded models; existing placeholder characters are rebuilt from them. */
  setModels(models: ModelSet) {
    this.models = models;
    // Loop over a copy: each actor is removed and re-added, and a live Map iterator would visit
    // the re-added entries again forever.
    for (const [id, a] of [...this.actors]) {
      const label = a.label;
      this.removeActor(id);
      this.upsertActor(id, a.kind, a.seed);
      this.setPose(id, a.pos, a.heading, a.altitude);
      this.bindLabel(id, label, a.labelLift);
    }
  }

  upsertActor(id: string, kind: ActorKind, seed: string) {
    if (this.actors.has(id)) return;
    const char = kind === 'pet' ? makePet(this.models, seed) : makeAvatar(this.models, seed);
    char.root.traverse((o) => { o.frustumCulled = false; });
    this.charScene.add(char.root);
    const trail = kind === 'pet' ? new MuseTrail() : null;
    if (trail) this.charScene.add(trail.object);
    this.actors.set(id, { kind, seed, char, pos: this.origin, heading: 0, altitude: 0, label: null, labelLift: 0, trail });
  }

  removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.charScene.remove(a.char.root);
    a.trail?.dispose();
    a.char.dispose();
    if (a.label) a.label.style.visibility = 'hidden';
    this.actors.delete(id);
  }

  actorIds(): string[] { return [...this.actors.keys()]; }

  setPose(id: string, pos: LatLng, heading: number, altitude = 0) {
    const a = this.actors.get(id);
    if (!a) return;
    a.pos = pos; a.heading = heading; a.altitude = altitude;
  }

  setState(id: string, state: string) { this.actors.get(id)?.char.setState(state); }

  /** Muse's wake follows its speed by default ('auto'); force a look for scripted moves. */
  setTrailMode(id: string, mode: MuseTrailModeSetting) { this.actors.get(id)?.trail?.setMode(mode); }

  /** Keep `el` positioned above the actor's head (CSS transform), or stop when el is null. */
  bindLabel(id: string, el: HTMLElement | null, liftMeters = 0.25) {
    const a = this.actors.get(id);
    if (!a) return;
    if (a.label && a.label !== el) a.label.style.visibility = 'hidden';
    a.label = el;
    a.labelLift = liftMeters;
  }

  /** The point the local frame is measured from (east/north meters). */
  getOrigin(): LatLng { return this.origin; }

  /** Scenery built in the local frame (Meta HQ). Depth-tested against the map's buildings. */
  setStatic(key: string, obj: THREE.Object3D | null) {
    const old = this.statics.get(key);
    if (old) { this.scene.remove(old); this.statics.delete(key); }
    if (obj) { this.scene.add(obj); this.statics.set(key, obj); }
  }

  /** Keep `el` above a fixed point (`altitude` meters, real size), or stop when el is null. */
  bindAnchor(id: string, pos: LatLng, altitude: number, el: HTMLElement | null) {
    const old = this.anchors.get(id);
    if (old && old.el !== el) old.el.style.visibility = 'hidden';
    if (el) this.anchors.set(id, { pos, altitude, el }); else this.anchors.delete(id);
  }

  /** Low-poly trees (two instanced meshes, so hundreds cost two draw calls). Real size, not zoom-scaled. */
  setTrees(spots: TreeSpot[]) {
    for (const m of [this.trunks, this.canopies]) { if (m) { this.scene.remove(m); m.dispose(); } }
    this.trunks = null;
    this.canopies = null;
    if (spots.length === 0) return;
    const trunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, spots.length);
    const canopies = new THREE.InstancedMesh(this.canopyGeo, this.canopyMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const greens = [new THREE.Color('#5DAE4B'), new THREE.Color('#6FBF55'), new THREE.Color('#4E9E45'), new THREE.Color('#82C35E')];
    spots.forEach((t, i) => {
      const o = offsetMeters(this.origin, t);
      const h = t.height;
      m.compose(new THREE.Vector3(o.east, h * 0.22, -o.north), q, new THREE.Vector3(h * 0.9, h * 0.44, h * 0.9));
      trunks.setMatrixAt(i, m);
      q.setFromEuler(new THREE.Euler(0, t.tone * Math.PI * 2, 0));
      m.compose(new THREE.Vector3(o.east, h * 0.62, -o.north), q, new THREE.Vector3(h * 0.34, h * 0.42, h * 0.34));
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, greens[Math.floor(t.tone * greens.length) % greens.length]);
      q.identity();
    });
    for (const mesh of [trunks, canopies]) { mesh.frustumCulled = false; mesh.instanceMatrix.needsUpdate = true; this.scene.add(mesh); }
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    this.trunks = trunks;
    this.canopies = canopies;
  }

  setBeacons(specs: BeaconSpec[]) {
    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.id);
      let b = this.beacons.get(spec.id);
      if (!b) {
        const beamMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(this.beaconGeo, beamMat);
        const ring = new THREE.Mesh(this.ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        const group = new THREE.Group();
        group.add(beam, ring);
        group.traverse((o) => { o.frustumCulled = false; });
        this.scene.add(group);
        b = { spec, group, beam, ring };
        this.beacons.set(spec.id, b);
      }
      b.spec = spec;
      (b.beam.material as THREE.MeshBasicMaterial).color.set(spec.color);
      (b.ring.material as THREE.MeshBasicMaterial).color.set(spec.color);
    }
    for (const [id, b] of this.beacons) {
      if (seen.has(id)) continue;
      this.scene.remove(b.group);
      (b.beam.material as THREE.Material).dispose();
      (b.ring.material as THREE.Material).dispose();
      this.beacons.delete(id);
    }
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }

  onRemove() {
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    this.setBeacons([]);
    this.setTrees([]);
    for (const key of [...this.statics.keys()]) this.setStatic(key, null);
    this.trunkGeo.dispose(); this.canopyGeo.dispose(); this.trunkMat.dispose(); this.canopyMat.dispose();
    this.beaconGeo.dispose();
    this.ringGeo.dispose();
    // The renderer shares MapLibre's context; dispose only three's own resources.
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
    const map = this.map;
    const renderer = this.renderer;
    if (!map || !renderer) return;
    this.clock.update();
    const dt = Math.min(0.1, this.clock.getDelta());
    this.elapsed += dt;

    const zoom = map.getZoom();
    const scale = characterScale(zoom);
    const showChars = zoom >= this.minZoom;
    if (this.trunks) this.trunks.visible = showChars;
    if (this.canopies) this.canopies.visible = showChars;
    for (const o of this.statics.values()) o.visible = zoom >= 14.5;
    const m = this.originMerc.meterInMercatorCoordinateUnits();
    const model = new THREE.Matrix4()
      .makeTranslation(this.originMerc.x, this.originMerc.y, this.originMerc.z ?? 0)
      .scale(new THREE.Vector3(m, -m, m))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.full.fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
    this.camera.projectionMatrix.copy(this.full);

    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    for (const a of this.actors.values()) {
      const o = offsetMeters(this.origin, a.pos);
      const s = a.kind === 'pet' ? scale * 0.9 : scale;
      a.char.root.visible = showChars;
      a.char.root.position.set(o.east, a.altitude * scale, -o.north);
      a.char.root.rotation.set(0, Math.PI - toRad(a.heading), 0);
      a.char.root.scale.setScalar(s);
      a.char.update(dt, this.elapsed);
      if (a.trail) {
        if (showChars) {
          // Muse's actual world position (its centre), never a separate simulation. Vertical motion is
          // ignored: height here is altitude x zoom scale, which changes while zooming.
          this.trailPos.set(o.east, a.altitude * scale + a.char.height * s * 0.5, -o.north);
          a.trail.update(this.trailPos, dt, { camera: this.full, scale: s, verticalWeight: 0 });
        } else a.trail.object.visible = false;
      }
      if (a.label) {
        // Project the point just above the head into screen pixels.
        const y = a.altitude * scale + (a.char.height + a.labelLift) * s;
        this.tmp.set(o.east, y, -o.north, 1).applyMatrix4(this.full);
        const visible = showChars && this.tmp.w > 0;
        if (visible) {
          const x = ((this.tmp.x / this.tmp.w + 1) / 2) * w;
          const py = ((1 - this.tmp.y / this.tmp.w) / 2) * h;
          a.label.style.transform = `translate(${x.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
          a.label.style.visibility = x > -200 && x < w + 200 && py > -100 && py < h + 200 ? 'visible' : 'hidden';
        } else {
          a.label.style.visibility = 'hidden';
        }
      }
    }

    for (const a of this.anchors.values()) {
      const o = offsetMeters(this.origin, a.pos);
      this.tmp.set(o.east, a.altitude, -o.north, 1).applyMatrix4(this.full);
      if (this.tmp.w <= 0 || zoom < 14.5) { a.el.style.visibility = 'hidden'; continue; }
      const x = ((this.tmp.x / this.tmp.w + 1) / 2) * w;
      const py = ((1 - this.tmp.y / this.tmp.w) / 2) * h;
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      a.el.style.visibility = x > -100 && x < w + 100 && py > -50 && py < h + 50 ? 'visible' : 'hidden';
    }

    const pulse = 0.5 + Math.sin(this.elapsed * 3) * 0.5;
    for (const b of this.beacons.values()) {
      const o = offsetMeters(this.origin, b.spec.pos);
      const radius = b.spec.strong ? 4.5 : 3;
      b.group.position.set(o.east, 0, -o.north);
      b.beam.scale.set(radius, b.spec.height, radius);
      b.beam.position.y = b.spec.height / 2;
      b.ring.scale.setScalar(radius * (b.spec.strong ? 2.2 + pulse * 0.8 : 1.8));
      b.ring.position.y = 0.3;
      (b.beam.material as THREE.MeshBasicMaterial).opacity = b.spec.strong ? 0.3 + pulse * 0.2 : 0.22;
      (b.ring.material as THREE.MeshBasicMaterial).opacity = b.spec.strong ? 0.55 - pulse * 0.3 : 0.35;
    }

    renderer.resetState();
    renderer.render(this.scene, this.camera);
    // This layer is the top one, so clearing depth here only affects the characters below.
    renderer.clearDepth();
    renderer.render(this.charScene, this.camera);
    map.triggerRepaint();
  }
}

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
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private actors = new Map<string, Actor>();
  private beacons = new Map<string, Beacon>();
  private beaconGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  private ringGeo = new THREE.RingGeometry(0.75, 1, 32);
  private origin: LatLng;
  private originMerc: MercatorCoordinate;
  private models: ModelSet | null = null;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private full = new THREE.Matrix4();
  private tmp = new THREE.Vector4();
  /** Characters are drawn only at or above this zoom. */
  minZoom = 0;

  constructor(origin: LatLng) {
    this.origin = origin;
    this.originMerc = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8d8d8d', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-40, 100, 60);
    this.scene.add(sun);
  }

  /** Swap in loaded models; existing placeholder characters are rebuilt from them. */
  setModels(models: ModelSet) {
    this.models = models;
    for (const [id, a] of this.actors) {
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
    this.scene.add(char.root);
    this.actors.set(id, { kind, seed, char, pos: this.origin, heading: 0, altitude: 0, label: null, labelLift: 0 });
  }

  removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.char.root);
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

  /** Keep `el` positioned above the actor's head (CSS transform), or stop when el is null. */
  bindLabel(id: string, el: HTMLElement | null, liftMeters = 0.25) {
    const a = this.actors.get(id);
    if (!a) return;
    if (a.label && a.label !== el) a.label.style.visibility = 'hidden';
    a.label = el;
    a.labelLift = liftMeters;
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
    this.clock.start();
  }

  onRemove() {
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    this.setBeacons([]);
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
    const dt = Math.min(0.1, this.clock.getDelta());
    this.elapsed += dt;

    const zoom = map.getZoom();
    const scale = characterScale(zoom);
    const showChars = zoom >= this.minZoom;
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
    map.triggerRepaint();
  }
}

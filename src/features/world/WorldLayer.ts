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
import { stadiumSeats } from './stadiums';
import type { TreeSpot } from './trees';
import {buildTreeBatch,type TreeBatch} from './vegetation';
import {loadSceneryAssets,type SceneryAssets} from './scenery-assets';
import type {StreetLamp} from './street-furniture';
import {makeSightline,applySightlineCutaway,cameraFromProjection,blocksSightline} from './cutaway';

export type ActorKind = 'avatar' | 'pet';
type Actor = {
  kind: ActorKind;
  seed: string;
  char: Character;
  pos: LatLng;
  heading: number;
  state:string;
  posed:boolean;
  /** Meters above the ground, before the zoom scale. */
  altitude: number;
  /** The DOM label kept above this actor's head. */
  label: HTMLElement | null;
  labelLift: number;
  /** Muse's energy wake (pets only). Lives in the characters scene, in world space. */
  trail: MuseTrail | null;
  /** A soft ground shadow (avatars). Depth-tested in the main scene, so buildings still cover it. */
  shadow: THREE.Mesh | null;
};
export type BeaconSpec = {
  id: string; pos: LatLng; color: string; height: number; strong: boolean;
  /** Stadium seats (#23): one per spot, the taken ones filled. Omitted = beam only. */
  capacity?: number; taken?: number;
  /** A Muse pick: the arena gets a gold ring. */
  pick?: boolean;
};
type Beacon = {
  spec: BeaconSpec; group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh;
  /** The arena: stands, a gold ring for picks, and the seats (rebuilt when the counts change). */
  arena: THREE.Group; gold: THREE.Mesh; seats: THREE.InstancedMesh | null; seatKey: string;
};

/** Arena size in meters (real size; it sits on the street, like the HQ buildings). */
const ARENA_R = 10;
const TIER_STEP = 3.4;
const STAND_H = 2.6;
const SEAT_OPEN = new THREE.Color('#FFFFFF');
const GOLD = '#F5B800';

const toRad = (d: number) => (d * Math.PI) / 180;

/** The arena floor: a pale court with the plan's color as a soft band at the rim and a center ring. */
const floorTextures = new Map<string, THREE.CanvasTexture>();
function arenaFloorTexture(color: string): THREE.CanvasTexture {
  const hit = floorTextures.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, '#FFFFFF');
  r.addColorStop(0.8, '#FBF8F2');
  r.addColorStop(0.9, color);
  r.addColorStop(1, color);
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.35;
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.beginPath(); g.arc(128, 128, 34, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 226); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  floorTextures.set(color, t);
  return t;
}

/** A soft round shadow: dark in the middle, fading to nothing at the edge. */
function shadowTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(10, 20, 35, 0.42)');
    grad.addColorStop(0.55, 'rgba(10, 20, 35, 0.22)');
    grad.addColorStop(1, 'rgba(10, 20, 35, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
  private standGeo = new THREE.CylinderGeometry(ARENA_R + TIER_STEP * 2, ARENA_R - 0.5, 1, 32, 1, true);
  private floorGeo = new THREE.CircleGeometry(ARENA_R - 0.5, 32);
  // Round stools read as seats; boxes read as crates.
  private seatGeo = new THREE.CylinderGeometry(0.9, 1.0, 1.1, 14);
  private standMat = new THREE.MeshStandardMaterial({ color: '#F4F6FA', roughness: 0.6, side: THREE.DoubleSide });
  private seatMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5, emissive: '#FFFFFF', emissiveIntensity: 0.25 });
  private origin: LatLng;
  private originMerc: MercatorCoordinate;
  private models: ModelSet | null = null;
  private clock = new THREE.Timer();
  private elapsed = 0;
  private motionQuery=typeof window==='undefined'?null:window.matchMedia('(prefers-reduced-motion: reduce)');
  private full = new THREE.Matrix4();
  private inverse=new THREE.Matrix4();
  private eyeScratch=new THREE.Vector4();
  private sight=makeSightline();
  private focusActor='me';
  private focusScreen={x:0,y:0,elevation:0};
  private sightRay=new THREE.Ray();
  private sightDirection=new THREE.Vector3();
  private sightHit=new THREE.Vector3();
  private modelMatrix = new THREE.Matrix4();
  private tmp = new THREE.Vector4();
  private trailPos = new THREE.Vector3();
  private trailAnchor = new THREE.Vector3();
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  private vegetation:TreeBatch|null=null;
  private treeSpots:TreeSpot[]=[];
  private scenery:SceneryAssets|null=null;
  private disposed=false;
  private furniture:THREE.InstancedMesh|null=null;
  private lamps:StreetLamp[]=[];
  private statics = new Map<string, THREE.Object3D>();
  private anchors = new Map<string, { pos: LatLng; altitude: number; el: HTMLElement }>();
  /** Measured label sizes (refreshed every 20 frames) for the overlap check. */
  private labelSize = new WeakMap<HTMLElement, [number, number]>();
  private frameCount = 0;
  /** Characters are drawn only at or above this zoom. */
  minZoom = 0;

  constructor(origin: LatLng) {
    this.origin = origin;
    this.originMerc = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
    const m=this.originMerc.meterInMercatorCoordinateUnits();
    this.modelMatrix.makeTranslation(this.originMerc.x,this.originMerc.y,this.originMerc.z??0).scale(new THREE.Vector3(m,-m,m)).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2));
    // Sunny afternoon: a blue sky fill from above, warm bounce from the grass, and a golden sun.
    this.scene.add(new THREE.HemisphereLight('#CFE8FF', '#B9DC9A', 1.15));
    this.charScene.add(new THREE.HemisphereLight('#CFE8FF', '#B9DC9A', 1.15));
    const sun2 = new THREE.DirectionalLight('#FFE9C4', 2.6);
    sun2.position.set(-5,8,7);
    this.charScene.add(sun2);
    const sun = new THREE.DirectionalLight('#FFE9C4', 2.6);
    sun.position.set(-5,8,7);
    this.scene.add(sun);
  }

  /** Swap in loaded models; existing placeholder characters are rebuilt from them. */
  setModels(models: ModelSet) {
    this.models = models;
    for (const a of this.actors.values()) {
      const previous=a.char;
      const next=a.kind==='pet'?makePet(models,a.seed):makeAvatar(models,a.seed);
      next.root.position.copy(previous.root.position);next.root.quaternion.copy(previous.root.quaternion);next.root.scale.copy(previous.root.scale);
      next.root.traverse(o=>{o.frustumCulled=!(o as THREE.SkinnedMesh).isSkinnedMesh;});
      next.setState(a.state);
      this.charScene.remove(previous.root);previous.dispose();a.char=next;this.charScene.add(next.root);
    }
  }

  upsertActor(id: string, kind: ActorKind, seed: string) {
    if (this.actors.has(id)) return;
    const char = kind === 'pet' ? makePet(this.models, seed) : makeAvatar(this.models, seed);
    char.root.traverse((o) => { o.frustumCulled = !(o as THREE.SkinnedMesh).isSkinnedMesh; });
    this.charScene.add(char.root);
    // The walking view gets the calm wake; the showpiece style is for flights and later animations.
    const trail = kind === 'pet' ? new MuseTrail({ style: 'walk' }) : null;
    if (trail) this.charScene.add(trail.object);
    let shadow: THREE.Mesh | null = null;
    if (kind === 'avatar') {
      shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 1;
      shadow.frustumCulled = false;
      this.scene.add(shadow);
    }
    this.actors.set(id, { kind, seed, char, pos: this.origin, heading: 0, state:kind==='pet'?'hover':'idle',posed:false,altitude: 0, label: null, labelLift: 0, trail, shadow });
  }

  removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.charScene.remove(a.char.root);
    a.trail?.dispose();
    if (a.shadow) this.scene.remove(a.shadow);
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

  setState(id: string, state: string) { const a=this.actors.get(id);if(!a||(a.state===state&&!['wave','happy','celebrate'].includes(state)))return;a.state=state;a.char.setState(state); }

  /** Muse's wake follows its speed by default ('auto'); force a look for scripted moves. */
  setTrailMode(id: string, mode: MuseTrailModeSetting) { this.actors.get(id)?.trail?.setMode(mode); }

  sendMusePulse(fromId: string, toId: string): void {
    const from=this.actors.get(fromId), to=this.actors.get(toId);
    if (!from?.trail || !to || !from.char.getEffectCenter || !to.char.getEffectCenter) return;
    from.char.getEffectCenter(this.trailPos); to.char.getEffectCenter(this.trailAnchor);
    from.trail.sendPulse(this.trailPos, this.trailAnchor);
  }
  setMuseTrailStyle(id: string, style: 'walk' | 'full') { this.actors.get(id)?.trail?.setConfig({style, seed:id, ...(id.startsWith('muse:') ? {brightBlue:'#23D9F5',cyanAccent:'#B8F7FF'} : {})}); }

  setProcessing(id: string, phase: 'off' | 'pending' | 'success' | 'fade') { this.actors.get(id)?.trail?.setProcessing(phase); }

  /** Actual animated body centre, in map-canvas pixels, for the existing camera rig. */
  actorScreenPoint(id: string, out: { x: number; y: number; elevation: number }): boolean {
    const actor = this.actors.get(id), canvas = this.map?.getCanvas();
    if (!actor || !canvas || !actor.char.getEffectCenter) return false;
    actor.char.getEffectCenter(this.trailPos);
    out.elevation = this.trailPos.y;
    this.tmp.set(this.trailPos.x, this.trailPos.y, this.trailPos.z, 1).applyMatrix4(this.full);
    if (this.tmp.w <= 0) return false;
    out.x = (this.tmp.x / this.tmp.w + 1) * canvas.clientWidth / 2;
    out.y = (1 - this.tmp.y / this.tmp.w) * canvas.clientHeight / 2;
    return Number.isFinite(out.x) && Number.isFinite(out.y);
  }

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

  setFocusActor(id:string){this.focusActor=id;}

  /** Scenery built in the local frame (Meta HQ). Depth-tested against the map's buildings. */
  setStatic(key: string, obj: THREE.Object3D | null) {
    const old = this.statics.get(key);
    if (old) { this.scene.remove(old); this.statics.delete(key); }
    if(key==='hq'&&!obj){this.sight.boxes=[];this.sight.rings=[];}
    if (obj) { applySightlineCutaway(obj,this.sight);this.scene.add(obj); this.statics.set(key, obj); }
  }

  /** Keep `el` above a fixed point (`altitude` meters, real size), or stop when el is null. */
  bindAnchor(id: string, pos: LatLng, altitude: number, el: HTMLElement | null) {
    const old = this.anchors.get(id);
    if (old && old.el !== el) old.el.style.visibility = 'hidden';
    if (el) this.anchors.set(id, { pos, altitude, el }); else this.anchors.delete(id);
  }

  /** Shared rounded prototypes, independently instanced at real metre dimensions. */
  setTrees(spots:TreeSpot[]){
    this.treeSpots=spots;this.vegetation?.dispose();if(this.vegetation)this.scene.remove(this.vegetation.object);
    this.vegetation=null;if(!spots.length)return;
    this.vegetation=buildTreeBatch(spots.map(t=>{const o=offsetMeters(this.origin,t);return{x:o.east,y:0,z:-o.north,height:t.height,tone:t.tone,kind:t.kind};}),this.scenery?.evergreen);
    this.scene.add(this.vegetation.object);
  }

  setStreetFurniture(spots:StreetLamp[]){
    this.lamps=spots;if(this.furniture){this.scene.remove(this.furniture);this.furniture.geometry.dispose();(this.furniture.material as THREE.Material).dispose();this.furniture.dispose();this.furniture=null;}
    if(!spots.length||!this.scenery?.streetlight)return;
    const geo=this.scenery.streetlight.clone(),mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),mesh=new THREE.InstancedMesh(geo,mat,spots.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();
    spots.forEach((lamp,i)=>{const o=offsetMeters(this.origin,lamp);m.compose(p.set(o.east,0,-o.north),q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,lamp.heading),s.setScalar(lamp.height));mesh.setMatrixAt(i,m);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.name='Kenney-streetlights';this.scene.add(mesh);this.furniture=mesh;
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
        const arena = new THREE.Group();
        const stands = new THREE.Mesh(this.standGeo, this.standMat);
        stands.scale.y = STAND_H;
        stands.position.y = STAND_H / 2;
        const floor = new THREE.Mesh(this.floorGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.15;
        floor.name = 'floor';
        const gold = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        gold.rotation.x = -Math.PI / 2;
        gold.position.y = 0.4;
        gold.scale.setScalar(ARENA_R + TIER_STEP * 2 + 2.5);
        arena.add(stands, floor, gold);
        const group = new THREE.Group();
        group.add(beam, ring, arena);
        group.traverse((o) => { o.frustumCulled = false; });
        this.scene.add(group);
        b = { spec, group, beam, ring, arena, gold, seats: null, seatKey: '' };
        this.beacons.set(spec.id, b);
      }
      b.spec = spec;
      (b.beam.material as THREE.MeshBasicMaterial).color.set(spec.color);
      (b.ring.material as THREE.MeshBasicMaterial).color.set(spec.color);
      const floorMat = (b.arena.getObjectByName('floor') as THREE.Mesh).material as THREE.MeshStandardMaterial;
      floorMat.color.set('#FFFFFF');
      const tex = arenaFloorTexture(spec.color);
      if (floorMat.map !== tex) { floorMat.map = tex; floorMat.needsUpdate = true; }
      b.arena.visible = spec.capacity != null;
      b.gold.visible = !!spec.pick;
      this.setSeats(b);
    }
    for (const [id, b] of this.beacons) {
      if (seen.has(id)) continue;
      this.scene.remove(b.group);
      (b.beam.material as THREE.Material).dispose();
      (b.ring.material as THREE.Material).dispose();
      (b.gold.material as THREE.Material).dispose();
      ((b.arena.getObjectByName('floor') as THREE.Mesh).material as THREE.Material).dispose();
      b.seats?.dispose();
      this.beacons.delete(id);
    }
  }

  /** One seat per spot around the arena: open seats white and lit, taken seats in the plan's color. */
  private setSeats(b: Beacon) {
    const { capacity, taken = 0, color } = b.spec;
    const key = `${capacity ?? ''}:${taken}:${color}`;
    if (key === b.seatKey) return;
    b.seatKey = key;
    if (b.seats) { b.arena.remove(b.seats); b.seats.dispose(); b.seats = null; }
    const seats = capacity != null ? stadiumSeats(capacity, taken) : [];
    if (seats.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.seatGeo, this.seatMat, seats.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const takenColor = new THREE.Color(color).multiplyScalar(0.75);
    seats.forEach((s, i) => {
      const a = toRad(s.angle);
      const r = ARENA_R + 0.8 + s.tier * TIER_STEP;
      // Local frame: x = east, z = south. Seats face the middle of the arena.
      q.setFromEuler(new THREE.Euler(0, -a, 0));
      // On the sloped stands: the bowl rises STAND_H from ARENA_R - 0.5 to its outer rim.
      const y = ((r - (ARENA_R - 0.5)) / (TIER_STEP * 2 + 0.5)) * STAND_H + 0.9;
      m.compose(new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, s.taken ? takenColor : SEAT_OPEN);
    });
    mesh.frustumCulled = false;
    mesh.name = `seats:${seats.filter((s) => !s.taken).length}`;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    b.arena.add(mesh);
    b.seats = mesh;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    // Neutral keeps the palette saturated (AgX washed the city out); a touch over 1 reads as sunny.
    this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1.05;
    void loadSceneryAssets().then(assets=>{if(this.disposed)return;this.scenery=assets;if(this.treeSpots.length)this.setTrees(this.treeSpots);if(this.lamps.length)this.setStreetFurniture(this.lamps);});
  }

  onRemove() {
    this.disposed=true;
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    this.setBeacons([]);
    this.setTrees([]);this.vegetation?.dispose();this.vegetation=null;this.setStreetFurniture([]);
    for (const key of [...this.statics.keys()]) this.setStatic(key, null);
    this.shadowGeo.dispose(); this.shadowMat.map?.dispose(); this.shadowMat.dispose();
    this.beaconGeo.dispose();
    this.ringGeo.dispose();
    this.standGeo.dispose(); this.floorGeo.dispose(); this.seatGeo.dispose(); this.standMat.dispose(); this.seatMat.dispose();
    // The renderer shares MapLibre's context; dispose only three's own resources.
    this.renderer?.dispose();
    this.renderer = null;
    this.map?.getContainer().removeAttribute('data-world-characters');
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
    const markerMode=showChars?'true':'false',container=map.getContainer();if(container.dataset.worldCharacters!==markerMode)container.dataset.worldCharacters=markerMode;
    if(this.vegetation)this.vegetation.object.visible=zoom>=15.5;
    if(this.furniture)this.furniture.visible=zoom>=17;
    for (const o of this.statics.values()) o.visible = zoom >= 14.5;
    this.full.fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]).multiply(this.modelMatrix);
    this.camera.projectionMatrix.copy(this.full);

    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    for (const a of this.actors.values()) {
      const o = offsetMeters(this.origin, a.pos);
      const s = a.kind === 'pet' ? scale * 0.9 : scale;
      a.char.root.visible = showChars;
      a.char.root.position.set(o.east, a.altitude * scale, -o.north);
      const target=Math.PI-toRad(a.heading),current=a.char.root.rotation.y;
      const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
      const reduced=this.motionQuery?.matches;
      a.char.root.rotation.set(0,a.posed&&!reduced?current+delta*(1-Math.exp(-dt*10)):target,0);a.posed=true;
      a.char.root.scale.setScalar(s);
      if(showChars)a.char.update(dt, this.elapsed);
      if (a.shadow) {
        // Soft contact shadow on the ground under the avatar, sized to its footprint.
        a.shadow.visible = showChars;
        a.shadow.position.set(o.east, 0.04, -o.north);
        a.shadow.scale.set(s * 1.05, s * 1.05, 1);
      }
      if (a.trail) {
        if (showChars) {
          // Muse's actual world position (its centre), never a separate simulation. Vertical motion is
          // ignored: height here is altitude x zoom scale, which changes while zooming.
          this.trailPos.set(o.east, a.altitude * scale + a.char.height * s * 0.5, -o.north);
          a.char.getEffectCenter?.(this.trailPos);
          // The wake stems from the platform under Muse's feet (the character's origin), not its back.
          this.trailAnchor.set(o.east, a.altitude * scale + 0.03 * s, -o.north);
          const responses = a.trail.isReleasing() ? document.querySelectorAll<HTMLElement>('[data-muse-response]') : null;
          const response = responses?.item(responses.length - 1);
          const rect = response?.getBoundingClientRect();
          const canvasRect = rect ? canvas.getBoundingClientRect() : null;
          const result = rect && canvasRect && rect.width > 0 && rect.height > 0 ? {
            x: ((rect.left + rect.width / 2 - canvasRect.left) / w) * 2 - 1,
            y: 1 - ((Math.max(canvasRect.top, rect.top) + Math.min(rect.height / 2, 70) - canvasRect.top) / h) * 2,
          } : undefined;
          a.trail.update(this.trailPos, dt, { result, camera: this.full, scale: s, verticalWeight: 0, anchor: this.trailAnchor });
        } else a.trail.object.visible = false;
      }
      if (a.label) {
        // Project the point just above the head into screen pixels.
        const y = a.altitude * scale + (a.char.height + a.labelLift) * s;
        this.tmp.set(o.east, y, -o.north, 1).applyMatrix4(this.full);
        const visible = showChars && this.tmp.w > 0;
        if (visible) {
          const raw = ((this.tmp.x / this.tmp.w + 1) / 2) * w;
          const py = ((1 - this.tmp.y / this.tmp.w) / 2) * h;
          // Keep the whole label on screen (the pet's speech bubble on a phone), while its anchor is.
          const half = a.label.offsetWidth / 2;
          const x = raw > 0 && raw < w && half > 0 && half * 2 + 16 < w ? Math.min(Math.max(raw, half + 8), w - half - 8) : raw;
          a.label.style.transform = `translate(${x.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
          a.label.style.visibility = x > -200 && x < w + 200 && py > -100 && py < h + 200 ? 'visible' : 'hidden';
        } else {
          a.label.style.visibility = 'hidden';
        }
      }
    }

    // Plan and place labels: nearest first; a label that would overlap a nearer one, or hang off the
    // screen edge, waits hidden until there's room (no half-cut or stacked chips).
    const onScreenLabels: { el: HTMLElement; x: number; y: number; d: number }[] = [];
    for (const a of this.anchors.values()) {
      const o = offsetMeters(this.origin, a.pos);
      this.tmp.set(o.east, a.altitude, -o.north, 1).applyMatrix4(this.full);
      if (this.tmp.w <= 0 || zoom < 14.5) { a.el.style.visibility = 'hidden'; continue; }
      const x = ((this.tmp.x / this.tmp.w + 1) / 2) * w;
      const py = ((1 - this.tmp.y / this.tmp.w) / 2) * h;
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      onScreenLabels.push({ el: a.el, x, y: py, d: this.tmp.w });
    }
    onScreenLabels.sort((p, q) => p.d - q.d);
    if (this.frameCount++ % 20 === 0) for (const l of onScreenLabels) this.labelSize.set(l.el, [l.el.offsetWidth || 120, l.el.offsetHeight || 32]);
    const shown: [number, number, number, number][] = [];
    for (const l of onScreenLabels) {
      const [sw, sh] = this.labelSize.get(l.el) ?? [120, 32];
      const r: [number, number, number, number] = [l.x - sw / 2, l.y - sh, l.x + sw / 2, l.y];
      const inside = r[0] >= 4 && r[2] <= w - 4 && r[1] >= 4 && r[3] <= h + 20;
      const clash = shown.some((v) => r[0] < v[2] + 6 && r[2] + 6 > v[0] && r[1] < v[3] + 4 && r[3] + 4 > v[1]);
      const ok = inside && !clash;
      l.el.style.visibility = ok ? 'visible' : 'hidden';
      if (ok) shown.push(r);
    }

    const focus=this.actors.get(this.focusActor);
    const focusVisible=this.actorScreenPoint(this.focusActor,this.focusScreen)&&this.focusScreen.x>=0&&this.focusScreen.x<=w&&this.focusScreen.y>=0&&this.focusScreen.y<=h;
    if(focus&&focusVisible&&cameraFromProjection(this.full,this.inverse,this.sight.start.value,this.eyeScratch)){
      if(focus.char.getEffectCenter)focus.char.getEffectCenter(this.sight.end.value);
      else{focus.char.root.getWorldPosition(this.sight.end.value);this.sight.end.value.y+=focus.char.height*scale*.5;}
      const length=this.sightDirection.subVectors(this.sight.end.value,this.sight.start.value).length();this.sightDirection.normalize();this.sightRay.set(this.sight.start.value,this.sightDirection);
      const ease=this.motionQuery?.matches?1:1-Math.exp(-dt*8);
      this.sight.boxes.forEach((box,i)=>{const hit=zoom>=19&&this.sightRay.intersectBox(box,this.sightHit);const blocked=!!hit&&this.sightHit.distanceTo(this.sight.start.value)<length-.2&&blocksSightline(this.sight.start.value,this.sight.end.value,box,this.sight.rings[i]??[]);const goal=blocked ? .32 : 1;this.sight.fades.value[i]+=(goal-this.sight.fades.value[i])*ease;});
    }else this.sight.fades.value.fill(1);
    const pulse = this.motionQuery?.matches ? .5 :0.5 + Math.sin(this.elapsed * 3) * 0.5;
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
      // Arenas read at street level; from the city view the beams carry it.
      b.arena.visible = b.spec.capacity != null && zoom >= 15.5;
      if (b.gold.visible) (b.gold.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.4;
    }

    renderer.resetState();
    renderer.render(this.scene, this.camera);
    // This layer is the top one, so clearing depth here only affects the characters below.
    renderer.clearDepth();
    renderer.render(this.charScene, this.camera);
    map.triggerRepaint();
  }
}

// Characters for the 3D view: the viewer's avatar, friends' avatars, and the Muse pet.
// Two kinds behind one interface:
// - Placeholder characters built from three.js primitives and animated in code, so the view
//   works before any model files exist.
// - glTF characters from public/models (Ally's files), animated by their clips. The clip names
//   are the contract in docs/3D_VIEW_PLAN.md section 3: Idle, Walk, Wave, Celebrate, Talk, Run,
//   Sit for the avatar; Hover, Fly, Talk, Think, Happy, Wave for the pet.
// Models are Y-up, facing +Z, in meters, origin at the feet (the pet: at its body's center).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type AvatarState = 'idle' | 'walk' | 'wave' | 'celebrate' | 'talk';
export type PetState = 'hover' | 'fly' | 'talk' | 'think' | 'happy';

export interface Character {
  /** Positioned, turned and scaled by the world layer. */
  readonly root: THREE.Object3D;
  /** Model-space height in meters, where a label sits above. */
  readonly height: number;
  setState(state: string): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

// ---- Persona colors (stable per user id) ----

const PALETTE = ['#0866FF', '#E8505B', '#24A148', '#F2A900', '#8A3FFC', '#00A3A3', '#FF7A00', '#D12771'];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function colorsFor(seed: string): { primary: string; secondary: string; accent: string } {
  const h = hashString(seed);
  return {
    primary: PALETTE[h % PALETTE.length],
    secondary: ['#2B2D42', '#3D405B', '#4A4E69', '#22333B'][(h >>> 3) % 4],
    accent: PALETTE[(h >>> 7) % PALETTE.length],
  };
}

const ONE_SHOT = new Set(['wave', 'celebrate', 'happy']);
const ONE_SHOT_SECONDS: Record<string, number> = { wave: 1.6, celebrate: 1.9, happy: 1.6 };

// ---- Placeholder avatar ----

class PlaceholderAvatar implements Character {
  readonly root = new THREE.Group();
  readonly height = 1.85;
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private state: AvatarState = 'idle';
  private base: AvatarState = 'idle';
  private stateT = 0;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(seed: string) {
    const c = colorsFor(seed);
    const mat = (color: string, rough = 0.7) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
      this.mats.push(m);
      return m;
    };
    const geo = <G extends THREE.BufferGeometry>(g: G) => { this.geos.push(g); return g; };
    const shirt = mat(c.primary);
    const pants = mat(c.secondary);
    const skin = mat('#F3D2B3', 0.8);
    const dark = mat('#1C1E21', 0.4);

    const torso = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.27, 0.5, 6, 14)), shirt);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.24, 20, 16)), skin);
    head.position.y = 1.62;
    const hair = new THREE.Mesh(geo(new THREE.SphereGeometry(0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2)), mat(c.secondary, 0.9));
    hair.position.y = 1.64;
    hair.rotation.x = -0.25;
    const eyeGeo = geo(new THREE.SphereGeometry(0.035, 10, 8));
    const eyeL = new THREE.Mesh(eyeGeo, dark);
    eyeL.position.set(-0.08, 1.64, 0.21);
    const eyeR = new THREE.Mesh(eyeGeo, dark);
    eyeR.position.set(0.08, 1.64, 0.21);

    const limb = (len: number, r: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(geo(new THREE.CapsuleGeometry(r, len, 4, 10)), m);
      mesh.position.y = -len / 2 - r;
      return mesh;
    };
    this.legL.position.set(-0.13, 0.72, 0);
    this.legR.position.set(0.13, 0.72, 0);
    this.legL.add(limb(0.5, 0.1, pants));
    this.legR.add(limb(0.5, 0.1, pants));
    this.armL.position.set(-0.36, 1.33, 0);
    this.armR.position.set(0.36, 1.33, 0);
    this.armL.add(limb(0.42, 0.075, shirt));
    this.armR.add(limb(0.42, 0.075, shirt));

    this.body.add(torso, head, hair, eyeL, eyeR, this.legL, this.legR, this.armL, this.armR);
    // A soft shadow disc, so the character reads as standing on the street.
    const shadow = new THREE.Mesh(
      geo(new THREE.CircleGeometry(0.42, 24)),
      (() => { const m = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }); this.mats.push(m); return m; })(),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.root.add(shadow, this.body);
  }

  setState(s: string) {
    const next = s as AvatarState;
    if (ONE_SHOT.has(next)) { this.state = next; this.stateT = 0; return; }
    this.base = next;
    if (!ONE_SHOT.has(this.state)) { this.state = next; this.stateT = 0; }
  }

  update(dt: number, t: number) {
    this.stateT += dt;
    if (ONE_SHOT.has(this.state) && this.stateT > (ONE_SHOT_SECONDS[this.state] ?? 1.5)) { this.state = this.base; this.stateT = 0; }
    const reset = () => {
      this.legL.rotation.set(0, 0, 0); this.legR.rotation.set(0, 0, 0);
      this.armL.rotation.set(0, 0, 0.08); this.armR.rotation.set(0, 0, -0.08);
      this.body.position.y = 0;
    };
    reset();
    switch (this.state) {
      case 'walk': {
        const s = Math.sin(t * 9);
        this.legL.rotation.x = s * 0.6;
        this.legR.rotation.x = -s * 0.6;
        this.armL.rotation.x = -s * 0.5;
        this.armR.rotation.x = s * 0.5;
        this.body.position.y = Math.abs(Math.cos(t * 9)) * 0.05;
        break;
      }
      case 'wave':
        this.armR.rotation.z = -2.6 + Math.sin(this.stateT * 12) * 0.35;
        break;
      case 'celebrate': {
        const k = this.stateT * 7;
        this.body.position.y = Math.abs(Math.sin(k)) * 0.35;
        this.armL.rotation.z = 2.7;
        this.armR.rotation.z = -2.7;
        break;
      }
      case 'talk':
        this.armR.rotation.x = -0.4 + Math.sin(t * 4) * 0.2;
        this.body.position.y = Math.sin(t * 2) * 0.01;
        break;
      default:
        this.body.position.y = Math.sin(t * 2) * 0.012;
    }
  }

  dispose() { this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); }
}

// ---- Placeholder Muse pet ----

class PlaceholderPet implements Character {
  readonly root = new THREE.Group();
  readonly height = 0.75;
  private bodyGroup = new THREE.Group();
  private halo: THREE.Mesh;
  private antenna: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private state: PetState = 'hover';
  private base: PetState = 'hover';
  private stateT = 0;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor() {
    const geo = <G extends THREE.BufferGeometry>(g: G) => { this.geos.push(g); return g; };
    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#7B61FF', emissive: '#4B2BD6', emissiveIntensity: 0.35, roughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#14102B', roughness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: '#FFD84D' });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#9F8BFF', transparent: true, opacity: 0.75 });
    this.mats.push(this.bodyMat, white, dark, glow, ringMat);

    const body = new THREE.Mesh(geo(new THREE.SphereGeometry(0.3, 24, 18)), this.bodyMat);
    body.scale.set(1, 0.92, 1);
    const eyeWhite = geo(new THREE.SphereGeometry(0.075, 14, 10));
    const pupil = geo(new THREE.SphereGeometry(0.04, 10, 8));
    for (const x of [-0.11, 0.11]) {
      const e = new THREE.Mesh(eyeWhite, white);
      e.position.set(x, 0.05, 0.25);
      const p = new THREE.Mesh(pupil, dark);
      p.position.set(x, 0.05, 0.31);
      this.bodyGroup.add(e, p);
    }
    const stalk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6)), this.bodyMat);
    stalk.position.y = 0.34;
    this.antenna = new THREE.Mesh(geo(new THREE.SphereGeometry(0.05, 12, 10)), glow);
    this.antenna.position.y = 0.44;
    this.halo = new THREE.Mesh(geo(new THREE.TorusGeometry(0.36, 0.022, 8, 40)), ringMat);
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = -0.32;
    this.bodyGroup.add(body, stalk, this.antenna);
    this.root.add(this.bodyGroup, this.halo);
  }

  setState(s: string) {
    const next = s as PetState;
    if (ONE_SHOT.has(next)) { this.state = next; this.stateT = 0; return; }
    this.base = next;
    if (!ONE_SHOT.has(this.state)) { this.state = next; this.stateT = 0; }
  }

  update(dt: number, t: number) {
    this.stateT += dt;
    if (ONE_SHOT.has(this.state) && this.stateT > (ONE_SHOT_SECONDS[this.state] ?? 1.5)) { this.state = this.base; this.stateT = 0; }
    this.bodyGroup.rotation.set(0, 0, 0);
    this.bodyGroup.scale.setScalar(1);
    this.bodyGroup.position.y = Math.sin(t * 2.4) * 0.06;
    this.halo.rotation.z += dt * 0.8;
    this.antenna.scale.setScalar(1);
    this.bodyMat.emissiveIntensity = 0.35;
    switch (this.state) {
      case 'think':
        this.halo.rotation.z += dt * 6;
        this.antenna.scale.setScalar(1 + Math.abs(Math.sin(t * 6)) * 0.6);
        this.bodyGroup.rotation.z = Math.sin(t * 3) * 0.12;
        break;
      case 'talk':
        this.bodyGroup.scale.set(1, 1 + Math.abs(Math.sin(t * 11)) * 0.07, 1);
        this.bodyMat.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 11)) * 0.25;
        break;
      case 'fly':
        this.bodyGroup.rotation.x = 0.35;
        break;
      case 'happy':
        this.bodyGroup.position.y = Math.abs(Math.sin(this.stateT * 8)) * 0.3;
        this.bodyGroup.rotation.y = this.stateT * 8;
        this.bodyMat.emissiveIntensity = 0.7;
        break;
    }
  }

  dispose() { this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); }
}

// ---- glTF characters (Ally's models) ----

const AVATAR_CLIPS: Record<AvatarState, string[]> = {
  idle: ['Idle'], walk: ['Walk', 'Run', 'Idle'], wave: ['Wave', 'Celebrate'], celebrate: ['Celebrate', 'Wave'], talk: ['Talk', 'Idle'],
};
const PET_CLIPS: Record<PetState, string[]> = {
  hover: ['Hover', 'Idle'], fly: ['Fly', 'Hover', 'Idle'], talk: ['Talk', 'Hover', 'Idle'], think: ['Think', 'Hover', 'Idle'], happy: ['Happy', 'Wave', 'Hover'],
};

class GltfCharacter implements Character {
  readonly root: THREE.Object3D;
  readonly height: number;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private base = '';
  private clipMap: Record<string, string[]>;
  private oneShotLeft = 0;
  private owned: THREE.Material[] = [];

  constructor(gltf: GLTF, kind: 'avatar' | 'pet', scale: number, seed: string) {
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(scale);
    // Persona tint on the materials named for it (Mat_Primary / Mat_Secondary / Mat_Accent).
    const c = colorsFor(seed);
    const tints: Record<string, string> = { Mat_Primary: c.primary, Mat_Secondary: c.secondary, Mat_Accent: c.accent };
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const tint = kind === 'avatar' ? tints[m.name] : undefined;
        if (!tint || !(m as THREE.MeshStandardMaterial).color) return m;
        const copy = (m as THREE.MeshStandardMaterial).clone();
        copy.color.set(tint);
        this.owned.push(copy);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    this.root = new THREE.Group();
    this.root.add(model);
    const box = new THREE.Box3().setFromObject(model);
    this.height = Math.max(0.3, box.max.y);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.clipMap = kind === 'avatar' ? AVATAR_CLIPS : PET_CLIPS;
    this.setState(kind === 'avatar' ? 'idle' : 'hover');
  }

  private play(names: string[], once: boolean) {
    const action = names.map((n) => this.actions.get(n)).find(Boolean);
    if (!action || action === this.current) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.play();
    if (this.current) this.current.crossFadeTo(action, 0.25, false);
    this.current = action;
    this.oneShotLeft = once ? action.getClip().duration : 0;
  }

  setState(s: string) {
    const once = ONE_SHOT.has(s);
    if (!once) {
      this.base = s;
      if (this.oneShotLeft > 0) return;
    }
    this.play(this.clipMap[s] ?? [], once);
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (this.oneShotLeft > 0) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0) { this.oneShotLeft = 0; this.play(this.clipMap[this.base] ?? [], false); }
    }
  }

  dispose() { this.mixer.stopAllAction(); this.owned.forEach((m) => m.dispose()); }
}

// ---- Loading ----

export type ModelManifest = { avatar?: string; pet?: string; scale?: { avatar?: number; pet?: number }; version?: number };
export type ModelSet = { avatar: GLTF | null; pet: GLTF | null; scale: { avatar: number; pet: number } };

let modelsPromise: Promise<ModelSet> | null = null;

/** Loads public/models/manifest.json and its models once. Missing or broken files fall back to placeholders. */
export function loadModels(): Promise<ModelSet> {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const none: ModelSet = { avatar: null, pet: null, scale: { avatar: 1, pet: 1 } };
    let manifest: ModelManifest;
    try {
      const r = await fetch('/models/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return none;
      manifest = (await r.json()) as ModelManifest;
    } catch {
      return none;
    }
    const loader = new GLTFLoader();
    const load = async (file?: string) => {
      if (!file || !/^[\w.-]+\.glb$/.test(file)) return null;
      try { return await loader.loadAsync(`/models/${file}`); } catch { return null; }
    };
    const [avatar, pet] = await Promise.all([load(manifest.avatar), load(manifest.pet)]);
    return { avatar, pet, scale: { avatar: manifest.scale?.avatar ?? 1, pet: manifest.scale?.pet ?? 1 } };
  })();
  return modelsPromise;
}

export function makeAvatar(models: ModelSet | null, seed: string): Character {
  return models?.avatar ? new GltfCharacter(models.avatar, 'avatar', models.scale.avatar, seed) : new PlaceholderAvatar(seed);
}

export function makePet(models: ModelSet | null, seed: string): Character {
  return models?.pet ? new GltfCharacter(models.pet, 'pet', models.scale.pet, seed) : new PlaceholderPet();
}

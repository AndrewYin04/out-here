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
import { currentLook, currentPipLook, type AvatarLook, type Pattern, type PipLook } from './avatarLook';
import { ChibiAvatar } from './chibi';
import { buildHat } from './hatMesh';

export type AvatarState = 'idle' | 'walk' | 'wave' | 'celebrate' | 'talk';
// 'stand' and 'walk' keep Jolly on the ground beside you (the hover platform hides, and walking adds a
// waddle in code, since the model has no walk clip); the others are the floating poses.
export type PetState = 'hover' | 'fly' | 'talk' | 'think' | 'happy' | 'stand' | 'walk' | 'listen' | 'sad' | 'jump' | 'cheer' | 'wave' | 'spin' | 'dance' | 'nod';

export interface Character {
  /** Positioned, turned and scaled by the world layer. */
  readonly root: THREE.Object3D;
  /** Model-space height in meters, where a label sits above. */
  readonly height: number;
  /** Rest-pose body centre: camera framing must not follow animation. */
  readonly cameraHeight?: number;
  setState(state: string): void;
  update(dt: number, t: number): void;
  /** Current animated plush-body centre for effects, excluding bubble and headphone bounds. */
  getEffectCenter?(out: THREE.Vector3): void;
  dispose(): void;
}

// ---- Persona colors (stable per user id) ----

const PALETTE = ['#0866FF', '#E8505B', '#24A148', '#F2A900', '#8A3FFC', '#00A3A3', '#FF7A00', '#D12771'];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Map My look onto the Kenney materials: top → Mat_Primary, pants → Mat_Secondary, skin → Mat_Accent.
 * Friends without a saved look still get a stable palette from their id.
 */
export function colorsFor(
  seed: string,
  lookOverride?: AvatarLook | null,
): { primary: string; secondary: string; accent: string; hair: string; pattern: Pattern } {
  const look = lookOverride ?? (seed ? currentLook(seed) : null);
  if (look) {
    return {
      primary: look.topColor,
      secondary: look.bottomColor,
      accent: look.skin,
      hair: look.hairColor,
      pattern: look.pattern,
    };
  }
  const h = hashString(seed);
  return {
    primary: PALETTE[h % PALETTE.length],
    secondary: ['#2B2D42', '#3D405B', '#4A4E69', '#22333B'][(h >>> 3) % 4],
    accent: PALETTE[(h >>> 7) % PALETTE.length],
    hair: '#3D2B1F',
    pattern: 'plain',
  };
}

/**
 * Root scale for Pip beside the map-readable Kenney person (~10 m).
 * ~0.55 keeps Pip about half the person's height.
 */
export const PET_ROOT_SCALE = 0.9; // Ally's Jolly beside a life-size person at her close camera
/** Person is ~1.72 m in the GLB; ×6 reads on the plaza without the old ×34 giant. */
export const PERSON_WORLD_SCALE = 1; // life size: Ally's camera (ENTER_ZOOM 22.1) frames the person close

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
// The manifest (public/models/manifest.json) says which file and node is the avatar and which
// is the pet, which clip plays for each state, and which nodes to hide. Ally's Blender export
// (assets/muse-companion) keeps both in one file: `Person` and `Muse`, with clips
// follow_back / thinking / talk_front / person_idle / person_run.

const AVATAR_CLIPS: Record<AvatarState, string[]> = {
  idle: ['Idle'], walk: ['Walk', 'Run', 'Idle'], wave: ['Wave', 'Celebrate'], celebrate: ['Celebrate', 'Wave'], talk: ['Talk', 'Idle'],
};
const PET_CLIPS: Record<PetState, string[]> = {
  hover: ['Hover', 'Idle'], fly: ['Fly', 'Hover', 'Idle'], talk: ['Talk', 'Hover', 'Idle'], think: ['Think', 'Hover', 'Idle'], happy: ['Happy', 'Wave', 'Hover'],
  stand: ['Stand', 'Hover', 'Idle'], walk: ['Walk', 'Run', 'Hover', 'Idle'], listen: ['Listen', 'Hover', 'Idle'], sad: ['Sad', 'Hover', 'Idle'],
  jump: ['Hover'], cheer: ['Hover'], wave: ['Hover'], spin: ['Hover'], dance: ['Hover'], nod: ['Hover'],
};

export type CharacterSpec = {
  gltf: GLTF;
  /** Keep only this top-level node (and its children); null keeps the whole scene. */
  node: string | null;
  scale: number;
  /** State → clip name(s), first one present wins; falls back to the contract names above. */
  clips: Partial<Record<string, string | string[]>>;
  timeScale: Partial<Record<string, number>>;
  /**
   * The kept node's own position/rotation tracks are made relative to each clip's first frame:
   * the bob and sway stay, the placement baked in for Blender (beside or in front of the person)
   * goes, because the 3D view places and turns the character itself.
   */
  relativeRoot: boolean;
  hide: string[];
};

/** Clip tracks for nodes inside `keep`; the root's own motion optionally made relative. */
function adaptClip(clip: THREE.AnimationClip, keep: Set<string>, rootName: string | null, relativeRoot: boolean, hide: Set<string>): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
    if (!keep.has(nodeName) || hide.has(nodeName)) continue;
    if (relativeRoot && nodeName === rootName && (propertyName === 'position' || propertyName === 'quaternion')) {
      const v = Float32Array.from(t.values);
      if (propertyName === 'position') {
        const [x0, y0, z0] = [v[0], v[1], v[2]];
        for (let i = 0; i < v.length; i += 3) { v[i] -= x0; v[i + 1] -= y0; v[i + 2] -= z0; }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      } else {
        const q0inv = new THREE.Quaternion(v[0], v[1], v[2], v[3]).invert();
        const q = new THREE.Quaternion();
        for (let i = 0; i < v.length; i += 4) {
          q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(q0inv);
          v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      }
      continue;
    }
    tracks.push(t);
  }
  return tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null;
}

/** Jolly's one-shot moves, in code (his model has no clips for them), and how long each lasts. */
const ACTIONS: Record<string, number> = { jump: 1.1, cheer: 2.0, wave: 1.7, spin: 1.1, dance: 3.2, nod: 0.9 };
/** Moods that hold while the state lasts: they ease in and out. */
const MOODS = ['think', 'listen', 'sad', 'talk'] as const;
type Role = 'armL' | 'armR' | 'legL' | 'legR';
const LIMBS:readonly Role[]=['armL','armR','legL','legR'];

/** Three-step toon ramp shared by every person on the map. */
let toonGradient: THREE.DataTexture | null = null;
function toonGradientMap(): THREE.DataTexture {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([80, 80, 80, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 3, 1);
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

type LookColors = { primary: string; secondary: string; accent: string; hair: string; pattern: Pattern };

/** Kenney Person atlas prototypes (skin / shirt / pants / hair) sampled from muse-companion.glb. */
const ATLAS_SKIN = [
  { r: 245, g: 147, b: 114 },
  { r: 228, g: 120, b: 62 },
  { r: 245, g: 140, b: 106 },
] as const;
const ATLAS_TOP = [
  { r: 240, g: 90, b: 67 },
  { r: 242, g: 101, b: 76 },
  { r: 240, g: 84, b: 62 },
] as const;
const ATLAS_PANTS = [
  { r: 23, g: 84, b: 124 },
  { r: 19, g: 70, b: 106 },
] as const;
const ATLAS_HAIR = [
  { r: 61, g: 43, b: 31 },
  { r: 45, g: 30, b: 20 },
  { r: 80, g: 55, b: 35 },
  { r: 38, g: 28, b: 22 },
  { r: 90, g: 60, b: 40 },
] as const;

function dist2(r: number, g: number, b: number, ref: { r: number; g: number; b: number }): number {
  const dr = r - ref.r, dg = g - ref.g, db = b - ref.b;
  return dr * dr + dg * dg + db * db;
}

function nearestDist(r: number, g: number, b: number, refs: readonly { r: number; g: number; b: number }[]): number {
  let best = Infinity;
  for (const ref of refs) best = Math.min(best, dist2(r, g, b, ref));
  return best;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Recolor the single "skin" atlas so My look skin/top/pants show on the Kenney person.
 * Preserves luminance so shading in the texture still reads.
 */
function tintPersonAtlas(srcMap: THREE.Texture, colors: LookColors, ownedTex: THREE.Texture[]): THREE.Texture {
  const img = srcMap.image as CanvasImageSource | undefined;
  if (!img || typeof document === 'undefined') return srcMap;
  const w = (img as { width: number }).width;
  const h = (img as { height: number }).height;
  if (!w || !h) return srcMap;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcMap;
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const skin = parseHex(colors.accent);
  const top = parseHex(colors.primary);
  const pants = parseHex(colors.secondary);
  const hair = parseHex(colors.hair);
  // Thresholds from atlas sampling; eyes / white stay untouched.
  const SKIN_MAX = 48 * 48, TOP_MAX = 55 * 55, PANTS_MAX = 48 * 48, HAIR_MAX = 42 * 42;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const x = p % w;
    const y = (p / w) | 0;
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 8) continue;
    const ds = nearestDist(r, g, b, ATLAS_SKIN);
    const dt = nearestDist(r, g, b, ATLAS_TOP);
    const dp = nearestDist(r, g, b, ATLAS_PANTS);
    const dh = nearestDist(r, g, b, ATLAS_HAIR);
    let target: { r: number; g: number; b: number } | null = null;
    let region: 'skin' | 'top' | 'pants' | 'hair' | null = null;
    if (dh <= HAIR_MAX && dh <= ds && dh <= dt && dh <= dp) { target = hair; region = 'hair'; }
    else if (ds <= SKIN_MAX && ds <= dt && ds <= dp) { target = skin; region = 'skin'; }
    else if (dt <= TOP_MAX && dt <= ds && dt <= dp) { target = top; region = 'top'; }
    else if (dp <= PANTS_MAX && dp <= ds && dp <= dt) { target = pants; region = 'pants'; }
    if (!target || !region) continue;
    // Patterns only on the shirt region so hair / skin never pick up stripes.
    if (region === 'top' && colors.pattern !== 'plain') {
      const stripe = Math.max(2, Math.round(h / 28));
      if (colors.pattern === 'stripes' && Math.floor(y / stripe) % 2 === 1) target = { r: 255, g: 255, b: 255 };
      else if (colors.pattern === 'dots' && (x % 10) < 3 && (y % 10) < 3) target = { r: 255, g: 255, b: 255 };
      else if (colors.pattern === 'ticket') {
        const band = Math.floor(y / Math.max(4, Math.round(h / 12))) % 6;
        if (band === 2 || band === 3) target = { r: 28, g: 30, b: 33 };
      }
    }
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    d[i] = Math.min(255, Math.round(target.r * (0.55 + lum * 0.9)));
    d[i + 1] = Math.min(255, Math.round(target.g * (0.55 + lum * 0.9)));
    d[i + 2] = Math.min(255, Math.round(target.b * (0.55 + lum * 0.9)));
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srcMap.colorSpace;
  tex.flipY = srcMap.flipY;
  tex.wrapS = srcMap.wrapS;
  tex.wrapT = srcMap.wrapT;
  tex.magFilter = srcMap.magFilter;
  tex.minFilter = srcMap.minFilter;
  tex.needsUpdate = true;
  ownedTex.push(tex);
  return tex;
}

function toonFrom(
  src: THREE.Material,
  tint: string | undefined,
  owned: THREE.Material[],
  ownedTex: THREE.Texture[],
  colors: LookColors,
): THREE.Material {
  const std = src as THREE.MeshStandardMaterial;
  // Keep albedo — the Kenney person is one atlas ("skin"); flat color alone washes them white.
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  m.name = src.name;
  if (src.name === 'skin' && std.map) {
    m.map = tintPersonAtlas(std.map, colors, ownedTex);
  } else if (std.map) {
    m.map = std.map;
  } else if (tint) {
    m.color.set(tint);
  } else if (std.color) {
    m.color.copy(std.color);
  }
  // Named Mat_* slots (when present) get a solid tint on top of any map.
  if (tint && src.name !== 'skin') m.color.set(tint);
  owned.push(m);
  return m;
}

/** Prefer the Head bone in the Person rig (scene graph or skinned skeleton). */
function findHeadBone(model: THREE.Object3D): THREE.Object3D | null {
  const named = model.getObjectByName('Head') ?? model.getObjectByName('Head_end');
  if (named) return named;
  let found: THREE.Object3D | null = null;
  model.traverse((o) => {
    if (found) return;
    const skinned = o as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh || !skinned.skeleton) return;
    const bone = skinned.skeleton.bones.find((b) => b.name === 'Head' || b.name === 'mixamorigHead');
    if (bone) found = bone;
  });
  return found;
}

/** Thin black silhouette; child of the mesh so skinned people keep the outline while they move. */
function addOutlineHull(mesh: THREE.Mesh, owned: THREE.Material[]): void {
  try {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1c1e21, side: THREE.BackSide });
    owned.push(mat);
    const skinned = mesh as THREE.SkinnedMesh;
    let outline: THREE.Mesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) {
      const skinnedOutline = new THREE.SkinnedMesh(skinned.geometry, mat);
      skinnedOutline.bind(skinned.skeleton, skinned.bindMatrix);
      outline = skinnedOutline;
    } else {
      outline = new THREE.Mesh(mesh.geometry, mat);
    }
    outline.userData.outline = true;
    outline.frustumCulled = false;
    outline.scale.setScalar(1.035);
    outline.renderOrder = -1;
    mesh.add(outline);
  } catch {
    // Outline is optional; a missing silhouette is better than a blank map.
  }
}

class GltfCharacter implements Character {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly cameraHeight: number;
  private ownedGeometry: THREE.BufferGeometry[] = [];
  private hop = new THREE.Group();
  private effectBody: THREE.Mesh | null = null;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private base = '';
  private clipMap: Record<string, string[]>;
  private timeScale: Partial<Record<string, number>>;
  private oneShotLeft = 0;
  private hopLeft = 0;
  private owned: THREE.Material[] = [];
  // Pet only: on the ground (no platform), and the waddle's phase and strength.
  private kind: 'avatar' | 'pet';
  private platform: THREE.Object3D | null = null;
  private glow: THREE.ShaderMaterial | null = null;
  private glowTime = 0;
  private walking = false;
  private gait = 0;
  private gaitAmp = 0;
  // Jolly's arm and leg nodes (no clip drives them), swung in code while he walks.
  // Jolly's arms and legs are part of one mesh, so they are bent in the vertex shader (see
  // patchLimbs). Each limb is [swing, raise outward] in radians; swing > 0 is backward.
  private limbU = { armL: { value: new THREE.Vector2() }, armR: { value: new THREE.Vector2() }, legL: { value: 0 }, legR: { value: 0 } };
  // The pose for this frame: body bounce, tilt, squash, and each limb as [swing, raise-outward].
  private pose = { y: 0, rx: 0, ry: 0, rz: 0, sy: 1 };
  private limbAng: Record<Role, [number, number]> = { armL: [0, 0], armR: [0, 0], legL: [0, 0], legR: [0, 0] };
  private moods: Record<string, number> = { think: 0, listen: 0, sad: 0, talk: 0 };
  private mood = '';
  private act: { name: string; t: number; dur: number } | null = null;
  private clock = 0;

  private ownedTex: THREE.Texture[] = [];
  /** Hat rides on hop and tracks the Head bone so a floating bind pose cannot hide it. */
  private hat: THREE.Object3D | null = null;
  private headBone: THREE.Object3D | null = null;

  constructor(
    spec: CharacterSpec,
    kind: 'avatar' | 'pet',
    seed: string,
    opts?: { look?: AvatarLook | null; worldScale?: number },
  ) {
    this.kind = kind;
    const scene = cloneSkinned(spec.gltf.scene);
    let model: THREE.Object3D = scene;
    if (spec.node) {
      const keepNode = scene.getObjectByName(spec.node);
      if (keepNode) {
        // Drop the other top-level nodes (Ally's file holds the person and the Muse together).
        for (const child of [...scene.children]) if (child !== keepNode) scene.remove(child);
        if (spec.relativeRoot) { keepNode.position.set(0, 0, 0); keepNode.quaternion.identity(); }
        model = scene;
      }
    }
    const hide = new Set(spec.hide);
    const keepNames = new Set<string>();
    model.traverse((o) => {
      keepNames.add(o.name);
      if (hide.has(o.name)) o.visible = false;
    });
    // Avatar: street uses PERSON_WORLD_SCALE; the dresser pedestal can pass worldScale: 1.
    const avatarScale = opts?.worldScale ?? (spec.scale || PERSON_WORLD_SCALE);
    model.scale.setScalar(kind === 'avatar' ? avatarScale : spec.scale);

    // Persona tint: Mat_Primary / Mat_Secondary / Mat_Accent when present; Kenney atlas "skin" is recolored.
    // Collect meshes first — adding outline children during traverse nests forever.
    const look = opts?.look ?? (seed ? currentLook(seed) : null);
    const c = colorsFor(seed, look);
    const tints: Record<string, string> = { Mat_Primary: c.primary, Mat_Secondary: c.secondary, Mat_Accent: c.accent };
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      if (kind === 'pet' && mesh.name === 'Muse_FurFibers') {
        const sparse = sparseFurGeometry(mesh.geometry);
        if (sparse) { mesh.geometry = sparse; this.ownedGeometry.push(sparse); }
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        if (kind === 'avatar') {
          // Toon + outline so people read off the street; My look recolors the person's atlas.
          return toonFrom(m, tints[m.name], this.owned, this.ownedTex, c);
        }
        // Jolly's fur is a warm cream in the model, but the scene's cool daylight and tone mapping turn
        // it gray. A warm self-light and a slightly richer base bring the cream back.
        if (kind === 'pet' && /Fur|Fiber/.test(m.name) && (m as THREE.MeshStandardMaterial).color) {
          const fur = (m as THREE.MeshStandardMaterial).clone();
          if (/Fur/.test(m.name)) {
            fur.color.set('#F2DDB9');
            fur.emissive.set('#F0CFA2');
            fur.emissiveIntensity = 0.32;
          }
          this.patchLimbs(fur);
          this.owned.push(fur);
          return fur;
        }
        // People returned above (toon + atlas tint); Jolly keeps his own materials.
        return m;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    }

    this.platform = kind === 'pet' ? model.getObjectByName('Muse_Platform') ?? null : null;
    const plat = this.platform as THREE.Mesh | null;
    if (plat?.isMesh) {
      // The hover platform is a soft pool of light, not a solid disc: bright in the middle, fading to
      // nothing at the edge, added onto the ground behind it.
      plat.geometry.computeBoundingBox();
      const bb = plat.geometry.boundingBox!;
      const r = Math.max(0.05, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
      this.glow = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#3FD2FF') }, uR: { value: r }, uC: { value: new THREE.Vector2((bb.max.x + bb.min.x) / 2, (bb.max.z + bb.min.z) / 2) }, uTime: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uR; uniform vec2 uC; uniform float uTime; varying vec3 vP; void main(){ float d = length(vP.xz - uC) / uR; float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.5); a *= 0.85 + 0.15 * sin(uTime * 2.2); gl_FragColor = vec4(uColor * (0.55 + 0.9 * a), a * 0.95); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      plat.material = this.glow;
      plat.renderOrder = 2;
    }
    this.effectBody = model.getObjectByName('Muse_Body') as THREE.Mesh | undefined ?? null;
    if (this.effectBody?.isMesh) this.effectBody.geometry.computeBoundingBox();
    else this.effectBody = null;
    this.hop.add(model);
    this.root.add(this.hop);
    // Hidden authoring nodes (especially the 3D bubble) must not lift HTML labels.
    model.updateWorldMatrix(true,true);
    const box = new THREE.Box3(), part = new THREE.Box3();
    model.traverseVisible((o)=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();if(mesh.geometry.boundingBox)box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));});
    this.height = Math.max(0.3, Number.isFinite(box.max.y)?box.max.y:0.3);
    this.cameraHeight = this.effectBody?.geometry.boundingBox
      ? this.effectBody.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(this.effectBody.matrixWorld).y
      : this.height / 2;
    if (kind === 'avatar' && look) {
      const hat = buildHat(look.hat);
      const head = findHeadBone(model);
      // Parent to the Head bone so the hat sits on the hair and follows idle/run.
      if (head && hat) {
        // Head's bind pose floats above the skinned crown; parenting directly put the hat on
        // the chest. Keep the hat in hop space at the measured crown and track Head XZ.
        this.headBone = head;
        this.hat = hat;
        hat.name = 'HatSocket';
        // BBox max.y is near the chest on this bind; 2.1 seats on the hair for the pedestal.
        hat.scale.setScalar(Math.min(0.52, this.height * 0.34));
        hat.position.set(0, this.height * 2.1, this.height * 0.05);
        hat.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.frustumCulled = false; m.renderOrder = 10; }
        });
        this.hop.add(hat);
      }
    }
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of spec.gltf.animations) {
      const adapted = adaptClip(clip, keepNames, spec.node, spec.relativeRoot, hide);
      if (adapted) this.actions.set(clip.name, this.mixer.clipAction(adapted));
    }
    const defaults: Record<string, string[]> = kind === 'avatar' ? AVATAR_CLIPS : PET_CLIPS;
    this.clipMap = Object.fromEntries(Object.entries(defaults).map(([state, names]) => {
      const custom = spec.clips[state];
      return [state, custom ? (Array.isArray(custom) ? custom : [custom]) : names];
    }));
    this.timeScale = spec.timeScale;
    this.setState(kind === 'avatar' ? 'idle' : 'hover');
  }

  /**
   * Bend Jolly's legs (hips at y 0.115) and arms (shoulders at x +-0.15, y 0.30) in the vertex shader,
   * with soft weights so the fur stretches instead of tearing. The body and his fuzz use the same bend.
   */
  private patchLimbs(mat: THREE.Material) {
    const u = this.limbU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uArmL = u.armL; sh.uniforms.uArmR = u.armR; sh.uniforms.uLegL = u.legL; sh.uniforms.uLegR = u.legR;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec2 uArmL; uniform vec2 uArmR; uniform float uLegL; uniform float uLegR;
vec3 jollyLimbs(vec3 p) {
  float s = p.x >= 0.0 ? 1.0 : -1.0;
  float ax = abs(p.x);
  // arms: raise outward about the shoulder, then swing forward / back
  vec2 a = s > 0.0 ? uArmL : uArmR;
  float aw = smoothstep(0.14, 0.185, ax) * smoothstep(0.12, 0.17, p.y) * (1.0 - smoothstep(0.30, 0.34, p.y));
  float phi = a.y * aw, th = a.x * aw;
  float dx = ax - 0.15, dy = p.y - 0.30;
  float nx = 0.15 + dx * cos(phi) - dy * sin(phi);
  float ny = 0.30 + dx * sin(phi) + dy * cos(phi);
  float dy2 = ny - 0.30;
  float nz = dy2 * sin(th) + p.z * cos(th);
  ny = 0.30 + dy2 * cos(th) - p.z * sin(th);
  vec3 q = vec3(s * nx, ny, nz);
  // legs: swing about the hip
  float lw = (1.0 - smoothstep(0.01, 0.115, q.y)) * smoothstep(0.015, 0.045, abs(q.x));
  float lg = (s > 0.0 ? uLegL : uLegR) * lw;
  float hy = q.y - 0.115;
  float lz = hy * sin(lg) + q.z * cos(lg);
  q.y = 0.115 + hy * cos(lg) - q.z * sin(lg);
  q.z = lz;
  return q;
}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = jollyLimbs(transformed);');
    };
    mat.customProgramCacheKey = () => 'jolly-limbs-v1';
  }

  private play(state: string, once: boolean): boolean {
    const action = (this.clipMap[state] ?? []).map((n) => this.actions.get(n)).find(Boolean);
    if (!action) return false;
    action.timeScale = this.timeScale[state] ?? 1;
    if (action === this.current) return true;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.play();
    if (this.current) this.current.crossFadeTo(action, 0.25, false);
    this.current = action;
    this.oneShotLeft = once ? action.getClip().duration / Math.max(0.05, action.timeScale) : 0;
    return true;
  }

  setState(s: string) {
    if (this.kind === 'pet') {
      // A one-shot move (happy and celebrate are the cheer): it plays over whatever he is doing.
      const move = s === 'happy' || s === 'celebrate' ? 'cheer' : s;
      if (ACTIONS[move]) { this.act = { name: move, t: 0, dur: ACTIONS[move] }; return; }
    }
    const once = ONE_SHOT.has(s);
    if (this.kind === 'pet' && !once) {
      this.mood = (MOODS as readonly string[]).includes(s) ? s : '';
      const grounded = s === 'walk' || s === 'stand';
      this.walking = s === 'walk';
      if (this.platform) this.platform.visible = !grounded;
    }
    if (!once) {
      this.base = s;
      if (this.oneShotLeft > 0) return;
      this.play(s, false);
      return;
    }
    // A one-shot the model has no clip for (wave, celebrate, happy): a small hop instead.
    if (!this.play(s, true)) this.hopLeft = ONE_SHOT_SECONDS[s] ?? 1.2;
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (this.glow) { this.glowTime += dt; this.glow.uniforms.uTime.value = this.glowTime; }
    if (this.oneShotLeft > 0) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0) { this.oneShotLeft = 0; this.play(this.base, false); }
    }
    let y = 0;
    if (this.hopLeft > 0) {
      this.hopLeft = Math.max(0, this.hopLeft - dt);
      y = Math.abs(Math.sin(this.hopLeft * 9)) * 0.22;
    }
    if (this.kind !== 'pet') { this.hop.position.y = y; return; }

    // ---- Jolly: the pose is the sum of the jog, the current mood and any one-shot move ----
    this.clock += dt;
    const P = this.pose, L = this.limbAng;
    P.y = y; P.rx = 0; P.ry = 0; P.rz = 0; P.sy = 1;
    for (const k of LIMBS) { L[k][0] = 0; L[k][1] = 0; }

    // The jog: about 2.9 steps a second. The body bounces on each step, rocks and leans in, and the
    // limbs swing: each leg with the opposite arm, arms bent forward.
    this.gaitAmp += ((this.walking ? 1 : 0) - this.gaitAmp) * (1 - Math.exp(-dt * 7));
    if (this.gaitAmp > 0.004) {
      this.gait += dt * Math.PI * 2 * 1.45;
      const a = this.gaitAmp, sw = Math.sin(this.gait);
      P.y += Math.abs(sw) * 0.09 * a; P.rx += 0.16 * a; P.ry += sw * 0.05 * a; P.rz += sw * 0.09 * a;
      L.legL[0] += 0.9 * sw * a; L.legR[0] -= 0.9 * sw * a;
      L.armL[0] += -0.75 * sw * a - 0.4 * a; L.armR[0] += 0.75 * sw * a - 0.4 * a;
    }

    // Moods (they ease in and out): thinking has a hand to his chin and a slow tilt; listening leans in
    // with his arms a little forward; talking bounces with arm gestures; sad slumps.
    const t = this.clock;
    for (const m of MOODS) {
      this.moods[m] += ((this.mood === m ? 1 : 0) - this.moods[m]) * (1 - Math.exp(-dt * 6));
      const a = this.moods[m];
      if (a < 0.004) continue;
      if (m === 'think') {
        P.rz += Math.sin(t * 1.3) * 0.09 * a; P.rx += 0.05 * a;
        L.armR[0] += -1.55 * a; L.armR[1] += -0.25 * a; L.armL[0] += -0.15 * a;
      } else if (m === 'listen') {
        P.rz += 0.11 * a; P.rx += 0.06 * a; L.armL[0] += -0.25 * a; L.armR[0] += -0.25 * a;
      } else if (m === 'talk') {
        P.y += Math.abs(Math.sin(t * 9)) * 0.02 * a; P.rx += Math.sin(t * 9) * 0.03 * a;
        L.armL[0] += -0.55 * a * (0.5 + 0.5 * Math.sin(t * 5)); L.armR[0] += -0.55 * a * (0.5 + 0.5 * Math.sin(t * 5 + 2.2));
        L.armL[1] += 0.15 * a; L.armR[1] += 0.15 * a;
      } else {
        P.rx += 0.2 * a; P.y -= 0.02 * a; P.sy *= 1 - 0.04 * a;
        L.armL[0] += 0.3 * a; L.armR[0] += 0.3 * a; L.armL[1] += 0.12 * a; L.armR[1] += 0.12 * a;
      }
    }

    // A one-shot move.
    if (this.act) {
      this.act.t += dt;
      const u = this.act.t / this.act.dur;
      if (u >= 1) this.act = null;
      else {
        const e0 = Math.max(0, Math.min(1, u / 0.1, (1 - u) / 0.1)), e = e0 * e0 * (3 - 2 * e0), PI = Math.PI;
        switch (this.act.name) {
          case 'jump':
            if (u < 0.2) { const k = u / 0.2; P.sy *= 1 - 0.22 * Math.sin(k * PI / 2); L.armL[0] += 0.5 * k; L.armR[0] += 0.5 * k; }
            else if (u < 0.8) {
              const v = (u - 0.2) / 0.6, up = Math.sin(v * PI);
              P.y += 0.36 * 4 * v * (1 - v); P.sy *= 1 + 0.12 * up;
              L.armL[1] += 2.2 * up; L.armR[1] += 2.2 * up; L.legL[0] -= 0.5 * up; L.legR[0] -= 0.5 * up;
            } else { const k = (u - 0.8) / 0.2; P.sy *= 1 - 0.16 * Math.sin(k * PI); }
            break;
          case 'cheer': {
            const v = (u * 2) % 1;
            P.y += 0.3 * 4 * v * (1 - v) * e; P.sy *= 1 + 0.05 * Math.sin(v * PI) * e;
            L.armL[1] += 2.3 * e; L.armR[1] += 2.3 * e;
            P.ry += Math.sin(u * 34) * 0.14 * e; P.rz += Math.sin(u * 26) * 0.07 * e;
            L.legL[0] += 0.3 * Math.sin(u * 40) * e; L.legR[0] -= 0.3 * Math.sin(u * 40) * e;
            break;
          }
          case 'wave':
            L.armR[1] += (2.1 + Math.sin(u * 34) * 0.28) * e; L.armR[0] += -0.2 * e; P.rz += 0.05 * e;
            break;
          case 'spin': {
            const sp = u * u * (3 - 2 * u), out = Math.sin(u * PI);
            P.ry += sp * PI * 2; P.y += 0.1 * out; L.armL[1] += 1.3 * out; L.armR[1] += 1.3 * out;
            break;
          }
          case 'dance': {
            const ph = u * 3.2 * PI * 2 * 1.5;
            P.rz += Math.sin(ph) * 0.18 * e; P.y += Math.abs(Math.sin(ph)) * 0.05 * e; P.ry += Math.sin(ph * 0.5) * 0.25 * e;
            L.armL[1] += (1.2 + 0.8 * Math.sin(ph)) * e; L.armR[1] += (1.2 + 0.8 * Math.sin(ph + PI)) * e;
            L.legL[0] += 0.35 * Math.sin(ph) * e; L.legR[0] -= 0.35 * Math.sin(ph) * e;
            break;
          }
          case 'nod':
            P.rx += 0.28 * Math.sin(u * PI * 4) * e;
            break;
        }
      }
    }

    // ---- apply ----
    this.hop.position.y = P.y;
    this.hop.rotation.set(P.rx, P.ry, P.rz);
    const sq = 1 / Math.sqrt(P.sy); // squash and stretch keep his volume
    this.hop.scale.set(sq, P.sy, sq);
    this.limbU.armL.value.set(L.armL[0], L.armL[1]);
    this.limbU.armR.value.set(L.armR[0], L.armR[1]);
    this.limbU.legL.value = L.legL[0];
    this.limbU.legR.value = L.legR[0];
  }

  getEffectCenter(out: THREE.Vector3): void {
    if(this.effectBody)this.effectBody.updateWorldMatrix(true,false);
    else this.root.updateWorldMatrix(true,false);
    if (this.effectBody?.geometry.boundingBox) {
      this.effectBody.geometry.boundingBox.getCenter(out).applyMatrix4(this.effectBody.matrixWorld);
    } else out.set(0, this.height / 2, 0).applyMatrix4(this.root.matrixWorld);
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.hat) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    });
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot());
    this.owned.forEach((m) => m.dispose()); this.ownedTex.forEach((t) => t.dispose());
    this.ownedGeometry.forEach((g) => g.dispose()); this.glow?.dispose();
  }
}

// ---- Loading ----

export type ModelManifest = {
  version?: number;
  avatar?: string | null; pet?: string | null;
  avatarNode?: string | null; petNode?: string | null;
  scale?: { avatar?: number; pet?: number };
  clips?: { avatar?: Record<string, string | string[]>; pet?: Record<string, string | string[]> };
  timeScale?: { avatar?: Record<string, number>; pet?: Record<string, number> };
  /** Make the pet node's own motion relative (see CharacterSpec.relativeRoot). Default true. */
  petRelativeMotion?: boolean;
  hide?: string[];
};
export type ModelSet = { avatar: CharacterSpec | null; pet: CharacterSpec | null };

let modelsPromise: Promise<ModelSet> | null = null;

/** Drop the cached GLB set so the next loadModels() re-reads manifest scale (e.g. after a human-size fix). */
export function invalidateModels(): void {
  modelsPromise = null;
}

/** Loads public/models/manifest.json and its models once. Missing or broken files fall back to placeholders. */
export function loadModels(): Promise<ModelSet> {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const none: ModelSet = { avatar: null, pet: null };
    let m: ModelManifest;
    try {
      // Cache-bust so a stale service worker / browser cache cannot keep avatar scale:34.
      const r = await fetch(`/models/manifest.json?v=${PERSON_WORLD_SCALE}`, { cache: 'no-cache' });
      if (!r.ok) return none;
      m = (await r.json()) as ModelManifest;
    } catch {
      return none;
    }
    const loader = new GLTFLoader();
    const files = new Map<string, Promise<GLTF | null>>();
    const load = (file?: string | null) => {
      if (!file || !/^[\w.-]+\.glb$/.test(file)) return Promise.resolve(null);
      if (!files.has(file)) files.set(file, loader.loadAsync(`/models/${file}`).catch(async () => {
        // A browser disk-cache write can fail for the large shared GLB. Retry once without
        // cache storage; keep the normal cached path and the shared in-flight promise.
        try {
          const response=await fetch(`/models/${file}`,{cache:'no-store'});
          if(!response.ok)return null;
          return await loader.parseAsync(await response.arrayBuffer(),'/models/');
        } catch { return null; }
      }));
      return files.get(file)!;
    };
    const [avatar, pet] = await Promise.all([load(m.avatar), load(m.pet)]);
    const hide = m.hide ?? [];
    return {
      avatar: avatar ? {
        gltf: avatar, node: m.avatarNode ?? null, scale: m.scale?.avatar ?? 1,
        clips: m.clips?.avatar ?? {}, timeScale: m.timeScale?.avatar ?? {}, relativeRoot: false, hide,
      } : null,
      pet: pet ? {
        gltf: pet, node: m.petNode ?? null, scale: m.scale?.pet ?? 1,
        clips: m.clips?.pet ?? {}, timeScale: m.timeScale?.pet ?? {}, relativeRoot: m.petRelativeMotion ?? true, hide,
      } : null,
    };
  })();
  return modelsPromise;
}

/**
 * People are the Kenney Person from muse-companion.glb (person_idle / person_run), toon-shaded
 * with My look atlas tints. Chibi is only the fallback before the GLB loads or if construction fails.
 */
export function makeAvatar(
  models: ModelSet | null,
  seed: string,
  opts?: { look?: AvatarLook | null; worldScale?: number },
): Character {
  if (models?.avatar) {
    try { return new GltfCharacter(models.avatar, 'avatar', seed, opts); }
    catch (err) { console.error('[world] Kenney person failed; using chibi', err); }
  }
  if (!seed) return new PlaceholderAvatar(seed);
  return new ChibiAvatar(opts?.look ?? currentLook(seed));
}

export function makePet(models: ModelSet | null, seed: string): Character {
  const pip = seed ? currentPipLook(seed) : null;
  if (!models?.pet) return new PlaceholderPet();
  const char = new GltfCharacter(models.pet, 'pet', seed);
  if (pip) decoratePip(char.root, pip);
  return char;
}

/** Coat tint + kind ears on the Muse body so Pip matches the dresser. */
function decoratePip(root: THREE.Object3D, pip: PipLook): void {
  const coat = new THREE.Color(pip.coat);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std?.color) continue;
      const n = (std.name || '').toLowerCase();
      if (n.includes('fur') || n.includes('body') || n.includes('fiber') || mesh.name === 'Muse_Body') {
        std.color.copy(coat);
      }
    }
  });
  const head = root.getObjectByName('Muse_Body') ?? root.getObjectByName('Muse') ?? root;
  const earMat = new THREE.MeshStandardMaterial({ color: pip.coat, roughness: 0.7 });
  const bowMat = new THREE.MeshStandardMaterial({ color: '#E8505B', roughness: 0.5 });
  const addEar = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), earMat);
    ear.position.set(x, y, z);
    ear.scale.set(sx, sy, sz);
    ear.userData.pipDecor = true;
    head.add(ear);
  };
  if (pip.kind === 'bun') {
    addEar(-0.18, 0.55, 0, 0.7, 1.6, 0.5);
    addEar(0.18, 0.55, 0, 0.7, 1.6, 0.5);
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), bowMat);
    bow.position.set(0.12, 0.72, 0.05);
    bow.userData.pipDecor = true;
    head.add(bow);
  } else if (pip.kind === 'kit') {
    addEar(-0.2, 0.5, 0, 0.55, 1.2, 0.35);
    addEar(0.2, 0.5, 0, 0.55, 1.2, 0.35);
  } else if (pip.kind === 'bear') {
    addEar(-0.28, 0.35, 0, 1.1, 1.1, 0.6);
    addEar(0.28, 0.35, 0, 1.1, 1.1, 0.6);
  } else if (pip.kind === 'sam') {
    const sprout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#24A148' }));
    sprout.position.set(0, 0.65, 0);
    sprout.userData.pipDecor = true;
    head.add(sprout);
  }
}

/** Keep complete authored hairs, never disconnected triangles. Own all output buffers. */
export function sparseFurGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const index = source.index, vertices = source.getAttribute('position')?.count;
  const strandVertices = 24, strandIndices = 108, stride = 4;
  if (!index || !vertices || vertices % strandVertices || index.count !== vertices / strandVertices * strandIndices) return null;
  for (let i = 0; i < index.count; i++) {
    const start = Math.floor(i / strandIndices) * strandVertices;
    if (index.getX(i) < start || index.getX(i) >= start + strandVertices) return null;
  }
  if (Object.values(source.attributes).some(a => a instanceof THREE.InterleavedBufferAttribute)) return null;
  const strands = Math.ceil(vertices / strandVertices / stride), geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const input = attribute as THREE.BufferAttribute;
    const data = new (input.array.constructor as new(length: number) => typeof input.array)(strands * strandVertices * input.itemSize);
    for (let hair = 0; hair < strands; hair++) {
      const start = hair * stride * strandVertices * input.itemSize;
      data.set(input.array.subarray(start, start + strandVertices * input.itemSize), hair * strandVertices * input.itemSize);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(data, input.itemSize, input.normalized));
  }
  const indices = new Uint32Array(strands * strandIndices);
  for (let hair = 0; hair < strands; hair++) for (let j = 0; j < strandIndices; j++) {
    indices[hair * strandIndices + j] = index.getX(hair * stride * strandIndices + j) - hair * stride * strandVertices + hair * strandVertices;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

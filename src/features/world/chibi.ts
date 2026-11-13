// A chunky little character for each person in the 3D view, built in code from an AvatarLook:
// big round head with a face, hair style, outfit and an accessory. Soft materials and a gentle
// idle bob, walk swing, wave and celebrate, so it reads like a friendly game character.
// Authored in meters (about 1.6 m tall) and drawn AVATAR_SCALE times larger, so people stay
// readable from the camera behind you.
import * as THREE from 'three';
import type { AvatarLook } from './avatarLook';
import type { AvatarState, Character } from './characters';

/** On-screen size: the street camera sits far enough back that life-size people read as specks. */
export const AVATAR_SCALE = 1.7;

const ONE_SHOT = new Set(['wave', 'celebrate']);
const ONE_SHOT_SECONDS: Record<string, number> = { wave: 1.6, celebrate: 1.9 };

export class ChibiAvatar implements Character {
  readonly root = new THREE.Group();
  readonly height = 1.75 * AVATAR_SCALE;
  private body = new THREE.Group();
  private headGroup = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private state: AvatarState = 'idle';
  private base: AvatarState = 'idle';
  private stateT = 0;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(look: AvatarLook) {
    const mat = (color: string, rough = 0.55, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
      this.mats.push(m);
      return m;
    };
    const geo = <G extends THREE.BufferGeometry>(g: G) => { this.geos.push(g); return g; };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo(g), m);
      o.position.set(x, y, z);
      return o;
    };

    const skin = mat(look.skin, 0.6);
    const top = mat(look.topColor, 0.62);
    const bottom = mat(look.bottomColor, 0.7);
    const hair = mat(look.hairColor, 0.8);
    const shoe = mat('#F7F7F7', 0.45);
    const sole = mat('#2B2D42', 0.6);
    const ink = mat('#1C1E21', 0.35);
    const white = mat('#FFFFFF', 0.3, { emissive: '#FFFFFF', emissiveIntensity: 0.25 });
    const blush = mat('#FF8FA3', 0.8, { transparent: true, opacity: 0.55 });

    // Legs and shoes
    const leg = (side: number, g: THREE.Group) => {
      g.position.set(0.12 * side, 0.46, 0);
      g.add(mesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 10), bottom, 0, -0.19, 0));
      const s = mesh(new THREE.SphereGeometry(0.12, 14, 10), shoe, 0, -0.42, 0.04);
      s.scale.set(1, 0.6, 1.35);
      const so = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14), sole, 0, -0.46, 0.04);
      so.scale.set(1, 1, 1.35);
      g.add(s, so);
    };
    leg(-1, this.legL);
    leg(1, this.legR);

    // Torso and outfit
    const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.28, 6, 16), top, 0, 0.72, 0);
    torso.scale.set(1.05, 1, 0.85);
    this.body.add(torso);
    if (look.top === 'hoodie') {
      const hood = mesh(new THREE.TorusGeometry(0.17, 0.07, 10, 20), top, 0, 0.98, -0.1);
      hood.rotation.x = Math.PI / 2.4;
      const pocket = mesh(new THREE.BoxGeometry(0.26, 0.09, 0.04), mat(shade(look.topColor, -0.12)), 0, 0.6, 0.2);
      const strings = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), white, -0.05, 0.86, 0.21);
      const strings2 = strings.clone(); strings2.position.x = 0.05;
      this.body.add(hood, pocket, strings, strings2);
    } else if (look.top === 'jacket') {
      const inner = mesh(new THREE.BoxGeometry(0.12, 0.34, 0.05), white, 0, 0.74, 0.19);
      const collarL = mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), top, -0.08, 0.92, 0.18);
      collarL.rotation.z = 0.5;
      const collarR = collarL.clone(); collarR.position.x = 0.08; collarR.rotation.z = -0.5;
      this.body.add(inner, collarL, collarR);
    } else {
      const hem = mesh(new THREE.TorusGeometry(0.235, 0.02, 6, 24), mat(shade(look.topColor, -0.15)), 0, 0.53, 0);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1.05, 0.85, 1);
      this.body.add(hem);
    }

    // Arms: full sleeves for hoodie/jacket, short sleeves and bare arms for a tee
    const arm = (side: number, g: THREE.Group) => {
      g.position.set(0.3 * side, 0.9, 0);
      const sleeveLong = look.top !== 'tee';
      g.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), top, 0, -0.03, 0));
      g.add(mesh(new THREE.CapsuleGeometry(0.06, sleeveLong ? 0.22 : 0.08, 4, 10), sleeveLong ? top : top, 0, sleeveLong ? -0.17 : -0.1, 0));
      if (!sleeveLong) g.add(mesh(new THREE.CapsuleGeometry(0.052, 0.14, 4, 10), skin, 0, -0.24, 0));
      g.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), skin, 0, -0.36, 0));
    };
    arm(-1, this.armL);
    arm(1, this.armR);

    // Head: big and round, with a face that looks the way the character walks (+Z)
    this.headGroup.position.y = 1.25;
    const head = mesh(new THREE.SphereGeometry(0.32, 28, 22), skin);
    head.scale.set(1, 0.95, 0.95);
    const neck = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 12), skin, 0, -0.3, 0);
    const eyeG = new THREE.SphereGeometry(0.045, 14, 12);
    const eyeL = mesh(eyeG, ink, -0.11, 0.02, 0.28); eyeL.scale.set(0.85, 1.15, 0.6);
    const eyeR = mesh(eyeG, ink, 0.11, 0.02, 0.28); eyeR.scale.set(0.85, 1.15, 0.6);
    const glintG = new THREE.SphereGeometry(0.014, 8, 6);
    const glintL = mesh(glintG, white, -0.095, 0.045, 0.31);
    const glintR = mesh(glintG, white, 0.125, 0.045, 0.31);
    const blushG = new THREE.CircleGeometry(0.045, 16);
    const blushL = mesh(blushG, blush, -0.18, -0.06, 0.255); blushL.rotation.y = -0.45;
    const blushR = mesh(blushG, blush, 0.18, -0.06, 0.255); blushR.rotation.y = 0.45;
    const smile = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI), ink, 0, -0.08, 0.285);
    smile.rotation.z = Math.PI;
    const earL = mesh(new THREE.SphereGeometry(0.06, 10, 8), skin, -0.31, 0, 0); earL.scale.set(0.6, 1, 0.8);
    const earR = mesh(new THREE.SphereGeometry(0.06, 10, 8), skin, 0.31, 0, 0); earR.scale.set(0.6, 1, 0.8);
    this.headGroup.add(head, neck, eyeL, eyeR, glintL, glintR, blushL, blushR, smile, earL, earR);

    // Hair
    const capG = new THREE.SphereGeometry(0.335, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55);
    if (look.hair !== 'buzz') {
      const cap = mesh(capG, hair, 0, 0.02, -0.02);
      cap.rotation.x = -0.35;
      this.headGroup.add(cap);
      const fringe = mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hair, 0, 0.13, 0.17);
      fringe.rotation.x = 0.9;
      fringe.scale.set(1.4, 0.8, 0.7);
      this.headGroup.add(fringe);
    } else {
      const cap = mesh(new THREE.SphereGeometry(0.325, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.01, -0.01);
      cap.rotation.x = -0.25;
      this.headGroup.add(cap);
    }
    if (look.hair === 'curly') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        this.headGroup.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), hair, Math.sin(a) * 0.27, 0.18 + Math.cos(a * 2) * 0.03, Math.cos(a) * 0.25 - 0.04));
      }
    } else if (look.hair === 'long') {
      const back = mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 16), hair, 0, -0.18, -0.13);
      back.scale.set(1.15, 1, 0.55);
      this.headGroup.add(back);
    } else if (look.hair === 'bun') {
      this.headGroup.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), hair, 0, 0.3, -0.16));
    } else if (look.hair === 'ponytail') {
      const tail = mesh(new THREE.CapsuleGeometry(0.07, 0.26, 4, 10), hair, 0, -0.02, -0.34);
      tail.rotation.x = 0.5;
      this.headGroup.add(tail, mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#FF6B9A'), 0, 0.12, -0.3));
    }

    // Accessory
    if (look.accessory === 'glasses') {
      const frame = mat('#1C1E21', 0.3);
      const ring = new THREE.TorusGeometry(0.07, 0.012, 8, 20);
      this.headGroup.add(mesh(ring, frame, -0.11, 0.02, 0.3), mesh(ring, frame, 0.11, 0.02, 0.3), mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), frame, 0, 0.03, 0.31));
      (this.headGroup.children.at(-1) as THREE.Mesh).rotation.z = Math.PI / 2;
    } else if (look.accessory === 'cap') {
      const capColor = mat(shade(look.topColor, -0.1), 0.6);
      const crown = mesh(new THREE.SphereGeometry(0.345, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), capColor, 0, 0.04, 0);
      const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), capColor, 0, 0.13, 0.22);
      brim.scale.set(1.3, 1, 1.1);
      this.headGroup.add(crown, brim);
    } else if (look.accessory === 'beanie') {
      const knit = mat(shade(look.topColor, 0.08), 0.95);
      const dome = mesh(new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), knit, 0, 0.04, 0);
      const fold = mesh(new THREE.TorusGeometry(0.31, 0.05, 10, 28), knit, 0, 0.1, 0);
      fold.rotation.x = Math.PI / 2 - 0.15;
      const pom = mesh(new THREE.SphereGeometry(0.08, 12, 10), white, 0, 0.42, -0.02);
      this.headGroup.add(dome, fold, pom);
    } else if (look.accessory === 'headphones') {
      const hp = mat('#2B2D42', 0.35);
      const band = mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 28, Math.PI), hp, 0, 0.02, 0);
      const cupG = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18);
      const cupL = mesh(cupG, mat(look.topColor, 0.4), -0.34, 0, 0); cupL.rotation.z = Math.PI / 2;
      const cupR = mesh(cupG, mat(look.topColor, 0.4), 0.34, 0, 0); cupR.rotation.z = Math.PI / 2;
      this.headGroup.add(band, cupL, cupR);
    }

    this.body.add(this.headGroup, this.legL, this.legR, this.armL, this.armR);
    this.body.scale.setScalar(AVATAR_SCALE);
    this.root.add(this.body);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
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
    this.legL.rotation.set(0, 0, 0); this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0.12); this.armR.rotation.set(0, 0, -0.12);
    this.headGroup.rotation.set(0, 0, 0);
    let y = 0;
    switch (this.state) {
      case 'walk': {
        const s = Math.sin(t * 9);
        this.legL.rotation.x = s * 0.7;
        this.legR.rotation.x = -s * 0.7;
        this.armL.rotation.x = -s * 0.6;
        this.armR.rotation.x = s * 0.6;
        y = Math.abs(Math.cos(t * 9)) * 0.045;
        this.headGroup.rotation.z = Math.sin(t * 4.5) * 0.04;
        break;
      }
      case 'wave':
        this.armR.rotation.z = -2.6 + Math.sin(this.stateT * 12) * 0.35;
        this.headGroup.rotation.z = -0.08;
        break;
      case 'celebrate': {
        y = Math.abs(Math.sin(this.stateT * 7)) * 0.3;
        this.armL.rotation.z = 2.6;
        this.armR.rotation.z = -2.6;
        break;
      }
      case 'talk':
        this.armR.rotation.x = -0.4 + Math.sin(t * 4) * 0.2;
        this.headGroup.rotation.x = Math.sin(t * 3) * 0.05;
        break;
      default:
        y = Math.sin(t * 2) * 0.012;
        this.headGroup.rotation.y = Math.sin(t * 0.7) * 0.12;
    }
    this.body.position.y = y * AVATAR_SCALE;
  }

  dispose() { this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); }
}

/** Lighten (amt > 0) or darken a hex color. */
function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

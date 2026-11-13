// Muse's signature energy wake: a luminous, layered blue trail that follows Muse's real movement.
//
// Layers (3 draw calls in total, all in the caller's scene and renderer, no postprocessing):
//   A  a restrained leading glow at Muse's tail            (glow mesh)
//   B  the main energy ribbon, tapering and fading with age (ribbon mesh)
//   C  5 to 10 independent light filaments around it        (ribbon mesh)
//   D  a broad soft diffuse glow along the wake             (ribbon mesh)
//   E  pooled sparks that drift off the wake and twinkle    (particle mesh)
// plus a faint aura around Muse that stays when it is idle.
//
// The path is world space: points are left where Muse was, so a turn bends the wake behind Muse and
// old sections never snap. A teleport clears the path instead of drawing a line across the map.
// Usage (see WorldLayer): add `trail.object` to the scene, then every frame
//   trail.update(museWorldPosition, dt, { camera: viewProjectionMatrix, scale })
import * as THREE from 'three';
import { filamentOffset, makeFilaments, type FilamentSpec } from './filaments';
import {
  clamp, DEFAULT_THRESHOLDS, defaultConfig, easeParamsInto, effectiveConfig, hexToRgb01, isJump, modeForSpeed,
  QUALITY_PRESETS, STYLES, styledParams, zeroParams, type ModeParams, type MuseTrailConfig, type MuseTrailMode, type MuseTrailModeSetting,
  type MuseTrailQuality, type MuseTrailStyle,
} from './params';
import { sampleWake, TrailHistory, WakeSamples } from './path';
import { BILLBOARD_VERT, GLOW_FRAG, PARTICLE_FRAG, RIBBON_FRAG, RIBBON_VERT } from './shaders';

export type TrailView = {
  /** Existing response container centre in normalized screen coordinates. */
  result?: { x: number; y: number };
  /** Local-to-clip matrix (projection x view). Needed to face ribbons and sparks at the camera. */
  camera?: THREE.Matrix4;
  /**
   * Where the wake stems from, in world space (the map layer passes the platform under Muse's feet).
   * Default: just behind Muse's centre. The wake leaves from the edge of this point away from the
   * direction of travel.
   */
  anchor?: THREE.Vector3;
  /** World size of Muse (the character's scale). Trail widths, spacing and speeds are relative to it. */
  scale?: number;
  /**
   * How much up/down movement counts as movement (default 1). The map layer passes 0, because Muse's
   * height there is altitude x the zoom scale and changes while pinch-zooming without Muse flying.
   */
  verticalWeight?: number;
};

export type MuseTrailOptions = {
  config?: Partial<MuseTrailConfig>;
  quality?: MuseTrailQuality;
  /** 'walk' is the calm wake for the walking view; 'full' (default) is the showpiece. */
  style?: MuseTrailStyle;
  /** true / false, or 'auto' (default) to follow the prefers-reduced-motion setting. */
  reducedMotion?: boolean | 'auto';
  /** Step the quality down once if the frame rate stays low. Default true. */
  adaptiveQuality?: boolean;
};

export type MuseTrailStats = {
  mode: MuseTrailMode;
  speed: number;
  historyPoints: number;
  particlesAlive: number;
  particleBudget: number;
  filaments: number;
  samples: number;
  quality: MuseTrailQuality;
  style: MuseTrailStyle;
  reducedMotion: boolean;
  drawCalls: number;
  visible: boolean;
};

const MAX_PUSH_PER_FRAME = 24;
const RIBBON_CAP = 96;
const DEFAULT_DEPTH_DIR = new THREE.Vector3(0, -0.6, -0.8).normalize();

export class MuseTrail {
  /** Add this to the scene (identity transform; everything inside is in world space). */
  readonly object = new THREE.Group();

  private cfg: MuseTrailConfig;
  // Preserve the requested quality while reduced-motion temporarily clamps the effective config.
  private requested: MuseTrailConfig;
  private opts: { adaptive: boolean; reducedAuto: boolean };
  private modeSetting: MuseTrailModeSetting = 'auto';
  private mode: MuseTrailMode = 'idle';
  private params: ModeParams = zeroParams();
  private readonly targetParams: Record<MuseTrailMode, ModeParams> = {
    off: styledParams('off', 'full'), idle: styledParams('idle', 'full'), float: styledParams('float', 'full'),
    fly: styledParams('fly', 'full'), dash: styledParams('dash', 'full'),
  };
  private readonly processingParams: ModeParams = {
    ...styledParams('fly', 'full'), ribbon: .24, filament: .62, diffuse: .12, glow: .20, halo: .24, particleRate: 12, spread: .30,
  };
  private readonly reducedParams: ModeParams = zeroParams();
  private readonly offset = { dx: 0, dy: 0 };
  private processing: 'off' | 'pending' | 'success' | 'fade' = 'off';
  private pulseAge = 10;
  private pulseFrom = new THREE.Vector3();
  private pulseTo = new THREE.Vector3();
  private processingAge = 0;
  private processingFinished = true;
  private processingGain = 0;
  private processingCenter = new THREE.Vector3();
  private resultTarget = new THREE.Vector3();
  private hasResult = false;
  private time = 0;
  private disposed = false;
  private mq: MediaQueryList | null = null;
  private onMq = () => { if (this.opts.reducedAuto && this.mq) this.applyReduced(this.mq.matches); };

  // motion
  private hasPrev = false;
  private prev = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private speed = 0; // world units per second, smoothed
  private anchor = new THREE.Vector3();
  private hasSmooth = false;
  private lastAnchor = new THREE.Vector3();
  private hasAnchor = false;
  private history: TrailHistory;
  private wake = new WakeSamples(RIBBON_CAP);
  private slowTime = 0;

  // camera basis (world space)
  private right = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private view = DEFAULT_DEPTH_DIR.clone();
  private inv = new THREE.Matrix4();
  private v4 = new THREE.Vector4();
  private a3 = new THREE.Vector3();
  private b3 = new THREE.Vector3();
  private pO = new THREE.Vector3();
  private pR = new THREE.Vector3();
  private pU = new THREE.Vector3();
  private pN = new THREE.Vector3();
  private pF = new THREE.Vector3();

  // per-sample scratch (tangent, side, lift, turn)
  private tx = new Float32Array(RIBBON_CAP);
  private ty = new Float32Array(RIBBON_CAP);
  private tz = new Float32Array(RIBBON_CAP);
  private sx = new Float32Array(RIBBON_CAP);
  private sy = new Float32Array(RIBBON_CAP);
  private sz = new Float32Array(RIBBON_CAP);
  private lx = new Float32Array(RIBBON_CAP);
  private ly = new Float32Array(RIBBON_CAP);
  private lz = new Float32Array(RIBBON_CAP);
  private turn = new Float32Array(RIBBON_CAP);

  // shared uniforms
  private u = {
    uTime: { value: 0 }, uIntensity: { value: 1 }, uCoreGain: { value: 0 }, uFilGain: { value: 0 }, uDiffGain: { value: 0 },
    uFadePow: { value: 1.5 }, uTipFade: { value: 0.25 },
    uBlue: { value: new THREE.Vector3() }, uBright: { value: new THREE.Vector3() }, uCyan: { value: new THREE.Vector3() }, uPale: { value: new THREE.Vector3() },
    uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
  };

  // ribbons
  private filaments: FilamentSpec[] = [];
  private ribbon: { mesh: THREE.Mesh; geom: THREE.BufferGeometry; pos: Float32Array; info: Float32Array; R: number; M: number } | null = null;
  private ribbonMat: THREE.ShaderMaterial;

  // particles
  private pn = 0;
  private ppos = new Float32Array(0);
  private pvel = new Float32Array(0);
  private page = new Float32Array(0);
  private plife = new Float32Array(0);
  private psize = new Float32Array(0);
  private ptint = new Float32Array(0);
  private pphase = new Float32Array(0);
  private pCursor = 0;
  private pAlive = 0;
  private spawnCarry = 0;
  private particles: { mesh: THREE.Mesh; geom: THREE.BufferGeometry; center: Float32Array; data: Float32Array } | null = null;
  private particleMat: THREE.ShaderMaterial;

  // glows
  private glow: { mesh: THREE.Mesh; geom: THREE.BufferGeometry; center: Float32Array; data: Float32Array };
  private glowMat: THREE.ShaderMaterial;
  private rngState = 0x9e3779b9;

  constructor(options: MuseTrailOptions = {}) {
    const quality = options.quality ?? options.config?.quality ?? 'medium';
    this.requested = defaultConfig(quality, { ...(options.style ? { style: options.style } : {}), ...options.config });
    if (options.reducedMotion === true) this.requested.reducedMotion = true;
    this.cfg = effectiveConfig(this.requested);
    this.opts = { adaptive: options.adaptiveQuality ?? true, reducedAuto: (options.reducedMotion ?? 'auto') === 'auto' };
    this.refreshModeParams();
    this.history = new TrailHistory(QUALITY_PRESETS[this.cfg.quality].historyCap);
    this.object.name = 'Muse_EnergyTrail';
    this.object.frustumCulled = false;

    const blend = {
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide,
    } as const;
    this.ribbonMat = new THREE.ShaderMaterial({ ...blend, uniforms: this.u, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG });
    this.particleMat = new THREE.ShaderMaterial({ ...blend, uniforms: this.u, vertexShader: BILLBOARD_VERT, fragmentShader: PARTICLE_FRAG });
    this.glowMat = new THREE.ShaderMaterial({ ...blend, uniforms: this.u, vertexShader: BILLBOARD_VERT, fragmentShader: GLOW_FRAG });
    this.glow = this.buildGlow();
    this.applyColors();
    this.build();

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.mq.addEventListener?.('change', this.onMq);
      if (this.opts.reducedAuto && this.mq.matches) this.applyReduced(true);
    }
  }

  // ------------------------------------------------------------------ public API
  /** 'auto' (default) picks the mode from Muse's speed; any other value forces that look. */
  setMode(mode: MuseTrailModeSetting): void { this.modeSetting = mode; }
  getMode(): MuseTrailMode { return this.mode; }

  /** Controller-owned signal. Repeated render frames never restart the effect. */
  setProcessing(phase: 'off' | 'pending' | 'success' | 'fade'): void {
    if (phase === this.processing) return;
    this.processing = phase; this.processingAge = 0; this.hasResult = false; this.processingFinished = false;
    this.history.clear(); this.hasAnchor = false;
  }
  /** Exactly one visual pulse per actual transport event; uses the existing ribbon/pool. */
  sendPulse(from: THREE.Vector3, to: THREE.Vector3): void {
    if (this.cfg.reducedMotion) return;
    this.pulseFrom.copy(from); this.pulseTo.copy(to); this.pulseAge=0;
  }
  isProcessing(): boolean { return this.processing === 'pending' || (this.processingAge < .45 && this.processingGain > .001); }

  isReleasing(): boolean { return this.processing === 'success' && this.processingAge < .45; }

  setConfig(patch: Partial<MuseTrailConfig>): void {
    this.requested = { ...this.requested, ...patch };
    const next = effectiveConfig(this.requested);
    const rebuild = next.quality !== this.cfg.quality || next.style !== this.cfg.style || next.filamentCount !== this.cfg.filamentCount
      || next.particleBudget !== this.cfg.particleBudget || next.samples !== this.cfg.samples || next.seed !== this.cfg.seed;
    this.cfg = next;
    this.refreshModeParams();
    this.applyColors();
    if (rebuild) this.build();
  }

  getConfig(): MuseTrailConfig { return { ...this.cfg }; }

  setReducedMotion(on: boolean): void {
    this.opts.reducedAuto = false;
    this.applyReduced(on);
  }

  /** Forget the path and sparks (use when the character is moved on purpose). */
  reset(): void {
    this.history.clear();
    this.hasPrev = false;
    this.hasAnchor = false;
    this.hasSmooth = false;
    this.speed = 0;
    this.plife.fill(0);
    this.pAlive = 0;
    this.spawnCarry = 0;
    this.wake.count = 0;
  }

  stats(): MuseTrailStats {
    return {
      mode: this.mode, speed: this.speed, historyPoints: this.history.length, particlesAlive: this.pAlive,
      particleBudget: this.cfg.particleBudget, filaments: this.filaments.length, samples: this.ribbon?.M ?? 0,
      quality: this.cfg.quality, style: this.cfg.style, reducedMotion: this.cfg.reducedMotion, drawCalls: 3, visible: this.object.visible,
    };
  }

  /**
   * Advance the effect. `position` is Muse's centre in world space (the character's own, never a
   * separate simulation), `dt` seconds since the last call.
   */
  update(position: THREE.Vector3, dt: number, view: TrailView = {}): void {
    if (this.disposed) return;
    dt = clamp(dt, 0, 0.1);
    const scale = view.scale && view.scale > 0 ? view.scale : 1;
    this.time += dt;
    this.u.uTime.value = this.time;
    this.updateBasis(position, view.camera);
    this.adapt(dt);

    this.pulseAge += dt;
    const pulsing = this.pulseAge < .65 && !this.cfg.reducedMotion;
    this.processingAge += dt;
    const processing = this.processing === 'pending' || ((this.processing === 'success' || this.processing === 'fade') && this.processingAge < .45 && this.processingGain > .001);
    if (this.processing !== 'pending' && this.processingAge >= .45 && !this.processingFinished) {
      this.plife.fill(0); this.history.clear(); this.processingFinished = true;
    }
    this.processingCenter.copy(position);
    if (this.processing === 'pending') this.processingGain = Math.min(1, this.processingGain + dt / .45);
    else this.processingGain = Math.max(0, this.processingGain - dt / .45);
    if (this.isReleasing() && view.result && view.camera) {
      const depth = this.v4.set(position.x, position.y, position.z, 1).applyMatrix4(view.camera);
      if (depth.w > 0) {
        const z = depth.z / depth.w;
        const point = this.v4.set(view.result.x, view.result.y, z, 1).applyMatrix4(this.inv);
        this.resultTarget.set(point.x / point.w, point.y / point.w, point.z / point.w);
        this.hasResult = true;
      }
    }

    // ---- motion: speed, direction, teleports
    let moved = 0;
    const vw = view.verticalWeight ?? 1;
    if (this.hasPrev) {
      moved = Math.hypot(position.x - this.prev.x, (position.y - this.prev.y) * vw, position.z - this.prev.z);
      if (isJump(moved, scale)) {
        this.history.clear();
        this.hasAnchor = false;
        this.hasSmooth = false;
        this.speed = 0;
        moved = 0;
      } else if (dt > 0) {
        this.speed += (moved / dt - this.speed) * (1 - Math.exp(-dt / 0.12));
        if (moved > 1e-5) {
          this.a3.set(position.x - this.prev.x, (position.y - this.prev.y) * vw, position.z - this.prev.z).multiplyScalar(1 / moved);
          this.dir.lerp(this.a3, 1 - Math.exp(-dt / 0.15));
          if (this.dir.lengthSq() > 1e-8) this.dir.normalize();
        }
      }
    }
    this.prev.copy(position);
    this.hasPrev = true;

    const speedRatio = this.speed / scale;
    const setting = this.modeSetting;
    this.mode = setting === 'auto' ? modeForSpeed(speedRatio, DEFAULT_THRESHOLDS) : setting;
    const moving = speedRatio >= DEFAULT_THRESHOLDS.moving && this.mode !== 'off';
    // Smoothed speed eases the remaining wake out, but actual displacement owns new emission.
    const emitting = moved > scale * 1e-5 && moving;

    // ---- smooth every layer toward what this mode asks for
    let target = processing || pulsing ? this.processingParams : this.targetParams[this.mode];
    if (this.cfg.reducedMotion) {
      Object.assign(this.reducedParams, target);
      this.reducedParams.ribbon = this.reducedParams.filament = this.reducedParams.diffuse = this.reducedParams.particleRate = 0;
      target = this.reducedParams;
    }
    easeParamsInto(this.params, target, dt, this.params);
    this.u.uFadePow.value = STYLES[this.cfg.style].fadePow;
    this.u.uTipFade.value = STYLES[this.cfg.style].tipFade;

    // ---- anchor: near Muse's rear, from the direction of travel
    if (view.anchor) this.a3.copy(view.anchor).addScaledVector(this.dir, -0.14 * scale); // the platform's rear edge
    else { this.a3.copy(position).addScaledVector(this.dir, -0.2 * scale); this.a3.y -= 0.03 * scale; }
    // Low-pass the anchor so a sudden change of direction curves the wake behind Muse instead of
    // folding it (the path points are left in world space once emitted).
    if (!this.hasSmooth) { this.anchor.copy(this.a3); this.hasSmooth = true; }
    else this.anchor.lerp(this.a3, 1 - Math.exp(-dt / 0.12));

    // ---- emit path points at a fixed spacing (interpolated, so fast moves leave no gaps)
    const longWake = !this.cfg.reducedMotion;
    if (!processing && emitting && longWake) this.emit(scale, speedRatio, dt);
    else if (!this.hasAnchor) { this.lastAnchor.copy(this.anchor); this.hasAnchor = true; }
    else this.lastAnchor.copy(this.anchor);
    const life = this.cfg.trailLifetime * Math.max(0.3, this.params.lifetime);
    this.history.prune(this.time, life);

    // ---- gains for the shaders
    const I = this.cfg.intensity * (processing ? this.processingGain : 1);
    this.u.uIntensity.value = I;
    this.u.uCoreGain.value = this.params.ribbon;
    this.u.uFilGain.value = this.params.filament;
    this.u.uDiffGain.value = this.params.diffuse;

    // ---- layers
    const haveWake = this.buildRibbons(scale, life, processing, pulsing);
    this.stepParticles(dt, scale, processing ? 1 : speedRatio, processing ? this.processing === 'pending' : emitting, life);
    this.placeGlows(position, scale, speedRatio, I);

    const p = this.params;
    const any = Math.max(p.ribbon, p.filament, p.glow, p.halo, p.diffuse) > 0.02;
    if (this.ribbon) this.ribbon.mesh.visible = haveWake && (p.ribbon > 0.02 || p.filament > 0.02 || p.diffuse > 0.02);
    if (this.particles) this.particles.mesh.visible = this.pAlive > 0;
    this.glow.mesh.visible = p.glow > 0.02 || p.halo > 0.02;
    this.object.visible = any || this.pAlive > 0 || this.history.length > 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mq?.removeEventListener?.('change', this.onMq);
    this.object.removeFromParent();
    this.disposeBuilt();
    this.glow.geom.dispose();
    this.ribbonMat.dispose();
    this.particleMat.dispose();
    this.glowMat.dispose();
  }

  // ------------------------------------------------------------------ internals
  private rnd(): number {
    // xorshift32: cheap, allocation-free, deterministic.
    let x = this.rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 4294967296;
  }

  private applyColors(): void {
    const set = (v: THREE.Vector3, hex: string) => { const [r, g, b] = hexToRgb01(hex); v.set(r, g, b); };
    set(this.u.uBlue.value, this.cfg.color);
    set(this.u.uBright.value, this.cfg.brightBlue);
    set(this.u.uCyan.value, this.cfg.cyanAccent);
    set(this.u.uPale.value, this.cfg.paleBlue);
  }

  private applyReduced(on: boolean): void {
    if (this.cfg.reducedMotion === on) return;
    this.requested.reducedMotion = on;
    this.cfg = effectiveConfig(this.requested);
    if (on) { this.history.clear(); this.hasAnchor = false; }
    this.build();
  }

  private refreshModeParams(): void {
    for (const mode of ['off', 'idle', 'float', 'fly', 'dash'] as const) {
      this.targetParams[mode] = styledParams(mode, this.cfg.style);
    }
  }

  /** If the frame rate stays low for a while, drop one quality step (never raised again automatically). */
  private adapt(dt: number): void {
    if (!this.opts.adaptive || this.cfg.quality === 'low') return;
    this.slowTime = dt > 0.034 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 2);
    if (this.slowTime > 3) {
      this.slowTime = 0;
      const lower: MuseTrailQuality = this.cfg.quality === 'high' ? 'medium' : 'low';
      const p = QUALITY_PRESETS[lower];
      this.setConfig({ quality: lower, filamentCount: p.filamentCount, particleBudget: p.particleBudget, samples: p.samples });
    }
  }

  private updateBasis(p: THREE.Vector3, camera?: THREE.Matrix4): void {
    if (!camera) { this.u.uRight.value.copy(this.right); this.u.uUp.value.copy(this.up); return; }
    this.inv.copy(camera).invert();
    const c = this.v4.set(p.x, p.y, p.z, 1).applyMatrix4(camera);
    if (!(c.w > 1e-6)) return; // behind the camera: keep the previous basis
    const nx = c.x / c.w, ny = c.y / c.w, nz = c.z / c.w;
    // Unproject NDC points to world space. Each result gets its OWN vector (they are compared below).
    const un = (x: number, y: number, z: number, out: THREE.Vector3) => {
      const v = this.v4.set(x, y, z, 1).applyMatrix4(this.inv);
      return out.set(v.x / v.w, v.y / v.w, v.z / v.w);
    };
    const o = un(nx, ny, nz, this.pO);
    const r = un(nx + 0.05, ny, nz, this.pR).sub(o);   // screen-right in world space at Muse's depth
    const u = un(nx, ny + 0.05, nz, this.pU).sub(o);   // screen-up
    const vd = un(nx, ny, 1, this.pF).sub(un(nx, ny, -1, this.pN)); // the viewing direction
    if (![r.x, r.y, r.z, u.x, u.y, u.z, vd.x, vd.y, vd.z].every(Number.isFinite) || r.lengthSq() < 1e-12 || u.lengthSq() < 1e-12 || vd.lengthSq() < 1e-12) return;
    this.right.copy(r).normalize();
    this.up.copy(u).normalize();
    this.view.copy(vd).normalize();
    this.u.uRight.value.copy(this.right);
    this.u.uUp.value.copy(this.up);
  }

  private emit(scale: number, speedRatio: number, dt: number): void {
    const spacing = scale * 0.085 * Math.max(1, speedRatio / 1.6);
    if (!this.hasAnchor) { this.lastAnchor.copy(this.anchor); this.hasAnchor = true; this.history.push(this.anchor.x, this.anchor.y, this.anchor.z, this.time); return; }
    const dx = this.anchor.x - this.lastAnchor.x, dy = this.anchor.y - this.lastAnchor.y, dz = this.anchor.z - this.lastAnchor.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < spacing) return;
    const n = Math.min(MAX_PUSH_PER_FRAME, Math.floor(len / spacing));
    for (let i = 1; i <= n; i++) {
      const f = (i * spacing) / len;
      this.history.push(this.lastAnchor.x + dx * f, this.lastAnchor.y + dy * f, this.lastAnchor.z + dz * f, this.time - dt * (1 - f));
    }
    const f = (n * spacing) / len;
    this.lastAnchor.set(this.lastAnchor.x + dx * f, this.lastAnchor.y + dy * f, this.lastAnchor.z + dz * f);
  }

  // ---------------------------------------------------------------- ribbons
  private buildRibbons(scale: number, life: number, processing = false, pulsing = false): boolean {
    const rb = this.ribbon;
    if (!rb) return false;
    const w = this.wake;
    const m = rb.M;
    if (pulsing) {
      const head = this.pulseAge / .48;
      for (let j=0;j<m;j++) {
        const u=j/(m-1), t=Math.max(0,Math.min(1,head-u*.35));
        const arc=Math.sin(t*Math.PI)*scale*.18;
        w.px[j]=this.pulseFrom.x+(this.pulseTo.x-this.pulseFrom.x)*t+this.up.x*arc;
        w.py[j]=this.pulseFrom.y+(this.pulseTo.y-this.pulseFrom.y)*t+this.up.y*arc;
        w.pz[j]=this.pulseFrom.z+(this.pulseTo.z-this.pulseFrom.z)*t+this.up.z*arc;
        w.u[j]=u; w.age[j]=life*Math.max(u*.6,Math.max(0,(head-1)/.35));
      }
      w.count=m;
    } else if (processing && !this.cfg.reducedMotion) {
      const release = this.processing === 'success' && this.hasResult ? Math.min(1, this.processingAge / .45) : 0;
      for (let j = 0; j < m; j++) {
        // An open, uneven stream passes below/behind Muse. A flattened, changing radius and
        // independent depth bend keep it from reading as concentric processing hoops.
        const u = j / (m - 1), a = this.time * 1.35 - u * Math.PI * 1.55;
        const radius = scale * (.24 + .07 * Math.sin(a * 1.37 + this.time * .31) + .19 * u);
        const side = radius * Math.cos(a) + scale * .035 * Math.sin(a * 2.1);
        const height = radius * .62 * Math.sin(a) - scale * .16;
        const drift = scale * (.22 + .12 * Math.sin(a * .73 + this.time * .3));
        w.px[j] = this.processingCenter.x + this.right.x * side + this.up.x * height + this.view.x * drift;
        w.py[j] = this.processingCenter.y + this.right.y * side + this.up.y * height + this.view.y * drift;
        w.pz[j] = this.processingCenter.z + this.right.z * side + this.up.z * height + this.view.z * drift;
        const t = release * release * (3 - 2 * release) * (1 - u * .5);
        w.px[j] += (this.resultTarget.x - w.px[j]) * t;
        w.py[j] += (this.resultTarget.y - w.py[j]) * t;
        w.pz[j] += (this.resultTarget.z - w.pz[j]) * t;
        w.age[j] = u * life * .45; w.u[j] = u;
      }
      w.count = m;
    } else if (sampleWake(this.history, this.anchor.x, this.anchor.y, this.anchor.z, this.time, m, w) < 2) return false;
    const n = w.count;

    // Tangents, camera-facing side vectors, depth (lift) vectors and how sharply the path bends.
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1);
      let x = w.px[a] - w.px[b], y = w.py[a] - w.py[b], z = w.pz[a] - w.pz[b]; // toward Muse (newer)
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      this.tx[j] = x; this.ty[j] = y; this.tz[j] = z;
      // side = tangent x viewDir (a ribbon that always faces the camera)
      let sx = y * this.view.z - z * this.view.y, sy = z * this.view.x - x * this.view.z, sz = x * this.view.y - y * this.view.x;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-4) { sx = this.right.x; sy = this.right.y; sz = this.right.z; } else { sx /= sl; sy /= sl; sz /= sl; }
      this.sx[j] = sx; this.sy[j] = sy; this.sz[j] = sz;
      let lx = sy * z - sz * y, ly = sz * x - sx * z, lz = sx * y - sy * x;
      const ll = Math.hypot(lx, ly, lz) || 1;
      lx /= ll; ly /= ll; lz /= ll;
      this.lx[j] = lx; this.ly[j] = ly; this.lz[j] = lz;
    }
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, j - 2), b = Math.min(n - 1, j + 2);
      const d = this.tx[a] * this.tx[b] + this.ty[a] * this.ty[b] + this.tz[a] * this.tz[b];
      this.turn[j] = clamp((1 - d) * 5, 0, 1);
    }

    const pr = this.params;
    const pos = rb.pos, info = rb.info;
    const unit = scale * 0.11;
    const spread = pr.spread;
    for (let r = 0; r < rb.R; r++) {
      const kind = r === 0 ? 2 : r === 1 ? 0 : 1;
      const spec = kind === 1 ? this.filaments[r - 2] : null;
      const lifeScale = spec ? spec.lifeScale : 1;
      for (let j = 0; j < m; j++) {
        const jj = Math.min(j, n - 1);
        const u = w.u[jj];
        const ageN = clamp(w.age[jj] / (life * lifeScale), 0, 1);
        const taper = Math.pow(Math.max(0, 1 - u), 0.85) * (0.5 + 0.5 * Math.min(1, u / 0.07));
        let dx = 0, dy = 0, half: number;
        if (kind === 2) half = scale * 0.42 * (0.4 + 0.6 * pr.diffuse) * (0.25 + 0.75 * taper);
        else if (kind === 0) half = scale * 0.115 * (0.35 + 0.65 * Math.min(1.3, pr.ribbon)) * taper;
        else {
          const o = filamentOffset(spec!, u, ageN, this.time, spread, this.turn[jj], this.offset);
          dx = o.dx * unit; dy = o.dy * unit;
          half = scale * 0.055 * (0.4 + 0.6 * spec!.width) * (0.45 + 0.55 * Math.min(1.3, pr.filament)) * taper;
        }
        const cx = w.px[jj] + this.sx[jj] * dx + this.lx[jj] * dy;
        const cy = w.py[jj] + this.sy[jj] * dx + this.ly[jj] * dy;
        const cz = w.pz[jj] + this.sz[jj] * dx + this.lz[jj] * dy;
        const v = (r * m + j) * 2;
        pos[v * 3] = cx + this.sx[jj] * half; pos[v * 3 + 1] = cy + this.sy[jj] * half; pos[v * 3 + 2] = cz + this.sz[jj] * half;
        pos[v * 3 + 3] = cx - this.sx[jj] * half; pos[v * 3 + 4] = cy - this.sy[jj] * half; pos[v * 3 + 5] = cz - this.sz[jj] * half;
        info[v * 3 + 2] = ageN;
        info[v * 3 + 5] = ageN;
      }
    }
    const g = rb.geom;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aInfo as THREE.BufferAttribute).needsUpdate = true;
    return true;
  }

  // ---------------------------------------------------------------- particles
  private stepParticles(dt: number, scale: number, speedRatio: number, moving: boolean, life: number): void {
    const pt = this.particles;
    if (!pt || this.pn === 0) return;
    const reduced = this.cfg.reducedMotion;
    const I = this.u.uIntensity.value;
    const w = this.wake;

    // spawn along the wake (never only at the head), biased toward the newer half
    if (moving && w.count >= 2 && this.params.particleRate > 0) {
      const gain = clamp(speedRatio / 1.2, 0.35, 1.6);
      this.spawnCarry += this.params.particleRate * gain * dt * (this.pn / 180);
      while (this.spawnCarry >= 1) {
        this.spawnCarry -= 1;
        if (this.pAlive >= this.pn) { this.spawnCarry = 0; break; }
        this.spawnOne(scale, life, reduced);
      }
    } else this.spawnCarry = 0;

    const centre = pt.center, data = pt.data;
    const drag = Math.exp(-dt * 0.9);
    let alive = 0;
    for (let i = 0; i < this.pn; i++) {
      const o = i * 12, d = i * 16;
      if (this.plife[i] <= 0) {
        for (let k = 0; k < 4; k++) { data[d + k * 4] = 0; data[d + k * 4 + 1] = 0; }
        continue;
      }
      this.page[i] += dt;
      const ageN = this.page[i] / this.plife[i];
      if (ageN >= 1) {
        this.plife[i] = 0;
        for (let k = 0; k < 4; k++) { data[d + k * 4] = 0; data[d + k * 4 + 1] = 0; }
        continue;
      }
      alive++;
      const p3 = i * 3;
      this.pvel[p3] *= drag; this.pvel[p3 + 1] *= drag; this.pvel[p3 + 2] *= drag;
      this.ppos[p3] += this.pvel[p3] * dt; this.ppos[p3 + 1] += this.pvel[p3 + 1] * dt; this.ppos[p3 + 2] += this.pvel[p3 + 2] * dt;
      // fade in and out smoothly (no popping), with a gentle twinkle
      const fadeIn = Math.min(1, ageN / 0.1);
      const fadeOut = 1 - ageN * ageN * (3 - 2 * ageN);
      const tw = 0.76 + 0.24 * Math.sin(this.time * (6 + this.pphase[i] * 5) + this.pphase[i] * 6.2832);
      const alpha = fadeIn * fadeIn * fadeOut * tw * I * 0.9;
      const size = this.psize[i] * (0.55 + 0.45 * (1 - ageN));
      for (let k = 0; k < 4; k++) {
        centre[o + k * 3] = this.ppos[p3]; centre[o + k * 3 + 1] = this.ppos[p3 + 1]; centre[o + k * 3 + 2] = this.ppos[p3 + 2];
        data[d + k * 4] = size; data[d + k * 4 + 1] = alpha; data[d + k * 4 + 2] = this.ptint[i];
      }
    }
    this.pAlive = alive;
    (pt.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (pt.geom.attributes.aData as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnOne(scale: number, life: number, reduced: boolean): void {
    // find a free slot
    let slot = -1;
    for (let k = 0; k < this.pn; k++) {
      const i = (this.pCursor + k) % this.pn;
      if (this.plife[i] <= 0) { slot = i; this.pCursor = (i + 1) % this.pn; break; }
    }
    if (slot < 0) return;
    const w = this.wake;
    const j = Math.min(w.count - 1, Math.floor(Math.pow(this.rnd(), 1.7) * 0.62 * (w.count - 1)));
    const sa = (this.rnd() * 2 - 1), la = (this.rnd() * 2 - 1);
    const jit = scale * 0.05;
    const p3 = slot * 3;
    this.ppos[p3] = w.px[j] + (this.sx[j] * sa + this.lx[j] * la) * jit;
    this.ppos[p3 + 1] = w.py[j] + (this.sy[j] * sa + this.ly[j] * la) * jit;
    this.ppos[p3 + 2] = w.pz[j] + (this.sz[j] * sa + this.lz[j] * la) * jit;
    // drift outward (independently per spark), a little upward, a little back along the wake
    let ox = this.sx[j] * sa + this.lx[j] * la, oy = this.sy[j] * sa + this.ly[j] * la, oz = this.sz[j] * sa + this.lz[j] * la;
    const ol = Math.hypot(ox, oy, oz) || 1;
    const v = scale * (0.06 + this.rnd() * 0.2) * (reduced ? 0.25 : 1);
    ox = (ox / ol) * v; oy = (oy / ol) * v; oz = (oz / ol) * v;
    this.pvel[p3] = ox - this.tx[j] * scale * 0.05;
    this.pvel[p3 + 1] = oy + scale * 0.04 + this.rnd() * scale * 0.05;
    this.pvel[p3 + 2] = oz - this.tz[j] * scale * 0.05;
    this.page[slot] = 0;
    this.plife[slot] = (0.9 + this.rnd() * 1.5) * Math.max(0.4, life / 2) * (reduced ? 0.6 : 1);
    this.psize[slot] = scale * (0.028 + this.rnd() * 0.05);
    this.ptint[slot] = this.rnd() < 0.5 ? 0.6 + this.rnd() * 0.4 : this.rnd() * 0.3;
    this.pphase[slot] = this.rnd();
    this.pAlive++;
  }

  // ---------------------------------------------------------------- glows
  private placeGlows(centre: THREE.Vector3, scale: number, speedRatio: number, I: number): void {
    const g = this.glow;
    const motion = clamp(speedRatio / 1.4, 0, 1.4);
    // Both sit BEHIND Muse (away from the camera), so Muse's body hides their middle and they never
    // wash out its face: only a rim of aura and the leading glow at the tail show.
    const back = 0.16 * scale;
    const lead = this.a3.copy(this.anchor).addScaledVector(this.view, back);
    g.center[0] = g.center[3] = g.center[6] = g.center[9] = lead.x;
    g.center[1] = g.center[4] = g.center[7] = g.center[10] = lead.y;
    g.center[2] = g.center[5] = g.center[8] = g.center[11] = lead.z;
    const ls = scale * (0.13 + 0.13 * motion);
    const la = this.params.glow * (0.2 + 0.4 * Math.min(1, motion)) * I;
    for (let k = 0; k < 4; k++) { g.data[k * 4] = ls; g.data[k * 4 + 1] = la; g.data[k * 4 + 2] = 0; }
    const halo = this.b3.copy(centre).addScaledVector(this.view, 0.28 * scale);
    for (let k = 0; k < 4; k++) {
      g.center[12 + k * 3] = halo.x; g.center[12 + k * 3 + 1] = halo.y; g.center[12 + k * 3 + 2] = halo.z;
      g.data[16 + k * 4] = scale * 0.62; g.data[16 + k * 4 + 1] = this.params.halo * 0.3 * I; g.data[16 + k * 4 + 2] = 1;
    }
    (g.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.geom.attributes.aData as THREE.BufferAttribute).needsUpdate = true;
  }

  // ---------------------------------------------------------------- geometry
  private buildGlow() {
    const geom = new THREE.BufferGeometry();
    const center = new Float32Array(2 * 4 * 3);
    const data = new Float32Array(2 * 4 * 4);
    const corner = new Float32Array(2 * 4 * 2);
    const idx: number[] = [];
    for (let q = 0; q < 2; q++) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) { corner[(q * 4 + k) * 2] = c[k][0]; corner[(q * 4 + k) * 2 + 1] = c[k][1]; }
      const b = q * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const pos = new THREE.BufferAttribute(center, 3); pos.setUsage(THREE.DynamicDrawUsage);
    const dat = new THREE.BufferAttribute(data, 4); dat.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', pos);
    geom.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geom.setAttribute('aData', dat);
    geom.setIndex(idx);
    const mesh = new THREE.Mesh(geom, this.glowMat);
    mesh.frustumCulled = false; mesh.renderOrder = 19; mesh.name = 'Muse_TrailGlow';
    this.object.add(mesh);
    return { mesh, geom, center, data };
  }

  private disposeBuilt(): void {
    if (this.ribbon) { this.object.remove(this.ribbon.mesh); this.ribbon.geom.dispose(); this.ribbon = null; }
    if (this.particles) { this.object.remove(this.particles.mesh); this.particles.geom.dispose(); this.particles = null; }
  }

  /** (Re)create the ribbon and particle geometry for the current config. */
  private build(): void {
    this.disposeBuilt();
    const preset = QUALITY_PRESETS[this.cfg.quality];
    this.history = new TrailHistory(preset.historyCap);
    this.hasAnchor = false;
    this.filaments = makeFilaments(this.cfg.seed, this.cfg.filamentCount);

    // ribbons: [diffuse, main, ...filaments]
    const R = 2 + this.filaments.length;
    const M = Math.min(RIBBON_CAP, this.cfg.samples);
    const verts = R * M * 2;
    const pos = new Float32Array(verts * 3);
    const style = new Float32Array(verts * 4);
    const info = new Float32Array(verts * 3);
    const index: number[] = [];
    for (let r = 0; r < R; r++) {
      const spec = r >= 2 ? this.filaments[r - 2] : null;
      const kind = r === 0 ? 2 : r === 1 ? 0 : 1;
      for (let j = 0; j < M; j++) {
        for (let s = 0; s < 2; s++) {
          const v = (r * M + j) * 2 + s;
          style[v * 4] = kind; style[v * 4 + 1] = spec ? spec.tint : 0.15; style[v * 4 + 2] = spec ? spec.alpha : 1; style[v * 4 + 3] = spec ? spec.phase / 6.2832 : 0;
          info[v * 3] = j / (M - 1); info[v * 3 + 1] = s === 0 ? -1 : 1; info[v * 3 + 2] = 1;
        }
        if (j < M - 1) { const a = (r * M + j) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const geom = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ia = new THREE.BufferAttribute(info, 3); ia.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', pa);
    geom.setAttribute('aStyle', new THREE.BufferAttribute(style, 4));
    geom.setAttribute('aInfo', ia);
    geom.setIndex(index);
    const mesh = new THREE.Mesh(geom, this.ribbonMat);
    mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.visible = false; mesh.name = 'Muse_TrailRibbons';
    this.object.add(mesh);
    this.ribbon = { mesh, geom, pos, info, R, M };

    // particle pool
    this.pn = this.cfg.particleBudget;
    this.ppos = new Float32Array(this.pn * 3); this.pvel = new Float32Array(this.pn * 3);
    this.page = new Float32Array(this.pn); this.plife = new Float32Array(this.pn); this.psize = new Float32Array(this.pn);
    this.ptint = new Float32Array(this.pn); this.pphase = new Float32Array(this.pn);
    this.pAlive = 0; this.pCursor = 0; this.spawnCarry = 0;
    if (this.pn > 0) {
      const center = new Float32Array(this.pn * 12), data = new Float32Array(this.pn * 16), corner = new Float32Array(this.pn * 8);
      const pidx: number[] = [];
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < this.pn; i++) {
        for (let k = 0; k < 4; k++) { corner[(i * 4 + k) * 2] = c[k][0]; corner[(i * 4 + k) * 2 + 1] = c[k][1]; }
        const b = i * 4;
        pidx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const pg = new THREE.BufferGeometry();
      const cp = new THREE.BufferAttribute(center, 3); cp.setUsage(THREE.DynamicDrawUsage);
      const dp = new THREE.BufferAttribute(data, 4); dp.setUsage(THREE.DynamicDrawUsage);
      pg.setAttribute('position', cp);
      pg.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      pg.setAttribute('aData', dp);
      pg.setIndex(pidx);
      const pm = new THREE.Mesh(pg, this.particleMat);
      pm.frustumCulled = false; pm.renderOrder = 21; pm.visible = false; pm.name = 'Muse_TrailSparks';
      this.object.add(pm);
      this.particles = { mesh: pm, geom: pg, center, data };
    }
  }
}

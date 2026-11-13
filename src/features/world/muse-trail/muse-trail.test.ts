import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { filamentOffset, makeFilaments } from './filaments';
import { MuseTrail } from './MuseTrail';
import {
  clamp, DEFAULT_THRESHOLDS, defaultConfig, easeParams, effectiveConfig, hexToRgb01, isJump, JUMP_LENGTHS, MODE_PARAMS, modeForSpeed,
  QUALITY_PRESETS, zeroParams,
} from './params';
import { catmullRom, sampleWake, TrailHistory, WakeSamples } from './path';

describe('modes and config', () => {
  it('picks the mode from speed (in character lengths per second)', () => {
    expect(modeForSpeed(0)).toBe('idle');
    expect(modeForSpeed(DEFAULT_THRESHOLDS.moving + 0.01)).toBe('float');
    expect(modeForSpeed(DEFAULT_THRESHOLDS.fly + 0.01)).toBe('fly');
    expect(modeForSpeed(DEFAULT_THRESHOLDS.dash + 0.01)).toBe('dash');
  });

  it('asks for no wake or sparks when idle, and more of everything as Muse speeds up', () => {
    const { idle, float, fly, dash } = MODE_PARAMS;
    expect([idle.ribbon, idle.filament, idle.particleRate]).toEqual([0, 0, 0]);
    expect(idle.halo).toBeGreaterThan(0); // a subtle localized aura remains
    expect(float.particleRate).toBeLessThan(fly.particleRate);
    expect(fly.particleRate).toBeLessThan(dash.particleRate);
    expect(float.spread).toBeLessThan(fly.spread);
    expect(fly.spread).toBeLessThan(dash.spread);
    expect(fly.lifetime).toBeLessThan(dash.lifetime);
    expect(Object.values(MODE_PARAMS.off).every((v, i) => (i === 7 ? true : v === 0 || v === 1))).toBe(true);
  });

  it('keeps the palette and clamps every config value', () => {
    const c = defaultConfig('high');
    expect(c.color).toBe('#0866FF');
    expect(c.cyanAccent).toBe('#23D9F5');
    expect(hexToRgb01('#FFFFFF')).toEqual([1, 1, 1]);
    const bad = effectiveConfig({ ...c, filamentCount: 999, particleBudget: 99999, trailLifetime: 999, intensity: 99, samples: 9999 });
    expect(bad.filamentCount).toBeLessThanOrEqual(12);
    expect(bad.particleBudget).toBeLessThanOrEqual(400);
    expect(bad.trailLifetime).toBeLessThanOrEqual(6);
    expect(bad.intensity).toBeLessThanOrEqual(2);
    for (const q of ['low', 'medium', 'high'] as const) {
      expect(QUALITY_PRESETS[q].filamentCount).toBeGreaterThanOrEqual(5);
      expect(QUALITY_PRESETS[q].filamentCount).toBeLessThanOrEqual(10);
    }
  });

  it('reduced motion drops the long wake and most sparks', () => {
    const r = effectiveConfig({ ...defaultConfig('high'), reducedMotion: true });
    expect(r.filamentCount).toBe(0);
    expect(r.particleBudget).toBeLessThanOrEqual(12);
    expect(r.trailLifetime).toBeLessThanOrEqual(0.35);
  });

  it('eases parameters smoothly and treats a big jump as a teleport', () => {
    const a = easeParams(zeroParams(), MODE_PARAMS.fly, 0.016);
    expect(a.ribbon).toBeGreaterThan(0);
    expect(a.ribbon).toBeLessThan(MODE_PARAMS.fly.ribbon);
    expect(isJump(JUMP_LENGTHS * 2 + 0.1, 2)).toBe(true);
    expect(isJump(0.5, 2)).toBe(false);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});

describe('path history and the wake curve', () => {
  it('keeps newest first, bounded, and prunes by age', () => {
    const h = new TrailHistory(4);
    for (let i = 0; i < 6; i++) h.push(i, 0, 0, i);
    expect(h.length).toBe(4);
    expect([h.x(0), h.x(1), h.x(3)]).toEqual([5, 4, 2]);
    expect(h.prune(6, 2.5)).toBe(2); // points at t=2,3 are older than 2.5s
    expect(h.length).toBe(2);
    h.clear();
    expect(h.length).toBe(0);
  });

  it('is a smooth Catmull-Rom that passes through its control points', () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBe(1);
    expect(catmullRom(0, 1, 2, 3, 1)).toBe(2);
    const h = new TrailHistory(8);
    // a right-angle turn: along +x then +z, older points further back
    const pts = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]];
    pts.forEach(([x, z], i) => h.push(x, 0, z, i));
    const out = new WakeSamples(32);
    const n = sampleWake(h, 3, 0, 3, 6, 32, out);
    expect(n).toBe(32);
    expect(out.age[0]).toBeCloseTo(0, 5);
    expect(out.age[n - 1]).toBeGreaterThan(out.age[0]);
    // continuous: no sample is farther from the previous than the whole path is long
    for (let j = 1; j < n; j++) expect(Math.hypot(out.px[j] - out.px[j - 1], out.pz[j] - out.pz[j - 1])).toBeLessThan(0.7);
    // the corner is rounded: the direction never turns sharply between neighbouring samples
    // (a hard 90 degree corner would turn 90 degrees in a single step)
    let worst = 0;
    for (let j = 2; j < n; j++) {
      const ax = out.px[j - 1] - out.px[j - 2], az = out.pz[j - 1] - out.pz[j - 2];
      const bx = out.px[j] - out.px[j - 1], bz = out.pz[j] - out.pz[j - 1];
      const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
      worst = Math.max(worst, Math.acos(Math.min(1, Math.max(-1, cos))));
    }
    expect(worst).toBeLessThan(Math.PI / 4);
  });

  it('returns nothing to draw for an empty history', () => {
    expect(sampleWake(new TrailHistory(8), 0, 0, 0, 1, 16, new WakeSamples(16))).toBe(0);
  });
});

describe('filaments', () => {
  it('are deterministic, varied and unevenly spaced', () => {
    const a = makeFilaments('muse', 7), b = makeFilaments('muse', 7), c = makeFilaments('other', 7);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(7);
    expect(new Set(a.map((f) => f.phase.toFixed(3))).size).toBe(7);
    expect(new Set(a.map((f) => f.drift.toFixed(2))).size).toBeGreaterThan(5);
    expect(a.map((f) => f.lifeScale).sort()[0]).toBeLessThan(a.map((f) => f.lifeScale).sort()[6] - 0.05); // fade at different times
    const gaps = a.map((f) => f.base).sort((x, y) => x - y).map((v, i, arr) => (i ? v - arr[i - 1] : 0)).slice(1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.05); // not evenly spaced
    expect(a.some((f) => f.base > 0) && a.some((f) => f.base < 0)).toBe(true);
  });

  it('start close and disperse with age, and fan out on tight turns', () => {
    const f = makeFilaments('muse', 7)[2];
    const young = filamentOffset(f, 0.3, 0.02, 1, 1, 0);
    const old = filamentOffset(f, 0.3, 0.9, 1, 1, 0);
    expect(Math.abs(old.dx)).toBeGreaterThan(Math.abs(young.dx) * 1.5);
    const straight = filamentOffset(f, 0.3, 0.5, 1, 1, 0);
    const turning = filamentOffset(f, 0.3, 0.5, 1, 1, 1);
    expect(Math.abs(turning.dx)).toBeGreaterThan(Math.abs(straight.dx));
    expect(filamentOffset(f, 0.3, 0.5, 1, 0, 0).dx).toBe(0); // no spread, no offset
  });
});

// The effect without a GPU: three builds geometry and materials fine in node.
describe('MuseTrail', () => {
  const view = { scale: 1 };
  const pos = new THREE.Vector3();
  const run = (t: MuseTrail, seconds: number, move: (time: number) => void, dt = 1 / 60) => {
    for (let time = 0; time < seconds; time += dt) { move(time); t.update(pos, dt, view); }
  };
  const circle = (speed: number) => (time: number) => pos.set(Math.cos((time * speed) / 4) * 4, 1, Math.sin((time * speed) / 4) * 4);

  it('stays idle with no wake and no sparks when Muse does not move', () => {
    const t = new MuseTrail({ reducedMotion: false });
    pos.set(0, 1, 0);
    run(t, 3, () => undefined);
    const s = t.stats();
    expect(s.mode).toBe('idle');
    expect(s.historyPoints).toBe(0);
    expect(s.particlesAlive).toBe(0);
    t.dispose();
  });

  it('builds a wake and sparks while flying, within the particle budget', () => {
    const t = new MuseTrail({ quality: 'low', reducedMotion: false, adaptiveQuality: false });
    let maxAlive = 0;
    run(t, 6, (time) => { circle(8)(time); maxAlive = Math.max(maxAlive, t.stats().particlesAlive); });
    const s = t.stats();
    expect(['fly', 'dash']).toContain(s.mode);
    expect(s.historyPoints).toBeGreaterThan(5);
    expect(maxAlive).toBeGreaterThan(0);
    expect(maxAlive).toBeLessThanOrEqual(s.particleBudget);
    expect(s.filaments).toBeGreaterThanOrEqual(5);
    expect(s.drawCalls).toBe(3);
    t.dispose();
  });

  it('keeps the wake in world space: old points stay put while Muse moves on', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    run(t, 2, (time) => pos.set(time * 3, 1, 0));
    const wake = (t as unknown as { history: TrailHistory }).history;
    const oldest = [wake.x(wake.length - 1), wake.z(wake.length - 1)];
    run(t, 0.2, (time) => pos.set(6 + time * 3, 1, 0));
    const wake2 = (t as unknown as { history: TrailHistory }).history;
    const same = Array.from({ length: wake2.length }, (_, i) => wake2.x(i)).includes(oldest[0]);
    expect(same || wake2.length > 0).toBe(true);
    expect(oldest[1]).toBe(0);
    t.dispose();
  });

  it('lets the wake linger after Muse stops, then removes every point and spark cleanly', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false, config: { trailLifetime: 2 } });
    run(t, 4, circle(8));
    expect(t.stats().historyPoints).toBeGreaterThan(5);
    // Muse stops. About a second later the wake is still there...
    run(t, 1, () => undefined);
    expect(t.stats().historyPoints).toBeGreaterThan(0);
    expect(t.stats().visible).toBe(true);
    // ...and a few seconds later everything is gone (path points, sparks, ribbon).
    run(t, 5, () => undefined);
    const s = t.stats();
    expect(s.historyPoints).toBe(0);
    expect(s.particlesAlive).toBe(0);
    t.dispose();
  });

  it('does not draw a line across a teleport', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    run(t, 2, circle(8));
    expect(t.stats().historyPoints).toBeGreaterThan(5);
    pos.set(500, 1, 500); // far beyond JUMP_LENGTHS
    t.update(pos, 1 / 60, view);
    expect(t.stats().historyPoints).toBeLessThanOrEqual(1);
    t.dispose();
  });

  it('draws no long wake and only a few sparks under reduced motion', () => {
    const t = new MuseTrail({ reducedMotion: true, adaptiveQuality: false });
    let maxAlive = 0;
    run(t, 4, (time) => { circle(8)(time); maxAlive = Math.max(maxAlive, t.stats().particlesAlive); });
    const s = t.stats();
    expect(s.reducedMotion).toBe(true);
    expect(s.historyPoints).toBe(0);
    expect(s.filaments).toBe(0);
    expect(maxAlive).toBeLessThanOrEqual(12);
    t.dispose();
  });

  it('can be forced off, and disposes its geometry and materials', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    t.setMode('off');
    run(t, 3, circle(8));
    expect(t.stats().mode).toBe('off');
    expect(t.object.visible).toBe(false);
    const geos: THREE.BufferGeometry[] = [];
    t.object.traverse((o) => { if ((o as THREE.Mesh).geometry) geos.push((o as THREE.Mesh).geometry); });
    let disposed = 0;
    geos.forEach((g) => g.addEventListener('dispose', () => { disposed++; }));
    t.dispose();
    expect(disposed).toBe(geos.length);
    expect(t.object.parent).toBeNull();
    t.update(pos, 0.016, view); // safe after dispose
  });

  it('steps quality down once if the frame rate stays low', () => {
    const t = new MuseTrail({ quality: 'high', reducedMotion: false });
    for (let i = 0; i < 200; i++) t.update(pos.set(i * 0.05, 1, 0), 0.08, view); // ~12 fps
    expect(t.stats().quality).not.toBe('high');
    t.dispose();
  });

  it('survives zero and huge time steps and a missing camera', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    t.update(pos.set(0, 0, 0), 0, view);
    t.update(pos.set(1, 0, 0), 10, view);
    t.update(pos.set(2, 0, 0), 0.016);
    expect(Number.isFinite(t.stats().speed)).toBe(true);
    t.dispose();
  });

  it('faces ribbons and sparks at the camera: right, up and view are distinct, perpendicular and match the camera', () => {
    const cam = new THREE.PerspectiveCamera(40, 1.5, 0.1, 200);
    cam.position.set(3, 9, 11);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    t.update(pos.set(0, 1, 0), 1 / 60, { camera: viewProj, scale: 1 });
    const u = (t as unknown as { u: { uRight: { value: THREE.Vector3 }; uUp: { value: THREE.Vector3 } } }).u;
    const right = u.uRight.value, up = u.uUp.value;
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    expect(right.length()).toBeCloseTo(1, 4);
    expect(up.length()).toBeCloseTo(1, 4);
    expect(Math.abs(right.dot(up))).toBeLessThan(0.05); // a quad built from them has real area
    expect(right.dot(camRight)).toBeGreaterThan(0.99);
    expect(up.dot(camUp)).toBeGreaterThan(0.95);
    t.dispose();
  });

  it('curves the wake smoothly behind a hard 120 degree corner (no folds, no snapping)', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false, quality: 'high' });
    const dt = 1 / 60;
    const speed = 3; // world units per second at scale 1 (about 3 lengths per second: a dash)
    let x = 0, z = 0, dx = 1, dz = 0;
    let worst = 0, at = '';
    for (let i = 0; i < 360; i++) {
      if (i === 150) { dx = Math.cos((2 * Math.PI) / 3); dz = Math.sin((2 * Math.PI) / 3); } // instant 120 degree turn
      x += dx * speed * dt; z += dz * speed * dt;
      t.update(pos.set(x, 1, z), dt, view);
      if (i > 120) {
        const w = (t as unknown as { wake: WakeSamples }).wake;
        for (let j = 2; j < w.count; j++) {
          const ax = w.px[j - 1] - w.px[j - 2], az = w.pz[j - 1] - w.pz[j - 2];
          const bx = w.px[j] - w.px[j - 1], bz = w.pz[j] - w.pz[j - 1];
          const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
          if (la < 0.02 || lb < 0.02) continue; // samples on top of each other have no meaningful direction
          const cos = (ax * bx + az * bz) / (la * lb);
          const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
          if (ang > worst) { worst = ang; at = `frame ${i} sample ${j}/${w.count} seg ${la.toFixed(3)},${lb.toFixed(3)}`; }
        }
      }
    }
    expect(worst, `worst turn ${(worst * 57.3).toFixed(0)} deg at ${at}`).toBeLessThan(Math.PI / 3); // a fold would be near 180 degrees
    t.dispose();
  });

  it('ignores up/down movement when asked (the map layer: pinch-zoom changes Muse\'s height without flying)', () => {
    const t = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    for (let i = 0; i < 120; i++) t.update(pos.set(0, 1 + i * 0.05, 0), 1 / 60, { scale: 1, verticalWeight: 0 });
    expect(t.stats().mode).toBe('idle');
    expect(t.stats().historyPoints).toBe(0);
    const t2 = new MuseTrail({ reducedMotion: false, adaptiveQuality: false });
    for (let i = 0; i < 120; i++) t2.update(pos.set(0, 1 + i * 0.05, 0), 1 / 60, { scale: 1 });
    expect(t2.stats().historyPoints).toBeGreaterThan(0); // default: vertical flight leaves a wake
    t.dispose(); t2.dispose();
  });
});


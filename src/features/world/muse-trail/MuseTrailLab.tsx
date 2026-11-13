'use client';

// Visual test lab for the Muse energy trail (dev only: /dev/muse-trail). The REAL trail over the
// REAL Jolly model (loaded through the app's own loadModels/makePet), on a bright map-like ground, so
// the effect can be judged against the environment it ships in. It is a test harness with its own
// small renderer; the app itself draws the trail inside the existing MapLibre/Three layer.
// Controls: idle, slow hover, normal flight, fast flight, curved path, sharp turn, figure-eight,
// spiral, stop and fade, reduced motion, quality, background. ?path=...&bg=...&quality=... preselect.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadModels, makePet, type Character } from '../characters';
import { MuseTrail, QUALITY_PRESETS, type MuseTrailQuality, type MuseTrailStats, type MuseTrailStyle } from './index';

type PathId = 'idle' | 'hover' | 'normal' | 'fast' | 'curved' | 'sharp' | 'figure8' | 'spiral' | 'stopgo';
type Bg = 'map' | 'white' | 'dark';

const PATHS: { id: PathId; label: string }[] = [
  { id: 'idle', label: 'Idle' }, { id: 'hover', label: 'Slow hover' }, { id: 'normal', label: 'Normal flight' },
  { id: 'fast', label: 'Fast flight' }, { id: 'curved', label: 'Curved path' }, { id: 'sharp', label: 'Sharp turn' },
  { id: 'figure8', label: 'Figure-eight' }, { id: 'spiral', label: 'Spiral' }, { id: 'stopgo', label: 'Stop and fade' },
];
const BG: Record<Bg, string> = { map: '#E9ECEF', white: '#FFFFFF', dark: '#14181F' };
const SCALE = 2; // world size of Muse in the lab (the app passes its zoom-dependent scale)

/** Position on each path for parameter `p`. Speed is set separately, in character lengths per second. */
const SHAPES: Record<Exclude<PathId, 'idle' | 'stopgo'>, { at: (p: number) => [number, number]; speed: number }> = {
  hover: { at: (p) => [Math.cos(p) * 1.1, Math.sin(p) * 0.8], speed: 0.3 },
  normal: { at: (p) => [Math.cos(p) * 5, Math.sin(p) * 2.6], speed: 1.0 },
  fast: { at: (p) => [Math.cos(p) * 6.5, Math.sin(p) * 3.4], speed: 3.2 },
  curved: { at: (p) => [Math.sin(p) * 6, Math.sin(p * 2.0) * 2.6], speed: 1.2 },
  sharp: {
    at: (p) => {
      const pts: [number, number][] = [[-6, -3], [-1, 3.2], [1.5, -3.2], [6, 3], [6, -3]];
      const k = ((p / 2) % pts.length + pts.length) % pts.length, i = Math.floor(k), f = k - i;
      const a = pts[i], b = pts[(i + 1) % pts.length];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    },
    speed: 1.4,
  },
  figure8: { at: (p) => [Math.sin(p) * 6, Math.sin(p * 2) * 2.7], speed: 1.25 },
  spiral: { at: (p) => { const r = 3.3 + 2.4 * Math.sin(p / 5); return [Math.cos(p) * r, Math.sin(p) * r * 0.62]; }, speed: 1.3 },
};

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function MuseTrailLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [path, setPath] = useState<PathId>('normal');
  const [bg, setBg] = useState<Bg>('map');
  const [quality, setQuality] = useState<MuseTrailQuality>('high');
  const [style, setStyle] = useState<MuseTrailStyle>('full');
  const [reduced, setReduced] = useState(false);
  const [showJolly, setShowJolly] = useState(true);
  const [intensity, setIntensity] = useState(1);
  const [lifetime, setLifetime] = useState(2);
  const [stats, setStats] = useState<MuseTrailStats | null>(null);
  const [fps, setFps] = useState(0);
  const [ready, setReady] = useState(false);
  // live values the animation loop reads without re-creating the scene
  const live = useRef({ path, bg, showJolly });
  live.current = { path, bg, showJolly };
  const api = useRef<{ trail: MuseTrail | null }>({ trail: null });

  // initial selections from the URL
  useEffect(() => {
    const p = readParam('path'); if (p && [...PATHS].some((x) => x.id === p)) setPath(p as PathId);
    const b = readParam('bg'); if (b === 'map' || b === 'white' || b === 'dark') setBg(b);
    const st = readParam('style'); if (st === 'walk' || st === 'full') setStyle(st);
    const q = readParam('quality'); if (q === 'low' || q === 'medium' || q === 'high') setQuality(q);
    if (readParam('reduced') === '1') setReduced(true);
    const l = Number(readParam('linger')); if (l >= 0.6 && l <= 4) setLifetime(l);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 15, 13.5);
    camera.lookAt(0, 0.4, 0.4);

    scene.add(new THREE.HemisphereLight('#ffffff', '#8d8d8d', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(-40, 100, 60); scene.add(sun);

    // a bright, map-like ground: pale base, white roads and a few light-grey blocks
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: BG.map }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const roadMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const blockMat = new THREE.MeshLambertMaterial({ color: '#D4D9DE' });
    const decor = new THREE.Group();
    for (const [x, z, w, d] of [[0, 8.5, 40, 1.6], [0, -9.5, 40, 1.6], [-14, 0, 1.6, 30], [14, 0, 1.6, 30]] as const) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z); decor.add(r);
    }
    for (const [x, z, w, d, h] of [[-11, -6.5, 3.4, 3, 1.6], [11, -6.5, 4, 3, 2.4], [-11, 6, 3.2, 2.6, 1.2], [11.5, 6, 2.8, 2.6, 1.4]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat); b.position.set(x, h / 2, z); decor.add(b);
    }
    scene.add(decor);

    const holder = api.current;
    const initialStyle = readParam('style') === 'walk' ? 'walk' : 'full';
    const trail = new MuseTrail({ quality, style: initialStyle, reducedMotion: false, adaptiveQuality: false, config: { seed: 'jolly' } });
    holder.trail = trail;
    scene.add(trail.object);

    let jolly: Character | null = null;
    let disposed = false;
    if (readParam('jolly') === '0') { setShowJolly(false); setReady(true); }
    else void loadModels().then((models) => {
      if (disposed) return;
      jolly = makePet(models, 'lab');
      jolly.root.traverse((o) => { o.frustumCulled = false; });
      jolly.setState('fly');
      scene.add(jolly.root);
      setReady(true);
    });

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    window.addEventListener('resize', size);

    const pos = new THREE.Vector3(0, 0, 0);
    const viewProj = new THREE.Matrix4();
    const platform = new THREE.Vector3();
    let phase = 0, last = performance.now(), t = 0, frames = 0, fpsAt = last, raf = 0, prevPath: PathId | null = null;
    let heading = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
      const { path: pid, bg: bgNow, showJolly: showNow } = live.current;
      (ground.material as THREE.MeshBasicMaterial).color.set(BG[bgNow]);
      renderer.setClearColor(BG[bgNow]);
      roadMat.color.set(bgNow === 'dark' ? '#232A35' : '#FFFFFF');
      blockMat.color.set(bgNow === 'dark' ? '#2A323F' : '#D4D9DE');

      // ---- move Muse along the chosen path at a steady speed (character lengths per second)
      if (pid !== prevPath) { prevPath = pid; phase = 0; t = 0; }
      let moving = true;
      let spd = 0;
      let shape = pid === 'idle' || pid === 'stopgo' ? SHAPES.normal : SHAPES[pid];
      if (pid === 'idle') moving = false;
      if (pid === 'stopgo') { moving = t % 7 < 3.2; shape = SHAPES.normal; }
      if (moving) {
        spd = shape.speed * SCALE;
        const e = 0.01, a = shape.at(phase), b = shape.at(phase + e);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        phase += (e * spd * dt) / len;
        const p2 = shape.at(phase);
        const dx = p2[0] - pos.x, dz = p2[1] - pos.z;
        if (Math.hypot(dx, dz) > 1e-4 && dt > 0) heading = Math.atan2(dx, dz);
        pos.x = p2[0]; pos.z = p2[1];
      } else if (pid === 'idle') {
        // Idle must remain in frame at phone widths so ambient/pending can be compared.
        pos.x = 0; pos.z = 0;
      }
      pos.y = 0.8 * SCALE + (pid === 'idle' ? 0 : Math.sin(t * 1.6) * 0.05 * SCALE);

      if (jolly) {
        const s = SCALE * 0.9;
        jolly.root.visible = showNow;
        jolly.root.position.set(pos.x, pos.y - jolly.height * s * 0.4, pos.z);
        jolly.root.rotation.set(0, heading, 0);
        jolly.root.scale.setScalar(s);
        jolly.update(dt, t);
      }

      camera.updateMatrixWorld();
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      // the wake stems from the platform under Muse's feet, like in the map layer
      platform.set(pos.x, jolly ? pos.y - jolly.height * SCALE * 0.9 * 0.4 + 0.03 * SCALE : pos.y - 0.5 * SCALE, pos.z);
      trail.update(pos, dt, { camera: viewProj, scale: SCALE * 0.9, anchor: platform });
      renderer.render(scene, camera);

      frames++;
      if (now - fpsAt > 500) { setFps(Math.round((frames * 1000) / (now - fpsAt))); frames = 0; fpsAt = now; setStats(trail.stats()); }
    };
    raf = requestAnimationFrame(tick);
    (window as unknown as { __muse?: unknown }).__muse = { trail };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      trail.dispose();
      holder.trail = null;
      if (jolly) { scene.remove(jolly.root); jolly.dispose(); }
      ground.geometry.dispose(); (ground.material as THREE.Material).dispose();
      decor.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      roadMat.dispose(); blockMat.dispose();
      renderer.dispose();
    };
    // the scene is built once; quality is applied through setConfig below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = QUALITY_PRESETS[quality];
    api.current.trail?.setConfig({ quality, filamentCount: p.filamentCount, particleBudget: p.particleBudget, samples: p.samples });
  }, [quality]);
  useEffect(() => { api.current.trail?.setReducedMotion(reduced); }, [reduced]);
  useEffect(() => { api.current.trail?.setConfig({ style }); }, [style]);
  useEffect(() => { api.current.trail?.setConfig({ intensity }); }, [intensity]);
  useEffect(() => { api.current.trail?.setConfig({ trailLifetime: lifetime }); }, [lifetime]);

  const btn = (on: boolean) => `rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${on ? 'bg-[#0866FF] text-white' : 'bg-white/90 text-[#080809] hover:bg-white'}`;
  return (
    <div className="fixed inset-0 bg-[#E9ECEF]" data-testid="trail-lab" data-ready={ready}>
      <canvas ref={canvas} className="h-full w-full" data-testid="trail-canvas" />
      <div className="absolute bottom-3 left-3 flex max-w-[min(94vw,560px)] flex-col gap-2 rounded-xl bg-black/55 p-3 text-white backdrop-blur-sm">
        <p className="text-[13px] font-bold uppercase tracking-wide">Muse energy trail lab</p>
        <div className="flex flex-wrap gap-1.5">
          {PATHS.map((p) => <button key={p.id} className={btn(path === p.id)} onClick={() => setPath(p.id)} data-testid={`path-${p.id}`}>{p.label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          {(['walk', 'full'] as MuseTrailStyle[]).map((st) => <button key={st} className={btn(style === st)} onClick={() => setStyle(st)} data-testid={`style-${st}`}>{st === 'walk' ? 'Walk style' : 'Full style'}</button>)}
          <button className={btn(reduced)} onClick={() => setReduced((v) => !v)} data-testid="toggle-reduced">Reduced motion</button>
          <button className={btn(showJolly)} onClick={() => setShowJolly((v) => !v)} data-testid="toggle-jolly">Jolly</button>
          {(['map', 'white', 'dark'] as Bg[]).map((b) => <button key={b} className={btn(bg === b)} onClick={() => setBg(b)} data-testid={`bg-${b}`}>{b}</button>)}
          {(['low', 'medium', 'high'] as MuseTrailQuality[]).map((q) => <button key={q} className={btn(quality === q)} onClick={() => setQuality(q)} data-testid={`q-${q}`}>{q}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">Intensity <input type="range" min={0.3} max={1.6} step={0.1} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} /></label>
          <label className="flex items-center gap-1">Linger <input type="range" min={0.6} max={4} step={0.2} value={lifetime} onChange={(e) => setLifetime(Number(e.target.value))} /> {lifetime.toFixed(1)}s</label>
        </div>
        <p className="font-mono text-[11px] text-white/80" data-testid="trail-stats">
          {stats ? `mode ${stats.mode} · speed ${(stats.speed / (SCALE * 0.9)).toFixed(2)} L/s · path ${stats.historyPoints} · sparks ${stats.particlesAlive}/${stats.particleBudget} · strands ${stats.filaments} · ${stats.quality}${stats.reducedMotion ? ' · reduced' : ''} · ${fps} fps` : 'starting…'}
        </p>
      </div>
    </div>
  );
}

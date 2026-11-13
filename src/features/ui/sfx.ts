'use client';
// Out Here sound effects (CC0, Kenney + OpenGameArt; sources in CREDITS.md and public/sfx).
// Web Audio, no dependency: each file is fetched and decoded once, then played through one
// master gain. Rules (from the pack's SOUNDS.md):
// - Nothing plays before the first tap (browsers block it); a cue fired earlier is dropped.
// - Repeating cues are throttled; nothing plays while the tab is hidden.
// - prefers-reduced-motion keeps only the essential cues (send, receive, accept, go, arrive, shutter, errors).
// - One mute switch, remembered per browser (localStorage `oh.sfx.muted`).
import { useSyncExternalStore } from 'react';

type Tier = 'essential' | 'flair';
export const SFX = {
  map_open: { v: 0.35, tier: 'flair' },
  free_tap: { v: 0.6, tier: 'essential' },
  muse_step: { v: 0.25, tier: 'flair' },
  muse_done: { v: 0.4, tier: 'flair' },
  results_reveal: { v: 0.5, tier: 'flair' },
  card_select: { v: 0.4, tier: 'flair' },
  invite_send: { v: 0.6, tier: 'essential' },
  invite_received: { v: 0.55, tier: 'essential' },
  accept_stamp: { v: 0.7, tier: 'essential' },
  friend_joined: { v: 0.6, tier: 'essential' },
  countdown_tick: { v: 0.5, tier: 'essential' },
  lets_go: { v: 0.7, tier: 'essential' },
  zoom_whoosh: { v: 0.45, tier: 'flair' },
  walk_step: { v: 0.18, tier: 'flair' },
  walk_step_2: { v: 0.18, tier: 'flair' },
  walk_step_3: { v: 0.18, tier: 'flair' },
  progress_tick: { v: 0.3, tier: 'flair' },
  arrival_made_it: { v: 0.75, tier: 'essential' },
  selfie_shutter: { v: 0.7, tier: 'essential' },
  polaroid_develop: { v: 0.45, tier: 'flair' },
  pin_board: { v: 0.5, tier: 'flair' },
  vision_caption: { v: 0.4, tier: 'flair' },
  rating_star: { v: 0.35, tier: 'flair' },
  rating_submit: { v: 0.5, tier: 'flair' },
  chat_send: { v: 0.35, tier: 'flair' },
  chat_receive: { v: 0.35, tier: 'flair' },
  pip_hop: { v: 0.3, tier: 'flair' },
  pet_levelup: { v: 0.6, tier: 'flair' },
  toggle_on: { v: 0.35, tier: 'flair' },
  toggle_off: { v: 0.35, tier: 'flair' },
  tap: { v: 0.2, tier: 'flair' },
  sheet_open: { v: 0.25, tier: 'flair' },
  sheet_close: { v: 0.25, tier: 'flair' },
  soft_no: { v: 0.35, tier: 'essential' },
  error: { v: 0.4, tier: 'essential' },
  pop_stamp: { v: 0.35, tier: 'flair' },
  ink_trail: { v: 0.3, tier: 'flair' },
  ticket_tear: { v: 0.55, tier: 'flair' },
  rally_split: { v: 0.6, tier: 'flair' },
  confetti: { v: 0.4, tier: 'flair' },
} as const satisfies Record<string, { v: number; tier: Tier }>;
export type SfxName = keyof typeof SFX;

/** Minimum gap between two plays of the same cue. */
const THROTTLE_MS: Partial<Record<SfxName, number>> = {
  pop_stamp: 120, muse_step: 400, pip_hop: 3000, walk_step: 300, walk_step_2: 300, walk_step_3: 300,
  progress_tick: 600, tap: 80, sheet_open: 300, sheet_close: 300, map_open: 60_000,
};
const MASTER = 0.8;
const STORE_KEY = 'oh.sfx.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
const buffers = new Map<SfxName, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SfxName, number>();
const listeners = new Set<() => void>();
let muted = false;
let stepIdx = 0;

function readMuted(): boolean {
  try { return window.localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

function canWebm(): boolean {
  try { return document.createElement('audio').canPlayType('audio/webm; codecs="opus"') !== ''; } catch { return false; }
}

function load(name: SfxName): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    const ext = canWebm() ? 'webm' : 'mp3';
    p = fetch(`/sfx/${name}.${ext}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => (ctx ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

/** The first tap/key opens the audio context (browsers require a gesture) and warms the hero cues. */
function unlock() {
  if (unlocked || typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    void ctx.resume();
    unlocked = true;
    for (const n of ['free_tap', 'invite_send', 'invite_received', 'accept_stamp', 'friend_joined', 'lets_go', 'arrival_made_it', 'selfie_shutter', 'muse_done', 'results_reveal', 'zoom_whoosh'] as SfxName[]) void load(n);
  } catch { /* no audio: the app works silently */ }
}

if (typeof window !== 'undefined') {
  muted = readMuted();
  const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (s) { try { s.type = 'ambient'; } catch { /* older Safari */ } }
  const once = () => { unlock(); window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Play a cue. `rate` shifts pitch (e.g. a rising star). Silently does nothing when it shouldn't play. */
export function sfx(name: SfxName, opts: { rate?: number; volume?: number } = {}): void {
  if (typeof window === 'undefined' || muted || !unlocked || !ctx || !master) return;
  if (document.hidden) return;
  const spec = SFX[name];
  if (spec.tier === 'flair' && reducedMotion()) return;
  const now = performance.now();
  const gap = THROTTLE_MS[name];
  if (gap && now - (lastPlayed.get(name) ?? -Infinity) < gap) return;
  lastPlayed.set(name, now);
  const c = ctx, out = master;
  void load(name).then((buf) => {
    if (!buf || muted) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      if (opts.rate) src.playbackRate.value = opts.rate;
      const g = c.createGain();
      g.gain.value = Math.min(1, spec.v * (opts.volume ?? 1));
      src.connect(g).connect(out);
      src.start();
    } catch { /* ignore */ }
  });
}

/** A soft footstep, rotating three variants. Call at most every ~25 m of walking, never per frame. */
export function footstep(): void {
  const names: SfxName[] = ['walk_step', 'walk_step_2', 'walk_step_3'];
  sfx(names[stepIdx++ % 3]!, { rate: 0.95 + (stepIdx % 3) * 0.04 });
}

export function setSfxMuted(m: boolean): void {
  muted = m;
  try { window.localStorage.setItem(STORE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  for (const l of listeners) l();
}

export function useSfxMuted(): [boolean, (m: boolean) => void] {
  const m = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => muted,
    () => false,
  );
  return [m, setSfxMuted];
}

// Muse energy trail: modes, configuration, quality presets and the speed rules. Pure (no three),
// so it is unit-tested. The look itself lives in MuseTrail.ts and shaders.ts.

export type MuseTrailMode = 'off' | 'idle' | 'float' | 'fly' | 'dash';
/** `auto` picks idle / float / fly / dash from Muse's actual speed. */
export type MuseTrailModeSetting = MuseTrailMode | 'auto';
export type MuseTrailQuality = 'low' | 'medium' | 'high';
/** `full` is the showpiece wake (flights, deliveries). `walk` is the calm one for the walking view. */
export type MuseTrailStyle = 'full' | 'walk';

export type MuseTrailConfig = {
  /** Main electric blue (Facebook blue). */
  color: string;
  /** Bright luminous blue, used for the lively mid tones. */
  brightBlue: string;
  /** Cyan highlights. */
  cyanAccent: string;
  /** Pale blue-white, the hottest point near Muse. */
  paleBlue: string;
  /** Independent light strands around the main ribbon (about 5 to 10). */
  filamentCount: number;
  /** Hard cap on live particles. */
  particleBudget: number;
  /** Seconds a path sample lives: how long the wake lingers after Muse stops. */
  trailLifetime: number;
  /** Overall brightness, 0 to 2. */
  intensity: number;
  quality: MuseTrailQuality;
  style: MuseTrailStyle;
  /** Samples along each ribbon. */
  samples: number;
  /** Shorten everything: no long wake, a few slow sparks, a soft halo. */
  reducedMotion: boolean;
  /** Seeds the filament shapes so one Muse looks the same every time. */
  seed: string;
};

export const COLORS = {
  color: '#0866FF',
  brightBlue: '#168AFF',
  cyanAccent: '#23D9F5',
  paleBlue: '#B8F7FF',
} as const;

type Preset = { filamentCount: number; particleBudget: number; samples: number; historyCap: number };
export const QUALITY_PRESETS: Record<MuseTrailQuality, Preset> = {
  low: { filamentCount: 5, particleBudget: 80, samples: 40, historyCap: 56 },
  medium: { filamentCount: 7, particleBudget: 180, samples: 60, historyCap: 80 },
  high: { filamentCount: 10, particleBudget: 320, samples: 88, historyCap: 112 },
};

export function defaultConfig(quality: MuseTrailQuality = 'medium', overrides: Partial<MuseTrailConfig> = {}): MuseTrailConfig {
  const p = QUALITY_PRESETS[quality];
  return {
    ...COLORS,
    filamentCount: p.filamentCount,
    particleBudget: p.particleBudget,
    trailLifetime: 2.0,
    intensity: 1,
    quality,
    style: 'full',
    samples: p.samples,
    reducedMotion: false,
    seed: 'muse',
    ...overrides,
  };
}

/** The numbers actually used: clamps a config so a bad value can never blow the budget. */
export function effectiveConfig(c: MuseTrailConfig): MuseTrailConfig {
  const p = QUALITY_PRESETS[c.quality];
  const base: MuseTrailConfig = {
    ...c,
    filamentCount: Math.round(clamp(c.filamentCount, 0, 12)),
    particleBudget: Math.round(clamp(c.particleBudget, 0, 400)),
    trailLifetime: clamp(c.trailLifetime, 0.2, 6),
    intensity: clamp(c.intensity, 0, 2),
    samples: Math.round(clamp(c.samples, 8, p.samples + 16)),
  };
  if (base.style === 'walk') {
    base.filamentCount = Math.min(base.filamentCount, 4);
    base.particleBudget = Math.min(base.particleBudget, 40);
  }
  if (!base.reducedMotion) return base;
  return {
    ...base,
    filamentCount: 0,
    particleBudget: Math.min(base.particleBudget, 12),
    trailLifetime: Math.min(base.trailLifetime, 0.35),
    intensity: Math.min(base.intensity, 0.8),
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- styles
/**
 * How a style reshapes the mode values. `walk` is for the walking view: thinner, fainter, few
 * strands and sparks, a short wake that fades from the tip toward the platform it stems from.
 */
export type StyleParams = {
  ribbon: number; filament: number; sparks: number; glow: number; halo: number; diffuse: number;
  /** Multiplier on the wake lifetime. */
  lifetime: number;
  /** How steeply a point fades with age (higher = the far end disappears sooner). */
  fadePow: number;
  /** 0..1 extra fade toward the tip, by position along the wake. */
  tipFade: number;
};
export const STYLES: Record<MuseTrailStyle, StyleParams> = {
  full: { ribbon: 1, filament: 1, sparks: 1, glow: 1, halo: 1, diffuse: 1, lifetime: 1, fadePow: 1.5, tipFade: 0.25 },
  walk: { ribbon: 0.62, filament: 0.5, sparks: 0.3, glow: 0.45, halo: 0.3, diffuse: 0.42, lifetime: 0.55, fadePow: 2.3, tipFade: 0.9 },
};

/** A mode's values with a style applied. */
export function styledParams(mode: MuseTrailMode, style: MuseTrailStyle): ModeParams {
  const m = MODE_PARAMS[mode], s = STYLES[style];
  return {
    ribbon: m.ribbon * s.ribbon, filament: m.filament * s.filament, spread: m.spread, particleRate: m.particleRate * s.sparks,
    glow: m.glow * s.glow, halo: m.halo * s.halo, lifetime: m.lifetime * s.lifetime, diffuse: m.diffuse * s.diffuse,
  };
}

// ---------------------------------------------------------------- modes
/** What each mode asks of every layer. All values are smoothed toward, never jumped to. */
export type ModeParams = {
  /** Main ribbon strength (width and opacity). */
  ribbon: number;
  /** Secondary filaments strength. */
  filament: number;
  /** How far the filaments fan out. */
  spread: number;
  /** Particles per second at full speed. */
  particleRate: number;
  /** Leading glow strength. */
  glow: number;
  /** Soft aura around Muse. */
  halo: number;
  /** Multiplier on the path lifetime (a fast dash leaves a longer wake). */
  lifetime: number;
  /** Diffuse broad glow along the wake. */
  diffuse: number;
};

export const MODE_PARAMS: Record<MuseTrailMode, ModeParams> = {
  off: { ribbon: 0, filament: 0, spread: 0, particleRate: 0, glow: 0, halo: 0, lifetime: 1, diffuse: 0 },
  idle: { ribbon: 0, filament: 0, spread: 0.4, particleRate: 0, glow: 0.12, halo: 0.55, lifetime: 1, diffuse: 0 },
  float: { ribbon: 0.5, filament: 0.62, spread: 0.55, particleRate: 9, glow: 0.45, halo: 0.6, lifetime: 0.85, diffuse: 0.45 },
  fly: { ribbon: 1, filament: 1, spread: 1, particleRate: 38, glow: 0.9, halo: 0.7, lifetime: 1, diffuse: 0.85 },
  dash: { ribbon: 1.2, filament: 1.2, spread: 1.55, particleRate: 85, glow: 1.3, halo: 0.8, lifetime: 1.25, diffuse: 1.1 },
};

export const MODES: MuseTrailMode[] = ['off', 'idle', 'float', 'fly', 'dash'];

/** Speed thresholds, in character lengths per second (speed divided by the world scale). */
export type SpeedThresholds = { moving: number; fly: number; dash: number };
export const DEFAULT_THRESHOLDS: SpeedThresholds = { moving: 0.12, fly: 0.45, dash: 1.8 };

/** idle below `moving`, float below `fly`, fly below `dash`, dash above. Never returns 'off'. */
export function modeForSpeed(speedPerScale: number, t: SpeedThresholds = DEFAULT_THRESHOLDS): Exclude<MuseTrailMode, 'off'> {
  if (speedPerScale < t.moving) return 'idle';
  if (speedPerScale < t.fly) return 'float';
  if (speedPerScale < t.dash) return 'fly';
  return 'dash';
}

/** Move `current` toward `target`; rising values react fast, falling values ease out. */
export function easeParams(current: ModeParams, target: ModeParams, dt: number, rise = 0.18, fall = 0.55): ModeParams {
  const out = { ...current };
  return easeParamsInto(current, target, dt, out, rise, fall);
}

const PARAM_KEYS: (keyof ModeParams)[] = ['ribbon', 'filament', 'spread', 'particleRate', 'glow', 'halo', 'lifetime', 'diffuse'];

/** The frame loop reuses its output instead of allocating a params object and key array. */
export function easeParamsInto(current: ModeParams, target: ModeParams, dt: number, out: ModeParams, rise = 0.18, fall = 0.55): ModeParams {
  for (const k of PARAM_KEYS) {
    const tau = target[k] > current[k] ? rise : fall;
    out[k] = current[k] + (target[k] - current[k]) * (1 - Math.exp(-dt / tau));
  }
  return out;
}

export const zeroParams = (): ModeParams => ({ ...MODE_PARAMS.off });

// ---------------------------------------------------------------- discontinuities
/** A step of more than this many character lengths in one frame is a teleport, not movement. */
export const JUMP_LENGTHS = 6;
export const isJump = (step: number, scale: number): boolean => step > JUMP_LENGTHS * scale;

// ---------------------------------------------------------------- hex
/** "#RRGGBB" to sRGB floats 0..1 (the shaders write display colours directly). */
export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

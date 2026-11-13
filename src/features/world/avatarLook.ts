// What a person's little 3D character looks like — and Pip's coat. Everyone gets a stable look
// from their user id. The viewer customizes You and Pip in the dresser; both are saved per
// persona in this browser (localStorage).

export const SKIN = ['#FBE3CF', '#F2C9A5', '#E0A982', '#C68A62', '#9C6644', '#6F4630'] as const;
export const HAIR_COLORS = ['#1E1B1A', '#3B2A20', '#6B4226', '#A8743D', '#E2C27A', '#C2453A', '#6C5CE7', '#F2F2F2'] as const;
/** Clip top row: blue, red, yellow, green, pink, white, black, purple. */
export const CLIP_TOP_COLORS = ['#0866FF', '#E8505B', '#F2A900', '#24A148', '#FF8FAB', '#F5F5F5', '#1C1E21', '#8A3FFC'] as const;
export const TOP_COLORS = [...CLIP_TOP_COLORS, '#00A3A3', '#FF7A00', '#D12771', '#2B2D42'] as const;
export const BOTTOM_COLORS = ['#2B2D42', '#3D5A80', '#4A4E69', '#5C4033', '#D8CFC4', '#1C1E21'] as const;
export const SHOE_COLORS = ['#F7F7F7', '#1C1E21', '#0866FF', '#E8505B', '#F2A900'] as const;
export const HAIR_STYLES = ['short', 'buzz', 'curly', 'long', 'bun', 'ponytail'] as const;
export const TOPS = ['tee', 'hoodie', 'jacket'] as const;
export const ACCESSORIES = ['none', 'glasses', 'cap', 'beanie', 'headphones'] as const;
export const PATTERNS = ['plain', 'stripes', 'dots', 'ticket'] as const;
export const HATS = ['none', 'beanie', 'cap', 'bucket', 'dumpling', 'crown'] as const;

export const PIP_KINDS = ['jolly', 'bun', 'kit', 'bear', 'sam', 'rooftop'] as const;
export const PIP_COATS = ['#F5F0E6', '#FF8FAB', '#F2A900', '#A8E6CF', '#B8D4FF', '#E0A982', '#9CA3AF', '#1E3A5F'] as const;
export const PIP_GLOWS = ['#0866FF', '#FF8FAB', '#24A148', '#F2A900', '#8A3FFC', '#23D9F5'] as const;

/** Seeded meetups for the dresser stage (“7 MEETUPS”). */
export const VIEWER_MEETUPS = 7;

export type Pattern = (typeof PATTERNS)[number];
export type Hat = (typeof HATS)[number];
export type PipKind = (typeof PIP_KINDS)[number];

export type AvatarLook = {
  skin: string;
  hair: (typeof HAIR_STYLES)[number];
  hairColor: string;
  top: (typeof TOPS)[number];
  topColor: string;
  bottomColor: string;
  accessory: (typeof ACCESSORIES)[number];
  pattern: Pattern;
  hat: Hat;
  shoeColor: string;
};

export type PipLook = {
  kind: PipKind;
  coat: string;
  glow: string;
};

/** Hats locked until this many meetups. */
export const HAT_LOCK: Partial<Record<Hat, number>> = { dumpling: 10, crown: 10 };
/** Pip kinds locked until this many meetups. */
export const PIP_LOCK: Partial<Record<PipKind, number>> = { sam: 10, rooftop: 10 };
/** Varsity jacket unlock (shown as “3 more meetups” at 7). */
export const VARSITY_LOCK = 10;

export function hatUnlocked(hat: Hat, meetups = VIEWER_MEETUPS): boolean {
  const need = HAT_LOCK[hat];
  return need == null || meetups >= need;
}
export function pipUnlocked(kind: PipKind, meetups = VIEWER_MEETUPS): boolean {
  const need = PIP_LOCK[kind];
  return need == null || meetups >= need;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T,>(xs: readonly T[], n: number): T => xs[n % xs.length]!;

/** Stated pronouns we've seen for a user (from their profile), used only to tip the default hair. */
const hints = new Map<string, string | null>();
export function setAvatarHint(userId: string, pronouns: string | null | undefined): void {
  if (pronouns !== undefined && hints.get(userId) !== pronouns) { hints.set(userId, pronouns ?? null); bump(); }
}

/** The default look for a user: stable per id. */
export function defaultLook(userId: string): AvatarLook {
  const h = hash(userId), h2 = hash(`${userId}:2`);
  const p = (hints.get(userId) ?? '').toLowerCase();
  const hairPool: readonly AvatarLook['hair'][] = p.startsWith('she') ? ['long', 'bun', 'ponytail', 'curly', 'long']
    : p.startsWith('he') ? ['short', 'buzz', 'curly', 'short']
      : HAIR_STYLES;
  const accessory = pick(['none', 'none', 'glasses', 'cap', 'beanie', 'headphones', 'none'] as const, h2 >>> 9);
  const hatFromAccessory: Hat = accessory === 'beanie' ? 'beanie' : accessory === 'cap' ? 'cap' : 'none';
  return {
    skin: pick(SKIN, h),
    hair: pick(hairPool, h >>> 4),
    hairColor: pick(HAIR_COLORS.slice(0, 6), h >>> 8),
    top: pick(TOPS, h >>> 11),
    topColor: pick(CLIP_TOP_COLORS, h2),
    bottomColor: pick(BOTTOM_COLORS, h2 >>> 5),
    accessory,
    pattern: pick(PATTERNS, h2 >>> 12),
    hat: hatFromAccessory,
    shoeColor: pick(SHOE_COLORS, h2 >>> 15),
  };
}

export function defaultPipLook(userId: string): PipLook {
  const h = hash(`${userId}:pip`);
  return {
    kind: pick(['jolly', 'bun', 'kit', 'bear'] as const, h),
    coat: pick(PIP_COATS, h >>> 4),
    glow: pick(PIP_GLOWS, h >>> 8),
  };
}

const KEY = (id: string) => `oh.avatar.${id}`;
const PIP_KEY = (id: string) => `oh.pip.${id}`;

function savedLook(userId: string): Partial<AvatarLook> | null {
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Partial<AvatarLook>) : null;
  } catch { return null; }
}

function savedPip(userId: string): Partial<PipLook> | null {
  try {
    const raw = window.localStorage.getItem(PIP_KEY(userId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Partial<PipLook>) : null;
  } catch { return null; }
}

/** A user's look: their saved customization over their default. */
export function lookFor(userId: string): AvatarLook {
  const base = defaultLook(userId);
  if (typeof window === 'undefined') return base;
  const s = savedLook(userId);
  if (!s) return base;
  const accessory = s.accessory && (ACCESSORIES as readonly string[]).includes(s.accessory) ? s.accessory : base.accessory;
  const hatRaw = s.hat && (HATS as readonly string[]).includes(s.hat) ? s.hat as Hat : undefined;
  return {
    skin: s.skin && /^#[0-9a-f]{6}$/i.test(s.skin) ? s.skin : base.skin,
    hair: s.hair && (HAIR_STYLES as readonly string[]).includes(s.hair) ? s.hair : base.hair,
    hairColor: s.hairColor && /^#[0-9a-f]{6}$/i.test(s.hairColor) ? s.hairColor : base.hairColor,
    top: s.top && (TOPS as readonly string[]).includes(s.top) ? s.top : base.top,
    topColor: s.topColor && /^#[0-9a-f]{6}$/i.test(s.topColor) ? s.topColor : base.topColor,
    bottomColor: s.bottomColor && /^#[0-9a-f]{6}$/i.test(s.bottomColor) ? s.bottomColor : base.bottomColor,
    accessory,
    pattern: s.pattern && (PATTERNS as readonly string[]).includes(s.pattern) ? s.pattern : base.pattern,
    hat: hatRaw && hatUnlocked(hatRaw) ? hatRaw : (hatRaw ? 'none' : base.hat),
    shoeColor: s.shoeColor && /^#[0-9a-f]{6}$/i.test(s.shoeColor) ? s.shoeColor : base.shoeColor,
  };
}

export function pipLookFor(userId: string): PipLook {
  const base = defaultPipLook(userId);
  if (typeof window === 'undefined') return base;
  const s = savedPip(userId);
  if (!s) return base;
  const kind = s.kind && (PIP_KINDS as readonly string[]).includes(s.kind) ? s.kind as PipKind : base.kind;
  return {
    kind: pipUnlocked(kind) ? kind : 'jolly',
    coat: s.coat && /^#[0-9a-f]{6}$/i.test(s.coat) ? s.coat : base.coat,
    glow: s.glow && /^#[0-9a-f]{6}$/i.test(s.glow) ? s.glow : base.glow,
  };
}

export function saveLook(userId: string, look: AvatarLook): void {
  try { window.localStorage.setItem(KEY(userId), JSON.stringify(look)); } catch { /* private mode */ }
  overrides.set(userId, look);
  bump();
}

export function savePipLook(userId: string, look: PipLook): void {
  try { window.localStorage.setItem(PIP_KEY(userId), JSON.stringify(look)); } catch { /* private mode */ }
  pipOverrides.set(userId, look);
  bump();
}

const overrides = new Map<string, AvatarLook>();
const pipOverrides = new Map<string, PipLook>();
export function currentLook(userId: string): AvatarLook { return overrides.get(userId) ?? lookFor(userId); }
export function currentPipLook(userId: string): PipLook { return pipOverrides.get(userId) ?? pipLookFor(userId); }

/** Random unlocked You outfit (or Pip coat) for “Muse, style me”. */
export function museStyleYou(look: AvatarLook): AvatarLook {
  const unlockedHats = HATS.filter((h) => hatUnlocked(h));
  return {
    ...look,
    topColor: pick(CLIP_TOP_COLORS, Math.floor(Math.random() * 97)),
    pattern: pick(PATTERNS, Math.floor(Math.random() * 53)),
    hat: pick(unlockedHats, Math.floor(Math.random() * 31)),
    top: 'tee',
  };
}

export function museStylePip(look: PipLook): PipLook {
  const unlocked = PIP_KINDS.filter((k) => pipUnlocked(k));
  return {
    kind: pick(unlocked, Math.floor(Math.random() * 41)),
    coat: pick(PIP_COATS, Math.floor(Math.random() * 73)),
    glow: pick(PIP_GLOWS, Math.floor(Math.random() * 29)),
  };
}

/** Bumps when any look or hint changes, so the 3D layer can rebuild the characters. */
let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; for (const l of listeners) l(); }
export function onLooksChanged(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function looksVersion(): number { return version; }

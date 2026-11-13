// What a person's little 3D character looks like. Everyone gets a stable look from their user id,
// so friends are easy to tell apart. A person's *stated* pronouns (never their name) only tip the
// default hair choice; they/them or no pronouns get a neutral pick. The viewer can customize their
// own look; it is saved per persona in this browser (localStorage `oh.avatar.<userId>`).

export const SKIN = ['#FBE3CF', '#F2C9A5', '#E0A982', '#C68A62', '#9C6644', '#6F4630'] as const;
export const HAIR_COLORS = ['#1E1B1A', '#3B2A20', '#6B4226', '#A8743D', '#E2C27A', '#C2453A', '#6C5CE7', '#F2F2F2'] as const;
export const TOP_COLORS = ['#0866FF', '#E8505B', '#24A148', '#F2A900', '#8A3FFC', '#00A3A3', '#FF7A00', '#D12771', '#F5F5F5', '#2B2D42'] as const;
export const BOTTOM_COLORS = ['#2B2D42', '#3D5A80', '#4A4E69', '#5C4033', '#D8CFC4', '#1C1E21'] as const;
export const HAIR_STYLES = ['short', 'buzz', 'curly', 'long', 'bun', 'ponytail'] as const;
export const TOPS = ['tee', 'hoodie', 'jacket'] as const;
export const ACCESSORIES = ['none', 'glasses', 'cap', 'beanie', 'headphones'] as const;

export type AvatarLook = {
  skin: string;
  hair: (typeof HAIR_STYLES)[number];
  hairColor: string;
  top: (typeof TOPS)[number];
  topColor: string;
  bottomColor: string;
  accessory: (typeof ACCESSORIES)[number];
};

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
  return {
    skin: pick(SKIN, h),
    hair: pick(hairPool, h >>> 4),
    hairColor: pick(HAIR_COLORS.slice(0, 6), h >>> 8),
    top: pick(TOPS, h >>> 11),
    topColor: pick(TOP_COLORS, h2),
    bottomColor: pick(BOTTOM_COLORS, h2 >>> 5),
    accessory: pick(['none', 'none', 'glasses', 'cap', 'beanie', 'headphones', 'none'] as const, h2 >>> 9),
  };
}

const KEY = (id: string) => `oh.avatar.${id}`;
function savedLook(userId: string): Partial<AvatarLook> | null {
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Partial<AvatarLook>) : null;
  } catch { return null; }
}

/** A user's look: their saved customization over their default. */
export function lookFor(userId: string): AvatarLook {
  const base = defaultLook(userId);
  if (typeof window === 'undefined') return base;
  const s = savedLook(userId);
  if (!s) return base;
  return {
    skin: s.skin && /^#[0-9a-f]{6}$/i.test(s.skin) ? s.skin : base.skin,
    hair: s.hair && (HAIR_STYLES as readonly string[]).includes(s.hair) ? s.hair : base.hair,
    hairColor: s.hairColor && /^#[0-9a-f]{6}$/i.test(s.hairColor) ? s.hairColor : base.hairColor,
    top: s.top && (TOPS as readonly string[]).includes(s.top) ? s.top : base.top,
    topColor: s.topColor && /^#[0-9a-f]{6}$/i.test(s.topColor) ? s.topColor : base.topColor,
    bottomColor: s.bottomColor && /^#[0-9a-f]{6}$/i.test(s.bottomColor) ? s.bottomColor : base.bottomColor,
    accessory: s.accessory && (ACCESSORIES as readonly string[]).includes(s.accessory) ? s.accessory : base.accessory,
  };
}

export function saveLook(userId: string, look: AvatarLook): void {
  try { window.localStorage.setItem(KEY(userId), JSON.stringify(look)); } catch { /* private mode: lasts this visit */ }
  overrides.set(userId, look);
  bump();
}
const overrides = new Map<string, AvatarLook>();
export function currentLook(userId: string): AvatarLook { return overrides.get(userId) ?? lookFor(userId); }

/** Bumps when any look or hint changes, so the 3D layer can rebuild the characters. */
let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; for (const l of listeners) l(); }
export function onLooksChanged(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function looksVersion(): number { return version; }

// Avatar looks: a body (masc / femme) plus colours for skin, hair, top, bottoms and shoes. Mix and
// match. Every person has a look: the demo personas have hand-picked ones, everyone else gets a
// stable one from their id, and a viewer's own edits (saved in the browser) win over both.
// Pure, so Vitest covers it.
import { z } from 'zod';
import { profileId, type PersonaHandle } from '@/shared';

export type Body = 'masc' | 'femme';
export type AreaName = 'skin' | 'hair' | 'top' | 'bottoms' | 'shoes';
export type Swatch = { id: string; label: string; hex: string };

export const BODIES: { id: Body; label: string }[] = [
  { id: 'masc', label: 'Body A' },
  { id: 'femme', label: 'Body B' },
];

export const PALETTES: Record<AreaName, Swatch[]> = {
  skin: [
    { id: 'porcelain', label: 'Porcelain', hex: '#F8DCCB' },
    { id: 'light', label: 'Light', hex: '#F1BE9C' },
    { id: 'warm', label: 'Warm', hex: '#DBA07A' },
    { id: 'tan', label: 'Tan', hex: '#B97C52' },
    { id: 'brown', label: 'Brown', hex: '#8D5736' },
    { id: 'deep', label: 'Deep', hex: '#5E3A25' },
  ],
  hair: [
    { id: 'black', label: 'Black', hex: '#221C1C' },
    { id: 'brown', label: 'Brown', hex: '#4E2C1C' },
    { id: 'auburn', label: 'Auburn', hex: '#8E3B23' },
    { id: 'blonde', label: 'Blonde', hex: '#DDB66E' },
    { id: 'silver', label: 'Silver', hex: '#BFC3C9' },
    { id: 'pink', label: 'Pink', hex: '#E68BB2' },
    { id: 'blue', label: 'Blue', hex: '#4472DA' },
  ],
  top: [
    { id: 'red', label: 'Red', hex: '#E2483D' },
    { id: 'blue', label: 'Blue', hex: '#2F6FE4' },
    { id: 'green', label: 'Green', hex: '#2BAA77' },
    { id: 'yellow', label: 'Yellow', hex: '#F2C230' },
    { id: 'purple', label: 'Purple', hex: '#7D5CF0' },
    { id: 'black', label: 'Black', hex: '#2B2B2B' },
    { id: 'white', label: 'White', hex: '#F3F3F3' },
  ],
  bottoms: [
    { id: 'denim', label: 'Denim', hex: '#1F5480' },
    { id: 'black', label: 'Black', hex: '#262626' },
    { id: 'khaki', label: 'Khaki', hex: '#B99B6B' },
    { id: 'grey', label: 'Grey', hex: '#878D96' },
    { id: 'olive', label: 'Olive', hex: '#5E6B3A' },
  ],
  shoes: [
    { id: 'white', label: 'White', hex: '#F4F4F4' },
    { id: 'red', label: 'Red', hex: '#E23B3B' },
    { id: 'teal', label: 'Teal', hex: '#2BB59A' },
    { id: 'black', label: 'Black', hex: '#262626' },
    { id: 'yellow', label: 'Yellow', hex: '#F2C230' },
  ],
};

export const AREAS: { id: AreaName; label: string }[] = [
  { id: 'skin', label: 'Skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'top', label: 'Top' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'shoes', label: 'Shoes' },
];

export type AvatarLook = { body: Body } & Record<AreaName, string>;

const swatchIds = (a: AreaName) => PALETTES[a].map((s) => s.id) as [string, ...string[]];
export const AvatarLookZ = z.object({
  body: z.enum(['masc', 'femme']),
  skin: z.enum(swatchIds('skin')),
  hair: z.enum(swatchIds('hair')),
  top: z.enum(swatchIds('top')),
  bottoms: z.enum(swatchIds('bottoms')),
  shoes: z.enum(swatchIds('shoes')),
});

/** Hand-picked looks for the demo personas (fictional people). */
const PERSONA_LOOKS: Record<PersonaHandle, AvatarLook> = {
  alex: { body: 'masc', skin: 'warm', hair: 'black', top: 'blue', bottoms: 'denim', shoes: 'white' },
  maya: { body: 'femme', skin: 'light', hair: 'black', top: 'red', bottoms: 'black', shoes: 'red' },
  jordan: { body: 'masc', skin: 'brown', hair: 'black', top: 'yellow', bottoms: 'khaki', shoes: 'black' },
  priya: { body: 'femme', skin: 'tan', hair: 'black', top: 'purple', bottoms: 'denim', shoes: 'white' },
  sam: { body: 'masc', skin: 'porcelain', hair: 'auburn', top: 'green', bottoms: 'grey', shoes: 'teal' },
  leo: { body: 'masc', skin: 'deep', hair: 'black', top: 'black', bottoms: 'olive', shoes: 'yellow' },
  nina: { body: 'femme', skin: 'porcelain', hair: 'pink', top: 'white', bottoms: 'denim', shoes: 'teal' },
  kai: { body: 'masc', skin: 'light', hair: 'blue', top: 'red', bottoms: 'black', shoes: 'white' },
};
const PERSONA_BY_ID = new Map(Object.entries(PERSONA_LOOKS).map(([h, look]) => [profileId(h as PersonaHandle), look]));

/** FNV-1a: a small stable hash so a person's mock look never changes between reloads. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The look a person has before anyone edits it: hand-picked for personas, else derived from the id. */
export function mockLook(personId: string): AvatarLook {
  const picked = PERSONA_BY_ID.get(personId);
  if (picked) return picked;
  const h = hash(personId);
  const pick = (a: AreaName, salt: number) => PALETTES[a][(h >>> salt) % PALETTES[a].length].id;
  return { body: h % 2 === 0 ? 'masc' : 'femme', skin: pick('skin', 1), hair: pick('hair', 4), top: pick('top', 8), bottoms: pick('bottoms', 12), shoes: pick('shoes', 16) };
}

export function hexOf(area: AreaName, id: string): string {
  return (PALETTES[area].find((s) => s.id === id) ?? PALETTES[area][0]).hex;
}

/** Stable cache key for a look's rendered image. */
export function lookKey(look: AvatarLook): string {
  return [look.body, look.skin, look.hair, look.top, look.bottoms, look.shoes].join('.');
}

/** Parse a saved look; anything invalid (old format, tampering) falls back to null. */
export function parseLook(value: unknown): AvatarLook | null {
  const r = AvatarLookZ.safeParse(value);
  return r.success ? r.data : null;
}

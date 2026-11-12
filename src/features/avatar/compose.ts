// Turns a look into a picture. Blender rendered each body twice per framing (assets/avatars):
// a grey "shade" pass and an "id" pass whose key colours mark the recolourable areas. Here every
// area pixel becomes (chosen colour x shade); other pixels (eyes, logos, laces) keep the shade
// pass as is. The pixel step is pure (tested); rendering uses a canvas and caches by look.
import { hexOf, lookKey, type AreaName, type AvatarLook } from './looks';

export type Framing = 'portrait' | 'full';

/** Key colours of the id maps (must match assets/avatars/build_avatars.py). */
export const AREA_KEYS: [AreaName, [number, number, number]][] = [
  ['skin', [255, 0, 0]], ['hair', [0, 255, 0]], ['top', [0, 0, 255]], ['bottoms', [255, 255, 0]], ['shoes', [255, 0, 255]],
];

/** The shade value a white area facing the key light reaches; it maps to the chosen colour itself. */
const WHITE_LEVEL = 210;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function areaAt(r: number, g: number, b: number): number {
  let best = -1, bestD = 120 * 120;
  for (let i = 0; i < AREA_KEYS.length; i++) {
    const [kr, kg, kb] = AREA_KEYS[i][1];
    const d = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Composite RGBA pixels: `shade` and `id` are the two passes (same size); returns a new buffer. */
export function composePixels(
  shade: Uint8ClampedArray, id: Uint8ClampedArray, colors: Record<AreaName, [number, number, number]>, whiteLevel = WHITE_LEVEL,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(shade.length);
  const tints = AREA_KEYS.map(([name]) => colors[name]);
  for (let i = 0; i < shade.length; i += 4) {
    const a = shade[i + 3];
    out[i + 3] = a;
    if (a === 0) continue;
    const area = id[i + 3] > 0 ? areaAt(id[i], id[i + 1], id[i + 2]) : -1;
    if (area < 0) {
      out[i] = shade[i]; out[i + 1] = shade[i + 1]; out[i + 2] = shade[i + 2];
      continue;
    }
    const t = tints[area];
    const f = Math.min(1.25, shade[i] / whiteLevel);
    out[i] = t[0] * f; out[i + 1] = t[1] * f; out[i + 2] = t[2] * f;
  }
  return out;
}

export function lookColors(look: AvatarLook): Record<AreaName, [number, number, number]> {
  return {
    skin: hexToRgb(hexOf('skin', look.skin)), hair: hexToRgb(hexOf('hair', look.hair)), top: hexToRgb(hexOf('top', look.top)),
    bottoms: hexToRgb(hexOf('bottoms', look.bottoms)), shoes: hexToRgb(hexOf('shoes', look.shoes)),
  };
}

// ---------------------------------------------------------------- browser rendering (cached)
const passes = new Map<string, Promise<{ shade: ImageData; id: ImageData }>>();
const rendered = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`avatar image failed: ${src}`));
    img.src = src;
  });
}

function pixelsOf(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function loadPasses(body: string, framing: Framing) {
  const key = `${body}/${framing}`;
  let p = passes.get(key);
  if (!p) {
    p = Promise.all([loadImage(`/avatars/${body}/${framing}-shade.png`), loadImage(`/avatars/${body}/${framing}-id.png`)])
      .then(([s, i]) => ({ shade: pixelsOf(s), id: pixelsOf(i) }));
    p.catch(() => passes.delete(key));
    passes.set(key, p);
  }
  return p;
}

/** The flat (unlit) texture's area value: atlas-white paints areas 235, which maps to the colour itself. */
const ATLAS_WHITE = 235;
const textures = new Map<string, Promise<string>>();

/**
 * The look painted onto the character's 1024x1024 texture, as a PNG data URL, for the 3D
 * third-person avatar: load the Kenney person GLB, then set its material's map to this image
 * (flipY = false for glTF). Cached per look.
 */
export function renderLookTexture(look: AvatarLook): Promise<string> {
  const key = lookKey(look);
  let p = textures.get(key);
  if (!p) {
    p = Promise.all([loadImage(`/avatars/${look.body}/atlas-white.png`), loadImage(`/avatars/${look.body}/atlas-id.png`)])
      .then(([w, i]) => {
        const white = pixelsOf(w), id = pixelsOf(i);
        const px = composePixels(white.data, id.data, lookColors(look), ATLAS_WHITE);
        const c = document.createElement('canvas');
        c.width = white.width; c.height = white.height;
        c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, white.width, white.height), 0, 0);
        return c.toDataURL('image/png');
      });
    p.catch(() => textures.delete(key));
    textures.set(key, p);
  }
  return p;
}

/** A PNG data URL of the look (portrait: 256x256, full: 256x512). Cached per look and framing. */
export function renderLook(look: AvatarLook, framing: Framing): Promise<string> {
  const key = `${lookKey(look)}/${framing}`;
  let p = rendered.get(key);
  if (!p) {
    p = loadPasses(look.body, framing).then(({ shade, id }) => {
      const px = composePixels(shade.data, id.data, lookColors(look));
      const c = document.createElement('canvas');
      c.width = shade.width; c.height = shade.height;
      c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, shade.width, shade.height), 0, 0);
      return c.toDataURL('image/png');
    });
    p.catch(() => rendered.delete(key));
    rendered.set(key, p);
  }
  return p;
}

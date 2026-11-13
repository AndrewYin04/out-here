// Prepare a photo for upload: decode, shrink to at most MAX_EDGE px on the long side, re-encode as
// JPEG. Keeps phones' 12 MP shots well under the 8 MB limit and drops EXIF (including GPS),
// because only the pixels are redrawn onto a fresh canvas.
export const MAX_EDGE = 1600;
const QUALITY = 0.86;

export class PhotoError extends Error {}

/** Decode a File or Blob into a bitmap, honouring EXIF orientation where the browser supports it. */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to an <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new PhotoError('This file could not be read as a photo.')); img.src = url; });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Choose a photo (JPEG, PNG or WebP).');
  const img = await decode(file);
  try {
    if (!img.width || !img.height) throw new PhotoError('This photo looks empty.');
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('Could not process the photo on this device.');
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new PhotoError('Could not process the photo on this device.');
    return blob;
  } finally {
    img.close();
  }
}

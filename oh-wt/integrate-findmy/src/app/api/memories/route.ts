import { z } from 'zod';
import sharp from 'sharp';
import { assertSelf, IdZ, query, readForm, readUpload, route } from '@/lib/api';
import { HttpError } from '@/features/data/server';

export const runtime = 'nodejs';

// GET /api/memories?crewId -> { memories } (crew members only)
export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, z.object({ crewId: IdZ }));
  return { memories: await store.memories(viewer.id, q.crewId) };
});

// POST /api/memories multipart: photo, crewId, questId, uploaderId?, caption? -> { memory }
export const POST = route(async ({ store, viewer, req }) => {
  const form = await readForm(req);
  const crewId = IdZ.parse(form.get('crewId'));
  const questId = IdZ.parse(form.get('questId'));
  const uploader = form.get('uploaderId');
  assertSelf(viewer, typeof uploader === 'string' ? uploader : undefined);
  const file = await readUpload(form.get('photo'));
  let bytes: Buffer;
  try {
    bytes = await sharp(file.bytes, { limitInputPixels: 40_000_000 })
      .rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw new HttpError(400, 'Choose a supported photo, such as a JPG, PNG, or WebP.');
  }
  const caption = form.get('caption');
  return {
    memory: await store.addMemory(viewer.id, {
      crewId, questId, file: { bytes, contentType: 'image/jpeg' },
      caption: typeof caption === 'string' ? caption.trim().slice(0, 500) : '',
    }),
  };
});

import { z } from 'zod';
import { assertSelf, IdZ, query, readForm, readUpload, route } from '@/lib/api';

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
  const photoUrl = await store.uploadFile(viewer.id, 'memories', file);
  const caption = form.get('caption');
  return {
    memory: await store.addMemory(viewer.id, { crewId, questId, photoUrl, caption: typeof caption === 'string' ? caption.slice(0, 500) : '' }),
  };
});

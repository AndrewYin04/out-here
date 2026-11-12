import { readForm, readUpload, route } from '@/lib/api';

// POST /api/uploads multipart: file -> { url } (Storage bucket "uploads"; in-process in MemoryStore mode)
export const POST = route(async ({ store, viewer, req }) => {
  const form = await readForm(req);
  const file = await readUpload(form.get('file'));
  return { url: await store.uploadFile(viewer.id, 'uploads', file) };
});

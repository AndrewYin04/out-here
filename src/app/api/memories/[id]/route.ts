import { z } from 'zod';
import { body, route } from '@/lib/api';

// PATCH /api/memories/:id { caption } -> { memory }   (the memory page's story; crew members only)
export const PATCH = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, z.object({ caption: z.string().max(500) }));
  return { memory: await store.captionMemory(viewer.id, params.id, b.caption) };

});

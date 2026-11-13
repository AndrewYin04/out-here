import { z } from 'zod';
import { body, route } from '@/lib/api';

// PATCH /api/crews/:id { name } -> { crew }   (the memory page's title; crew members only)
export const PATCH = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return { crew: await store.renameCrew(viewer.id, params.id, b.name) };
});

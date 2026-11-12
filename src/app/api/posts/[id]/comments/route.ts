import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// GET /api/posts/:id/comments -> { comments: CommentView[] } (top level with one level of replies)
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({ comments: await store.comments(viewer.id, params.id) }));

const CommentZ = z.object({ text: z.string().trim().min(1).max(2000), parentId: IdZ.nullish() });

// POST /api/posts/:id/comments body { text, parentId? } -> { comment }
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, CommentZ);
  return { comment: await store.addComment(viewer.id, params.id, b.text, b.parentId ?? null) };
});

import { z } from 'zod';
import { body, route } from '@/lib/api';

// GET /api/quests/:id/posts -> { posts } (the plan page's activity feed, newest first)
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({
  posts: await store.questPosts(viewer.id, params.id),
}));

const BodyZ = z.object({
  text: z.string().max(2000).default(''),
  media: z.array(z.string().max(500)).max(4).default([]),
});

// POST /api/quests/:id/posts body { text, media? } -> { post }
// Anyone who can see the plan can post on its page; the post is as visible as the plan.
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  const post = await store.createPost(viewer.id, {
    text: b.text, media: b.media, audience: 'public', target: { type: 'quest', id: params.id },
  });
  return { post };
});

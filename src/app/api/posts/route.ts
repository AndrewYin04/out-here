import { z } from 'zod';
import { AudienceZ, body, IdZ, route } from '@/lib/api';

const CreateZ = z.object({
  text: z.string().max(5000).default(''),
  media: z.array(z.string().min(1).max(2000)).max(10).optional(),
  audience: AudienceZ.default('friends'),
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('profile') }),
    z.object({ type: z.literal('group'), slug: z.string().min(1) }),
    z.object({ type: z.literal('event'), slug: z.string().min(1) }),
    z.object({ type: z.literal('crew'), crewId: IdZ }),
    z.object({ type: z.literal('community'), questId: IdZ }),
  ]).optional(),
  sharedPostId: IdZ.optional(),
});

// POST /api/posts -> { post: PostView } (share = sharedPostId)
export const POST = route(async ({ store, viewer, req }) => ({ post: await store.createPost(viewer.id, await body(req, CreateZ)) }));

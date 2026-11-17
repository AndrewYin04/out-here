import { z } from 'zod';
import { REACTION_TYPES } from '@/shared';
import { body, route } from '@/lib/api';

const ReactZ = z.object({ type: z.enum(REACTION_TYPES).nullable() });

// POST /api/posts/:id/reactions body { type | null } -> ReactResponse (null removes)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) =>
  store.react(viewer.id, params.id, (await body(req, ReactZ)).type));

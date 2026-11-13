import { z } from 'zod';
import { body, IdZ, LIVE_TABLES, route } from '@/lib/api';
import { openOrCreateTogether } from '@/features/outhere/server/together';

const OpenZ = z.object({ friendIds: z.array(IdZ).min(1).max(5) });

// GET /api/together -> { plans } (the viewer's open and just-confirmed shared plans)
export const GET = route(async ({ store, viewer }) => ({ plans: await store.togetherPlans(viewer.id) }));

// POST /api/together { friendIds } -> { plan }: the group's open shared plan, or a new one from Muse.
// Two people opening it at once both get the same plan (one open plan per group).
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, OpenZ);
  const friendIds = [...new Set(b.friendIds)].filter((id) => id !== viewer.id);
  return { plan: await openOrCreateTogether(store, viewer.id, friendIds) };
}, { refresh: LIVE_TABLES });

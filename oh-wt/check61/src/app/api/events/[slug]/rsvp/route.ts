import { z } from 'zod';
import { body, route } from '@/lib/api';

const RsvpZ = z.object({ status: z.enum(['going', 'interested', 'invited']).nullable() });

// POST /api/events/:slug/rsvp body { status | null } -> { event: EventView }
export const POST = route<{ slug: string }>(async ({ store, viewer, params, req }) =>
  ({ event: await store.rsvp(viewer.id, params.slug, (await body(req, RsvpZ)).status) }));

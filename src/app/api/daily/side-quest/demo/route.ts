import { z } from 'zod';
import { body, route } from '@/lib/api';

const BodyZ = z.discriminatedUnion('action', [
  z.object({ action: z.literal('trigger'), deadlineSeconds: z.number().int().min(10).max(3600).optional() }),
  z.object({ action: z.literal('deadline'), deadlineSeconds: z.number().int().min(10).max(3600) }),
  z.object({ action: z.literal('reset') }),
  z.object({ action: z.literal('seed') }),
]);

// POST /api/daily/side-quest/demo -> SideQuestState. Demo controls: 403 unless the server enables
// them (OUTHERE_DEMO_CONTROLS) AND the viewer is a demo persona. Touches only today's Side Quest records.
export const POST = route(async ({ store, viewer, req }) => store.sideQuestDemo(viewer.id, await body(req, BodyZ)));

import { z } from 'zod';
import { SIDE_QUEST_AUDIENCES } from '@/shared';
import { IdZ, readForm, readUpload, route } from '@/lib/api';

const FieldsZ = z.object({
  audience: z.enum(SIDE_QUEST_AUDIENCES).default('only_me'),
  caption: z.string().max(500).default(''),
  crewId: IdZ.nullable().default(null),
});

// POST /api/daily/side-quest/submit  multipart: photo (JPEG/PNG/WebP), audience, caption?, crewId?
//   -> SideQuestSubmitResponse. The server alone decides on time: 409 already_completed,
//   409 not_dropped_yet, 410 quest_ended. Audience defaults to only_me.
export const POST = route(async ({ store, viewer, req }) => {
  const form = await readForm(req);
  const file = await readUpload(form.get('photo'));
  const raw = (k: string) => { const v = form.get(k); return typeof v === 'string' && v !== '' ? v : undefined; };
  const f = FieldsZ.parse({ audience: raw('audience'), caption: raw('caption'), crewId: raw('crewId') ?? null });
  return store.sideQuestSubmit(viewer.id, { file, audience: f.audience, caption: f.caption, crewId: f.crewId });
});

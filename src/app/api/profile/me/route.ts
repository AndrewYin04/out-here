import { z } from 'zod';
import { AudienceZ, body, route } from '@/lib/api';
import type { Audience, ProfileField } from '@/shared/types';

const FIELDS = ['school', 'major', 'gradYear', 'hometown', 'currentCity', 'job', 'pronouns'] as const satisfies readonly ProfileField[];

const PatchZ = z.object({
  bio: z.string().max(300).optional(),
  fieldVisibility: z.partialRecord(z.enum(FIELDS), AudienceZ).optional(),
});

// PATCH /api/profile/me  body: { bio?, fieldVisibility? } -> ProfileResponse (the viewer's own profile)
export const PATCH = route(async ({ req, store, viewer }) => {
  const patch = await body(req, PatchZ);
  await store.updateProfile(viewer.id, {
    bio: patch.bio,
    fieldVisibility: patch.fieldVisibility as Partial<Record<ProfileField, Audience>> | undefined,
  });
  return store.profile(viewer.id, viewer.id);
});

import { route } from '@/lib/api';
import type { HangoutRecap } from '@/shared';

// GET /api/quests/:id/recap -> HangoutRecap (members only; counts and chips, no hang-again, no notes)
export const GET = route<{ id: string }>(async ({ store, viewer, params }): Promise<HangoutRecap> =>
  store.hangoutRecap(viewer.id, params.id));

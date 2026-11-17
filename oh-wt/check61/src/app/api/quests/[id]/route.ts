import { route } from '@/lib/api';

// GET /api/quests/:id -> { quest, seatsLeft, host, members, viewerIsMember }
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => store.quest(viewer.id, params.id));

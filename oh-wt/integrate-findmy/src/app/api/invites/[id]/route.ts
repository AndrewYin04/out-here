import { route } from '@/lib/api';

// GET /api/invites/:id -> { invite } (sender or recipient only)
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({ invite: await store.invite(viewer.id, params.id) }));

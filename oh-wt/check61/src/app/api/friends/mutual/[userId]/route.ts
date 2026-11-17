import { route } from '@/lib/api';

// GET /api/friends/mutual/:userId -> { friends: PersonCard[] } (ext: mutual friends with a person, id or handle)
export const GET = route<{ userId: string }>(async ({ store, viewer, params }) => ({ friends: await store.mutualFriends(viewer.id, params.userId) }));

import { route } from '@/lib/api';

// GET /api/profile/:handle/friends -> { friends: PersonCard[] } (ext: profile Friends tab)
export const GET = route<{ handle: string }>(async ({ store, viewer, params }) => ({ friends: await store.profileFriends(viewer.id, params.handle) }));

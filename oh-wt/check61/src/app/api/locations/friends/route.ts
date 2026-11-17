import { route } from '@/lib/api';

// GET /api/locations/friends -> { pins: FriendPin[] }
// Accepted friends only, canSee on each share's audience, paused/expired hidden, approximate
// shares snapped to an ~800 m grid cell with rounded distance.
export const GET = route(async ({ store, viewer }) => ({ pins: await store.friendPins(viewer.id) }));

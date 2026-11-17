import { route } from '@/lib/api';

// GET /api/notifications -> { notifications, unread }
export const GET = route(async ({ store, viewer }) => (await store.notifications(viewer.id)));

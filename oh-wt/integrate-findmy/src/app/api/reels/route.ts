import { route } from '@/lib/api';

// GET /api/reels -> { reels }
export const GET = route(async ({ store }) => ({ reels: await store.reels() }));

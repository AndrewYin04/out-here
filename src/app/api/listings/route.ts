import { route } from '@/lib/api';

// GET /api/listings -> { listings }
export const GET = route(async ({ store }) => ({ listings: await store.listings() }));

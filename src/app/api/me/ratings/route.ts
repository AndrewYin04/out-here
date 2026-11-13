import { route } from '@/lib/api';
import type { MyRating } from '@/shared';

// GET /api/me/ratings -> { ratings } (the viewer's rated hangouts, score desc)
export const GET = route(async ({ store, viewer }): Promise<{ ratings: MyRating[] }> => ({
  ratings: await store.myRatings(viewer.id),
}));

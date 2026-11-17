import { route } from '@/lib/api';
import type { YourPlansResponse } from '@/shared';

export const GET = route(async ({ store, viewer }): Promise<YourPlansResponse> => ({
  plans: await store.yourPlans(viewer.id),
}));

import { route } from '@/lib/api';

// GET /api/daily/side-quest/history -> SideQuestHistoryResponse (last 7 days + personal Side Quest memories)
export const GET = route(async ({ store, viewer }) => store.sideQuestHistory(viewer.id));

import { route } from '@/lib/api';

// GET /api/stories -> { stories: StoryGroup[] } (own first, then friends by latest)
export const GET = route(async ({ store, viewer }) => ({ stories: await store.stories(viewer.id) }));

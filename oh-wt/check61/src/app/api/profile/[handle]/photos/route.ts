import { route } from '@/lib/api';

// GET /api/profile/:handle/photos -> { photos: string[] }
export const GET = route<{ handle: string }>(async ({ store, viewer, params }) => ({ photos: await store.profilePhotos(viewer.id, params.handle) }));

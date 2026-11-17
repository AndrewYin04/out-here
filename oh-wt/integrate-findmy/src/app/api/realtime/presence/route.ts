import { heartbeat, onlineUserIds } from '@/features/data/server';
import { route } from '@/lib/api';

export const dynamic = 'force-dynamic';

// MemoryStore-mode presence for online dots (Supabase mode uses Presence on presence:online).
// GET -> { userIds }; POST (heartbeat every ~15 s) -> { userIds }; DELETE (tab closing) -> { userIds }
export const GET = route(async () => ({ userIds: onlineUserIds() }));
export const POST = route(async ({ viewer }) => ({ userIds: await heartbeat(viewer.id, true) }));
export const DELETE = route(async ({ viewer }) => ({ userIds: await heartbeat(viewer.id, false) }));

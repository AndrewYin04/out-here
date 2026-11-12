import { z } from 'zod';
import { assertSelf, body, IdZ, IsoZ, LatLngZ, query, route } from '@/lib/api';
import { DEMO_CENTER } from '@/shared';

const NearZ = z.object({
  lat: z.coerce.number().min(-90).max(90).default(DEMO_CENTER.lat),
  lng: z.coerce.number().min(-180).max(180).default(DEMO_CENTER.lng),
  radiusM: z.coerce.number().int().min(50).max(50_000).default(3000),
  viewerId: z.string().optional(),
});

// GET /api/quests?lat&lng&radiusM -> { quests } (`location` is the approx point unless the viewer is a member)
export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, NearZ);
  return { quests: await store.questsNear(viewer.id, { lat: q.lat, lng: q.lng }, q.radiusM) };
});

const CreateZ = z.object({
  hostId: IdZ.optional(),
  title: z.string().trim().min(1).max(120),
  emoji: z.string().min(1).max(16).default('✨'),
  category: z.enum(['food', 'music', 'sports', 'study', 'thrift', 'art', 'outdoors', 'games', 'other']),
  description: z.string().max(2000).default(''),
  venueName: z.string().trim().min(1).max(120),
  location: LatLngZ,
  startsAt: IsoZ,
  endsAt: IsoZ,
  capacity: z.number().int().min(2).max(50),
  priceMax: z.number().min(0).max(1000).default(0),
  tags: z.array(z.string().max(40)).max(12).default([]),
  isPublic: z.boolean().default(true),
  groupId: IdZ.nullable().default(null),
  placeId: IdZ.nullable().default(null),
});

// POST /api/quests -> { quest } (the viewer hosts and takes the first seat)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, CreateZ);
  assertSelf(viewer, b.hostId);
  return { quest: await store.createQuest(viewer.id, b) };
});

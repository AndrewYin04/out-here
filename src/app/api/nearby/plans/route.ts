import { z } from 'zod';
import { body, route } from '@/lib/api';
import { haversineMeters, minutesFrom, type LatLng } from '@/shared';
import { profileId } from '@/shared/seed/ids';

/**
 * POST /api/nearby/plans  body { lat, lng } -> { created, plans }
 *
 * "Here" mode (the Out Here location toggle): when someone turns on their real location, make sure
 * a handful of ready-made plans are about to start around them, hosted by the demo personas, so
 * there is something to join wherever the demo runs (Meta HQ in Menlo Park on stage). Venues are
 * fictional names at offsets from the viewer; nothing is presented as a real business's event.
 * Idempotent: a plan with the same title still open within 1.5 km is reused, not duplicated.
 * The viewer's position is used for this one call and never stored.
 */
const BodyZ = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

type Template = {
  host: string; title: string; emoji: string; category: 'food' | 'sports' | 'games' | 'outdoors' | 'other';
  venue: string; description: string; inMin: number; durMin: number; capacity: number; price: number;
  /** Where, from the viewer: meters and compass bearing. */
  m: number; deg: number; also?: string[]; tags: string[];
};

const TEMPLATES: Template[] = [
  { host: 'maya', title: 'Sweet shop run · come join', emoji: '🍬', category: 'food', venue: 'Sugar Stop (pop-up)',
    description: 'Quick walk for candy and something cold. Back in 30.', inMin: 8, durMin: 30, capacity: 5, price: 8,
    m: 260, deg: 40, also: ['kai'], tags: ['sweets', 'quick'] },
  { host: 'jordan', title: 'Lunch on the patio', emoji: '🥗', category: 'food', venue: 'Patio Greens',
    description: 'Grabbing lunch outside. Pull up a chair.', inMin: 12, durMin: 50, capacity: 6, price: 15,
    m: 380, deg: 140, also: ['priya'], tags: ['lunch'] },
  { host: 'nina', title: 'Coffee walk to the bay', emoji: '☕', category: 'outdoors', venue: 'Bayside Coffee Cart',
    description: 'Coffee, then a lap by the water.', inMin: 18, durMin: 40, capacity: 4, price: 6,
    m: 520, deg: 340, tags: ['coffee', 'walk'] },
  { host: 'sam', title: 'Pickup volleyball, need 2', emoji: '🏐', category: 'sports', venue: 'Courtside Sand Court',
    description: 'Casual 4v4. All levels.', inMin: 22, durMin: 60, capacity: 8, price: 0,
    m: 640, deg: 220, also: ['leo', 'kai'], tags: ['volleyball'] },
  { host: 'priya', title: 'Board games after lunch', emoji: '🎲', category: 'games', venue: 'The Game Nook',
    description: 'Short games, easy to learn.', inMin: 35, durMin: 60, capacity: 6, price: 0,
    m: 450, deg: 270, tags: ['games'] },
  { host: 'leo', title: 'Sunset walk on the trail', emoji: '🌅', category: 'outdoors', venue: 'Bay Trail lookout',
    description: 'Easy walk, good views.', inMin: 50, durMin: 45, capacity: 8, price: 0,
    m: 700, deg: 10, tags: ['walk', 'outdoors'] },
];

function offset(from: LatLng, meters: number, deg: number): LatLng {
  const r = (deg * Math.PI) / 180;
  const dLat = (meters * Math.cos(r)) / 111_320;
  const dLng = (meters * Math.sin(r)) / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

export const POST = route(async ({ store, viewer, req }) => {
  const at = await body(req, BodyZ);
  const near = await store.questsNear(viewer.id, at, 1500);
  const open = near.filter((q) => Date.parse(q.endsAt) > Date.now());
  let created = 0;
  for (const t of TEMPLATES) {
    if (open.some((q) => q.title === t.title)) continue;
    const hostId = profileId(t.host);
    if (hostId === viewer.id) continue;
    const location = offset(at, t.m, t.deg);
    try {
      const quest = await store.createQuest(hostId, {
        title: t.title, emoji: t.emoji, category: t.category, description: t.description,
        venueName: t.venue, location, startsAt: minutesFrom(t.inMin), endsAt: minutesFrom(t.inMin + t.durMin),
        capacity: t.capacity, priceMax: t.price, tags: [...t.tags, 'nearby'], groupId: null, placeId: null,
        inviteIds: [], visibility: 'community',
      });
      created++;
      // A friend or two already in, so each plan shows faces and a real seat count.
      for (const h of t.also ?? []) {
        const id = profileId(h);
        if (id === viewer.id) continue;
        await store.joinQuest(id, quest.id).catch(() => {});
      }
    } catch {
      // A host at their daily cap, or a race with another tab: skip that plan, keep the rest.
    }
  }
  const plans = (await store.questsNear(viewer.id, at, 1500))
    .filter((q) => Date.parse(q.endsAt) > Date.now() && haversineMeters(at, q.approxLocation) <= 1500);
  return { created, plans: plans.length };
});

import { HttpError, newScope, runInScope, type DataStore } from '@/features/data/server';
import { fromWallClock, resolveWindow, wallClock } from '@/features/muse';
import { walkingMinutes } from '@/shared';
import type { CoordinationRequest } from '../protocol';

/** Deliberately exclude availability text/intent/location, messages, home and private budget.
 * Interests are public in the current Profile contract. City obeys per-field visibility. */
export async function encounterContext(store: DataStore, ownerId: string, recipientId: string) {
  const { db, view } = await runInScope(newScope(true), () => store.museContext());
  const owner = view.profileById.get(ownerId), recipient = view.profileById.get(recipientId);
  if (!owner || !recipient) throw new HttpError(404, 'Friend not found.');
  if (ownerId === recipientId || !view.areFriends(ownerId, recipientId)) throw new HttpError(403, 'Only accepted friends can coordinate.');
  const visible = view.profileFor(ownerId, recipient);
  const slots = db.availability.filter(a => a.userId === recipientId && view.canSee(ownerId, recipientId, a.audience))
    .map(a => ({ id: a.id, startsAt: a.startsAt, endsAt: a.endsAt }));
  return {
    owner: { id: owner.id, name: owner.name, interests: owner.interests },
    recipient: { id: recipient.id, name: recipient.name, interests: visible.interests, city: visible.currentCity },
    slots,
    candidates(request: CoordinationRequest, at: Date) {
      let now = at;
      if (request.time === 'tomorrow') {
        const w = wallClock(at);
        const next = new Date(Date.UTC(w.year, w.month - 1, w.day + 1));
        now = fromWallClock({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 8, minute: 0 });
      }
      const window = resolveWindow({ partOfDay: request.time === 'tonight' ? 'tonight' : null, startClock: request.startClock,
        endClock: request.endClock, durationMinutes: null, startsInMinutes: null }, now);
      const shared = slots.flatMap(s => {
        const startsAt = new Date(Math.max(Date.parse(s.startsAt), Date.parse(window.windowStart))).toISOString();
        const endsAt = new Date(Math.min(Date.parse(s.endsAt), Date.parse(window.windowEnd))).toISOString();
        return startsAt < endsAt ? [{ ...s, startsAt, endsAt }] : [];
      });
      const quests = db.quests.filter(q => q.category === request.activity && q.status !== 'done' && view.seatsLeft(q) > 0 &&
        view.canSeeQuest(ownerId, q) && view.canSeeQuest(recipientId, q) &&
        q.startsAt >= window.windowStart && q.endsAt <= window.windowEnd &&
        (request.budgetMax === null || q.priceMax <= request.budgetMax) &&
        Date.parse(q.startsAt) >= at.getTime() + walkingMinutes(owner.home, q.location) * 60000)
        .slice(0, 8).map(q => ({ id: q.id, title: q.title, venueName: q.venueName, category: q.category,
          startsAt: q.startsAt, endsAt: q.endsAt, priceMax: q.priceMax, seatsLeft: view.seatsLeft(q),
          travelMinutes: walkingMinutes(owner.home, q.location), emoji: q.emoji }));
      return { window, slots: shared, quests };
    },
  };
}

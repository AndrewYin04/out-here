// Plan together: Muse proposes options that fit EVERY member of the group, not just the person
// who opened it. Server only.
import { getPlanContextProvider, interestsMatchingQuest, plan, type PlanContext } from '@/features/muse';
import { conflict, type DataStore } from '@/features/data/server';
import { walkingMinutesExact, type ID, type Quest, type TogetherOption } from '@/shared';

const MAX_WALK_MIN = 25;
const MAX_OPTIONS = 3;

/**
 * One reason that reads the same on every member's phone. Muse's own text is written from the
 * planner's side ("Maya's free till…" would be wrong on Maya's phone), so shared plans use facts:
 * Muse still picks and orders the options.
 */
function sharedReason(q: Quest, members: ID[], context: PlanContext): string {
  const profiles = [context.viewer, ...context.friends.map((f) => f.profile)].filter((p) => members.includes(p.id));
  const each = profiles.map((p) => new Set(interestsMatchingQuest(p.interests, q).map((i) => i.toLowerCase())));
  const common = each.length === members.length && each.length > 0 ? [...each[0]].filter((i) => each.every((e) => e.has(i))) : [];
  const seats = q.capacity - q.memberIds.length;
  const parts = [
    common[0] ? `You ${members.length === 2 ? 'both' : 'all'} like ${common[0]}` : null,
    q.priceMax === 0 ? 'Free' : `Up to $${q.priceMax}`,
    `${seats} ${seats === 1 ? 'seat' : 'seats'} left`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** A friend's note without its own time talk: "on a long lunch break, free for the next 45 min" -> "on a long lunch break". */
export function noteForPlan(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\b(free|around)?\s*(for\s+)?(the\s+)?(next\s+)?(~|about\s+)?\d+\s*(min|mins|minutes|hr|hrs|hours?)\b/gi, '')
    .replace(/\b(free|i'?m free)\b/gi, '')
    .replace(/\s*[,;·]\s*(?=[,;·]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim().replace(/^[,;·\s]+|[,;·\s]+$/g, '');
  return cleaned.length >= 3 ? cleaned : null;
}

/**
 * Options for viewer + friendIds. Each friend must be free when the viewer is (else 409). Muse
 * plans over the shared free time with everyone's notes, so the result does not depend on who
 * tapped first; code keeps only quests every member can reach on foot before they start, with
 * seats for everyone not already in. If one member's side of the map has nothing, the next
 * member's is tried.
 */
export async function proposeTogether(store: DataStore, viewerId: ID, friendIds: ID[], now = new Date()):
  Promise<{ options: TogetherOption[]; summary: string; expiresAt: string }> {
  const free = await store.freeWithMe(viewerId);
  const byId = new Map(free.items.map((i) => [i.friend.id, i]));
  if (friendIds.some((id) => !byId.has(id))) throw conflict('not_free_together');
  const expiresAt = friendIds.map((id) => byId.get(id)!.until).sort()[0];
  const minutes = Math.max(15, Math.round((Date.parse(expiresAt) - now.getTime()) / 60_000));
  const mine = (await store.myAvailability(viewerId))[0];
  const notes = [noteForPlan(mine?.text), ...friendIds.map((id) => noteForPlan(byId.get(id)!.text))].filter((x): x is string => !!x);
  const text = `${notes.length > 0 ? [...new Set(notes)].join('; ') : 'something fun'}, ${minutes} min`;
  const members = [viewerId, ...friendIds];
  const provider = await getPlanContextProvider();

  for (const planner of members) {
    const others = members.filter((m) => m !== planner);
    const context = await provider.getPlanContext({ userId: planner, location: null, now });
    const out = await plan({ text, userId: planner, location: null, now, context });
    const questById = new Map(context.quests.map((q) => [q.id, q]));
    const windows = new Map<ID, typeof context.friendAvailability>();
    for (const a of context.friendAvailability) windows.set(a.userId, [...(windows.get(a.userId) ?? []), a]);
    const canMake = (friendId: ID, q: NonNullable<ReturnType<typeof questById.get>>) =>
      (windows.get(friendId) ?? []).some((a) => {
        const walk = walkingMinutesExact(a.location, q.location);
        const depart = Math.max(now.getTime(), Date.parse(a.startsAt));
        return walk <= MAX_WALK_MIN && depart + walk * 60_000 <= Date.parse(q.startsAt) + 5 * 60_000 && Date.parse(a.endsAt) > Date.parse(q.startsAt);
      });
    const options: TogetherOption[] = [];
    for (const s of out.plan.suggestions) {
      const q = s.questId ? questById.get(s.questId) : undefined;
      if (!q) continue;
      const joining = members.filter((m) => !q.memberIds.includes(m)).length;
      if (q.capacity - q.memberIds.length < joining) continue;
      if (!others.every((f) => q.memberIds.includes(f) || canMake(f, q))) continue;
      options.push({
        questId: q.id, title: q.title, emoji: q.emoji, venueName: q.venueName, startsAt: q.startsAt,
        priceMax: q.priceMax, seatsLeft: q.capacity - q.memberIds.length, reason: sharedReason(q, members, context),
      });
      if (options.length >= MAX_OPTIONS) break;
    }
    if (options.length > 0) {
      const who = members.length === 2 ? 'both of you' : 'all of you';
      return { options, summary: `Muse picked ${options.length === 1 ? 'a plan' : `${options.length} plans`} that fit ${who}.`, expiresAt };
    }
  }
  return { options: [], summary: 'Nothing nearby fits everyone’s time right now.', expiresAt };
}

// One in-flight open per group in this server process: when two members tap at the same moment,
// the second waits for the first and gets the same plan (Muse runs once). Across processes the
// unique index on together_plans(member_key) where open does the same job.
const g = globalThis as unknown as { __outhereTogetherOpen?: Map<string, Promise<unknown>> };
const inflight = (g.__outhereTogetherOpen ??= new Map());

export async function openOrCreateTogether(store: DataStore, viewerId: ID, friendIds: ID[]) {
  const key = [...new Set([viewerId, ...friendIds])].sort().join(',');
  const running = inflight.get(key);
  if (running) {
    // Someone in the group is already opening it: wait, then read it from this viewer's side.
    await running.catch(() => undefined);
    const theirs = await store.openTogether(viewerId, friendIds);
    if (theirs) return theirs;
  }
  // Registered synchronously (no await before set), so a request arriving a tick later waits.
  const job = (async () => {
    const existing = await store.openTogether(viewerId, friendIds);
    if (existing) return existing;
    const proposal = await proposeTogether(store, viewerId, friendIds);
    return store.createTogether(viewerId, { friendIds, ...proposal });
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

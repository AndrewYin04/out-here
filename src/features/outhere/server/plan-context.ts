// Store-backed PlanContextProvider: builds the Muse plan context from getStore() (the live
// MemoryStore or SupabaseStore), so plans see joins, new availability and new quests the
// moment they happen. Server-only. The seed provider in features/muse stays as the fallback
// for unit tests; deployed builds must register this one (see assertPlanContextRegistered).
import { DEMO_CENTER, DEMO_DRIVER_HANDLE, haversineMeters, type Audience, type ID, type LatLng, type StatusBubble } from '@/shared';
import { getStore, type DataStore } from '@/features/data/server';
import {
  UnknownUserError, firstName, getPlanContextProvider, sharedInterests,
  type PlanContext, type PlanContextProvider, type PlanContextRequest,
} from '@/features/muse';

/** A friend's status bubble the viewer may see. Text only: never coordinates. */
export type PlanFriendStatus = { friendId: ID; firstName: string; line: string; bubble: StatusBubble; updatedAt: string };

/** PlanContext plus the friends' status bubbles (also copied onto each PlanFriend.status for the rank prompt). */
export type StorePlanContext = PlanContext & {
  friendStatuses: PlanFriendStatus[];
  /**
   * The viewer's own active "Free till X" window (the earliest one running or upcoming), or null
   * when they are busy. The Muse filter keeps only plans that fit inside it.
   */
  viewerWindow?: { startsAt: string; endsAt: string } | null;
};

/** Quests farther than this from the viewer are not planning candidates. */
const QUEST_RADIUS_M = 5_000;

type ShareRow = {
  userId: ID; paused?: boolean; audience?: Audience; expiresAt?: string; updatedAt?: string; location?: LatLng;
  bubble?: Partial<StatusBubble> | null;
};

/** One plain line from a bubble: "craving dumplings 🥟 · at work till 5:15 · wants to try the new boba place". */
export function bubbleLine(b: Partial<StatusBubble> | null | undefined): string {
  if (!b) return '';
  const thought = [b.thought?.trim(), b.emoji?.trim()].filter(Boolean).join(' ');
  const parts = [thought, b.doing?.trim(), b.wantsTo?.trim() ? `wants to ${b.wantsTo.trim()}` : ''].filter((x): x is string => !!x);
  return parts.join(' · ').slice(0, 160);
}

export async function buildStorePlanContext(
  req: PlanContextRequest,
  store: Pick<DataStore, 'museContext'> = getStore(),
): Promise<StorePlanContext> {
  const { db, view } = await store.museContext();
  const key = (req.userId ?? DEMO_DRIVER_HANDLE).toLowerCase();
  const viewer = db.profiles.find((p) => p.id === req.userId || p.handle === key);
  if (!viewer) throw new UnknownUserError(req.userId ?? DEMO_DRIVER_HANDLE);
  const at = req.now.toISOString();
  const friendIds = view.friendIds(viewer.id);
  const byId = new Map(db.profiles.map((p) => [p.id, p]));

  const friends = [...friendIds]
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => {
      const profile = view.profileFor(viewer.id, p);
      return { profile, sharedInterests: sharedInterests(viewer.interests, profile.interests), status: null as string | null };
    });

  const friendAvailability = db.availability
    .filter((a) => friendIds.has(a.userId) && a.endsAt > at && view.canSee(viewer.id, a.userId, a.audience))
    .map(({ audience: _a, ...a }) => { void _a; return a; });

  // Location shares are optional in the Db (the Find My layer adds the table): read them if present.
  const shares = ((db as unknown as { locationShares?: ShareRow[] }).locationShares ?? []);
  const own = db.availability
    .filter((a) => a.userId === viewer.id && a.endsAt > at)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const ownShare = shares.find((s) => s.userId === viewer.id && !s.paused && (!s.expiresAt || s.expiresAt > at) && s.location);
  // Where the viewer is now: Alex starts at the demo center; anyone else from the free window they
  // already share, then their shared location, then home. A new ask from the same person therefore
  // keeps the place friends already see, instead of jumping to home (Maya would be 2 km north).
  const location: LatLng = req.location
    ?? (viewer.handle === DEMO_DRIVER_HANDLE ? DEMO_CENTER : own?.location ?? ownShare?.location ?? viewer.home ?? DEMO_CENTER);
  const quests = db.quests
    .filter((q) => view.isActiveQuest(q) && view.canSeeQuest(viewer.id, q) && haversineMeters(location, q.location) <= QUEST_RADIUS_M)
    .map((q) => ({ ...q, memberIds: view.questMemberIds(q.id) }));

  const friendStatuses: PlanFriendStatus[] = [];
  for (const s of shares) {
    if (!friendIds.has(s.userId) || s.paused) continue;
    if (s.expiresAt && s.expiresAt <= at) continue;
    if (!view.canSee(viewer.id, s.userId, s.audience ?? 'friends')) continue;
    const line = bubbleLine(s.bubble);
    const p = byId.get(s.userId);
    if (!line || !p) continue;
    friendStatuses.push({
      friendId: s.userId, firstName: firstName(p), line,
      bubble: { emoji: s.bubble?.emoji ?? null, thought: s.bubble?.thought ?? null, doing: s.bubble?.doing ?? null, wantsTo: s.bubble?.wantsTo ?? null },
      updatedAt: s.updatedAt ?? at,
    });
  }

  // The rank prompt and the offline reasons read each friend's bubble line from PlanFriend.status.
  const statusOf = new Map(friendStatuses.map((f) => [f.friendId, f.line]));
  for (const f of friends) f.status = statusOf.get(f.profile.id) ?? null;

  return {
    viewer,
    viewerWindow: own ? { startsAt: own.startsAt, endsAt: own.endsAt } : null,
    friends,
    friendAvailability,
    quests,
    location,
    now: req.now,
    knownPeople: db.profiles.map((p) => ({ id: p.id, firstName: firstName(p) })),
    friendStatuses,
  };
}

export const storePlanContextProvider: PlanContextProvider = {
  getPlanContext: (req) => buildStorePlanContext(req),
};

export class PlanContextNotRegisteredError extends Error {
  constructor() {
    super('plan_context_not_registered');
    this.name = 'PlanContextNotRegisteredError';
  }
}

/**
 * Which provider the plan route will use. On a deployed or targeted build (DATA_TARGET or
 * VERCEL_ENV set) the seed files are never an acceptable source: throw instead.
 */
export async function planContextSource(): Promise<'store' | 'seed'> {
  const p = await getPlanContextProvider();
  if (p === storePlanContextProvider) return 'store';
  if (process.env.DATA_TARGET || process.env.VERCEL_ENV) throw new PlanContextNotRegisteredError();
  return 'seed';
}

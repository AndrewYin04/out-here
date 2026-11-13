// GET  /api/muse/regroup -> { viewerId, crews: { crewId, members: PersonCard[], originTitle, threadId, notAgainIds }[] }
//      (the viewer's crews with member cards and the crew's group thread, for the Memories page)
// POST /api/muse/regroup  body: { crewId, now? } -> { suggestion: { questId|null, title, whenText, reason }, message }
//      Context comes from the store (members, shared interests, visible availability and Find My
//      bubbles, upcoming quests nearby). Muse (fast model, strict schema) picks; code checks the
//      quest id. Members the viewer said no to ("Hang out with them again?") are left out; 409 when
//      that leaves nobody. Header x-muse-mode: mock|live. 502 { error } when Muse fails.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEMO_CENTER, NEGATIVE_HIGHLIGHTS, demoDate, formatDemoTime, minutesUntil, now as demoNow } from '@/shared';
import { museJSON, reportFallback } from '@/features/muse';
import { body, IdZ, route } from '@/lib/api';
import {
  commonInterests, crewFits, mockRegroup, questMatches, REGROUP_JSON_SCHEMA, RegroupZ, regroupMessages, validateRegroup,
  type RegroupCandidate, type RegroupContext,
} from '@/features/memories/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const first = (name: string) => name.split(' ')[0] ?? name;

function bubbleText(b: { emoji: string | null; thought: string | null; doing: string | null; wantsTo: string | null }): string | null {
  const parts = [b.thought && `${b.emoji ? `${b.emoji} ` : ''}${b.thought}`, b.doing, b.wantsTo && `wants to ${b.wantsTo}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function whenText(iso: string, at: Date): string {
  const mins = minutesUntil(iso, at);
  if (mins <= 0) return 'happening now';
  if (mins < 60) return `in ${mins} min`;
  const day = demoDate(new Date(iso)) === demoDate(at) ? 'today' : 'tomorrow';
  return `${day} ${formatDemoTime(iso)}`;
}

/** People the viewer said no to ("Hang out with them again?"), at any hangout. The viewer's own answers. */
async function saidNoTo(store: { hangAgainSignals(id: string): Promise<{ subjectId: string; again: boolean }[]> }, viewerId: string): Promise<Set<string>> {
  return new Set((await store.hangAgainSignals(viewerId)).filter((a) => !a.again).map((a) => a.subjectId));
}

export const GET = route(async ({ store, viewer }) => {
  const [crews, { view }, no] = await Promise.all([store.crews(viewer.id), store.museContext(), saidNoTo(store, viewer.id)]);
  return {
    viewerId: viewer.id,
    crews: crews.map((c) => {
      const members = view.people(viewer.id, c.memberIds);
      const set = new Set(c.memberIds);
      const thread = view.db.threads.find((t) => {
        const ms = view.threadMemberIds(t.id);
        return t.isGroup && ms.length === set.size && ms.every((m) => set.has(m));
      });
      // notAgainIds: crew members the viewer said no to. Only the viewer's own answers, so the
      // Memories card can leave them out of invites and demote "Get this group together again".
      const notAgainIds = c.memberIds.filter((m) => m !== viewer.id && no.has(m));
      return { crewId: c.id, members, originTitle: view.questById.get(c.originQuestId)?.title ?? null, threadId: thread?.id ?? null, notAgainIds };
    }),
  };
});

export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ crewId: IdZ, now: z.string().datetime({ offset: true }).optional() }));
  const at = b.now ? new Date(b.now) : demoNow();
  const crew = (await store.crews(viewer.id)).find((c) => c.id === b.crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  const [{ view }, pins, availability, mine, no, rated] = await Promise.all([
    store.museContext(), store.friendPins(viewer.id), store.friendAvailability(viewer.id), store.myLocation(viewer.id),
    saidNoTo(store, viewer.id), store.hangoutRatings(viewer.id),
  ]);
  // Never re-invite someone the viewer said no to: they are left out of the context and of the seat check.
  const others = crew.memberIds.filter((id) => id !== viewer.id && !no.has(id));
  if (crew.memberIds.length > 1 && others.length === 0) {
    return NextResponse.json({ error: 'nobody from this crew to invite' }, { status: 409 });
  }
  const invited = [viewer.id, ...others];
  const liked = new Map<string, number>();
  for (const r of rated) if (r.verdict === 'loved') for (const h of r.highlights) if (!NEGATIVE_HIGHLIGHTS.has(h)) liked.set(h, (liked.get(h) ?? 0) + 1);
  const likedBefore = [...liked].sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0])).map(([h]) => h).slice(0, 4);
  const profiles = invited.map((id) => view.profileById.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const members = others.flatMap((id) => {
    const p = view.profileById.get(id);
    if (!p) return [];
    const free = availability.find((a) => a.userId === id) ?? null;
    const pin = pins.find((x) => x.friend.id === id) ?? null;
    return [{
      id, firstName: first(p.name), interests: p.interests,
      free: free ? { text: free.text, startsAt: free.startsAt, endsAt: free.endsAt } : null,
      bubble: pin ? bubbleText(pin.bubble) : null,
    }];
  });
  const sharedInterests = commonInterests(profiles.map((p) => p.interests));
  const wanted = [...crew.sharedPrefs, ...sharedInterests];
  const center = mine?.location ?? viewer.home ?? DEMO_CENTER;
  const quests = await store.questsNear(viewer.id, center, 3000);
  const candidates: RegroupCandidate[] = quests
    .filter((q) => q.status === 'open' && !q.memberIds.includes(viewer.id))
    .flatMap((q) => {
      const row = view.questById.get(q.id);
      const seatsLeft = row ? view.seatsLeft(row) : Math.max(q.capacity - q.memberIds.length, 0);
      // The whole crew must fit: a 4-person crew is never sent to a 2-seat plan.
      return crewFits(seatsLeft, invited, q.memberIds) ? [{ q, seatsLeft }] : [];
    })
    .map(({ q, seatsLeft }) => {
      return {
        questId: q.id, title: q.title, emoji: q.emoji, venueName: q.venueName, startsAt: q.startsAt,
        whenText: whenText(q.startsAt, at), seatsLeft,
        priceMax: q.priceMax, tags: q.tags, matches: questMatches(q, wanted),
      };
    })
    .filter((c) => c.seatsLeft > 0)
    .sort((a, b2) => b2.matches.length - a.matches.length || a.startsAt.localeCompare(b2.startsAt))
    .slice(0, 6);

  const ctx: RegroupContext = {
    crewId: crew.id, crewName: crew.name, originTitle: view.questById.get(crew.originQuestId)?.title ?? null,
    lastHangoutText: demoDate(new Date(crew.lastHangoutAt)), viewerFirstName: first(viewer.name),
    sharedPrefs: crew.sharedPrefs, sharedInterests, members, candidates, likedBefore,
  };

  try {
    const res = await museJSON({
      schemaName: 'regroup', schema: RegroupZ, jsonSchema: REGROUP_JSON_SCHEMA,
      messages: regroupMessages(ctx), model: 'fast', effort: 'minimal',
      mock: () => mockRegroup(ctx), route: '/api/muse/regroup', userId: viewer.id, signal: req.signal, deadline: Date.now() + 8_000,
      // "Why did Muse suggest this": past ratings used, as counts and chips, never whose answer.
      logSignals: { pastHangoutsRated: rated.length, likedBefore, membersLeftOut: crew.memberIds.length - invited.length },
    });
    const out = validateRegroup(res.data, ctx);
    return NextResponse.json({ ...out, cached: res.cached === true }, { headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model } });
  } catch (err) {
    // Muse slow or down: the code version picks from the same real plans, so the crew card
    // still gets a suggestion (labelled offline) instead of "Muse is busy".
    const msg = String((err as Error)?.message ?? err).slice(0, 200);
    reportFallback({ route: '/api/muse/regroup', step: 'regroup', error: msg, userId: viewer.id });
    return NextResponse.json(validateRegroup(mockRegroup(ctx), ctx), { headers: { 'x-muse-mode': 'fallback' } });
  }
});

// GET /api/muse/for-you -> ForYouResponse
//     The "Up for" chips picked for you on the I'm free sheet. Code reads the viewer's hangout
//     ratings, this week's watched videos and profile interests, and keeps only chips an open plan
//     nearby matches (Noticed + Checked). Muse (fast model, minimal effort) writes the one Decided
//     sentence; code checks it invents no number or name. When Muse fails, the code template is
//     returned with byMuse false and the client drops the "✨ Muse" label. Header x-muse-mode: mock|live|fallback.
import { NextResponse } from 'next/server';
import {
  FOR_YOU_JSON_SCHEMA, ForYouDecidedZ, forYouMessages, forYouTemplate, museJSON, pickForYou, reportFallback, validateForYou,
} from '@/features/muse';
import { DEMO_CENTER, now, VIDEO_BY_KEY, type ForYouResponse } from '@/shared';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const first = (name: string) => name.split(' ')[0] ?? name;

export const GET = route(async ({ store, viewer }) => {
  const at = now();
  const [ratings, watch, quests, friends] = await Promise.all([
    store.myRatings(viewer.id), store.watch(viewer.id), store.questsNear(viewer.id, DEMO_CENTER, 3000), store.friends(viewer.id),
  ]);
  const open = quests.filter((q) => (q.status === 'open' || q.status === 'live') && !q.memberIds.includes(viewer.id));
  const draft = pickForYou({
    ratings,
    videos: watch.history.flatMap((h) => { const v = VIDEO_BY_KEY.get(h.videoKey); return v ? [{ ...h, topics: v.topics }] : []; }),
    interests: viewer.interests,
    quests: open,
    friendNames: new Map(friends.map((f) => [f.id, first(f.name)])),
    now: at,
  });
  const base = {
    chips: draft.chips.map(({ id, label, ask, icon, because, openPlans }) => ({ id, label, ask, icon, because, openPlans })),
    noticed: draft.noticed, checked: draft.checked,
  };
  const template = forYouTemplate(draft);
  if (draft.chips.length === 0) {
    return NextResponse.json({ ...base, decided: template, byMuse: false } satisfies ForYouResponse, { headers: { 'x-muse-mode': 'fallback' } });
  }
  try {
    const res = await museJSON({
      schemaName: 'for_you', schema: ForYouDecidedZ, jsonSchema: FOR_YOU_JSON_SCHEMA,
      messages: forYouMessages(draft),
      model: 'fast', effort: 'minimal', timeoutMs: 5000, deadline: Date.now() + 6000,
      mock: () => ({ decided: template }),
      route: 'muse/for-you', userId: viewer.id,
      logSignals: { chips: draft.chips.map((c) => c.id), dropped: draft.dropped, open: draft.openTotal },
    });
    const line = validateForYou(res.data.decided, draft);
    if (line) {
      return NextResponse.json({ ...base, decided: line, byMuse: true } satisfies ForYouResponse,
        { headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model } });
    }
    reportFallback({ route: 'muse/for-you', step: 'validate', error: 'line used a number or name not in the facts', userId: viewer.id });
  } catch (err) {
    reportFallback({ route: 'muse/for-you', step: 'muse', error: String((err as Error)?.message ?? err).slice(0, 200), userId: viewer.id });
  }
  return NextResponse.json({ ...base, decided: template, byMuse: false } satisfies ForYouResponse, { headers: { 'x-muse-mode': 'fallback' } });
});

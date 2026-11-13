import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MuseError, extractJSON, isMockMode, museJSON, onRun, plan, setMuseTransport, type MuseRunRecord,
} from '@/features/muse';

const Z = z.object({ answer: z.string() });
const JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
const saved = { ...process.env };
let runs: MuseRunRecord[] = [];

beforeEach(() => {
  runs = [];
  onRun((r) => { runs.push(r); });
});
afterEach(() => {
  process.env = { ...saved };
  setMuseTransport(null);
  onRun(() => {});
});

const call = () => museJSON({
  schemaName: 'test', schema: Z, jsonSchema: JSON_SCHEMA, model: 'fast',
  messages: [{ role: 'user', content: 'hi' }], mock: () => ({ answer: 'mocked' }), route: 'test',
});

function live() {
  delete process.env.MUSE_MOCK;
  process.env.MUSE_API_KEY = 'test-key-not-real';
  process.env.MUSE_BASE_URL = 'http://127.0.0.1:9';
  process.env.MUSE_CACHE = '0';
}

describe('museJSON', () => {
  it('uses the mock without a key and logs the run', async () => {
    delete process.env.MUSE_API_KEY;
    expect(isMockMode()).toBe(true);
    const r = await call();
    expect(r).toMatchObject({ data: { answer: 'mocked' }, model: 'mock', mock: true });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ route: 'test', ok: true, mock: true });
  });

  it('logs logSignals with the output but returns the plain data', async () => {
    delete process.env.MUSE_API_KEY;
    const r = await museJSON({
      schemaName: 'test', schema: Z, jsonSchema: JSON_SCHEMA, model: 'fast',
      messages: [{ role: 'user', content: 'hi' }], mock: () => ({ answer: 'mocked' }), route: 'test',
      logSignals: { pastHangoutsRated: 3, membersLeftOut: 1 },
    });
    expect(r.data).toEqual({ answer: 'mocked' });
    expect(runs[0].output).toEqual({ answer: 'mocked', signals: { pastHangoutsRated: 3, membersLeftOut: 1 } });
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    live();
    let n = 0;
    setMuseTransport(async (req) => {
      n++;
      expect(req.model).toBe('muse-ember-1.0');
      expect(req.effort).toBe('minimal');
      return { content: n === 1 ? '{"answer": 4' : '{"answer":"ok"}', usage: { promptTokens: 10, completionTokens: 3 } };
    });
    const r = await call();
    expect(n).toBe(2);
    expect(r.data).toEqual({ answer: 'ok' });
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 3 });
  });

  it('fails after two schema mismatches and never logs the key', async () => {
    live();
    setMuseTransport(async () => ({ content: '{"wrong":1} test-key-not-real', usage: { promptTokens: null, completionTokens: null } }));
    await expect(call()).rejects.toBeInstanceOf(MuseError);
    expect(runs.at(-1)?.ok).toBe(false);
    expect(JSON.stringify(runs)).not.toContain('test-key-not-real');
  });

  it('extractJSON handles code fences', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('plan with a live model that misbehaves', () => {
  it('drops invented ids from the model and falls back to the heuristic', async () => {
    live();
    setMuseTransport(async (req) => {
      if (req.schemaName === 'intent') {
        return {
          content: JSON.stringify({
            understood: true, activities: ['food'], budgetMax: 15, durationMinutes: 40, startsInMinutes: null,
            startClock: null, endClock: null, partOfDay: null, maxWalkMinutes: null, wantsFriends: true,
            openToNewPeople: true, vibe: null,
          }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }
      return {
        content: JSON.stringify({
          summary: 'Try the secret quest.',
          picks: [{ candidate: 'c99', friends: ['f9'], reason: 'Invented.', bridge: null, inviteDraft: null }],
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    });
    const out = await plan({ text: 'hungry, got like 40 min, under $15', userId: 'alex', now: new Date('2026-11-12T16:00:00-08:00') });
    expect(out.meta.mode).toBe('live');
    expect(out.meta.rankFallback).toBe(true);
    expect(out.plan.suggestions[0].title).toBe('Dumplings before the rush');
    expect(out.plan.summary.startsWith('[mock]')).toBe(false);
  });

  it('uses model picks that reference real candidates', async () => {
    live();
    setMuseTransport(async (req) => {
      if (req.schemaName === 'intent') {
        return {
          content: JSON.stringify({
            understood: true, activities: ['food'], budgetMax: 15, durationMinutes: 40, startsInMinutes: null,
            startClock: null, endClock: null, partOfDay: null, maxWalkMinutes: null, wantsFriends: true,
            openToNewPeople: true, vibe: null,
          }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }
      const user = JSON.parse(req.messages[1].content) as { candidates: { id: string; title: string; friendsWhoCanCome: { id: string }[] }[] };
      const d = user.candidates.find((c) => c.title.startsWith('Dumplings'))!;
      return {
        content: JSON.stringify({
          summary: 'Dumplings with Maya fit.',
          picks: [{ candidate: d.id, friends: d.friendsWhoCanCome.map((f) => f.id), reason: 'Starts 4:25 PM, 9 min walk, $12. You and Maya both like dumplings.', bridge: 'Maya is free till 4:50 PM.', inviteDraft: 'Maya! Dumplings at 4:25?' }],
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    });
    const out = await plan({ text: 'hungry, got like 40 min, under $15', userId: 'alex', now: new Date('2026-11-12T16:00:00-08:00') });
    expect(out.meta.rankFallback).toBe(false);
    expect(out.plan.summary).toBe('Dumplings with Maya fit.');
    expect(out.plan.suggestions).toHaveLength(1);
    expect(out.plan.suggestions[0].inviteDraft).toBe('Maya! Dumplings at 4:25?');
    expect(out.plan.suggestions[0].travelMinutes).toBe(9);
  });
});

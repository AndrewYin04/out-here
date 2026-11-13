import { expect, it, vi } from 'vitest';
vi.mock('@/features/outhere', () => ({
  museSteps: (plan: { meta: { understood?: boolean } }) => plan.meta.understood === false
    ? [{ key: 'intent', text: "Couldn't tell what you're up for." }]
    : [
      { key: 'intent', text: 'Got it: food · 45 min' },
      { key: 'friends', text: 'Maya is free till 6:00 PM' },
      { key: 'plans', text: 'Checked 5 plans: 1 fit · 2 too far' },
      { key: 'rank', text: 'Muse ranked 1 of 1 and explained why' },
    ],
}));
import type { ChatMessage } from './controller';
import type { AgentEncounter } from './encounter';
import { stageThought, companionThoughts as thoughts, thoughtDwellMs, THOUGHT_MAX } from './thought-line';
const companionThoughts = (...a: Parameters<typeof thoughts>) => thoughts(...a).map((t) => t.text);

const encounter = { id: 1, recipient: { id: 'maya', name: 'Maya Chen' }, source: 'backend', sent: 0, received: 0, messages: [], outcome: null } as unknown as AgentEncounter;
const pick = { questId: 'q-dumpling', friendIds: ['maya'], emoji: '🥟', title: 'Dumpling Den', travelMinutes: 9, seatsLeft: 2, reason: 'You both love dumplings and it fits before 6.', bridge: 'Maya can make it after work.' };
const reply = (suggestions: unknown[], meta: object = {}) => ({ id: 'm1', role: 'muse', text: '', source: 'muse', ask: 'food', plan: { intent: {}, summary: '', suggestions, meta: { dropped: [], ...meta } } }) as unknown as ChatMessage;

it('narrates a hand-off from the real agent events, in order', () => {
  expect(companionThoughts('sending', encounter, undefined, false)).toEqual(['Asking Maya’s Muse']);
  expect(companionThoughts('sending', { ...encounter, sent: 1 }, undefined, false)).toEqual(['Asking Maya’s Muse', 'Message sent']);
  expect(companionThoughts('receiving', { ...encounter, sent: 1, received: 1 }, undefined, false).at(-1)).toBe('Maya’s Muse replied');
  expect(companionThoughts('idle', { ...encounter, sent: 1, received: 1, outcome: 'success' }, undefined, false).at(-1)).toContain('in the chat');
  expect(companionThoughts('idle', { ...encounter, outcome: 'cancelled' }, undefined, false)).toEqual([]);
});

it('never claims agreement for unavailable or failed encounters', () => {
  const lines = companionThoughts('idle', { ...encounter, outcome: 'unavailable' }, undefined, false);
  expect(lines.at(-1)).toBe('No plan was confirmed.');
  expect(lines.join(' ')).not.toMatch(/agreed|said yes|is in\b/i);
  expect(companionThoughts('error', { ...encounter, outcome: 'error' }, undefined, false)[0]).toContain('did not finish');
});

it('talks through a fresh plan: understood, friends, checked, the pick, then Muse’s own words', () => {
  expect(companionThoughts('idle', null, reply([pick, { ...pick, title: 'Boba' }]), true)).toEqual([
    'Got it: food · 45 min',
    'Maya is free till 6:00 PM',
    'Checked 5 plans: 1 fit · 2 too far',
    '🥟 Dumpling Den: 9 min walk · 2 seats left',
    pick.reason,
    pick.bridge,
    '1 more idea for you',
  ]);
});

it('leaves out what it does not know and cuts long lines at a word', () => {
  const lines = companionThoughts('idle', null, reply([{ ...pick, seatsLeft: null, bridge: null, reason: 'word '.repeat(60) }]), true);
  expect(lines).toContain('🥟 Dumpling Den: 9 min walk');
  expect(lines.some((l) => l.includes('null'))).toBe(false);
  const cut = lines.find((l) => l.startsWith('word'))!;
  expect(cut.length).toBeLessThanOrEqual(THOUGHT_MAX);
  expect(cut.endsWith('word…')).toBe(true);
  expect(companionThoughts('idle', null, reply([]), true).at(-1)).toBe('Muse ranked 1 of 1 and explained why');
  expect(companionThoughts('idle', null, reply([pick], { understood: false }), true)).toEqual(["Couldn't tell what you're up for."]);
});

it('only describes real pending work and tolerates responses without optional metadata', () => {
  expect(companionThoughts('thinking', null, undefined, false)).toEqual(['Working on your request']);
  expect(companionThoughts('evaluating', null, undefined, false)).toEqual(['Looking at your photo']);
  expect(companionThoughts('idle', null, { role: 'muse', plan: { summary: 'No metadata' } } as ChatMessage, true)).toEqual([]);
  expect(companionThoughts('idle', null, undefined, false)).toEqual([]);
});

it('never replays old plan recaps after the next message or an error', () => {
  expect(companionThoughts('idle', null, { role: 'user', text: 'A newer ask' } as ChatMessage, true)).toEqual([]);
  expect(companionThoughts('error', null, reply([pick]), true)).toEqual([]);
  expect(companionThoughts('idle', null, reply([pick]), false)).toEqual([]);
});

it('gives each thought time to be read', () => {
  expect(thoughtDwellMs('Message sent')).toBeGreaterThanOrEqual(2600);
  expect(thoughtDwellMs('x'.repeat(110))).toBeGreaterThan(thoughtDwellMs('short'));
  expect(thoughtDwellMs('x'.repeat(500))).toBeLessThanOrEqual(6500);
});

it('points each thought at what it is about on the map', () => {
  const r = { ...(reply([pick]) as object), plan: { intent: {}, summary: '', suggestions: [pick], meta: { dropped: [{ questId: 'q-ramen', reason: 'walk' }, { questId: 'q-x', reason: 'activity' }], friendsFree: [{ friendId: 'maya', firstName: 'Maya', freeUntil: '' }] } } } as unknown as ChatMessage;
  const f = thoughts('idle', null, r, true).map((t) => t.focus);
  expect(f[0]).toEqual({ kind: 'me' });
  expect(f[1]).toEqual({ kind: 'friends', ids: ['maya'] });
  expect(f[2]).toEqual({ kind: 'checked', lit: ['q-dumpling'], dropped: [{ id: 'q-ramen', label: 'too far' }] });
  expect(f[3]).toEqual({ kind: 'quest', id: 'q-dumpling', friendIds: ['maya'] });
  expect(thoughts('sending', encounter, undefined, false)[0].focus).toEqual({ kind: 'encounter', friendId: 'maya' });
});

it('while a run is going, the thought follows the last finished stage', () => {
  expect(stageThought([]).text).toBe('Reading what you asked');
  const t = stageThought([
    { stage: 'context', ms: 1, friends: 3, quests: 5 },
    { stage: 'parse', ms: 1, model: 'mock', cached: false, understood: true, intent: {} as never },
    { stage: 'candidates', ms: 1, fit: 2, checked: 5, friendsFree: [{ friendId: 'maya', firstName: 'Maya', freeUntil: '' }], dropped: [{ questId: 'q1', reason: 'walk' }] },
  ]);
  expect(t.text).toBe('Checked 5 plans: 1 fit · 2 too far · ranking them');
  expect(t.focus).toEqual({ kind: 'checked', lit: [], dropped: [{ id: 'q1', label: 'too far' }], friends: ['maya'] });
  expect(stageThought([{ stage: 'rank', ms: 1, model: 'muse-spark-1.0', cached: false, fallback: false, picks: 2 }]).text).toBe('Ranked 2 with Spark · double-checking the facts');
});

it('after a friend’s Muse replies, says what it found, never an invented ask', () => {
  const coord = { id: 'c1', role: 'muse', text: '', source: 'muse', ask: '', plan: { intent: { activities: [] }, summary: '', meta: { dropped: [], coordination: true },
    suggestions: [{ questId: null, friendIds: ['maya'], emoji: '💬', title: 'Invite Maya for food', reason: 'Maya shared a free window from 8:25 to 9:14 AM.', travelMinutes: 0, seatsLeft: null }] } } as unknown as ChatMessage;
  const lines = companionThoughts('idle', null, coord, true);
  expect(lines).toEqual(['Maya shared a free window from 8:25 to 9:14 AM.', '💬 Invite Maya for food', 'They still need to say yes']);
  expect(lines.join(' ')).not.toMatch(/anything nearby|Got it/);
});

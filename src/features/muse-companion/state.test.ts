import { describe, expect, it } from 'vitest';
import { INITIAL, petPose, reduce, type MuseEvent, type MuseSnapshot } from './state';

const run = (events: MuseEvent[], from: MuseSnapshot = INITIAL) => events.reduce(reduce, from);

describe('muse companion state', () => {
  it('opening approaches, then settles to idle with the chat open', () => {
    const s = run([{ type: 'CHAT_OPENED' }]);
    expect(s).toMatchObject({ open: true, state: 'approaching' });
    expect(run([{ type: 'APPROACH_DONE' }], s)).toMatchObject({ open: true, state: 'idle' });
  });

  it('rapid opens are one approach (no restart)', () => {
    const once = run([{ type: 'CHAT_OPENED' }]);
    expect(reduce(once, { type: 'CHAT_OPENED' })).toBe(once);
  });

  it('typing listens, blurring goes back to idle', () => {
    const open = run([{ type: 'CHAT_OPENED' }, { type: 'APPROACH_DONE' }]);
    const typing = reduce(open, { type: 'USER_INPUT_STARTED' });
    expect(typing.state).toBe('listening');
    expect(reduce(typing, { type: 'USER_INPUT_ENDED' }).state).toBe('idle');
  });

  it('request → thinking → responding → settled', () => {
    const open = run([{ type: 'CHAT_OPENED' }, { type: 'APPROACH_DONE' }]);
    const s = run([{ type: 'MUSE_REQUEST_STARTED' }, { type: 'MUSE_RESPONSE_RECEIVED' }], open);
    expect(s.state).toBe('responding');
    expect(reduce(s, { type: 'RESPONSE_SETTLED' }).state).toBe('idle');
  });

  it('a failure shows error, and typing again recovers', () => {
    const open = run([{ type: 'CHAT_OPENED' }, { type: 'APPROACH_DONE' }]);
    const failed = run([{ type: 'MUSE_REQUEST_STARTED' }, { type: 'MUSE_REQUEST_FAILED' }], open);
    expect(failed.state).toBe('error');
    expect(reduce(failed, { type: 'USER_INPUT_STARTED' }).state).toBe('listening');
  });

  it('closing returns, then idles; a reply that lands after closing does not reopen anything', () => {
    const thinking = run([{ type: 'CHAT_OPENED' }, { type: 'APPROACH_DONE' }, { type: 'MUSE_REQUEST_STARTED' }]);
    const closed = reduce(thinking, { type: 'CHAT_CLOSED' });
    expect(closed).toMatchObject({ open: false, state: 'returning' });
    expect(reduce(closed, { type: 'MUSE_RESPONSE_RECEIVED' })).toBe(closed);
    expect(reduce(closed, { type: 'RETURN_DONE' }).state).toBe('idle');
  });

  it('typing does not interrupt a request in flight', () => {
    const thinking = run([{ type: 'CHAT_OPENED' }, { type: 'APPROACH_DONE' }, { type: 'MUSE_REQUEST_STARTED' }]);
    expect(reduce(thinking, { type: 'USER_INPUT_STARTED' })).toBe(thinking);
  });

  it('picking a plan records it and bumps the sequence (so picking the same one twice still fires)', () => {
    const a = reduce(INITIAL, { type: 'PLAN_SELECTED', questId: 'q1' });
    const b = reduce(a, { type: 'PLAN_SELECTED', questId: 'q1' });
    expect(a.selectedQuestId).toBe('q1');
    expect(b.selectionSeq).toBe(a.selectionSeq + 1);
  });

  it('future states: a hook can enter and leave delivering, but cannot cut off a request', () => {
    const delivering = reduce(INITIAL, { type: 'ACTION_STARTED', state: 'delivering' });
    expect(delivering.state).toBe('delivering');
    expect(reduce(delivering, { type: 'ACTION_ENDED' }).state).toBe('idle');
    const thinking = reduce({ ...INITIAL, open: true }, { type: 'MUSE_REQUEST_STARTED' });
    expect(reduce(thinking, { type: 'ACTION_STARTED', state: 'sending' })).toBe(thinking);
  });

  it('pose: front while chat is open, thinking and talking clips', () => {
    expect(petPose(INITIAL)).toEqual({ front: false, clip: 'hover' });
    expect(petPose({ ...INITIAL, open: true, state: 'thinking' })).toEqual({ front: true, clip: 'think' });
    expect(petPose({ ...INITIAL, open: true, state: 'responding' })).toEqual({ front: true, clip: 'talk' });
    expect(petPose({ ...INITIAL, open: true, state: 'listening' })).toMatchObject({ clip: 'listen' });
    expect(petPose({ ...INITIAL, open: true, state: 'error' })).toMatchObject({ clip: 'sad' });
    expect(petPose({ ...INITIAL, open: true, state: 'celebrating' })).toMatchObject({ clip: 'happy' });
  });
});

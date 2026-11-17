import { describe, expect, it } from 'vitest';
import type { Message } from '@/shared';
import type { PersonCard, ThreadView } from '@/shared/api';
import { groupMessages, listedThreads, mergeMessages, shortAgo, snippet, sortThreads, threadTitle } from './format';

const person = (id: string, name: string): PersonCard => ({ id, handle: id, name, avatarUrl: '', mutualFriendCount: 0, isFriend: true });
const msg = (id: string, fromId: string, at: string, kind: Message['kind'] = 'text'): Message => ({
  id, threadId: 't', fromId, text: `m${id}`, kind, inviteId: kind === 'invite' ? 'i1' : null, createdAt: at,
});
const thread = (over: Partial<ThreadView>): ThreadView => ({
  id: 't', name: null, isGroup: false, memberIds: [], createdAt: '2026-11-12T10:00:00Z', lastMessageAt: null,
  members: [person('a', 'Alex Rivera'), person('m', 'Maya Chen')], lastMessage: null, unreadCount: 0, ...over,
});

describe('messenger format', () => {
  it('titles a 1:1 chat with the other person and a group by name or first names', () => {
    expect(threadTitle(thread({}), 'a')).toBe('Maya Chen');
    expect(threadTitle(thread({ isGroup: true, name: 'Sac crew' }), 'a')).toBe('Sac crew');
    const many = thread({ isGroup: true, members: ['a', 'b', 'c', 'd', 'e'].map((x) => person(x, `${x.toUpperCase()} Z`)) });
    expect(threadTitle(many, 'a')).toBe('B, C and 2 others');
  });

  it('prefixes the snippet with "You: " for the viewer and the first name in groups', () => {
    expect(snippet(thread({ lastMessage: msg('1', 'a', '2026-11-12T10:00:00Z') }), 'a')).toBe('You: m1');
    expect(snippet(thread({ lastMessage: msg('1', 'm', '2026-11-12T10:00:00Z') }), 'a')).toBe('m1');
    expect(snippet(thread({ isGroup: true, lastMessage: msg('1', 'm', '2026-11-12T10:00:00Z') }), 'a')).toBe('Maya: m1');
  });

  it('hides chats with no messages unless they are the open one', () => {
    const empty = thread({ id: 'empty' });
    const real = thread({ id: 'real', lastMessage: msg('1', 'm', '2026-11-12T10:00:00Z') });
    expect(listedThreads([empty, real]).map((t) => t.id)).toEqual(['real']);
    expect(listedThreads([empty, real], 'empty').map((t) => t.id)).toEqual(['empty', 'real']);
  });

  it('sorts newest first and formats short times', () => {
    const older = thread({ id: 'old', lastMessage: msg('1', 'a', '2026-11-11T10:00:00Z') });
    const newer = thread({ id: 'new', lastMessage: msg('2', 'a', '2026-11-12T10:00:00Z') });
    expect(sortThreads([older, newer]).map((t) => t.id)).toEqual(['new', 'old']);
    const now = Date.parse('2026-11-12T13:00:00Z');
    expect(shortAgo('2026-11-12T10:00:00Z', now)).toBe('3h');
    expect(shortAgo('2026-11-12T12:59:30Z', now)).toBe('Just now');
  });

  it('groups by sender within 5 minutes and adds dividers after 15 minutes', () => {
    const now = Date.parse('2026-11-12T20:00:00Z');
    const g = groupMessages([
      msg('1', 'a', '2026-11-12T18:00:00Z'),
      msg('2', 'a', '2026-11-12T18:02:00Z'),
      msg('3', 'm', '2026-11-12T18:03:00Z'),
      msg('4', 'm', '2026-11-12T18:30:00Z'),
      msg('5', 'm', '2026-11-12T18:31:00Z', 'invite'),
    ], now);
    expect(g.map((x) => x.messages.map((m) => m.id))).toEqual([['1', '2'], ['3'], ['4'], ['5']]);
    expect(g[0].divider).toBe('10:00 AM');
    expect(g[1].divider).toBeNull();
    expect(g[2].divider).toBe('10:30 AM');
  });

  it('merges optimistic sends without duplicating confirmed ones', () => {
    const server = [msg('1', 'a', '2026-11-12T18:00:00Z')];
    const pending = [msg('1', 'a', '2026-11-12T18:00:00Z'), msg('local-1', 'a', '2026-11-12T18:01:00Z')];
    expect(mergeMessages(server, pending).map((m) => m.id)).toEqual(['1', 'local-1']);
  });
});

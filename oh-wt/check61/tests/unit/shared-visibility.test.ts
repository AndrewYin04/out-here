import { describe, expect, it } from 'vitest';
import { audienceListId, canSee, isAudience } from '@/shared/visibility';

const OWNER = 'owner';
const FRIEND = 'friend';
const STRANGER = 'stranger';
const LIST = 'list:close';

describe('canSee', () => {
  it('owner always sees their own item, even only_me', () => {
    for (const a of ['public', 'friends', 'only_me', LIST] as const) {
      expect(canSee(OWNER, OWNER, a, { areFriends: false })).toBe(true);
    }
  });

  it('public is visible to everyone, including a logged-out viewer', () => {
    expect(canSee(STRANGER, OWNER, 'public', { areFriends: false })).toBe(true);
    expect(canSee(null, OWNER, 'public', { areFriends: false })).toBe(true);
  });

  it('friends is visible to friends only', () => {
    expect(canSee(FRIEND, OWNER, 'friends', { areFriends: true })).toBe(true);
    expect(canSee(STRANGER, OWNER, 'friends', { areFriends: false })).toBe(false);
    expect(canSee(null, OWNER, 'friends', { areFriends: false })).toBe(false);
  });

  it('only_me hides from friends', () => {
    expect(canSee(FRIEND, OWNER, 'only_me', { areFriends: true })).toBe(false);
  });

  it('a list audience needs list membership and friendship', () => {
    expect(canSee(FRIEND, OWNER, LIST, { areFriends: true, listMemberIds: [FRIEND] })).toBe(true);
    expect(canSee(FRIEND, OWNER, LIST, { areFriends: true, listMemberIds: ['someone-else'] })).toBe(false);
    expect(canSee(FRIEND, OWNER, LIST, { areFriends: true })).toBe(false);
    // unfriended but still on the list: hidden
    expect(canSee(FRIEND, OWNER, LIST, { areFriends: false, listMemberIds: [FRIEND] })).toBe(false);
  });

  it('unknown audience strings fail closed', () => {
    expect(canSee(FRIEND, OWNER, 'list:' as never, { areFriends: true, listMemberIds: [FRIEND] })).toBe(false);
    expect(canSee(FRIEND, OWNER, 'everyone' as never, { areFriends: true })).toBe(false);
  });
});

describe('audience helpers', () => {
  it('parses list ids and validates audiences', () => {
    expect(audienceListId('list:abc')).toBe('abc');
    expect(audienceListId('friends')).toBeNull();
    expect(isAudience('public')).toBe(true);
    expect(isAudience('list:abc')).toBe(true);
    expect(isAudience('list:')).toBe(false);
    expect(isAudience('everyone')).toBe(false);
  });
});

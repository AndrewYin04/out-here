import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { profileId, seedId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import type { CoreStore } from '@/features/data/core';

// Finding E1 (fix round 2): an invite to a quest with one seat left must still be acceptable.
const alex = profileId('alex');
const maya = profileId('maya');
const volleyball = seedId('quest', 'volleyball');

let store: CoreStore;
const NOW = new Date('2026-11-12T18:07:00Z');
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

describe('invites to the last seat', () => {
  it('createInvite reports seatsLeft so the UI can warn', async () => {
    const before = await store.quest(alex, volleyball);
    expect(before.seatsLeft).toBe(1);
    expect(before.quest.memberIds).not.toContain(alex);
    const invite = await store.createInvite(alex, { toId: maya, questId: volleyball, suggestionTitle: 'Volleyball?', message: 'last spot' });
    expect(invite.seatsLeft).toBe(1);
  });

  it('the invitee takes the last seat alone, and the inviter is told', async () => {
    const invite = await store.createInvite(alex, { toId: maya, questId: volleyball, suggestionTitle: 'Volleyball?', message: 'last spot' });
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => { if (m.channel === `user:${alex}`) got.push(m); });
    const [a, b] = await Promise.all([
      store.respondInvite(maya, invite.id, 'accepted'),
      store.respondInvite(maya, invite.id, 'accepted'),
    ]);
    off();
    for (const r of [a, b]) {
      expect(r.invite.status).toBe('accepted');
      expect(r.joinedAlone).toBe(true);
    }
    const after = await store.quest(maya, volleyball);
    expect(after.seatsLeft).toBe(0);
    expect(after.quest.memberIds).toContain(maya);
    expect(after.quest.memberIds).not.toContain(alex);
    expect(got.some((m) => m.payload && (m.payload as { type?: string }).type === 'invite')).toBe(true);
  });

  it('a full quest still returns 409 quest_full, leaves the invite pending, and tells the inviter', async () => {
    const v = await store.view();
    const stranger = v.db.profiles.find((p) => p.id !== alex && p.id !== maya && !v.questMemberIds(volleyball).includes(p.id))!;
    const invite = await store.createInvite(alex, { toId: maya, questId: volleyball, suggestionTitle: 'Volleyball?', message: '' });
    await store.joinQuest(stranger.id, volleyball, null);
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => { if (m.channel === `user:${alex}`) got.push(m); });
    await expect(store.respondInvite(maya, invite.id, 'accepted')).rejects.toMatchObject({ status: 409, message: 'quest_full' });
    off();
    expect((await store.invites(maya)).incoming.find((i) => i.id === invite.id)?.status).toBe('pending');
    expect(got.some((m) => (m.payload as { type?: string }).type === 'invite')).toBe(true);
  });
});

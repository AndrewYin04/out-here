import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { haversineMeters, profileId, seedId, setNow, snapToGrid } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import type { CoreStore } from '@/features/data/core';
import { placeChips, type ChipItem } from '@/features/map/friends/chips';
import { myShareSkip } from '@/features/map/friends/useFindMy';

const id = (h: string) => profileId(h);
let store: CoreStore;
const NOW = new Date('2026-11-12T18:07:00Z');
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

const handles = async (viewer: string) => {
  const v = await store.view();
  return (await store.friendPins(id(viewer))).map((p) => v.profileById.get(p.friend.id)!.handle);
};

describe('Find My: friend pins', () => {
  it('shows Alex at least 4 local friends with bubbles, never non-friends, paused or expired', async () => {
    const pins = await store.friendPins(id('alex'));
    const v = await store.view();
    const hs = pins.map((p) => v.profileById.get(p.friend.id)!.handle);
    for (const h of hs) expect(v.areFriends(id('alex'), id(h))).toBe(true);
    for (const h of ['jordan', 'nina', 'priya', 'olivia', 'nate', 'alex']) expect(hs).not.toContain(h);
    const local = pins.filter((p) => p.distanceKm < 5 && p.bubble.thought);
    expect(local.length).toBeGreaterThanOrEqual(4);
    expect(hs.slice(0, 2)).toContain('maya');
    expect(hs.length).toBeGreaterThanOrEqual(20);
    // sorted by distance
    for (let i = 1; i < pins.length; i++) expect(pins[i].distanceKm).toBeGreaterThanOrEqual(pins[i - 1].distanceKm);
  });

  it('gives Maya the boba bubble and no home location for other people', async () => {
    const maya = (await store.friendPins(id('alex'))).find((p) => p.friend.id === id('maya'))!;
    expect(maya.bubble).toEqual({ emoji: '🧋', thought: 'Free after class · Down for boba', doing: 'out of class, free for an hour', wantsTo: 'grab boba' });
    expect(maya.walkingMinutes).not.toBeNull();
    expect(maya.friend.home).toBeNull();
  });

  it('keeps Ethan at least 150 m from the Dumpling Den pin', async () => {
    const v = await store.view();
    const den = v.db.places.find((p) => p.name === 'Dumpling Den')!;
    const ethan = (await store.friendPins(id('alex'))).find((p) => p.friend.id === id('ethan'))!;
    expect(haversineMeters(ethan.location, den.location)).toBeGreaterThanOrEqual(150);
  });

  it('snaps approximate shares to a grid cell with a city label and rounded distance', async () => {
    const v = await store.view();
    const raw = v.db.locationShares.find((s) => s.userId === id('liam'))!;
    const pin = (await store.friendPins(id('alex'))).find((p) => p.friend.id === id('liam'))!;
    expect(pin.precision).toBe('approximate');
    expect(pin.location).toEqual(snapToGrid(raw.location, 800));
    expect(pin.location).not.toEqual(raw.location);
    expect(pin.placeLabel).toBe('Redwood City');
    expect((pin.distanceKm * 2) % 1).toBe(0);
    expect(pin.walkingMinutes === null || pin.walkingMinutes % 5 === 0).toBe(true);
  });

  it('snapToGrid is stable inside a cell', () => {
    const a = snapToGrid({ lat: 37.48, lng: -122.15 }, 800);
    const b = snapToGrid({ lat: 37.4801, lng: -122.1501 }, 800);
    expect(a).toEqual(b);
  });
});

describe('Find My: editing my share', () => {
  it('updates the bubble and notifies the audience on location channels only, never user:', async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    await store.updateMyLocation(id('maya'), { bubble: { thought: 'ramen instead?' } });
    off();
    expect(got.some((m) => m.channel === `location:${id('alex')}` && m.payload.type === 'location' && m.payload.id === id('maya'))).toBe(true);
    expect(got.some((m) => m.channel.startsWith('user:'))).toBe(false);
    expect(got.some((m) => m.channel === `location:${id('nina')}`)).toBe(false);
    const pin = (await store.friendPins(id('alex'))).find((p) => p.friend.id === id('maya'))!;
    expect(pin.bubble.thought).toBe('ramen instead?');
    expect(pin.bubble.emoji).toBe('🧋');
  });

  it("a friend's move does not refetch the watcher's own share; the mover's own tabs do (E2)", async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    await store.updateMyLocation(id('alex'), { location: { lat: 37.485, lng: -122.148 } });
    off();
    const toMaya = got.find((m) => m.channel === `location:${id('maya')}`)!;
    const toAlex = got.find((m) => m.channel === `location:${id('alex')}`)!;
    expect(myShareSkip(id('maya'))(null, toMaya.channel, toMaya.payload as Record<string, unknown>)).toBe(true);
    expect(myShareSkip(id('alex'))(null, toAlex.channel, toAlex.payload as Record<string, unknown>)).toBe(false);
  });

  it('only_me hides the pin and still notifies the old audience', async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    await store.updateMyLocation(id('maya'), { audience: 'only_me' });
    off();
    expect(got.some((m) => m.channel === `location:${id('alex')}`)).toBe(true);
    expect(await handles('alex')).not.toContain('maya');
  });

  it('pausing hides the pin; a Close friends list limits who sees it', async () => {
    await store.updateMyLocation(id('maya'), { paused: true });
    expect(await handles('alex')).not.toContain('maya');
    await store.updateMyLocation(id('maya'), { paused: false, audience: `list:${seedId('friend_list', 'maya:close-friends')}` });
    expect(await handles('alex')).toContain('maya');
    expect(await handles('chloe')).not.toContain('maya');
  });

  it('first-time sharing defaults to approximate; unknown lists are rejected', async () => {
    const share = await store.updateMyLocation(id('sam'), { bubble: { thought: 'hi' } });
    expect(share.precision).toBe('approximate');
    await expect(store.updateMyLocation(id('sam'), { audience: 'list:nope' })).rejects.toMatchObject({ status: 400 });
  });

  it('Want to hang? creates an invite to a friend with a nearby suggestion', async () => {
    const { invite, suggestion } = await store.hangInvite(id('alex'), { toId: id('maya'), message: 'lunch?' });
    expect(invite.toId).toBe(id('maya'));
    expect(suggestion.length).toBeGreaterThan(3);
    await expect(store.hangInvite(id('alex'), { toId: id('jordan'), message: 'hi' })).rejects.toMatchObject({ status: 403 });
  });

  it('Want to hang? proposes a nearby plan for Maya, and the invite matches the preview', async () => {
    // The boba quest is in the afternoon now ("45 Minutes to Thrift"), so the nearest plan soon wins.
    const s = await store.hangSuggestion(id('alex'), id('maya'));
    expect(s?.kind).toBe('quest');
    expect(s?.draft).toContain(s!.venueName!);
    const { invite } = await store.hangInvite(id('alex'), { toId: id('maya'), message: s!.draft, questId: s!.questId });
    expect(invite.questId).toBe(s!.questId);
    // a hidden friend gets no suggestion
    expect(await store.hangSuggestion(id('alex'), id('olivia'))).toBeNull();
  });
});

describe('Find My: chip placement', () => {
  const item = (h: string, x: number, y: number, km: number, thought = 'craving dumplings'): ChipItem => ({
    pin: { friend: { id: h } as ChipItem['pin']['friend'], bubble: { emoji: '🥟', thought, doing: null, wantsTo: null }, distanceKm: km, updatedAt: NOW.toISOString() },
    x, y,
  });
  const view = { w: 390, h: 700 };

  it("keeps the nearer friend's full chip and shrinks or hides a colliding one", () => {
    const m = placeChips([item('far', 205, 300, 2), item('near', 200, 300, 1)], null, view, false);
    expect(m.get('near')).toBe('full');
    expect(m.get('far')).not.toBe('full');
  });

  it("never covers the viewer's own pin or runs off the edge", () => {
    // chip of a pin right below "You" would sit on the viewer's avatar
    const m = placeChips([item('a', 200, 350, 0.3), item('edge', 360, 200, 0.5, 'new playlist on repeat all day')], { x: 200, y: 304 }, view, false);
    expect(m.get('a')).toBe('none');
    expect(m.get('edge')).toBe('emoji');
  });

  it('shows emoji only when asked (phones zoomed out)', () => {
    const m = placeChips([item('a', 100, 300, 1)], null, view, true);
    expect(m.get('a')).toBe('emoji');
  });
});

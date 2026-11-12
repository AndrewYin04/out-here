import { describe, expect, it } from 'vitest';
import type { Crew, Memory, PersonCard, Quest } from '@/shared';
import { buildJourney, journeyQuestIds, photoLabel, stopLabel, toMapPoints, type QuestDetailLite } from './journey';

const person = (id: string, name: string): PersonCard => ({
  id, handle: id, name, avatarUrl: `/a/${id}.png`, mutualFriendCount: 0, isFriend: true,
});

const crew: Crew = {
  id: 'crew-1', name: 'Dumpling Den crew', memberIds: ['alex', 'maya'], originQuestId: 'q-dumplings',
  sharedPrefs: ['dumplings'], lastHangoutAt: '2026-11-08T21:30:00.000Z',
};

const quest = (id: string, over: Partial<Quest> = {}): Quest => ({
  id, hostId: 'alex', title: '🥟 Dumpling Den first try', emoji: '🥟', category: 'food', description: '',
  venueName: 'Dumpling Den', location: { lat: 37.48, lng: -122.15 }, approxLocation: { lat: 37.481, lng: -122.151 },
  startsAt: '2026-11-08T20:30:00.000Z', endsAt: '2026-11-08T21:30:00.000Z', capacity: 4, memberIds: ['alex', 'maya'],
  priceMax: 12, tags: [], status: 'done', isPublic: true, createdAt: '2026-11-01T00:00:00.000Z', groupId: null, placeId: null,
  ...over,
});

const detail = (q: Quest, viewerIsMember = true): QuestDetailLite => ({
  quest: q, members: [person('alex', 'Alex Kim'), person('maya', 'Maya Chen')], viewerIsMember,
});

const photo = (id: string, questId: string, createdAt: string): Memory => ({
  id, crewId: crew.id, questId, uploaderId: 'alex', photoUrl: `/p/${id}.jpg`, caption: `caption ${id}`, createdAt,
});

describe('buildJourney', () => {
  it('groups several photos at one venue into one stop, in photo order', () => {
    const memories = [photo('b', 'q-dumplings', '2026-11-08T21:10:00Z'), photo('a', 'q-dumplings', '2026-11-08T20:50:00Z')];
    const j = buildJourney({ crew, members: [], memories, quests: { 'q-dumplings': detail(quest('q-dumplings')) } });
    expect(j.stops).toHaveLength(1);
    expect(j.stops[0].photos.map((p) => p.id)).toEqual(['a', 'b']);
    expect(j.stops[0].title).toBe('Dumpling Den first try');
    expect(j.photoCount).toBe(2);
    expect(j.date).toBe('2026-11-08T20:30:00.000Z');
  });

  it('uses [lng, lat] for members and never coordinates for non-members', () => {
    const q = quest('q-dumplings');
    const member = buildJourney({ crew, members: [], memories: [], quests: { 'q-dumplings': detail(q, true) } });
    expect(member.stops[0].coordinates).toEqual([-122.15, 37.48]);
    const outsider = buildJourney({ crew, members: [], memories: [], quests: { 'q-dumplings': detail(q, false) } });
    expect(outsider.stops[0].coordinates).toBeNull();
  });

  it('keeps a stop with an unloaded quest, with no location and the crew name', () => {
    const j = buildJourney({ crew, members: [], memories: [photo('a', 'q-dumplings', '2026-11-08T20:50:00Z')], quests: {} });
    expect(j.stops[0]).toMatchObject({ title: 'Dumpling Den crew', coordinates: null, startsAt: null, priceMax: null });
    expect(j.date).toBe(crew.lastHangoutAt);
  });

  it('orders multi-stop journeys by start time, undated stops last', () => {
    const memories = [photo('c', 'q-coffee', '2026-11-08T22:10:00Z'), photo('d', 'q-mystery', '2026-11-08T23:00:00Z'), photo('a', 'q-dumplings', '2026-11-08T20:50:00Z')];
    const j = buildJourney({
      crew, members: [], memories,
      quests: {
        'q-dumplings': detail(quest('q-dumplings')),
        'q-coffee': detail(quest('q-coffee', { title: 'Coffee', venueName: 'Cafe', startsAt: '2026-11-08T22:00:00.000Z' })),
      },
    });
    expect(j.stops.map((s) => s.id)).toEqual(['q-dumplings', 'q-coffee', 'q-mystery']);
  });

  it('drops photo-less stops other than the crew hangout', () => {
    expect(journeyQuestIds(crew, [])).toEqual(['q-dumplings']);
    const j = buildJourney({ crew, members: [person('alex', 'Alex Kim')], memories: [], quests: { 'q-dumplings': detail(quest('q-dumplings')) } });
    expect(j.stops).toHaveLength(1);
    expect(j.members.map((m) => m.id)).toEqual(['alex']);
  });

  it('reports a free hangout as no price', () => {
    const j = buildJourney({ crew, members: [], memories: [], quests: { 'q-dumplings': detail(quest('q-dumplings', { priceMax: 0 })) } });
    expect(j.stops[0].priceMax).toBeNull();
  });
});

describe('toMapPoints', () => {
  it('maps stops to the map contract with the cover photo and grouped count', () => {
    const memories = [photo('a', 'q-dumplings', '2026-11-08T20:50:00Z'), photo('b', 'q-dumplings', '2026-11-08T21:10:00Z')];
    const j = buildJourney({ crew, members: [], memories, quests: { 'q-dumplings': detail(quest('q-dumplings')) } });
    expect(toMapPoints(j)).toEqual([{
      id: 'q-dumplings', title: 'Dumpling Den', emoji: '🥟', coordinates: [-122.15, 37.48],
      photoUrl: '/p/a.jpg', photoCount: 2, startsAt: '2026-11-08T20:30:00.000Z',
    }]);
  });
});

describe('labels', () => {
  it('pluralises', () => {
    expect(photoLabel(1)).toBe('1 photo');
    expect(photoLabel(2)).toBe('2 photos');
    expect(stopLabel(1)).toBe('1 stop');
    expect(stopLabel(3)).toBe('3 stops');
  });
});

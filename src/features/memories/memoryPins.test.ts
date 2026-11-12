import { describe, expect, it } from 'vitest';
import { groupMemoryPins, pinBounds, type PinnableMemory } from './memoryPins';

const row = (id: string, coords: [number, number] | null, startsAt: string, venueName = 'Dumpling Den'): PinnableMemory => ({
  id, name: id, lastHangoutAt: startsAt,
  place: coords ? { coordinates: coords, venueName, emoji: '🥟', startsAt } : null,
});

describe('groupMemoryPins', () => {
  it('puts memories at the same venue on one pin, most recent first', () => {
    const { pins, unplaced } = groupMemoryPins([
      row('old', [-122.15, 37.48], '2026-11-01T20:00:00Z'),
      row('new', [-122.15005, 37.48003], '2026-11-08T20:00:00Z'),
      row('park', [-122.17, 37.49], '2026-11-05T20:00:00Z', 'Bayfront Park'),
    ]);
    expect(unplaced).toEqual([]);
    expect(pins).toHaveLength(2);
    expect(pins[0].id).toBe('new');
    expect(pins[0].memories.map((m) => m.id)).toEqual(['new', 'old']);
    expect(pins[1].venueName).toBe('Bayfront Park');
  });

  it('keeps memories without a location off the map', () => {
    const { pins, unplaced } = groupMemoryPins([row('lost', null, '2026-11-08T20:00:00Z')]);
    expect(pins).toEqual([]);
    expect(unplaced.map((m) => m.id)).toEqual(['lost']);
  });
});

describe('pinBounds', () => {
  it('spans every pin, or null with none', () => {
    expect(pinBounds([])).toBeNull();
    expect(pinBounds([{ coordinates: [-122.15, 37.48] }, { coordinates: [-122.17, 37.49] }])).toEqual([[-122.17, 37.48], [-122.15, 37.49]]);
  });
});

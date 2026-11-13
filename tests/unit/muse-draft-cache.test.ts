// The ✨ Draft cache key covers the places Muse chose from, and a pitch that no longer matches
// the checked place is replaced by the code pitch (docs/MUSE_PREBAKE.md, finding R2).
import { describe, expect, it } from 'vitest';
import { DEMO_CENTER } from '@/shared';
import { draftCacheKey, nearbyPlaces, validateDraft, type CreateQuestContext, type RawDraft } from '@/features/muse';

const PLACES = [
  { id: 'p-cafe', name: 'Hacker Way Cafe', category: 'coffee', typicalCostUsd: 6, location: { lat: DEMO_CENTER.lat + 0.0008, lng: DEMO_CENTER.lng } },
  { id: 'p-boba', name: 'Bayfront Boba', category: 'boba', typicalCostUsd: 7, location: { lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng + 0.001 } },
  { id: 'p-far', name: 'Willow Comics Cafe', category: 'coffee', typicalCostUsd: 6, location: { lat: DEMO_CENTER.lat - 0.0054, lng: DEMO_CENTER.lng } },
];
const TEXT = 'comics open house at the cafe in 30 min, me + 3';
const ctxAt = (pin: { lat: number; lng: number }): CreateQuestContext => ({
  text: TEXT, now: new Date('2026-11-13T10:00:00-08:00'), pin, hostFirstName: 'Alex', hostInterests: ['comics'],
  places: nearbyPlaces(PLACES, pin),
});
const raw = (over: Partial<RawDraft> = {}): RawDraft => ({
  title: 'Comics open house', emoji: '📚', category: 'other', description: 'Comics and coffee.', placeId: 'p-cafe',
  startClock: null, startsInMinutes: 30, durationMinutes: 60, capacity: 4, priceMax: null, tags: ['comics'], bubbleText: null,
  pitch: 'I picked Hacker Way Cafe, 2 min from your pin.', ...over,
});

describe('draft cache key', () => {
  it('a pin about 600 m away, with other places nearby, gets a different key', () => {
    const here = ctxAt(DEMO_CENTER);
    const away = ctxAt({ lat: DEMO_CENTER.lat - 0.0054, lng: DEMO_CENTER.lng });
    expect(here.places.map((p) => p.placeId)).not.toEqual(away.places.map((p) => p.placeId));
    expect(draftCacheKey(here)).not.toEqual(draftCacheKey(away));
  });

  it('the same sentence at the same pin keeps its key (case and spaces ignored)', () => {
    expect(draftCacheKey({ ...ctxAt(DEMO_CENTER), text: `  ${TEXT.toUpperCase()} ` })).toEqual(draftCacheKey(ctxAt(DEMO_CENTER)));
  });
});

describe('draft pitch check', () => {
  it('a place id that is not near this pin keeps the pin and drops the stale pitch', () => {
    const away = ctxAt({ lat: DEMO_CENTER.lat - 0.0054, lng: DEMO_CENTER.lng });
    const out = validateDraft(raw(), away);
    expect(out.draft.venueName).toBe('Dropped pin');
    expect(out.pitch).toBe('I kept your pin as the spot.');
  });

  it('a pitch whose walk minutes do not match the checked place gets the code pitch', () => {
    const here = ctxAt(DEMO_CENTER);
    const cafe = here.places.find((p) => p.placeId === 'p-cafe')!;
    const out = validateDraft(raw({ pitch: `I picked Hacker Way Cafe, ${cafe.walkMin + 7} min from your pin.` }), here);
    expect(out.pitch).toBe(`I picked Hacker Way Cafe, ${cafe.walkMin} min from your pin.`);
  });

  it('a pitch naming a different nearby place gets the code pitch', () => {
    const here = ctxAt(DEMO_CENTER);
    const out = validateDraft(raw({ pitch: 'Bayfront Boba is right there, perfect for comics.' }), here);
    expect(out.pitch).toMatch(/^I picked Hacker Way Cafe, \d+ min from your pin\.$/);
  });

  it('a pitch that matches the checked place is kept', () => {
    const here = ctxAt(DEMO_CENTER);
    const cafe = here.places.find((p) => p.placeId === 'p-cafe')!;
    const pitch = `Hacker Way Cafe is ${cafe.walkMin} min from your pin and starts in 30 min.`;
    expect(validateDraft(raw({ pitch }), here).pitch).toBe(pitch);
  });
});

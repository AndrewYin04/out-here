// Muse one-line plan draft: code owns places, times and numbers, whatever the model says.
import { describe, expect, it } from 'vitest';
import { DEMO_CENTER } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { mockDraft, nearbyPlaces, validateDraft, type CreateQuestContext, type RawDraft } from '@/features/muse';
import { wallClock } from '@/features/muse/time';

// 2026-11-12 10:07 AM PT
const NOW = new Date('2026-11-12T18:07:00Z');

async function ctxFor(text: string, pin = DEMO_CENTER): Promise<CreateQuestContext> {
  const store = createMemoryStore(NOW);
  const { db } = await store.museContext();
  return { text, now: NOW, pin, hostFirstName: 'Alex', hostInterests: ['boba', 'dumplings'], places: nearbyPlaces(db.places, pin) };
}

const raw = (over: Partial<RawDraft> = {}): RawDraft => ({
  title: 'Boba after class', emoji: '🧋', category: 'food', description: 'Grab boba.', placeId: null,
  startClock: null, startsInMinutes: null, durationMinutes: null, capacity: null, priceMax: null, tags: [],
  bubbleText: null, pitch: '', ...over,
});

describe('nearbyPlaces', () => {
  it('lists real places within 400 m of the pin, nearest first', async () => {
    const ctx = await ctxFor('x');
    expect(ctx.places.length).toBeGreaterThan(0);
    expect(ctx.places[0].name).toBe('Bobalicious Corner');
    for (let i = 1; i < ctx.places.length; i++) expect(ctx.places[i].walkMin).toBeGreaterThanOrEqual(ctx.places[i - 1].walkMin);
  });
});

describe('mockDraft + validateDraft', () => {
  it('"boba after class at 4" -> boba emoji, food, 4:00 PM today, the nearby boba place', async () => {
    const ctx = await ctxFor('boba after class at 4');
    const { draft, pitch } = validateDraft(mockDraft(ctx), ctx);
    expect(draft.emoji).toBe('🧋');
    expect(draft.category).toBe('food');
    const w = wallClock(new Date(draft.startsAt));
    expect([w.hour, w.minute, w.day]).toEqual([16, 0, 12]);
    expect(draft.venueName).toBe('Bobalicious Corner');
    expect(draft.placeId).toBe(ctx.places[0].placeId);
    expect(draft.location).toEqual(ctx.places[0].location);
    expect(draft.capacity).toBe(6);
    expect(Date.parse(draft.endsAt) - Date.parse(draft.startsAt)).toBe(60 * 60_000);
    expect(pitch).toContain('Bobalicious Corner');
    expect(draft.title.toLowerCase()).not.toContain('at 4');
  });

  it('"pickup soccer in 20 min, 8 people" -> sports, 20 min out, 8 spots', async () => {
    const ctx = await ctxFor('pickup soccer in 20 min, 8 people');
    const { draft } = validateDraft(mockDraft(ctx), ctx);
    expect(draft.category).toBe('sports');
    expect(draft.capacity).toBe(8);
    expect(Date.parse(draft.startsAt) - NOW.getTime()).toBeGreaterThanOrEqual(20 * 60_000);
    expect(Date.parse(draft.startsAt) - NOW.getTime()).toBeLessThan(25 * 60_000);
  });
});

describe('validateDraft never trusts the model', () => {
  it('drops an invented place id and keeps the pin', async () => {
    const ctx = await ctxFor('boba');
    const { draft } = validateDraft(raw({ placeId: 'made-up' }), ctx);
    expect(draft.placeId).toBeNull();
    expect(draft.venueName).toBe('Dropped pin');
    expect(draft.location).toEqual(ctx.pin);
  });

  it('clamps spots, duration and price, and fixes an unknown category', async () => {
    const ctx = await ctxFor('x');
    const { draft } = validateDraft(raw({ capacity: 500, durationMinutes: 2000, priceMax: -4, category: 'party' }), ctx);
    expect(draft.capacity).toBe(50);
    expect(Date.parse(draft.endsAt) - Date.parse(draft.startsAt)).toBe(360 * 60_000);
    expect(draft.priceMax).toBe(0);
    expect(draft.category).toBe('other');
  });

  it('a start more than a day out falls back to 30 min from now', async () => {
    const ctx = await ctxFor('x');
    const { draft } = validateDraft(raw({ startsInMinutes: 5000 }), ctx);
    const delta = Date.parse(draft.startsAt) - NOW.getTime();
    expect(delta).toBeGreaterThanOrEqual(30 * 60_000);
    expect(delta).toBeLessThan(36 * 60_000);
  });

  it('strips prompt field names from user-facing text', async () => {
    const ctx = await ctxFor('x');
    const { draft, pitch } = validateDraft(raw({ pitch: 'I set priceMax to 0 and placeId to null.', bubbleText: 'Come thru bubbleText' }), ctx);
    expect(pitch).not.toMatch(/priceMax|placeId/);
    expect(draft.bubbleText).toBe('Come thru');
  });
});

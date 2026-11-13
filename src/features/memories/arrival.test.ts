import { beforeAll, describe, expect, it, vi } from 'vitest';
import { arrivalWait, emitMemorySaved, MEMORY_SAVED, RATE_HANGOUT, requestRating } from './arrival';

describe('arrivalWait', () => {
  const now = Date.parse('2026-11-13T18:00:00Z');
  it('is not early once the plan has started', () => {
    expect(arrivalWait('2026-11-13T17:59:00Z', now)).toEqual({ early: false, minutes: 0 });
    expect(arrivalWait('2026-11-13T18:00:00Z', now)).toEqual({ early: false, minutes: 0 });
  });
  it('counts whole minutes up to the start', () => {
    expect(arrivalWait('2026-11-13T18:00:20Z', now)).toEqual({ early: true, minutes: 1 });
    expect(arrivalWait('2026-11-13T18:14:01Z', now)).toEqual({ early: true, minutes: 15 });
  });
  it('treats a bad date as started', () => {
    expect(arrivalWait('nope', now).early).toBe(false);
  });
});

describe('arrival events', () => {
  beforeAll(() => { vi.stubGlobal('window', new EventTarget()); });
  it('emits the saved memory', () => {
    const seen = vi.fn();
    window.addEventListener(MEMORY_SAVED, (e) => seen((e as CustomEvent).detail));
    emitMemorySaved({ questId: 'q', crewId: 'c', memoryId: 'm' });
    expect(seen).toHaveBeenCalledWith({ questId: 'q', crewId: 'c', memoryId: 'm' });
  });
  it('reports whether the rating handled the request', () => {
    expect(requestRating({ questId: 'q', crewId: 'c', photoIds: ['m'] })).toBe(false);
    const handler = (e: Event) => e.preventDefault();
    window.addEventListener(RATE_HANGOUT, handler);
    expect(requestRating({ questId: 'q', crewId: 'c', photoIds: ['m'] })).toBe(true);
    window.removeEventListener(RATE_HANGOUT, handler);
  });
});

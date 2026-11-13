import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateInZone, profileId, setNow, SUBMIT_GRACE_MS, zonedTimeToUtc } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { HttpError } from '@/features/data/errors';

// Daily Side Quests against the in-process store: schedule persistence, server-side deadlines,
// duplicates, privacy, the board, Memories and the weekly streak.
const alex = profileId('alex');
const maya = profileId('maya');
const jordan = profileId('jordan');
const NOW = new Date('2026-11-12T18:07:00Z'); // 10:07 AM in Los Angeles
const DATE = '2026-11-12';
const photo = () => ({ bytes: new Uint8Array(300).fill(7), contentType: 'image/jpeg', name: 'shot.jpg' });

let store: CoreStore;
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); vi.unstubAllEnvs(); });
afterAll(() => { setNow(null); vi.unstubAllEnvs(); });

/** Move "now" to a moment inside a person's open window (one minute after their drop). */
async function openWindow(userId: string) {
  const s = await store.sideQuestState(userId);
  setNow(new Date(new Date(s.dropAt).getTime() + 60_000));
  return s;
}
const status = (p: Promise<unknown>) => p.then(() => 200, (e: unknown) => (e instanceof HttpError ? e.status : 500));

describe('schedule persistence', () => {
  it('rolls once and returns the same drop and deadline on every read', async () => {
    const a = await store.sideQuestState(alex);
    for (let i = 0; i < 5; i++) {
      const again = await store.sideQuestState(alex);
      expect(again.dropAt).toBe(a.dropAt);
      expect(again.deadlineAt).toBe(a.deadlineAt);
      expect(again.durationMinutes).toBe(a.durationMinutes);
    }
    // Reading later in the day, or from "another device", is the same row.
    setNow(new Date('2026-11-13T02:00:00Z'));
    expect((await store.sideQuestState(alex)).dropAt).toBe(a.dropAt);
  });

  it('puts the drop and the whole quest inside the default 10 AM to 8 PM window', async () => {
    const s = await store.sideQuestState(alex);
    expect(dateInZone(new Date(s.dropAt), 'America/Los_Angeles')).toBe(DATE);
    expect(new Date(s.dropAt).getTime()).toBeGreaterThanOrEqual(zonedTimeToUtc(DATE, 600, 'America/Los_Angeles').getTime());
    expect(new Date(s.deadlineAt).getTime()).toBeLessThanOrEqual(zonedTimeToUtc(DATE, 1200, 'America/Los_Angeles').getTime());
    expect(new Date(s.deadlineAt).getTime() - new Date(s.dropAt).getTime()).toBe(s.durationMinutes * 60_000);
  });

  it('serves everyone the same challenge, with their own times', async () => {
    const [a, m] = await Promise.all([store.sideQuestState(alex), store.sideQuestState(maya)]);
    expect(a.challenge.id).toBe(m.challenge.id);
    expect(a.date).toBe(m.date);
  });

  it('a custom active window applies to days without a drop and never rerolls today', async () => {
    const before = await store.sideQuestState(alex);
    await store.setSideQuestPrefs(alex, { startMin: 13 * 60, endMin: 16 * 60, tz: 'America/Los_Angeles' });
    expect((await store.sideQuestState(alex)).dropAt).toBe(before.dropAt);
    await expect(store.setSideQuestPrefs(alex, { startMin: 600, endMin: 660, tz: 'America/Los_Angeles' })).rejects.toMatchObject({ status: 400 });
    // Maya sets a narrow window first: her new drop lands inside it.
    await store.setSideQuestPrefs(maya, { startMin: 13 * 60, endMin: 16 * 60, tz: 'America/Los_Angeles' });
    const m = await store.sideQuestState(maya);
    expect(new Date(m.dropAt).getTime()).toBeGreaterThanOrEqual(zonedTimeToUtc(DATE, 13 * 60, 'America/Los_Angeles').getTime());
    expect(new Date(m.deadlineAt).getTime()).toBeLessThanOrEqual(zonedTimeToUtc(DATE, 16 * 60, 'America/Los_Angeles').getTime());
  });
});

describe('server-side completion', () => {
  it('is not open before the drop', async () => {
    const s = await store.sideQuestState(alex);
    setNow(new Date(new Date(s.dropAt).getTime() - 60_000));
    expect(await status(store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: '', crewId: null }))).toBe(409);
    expect((await store.sideQuestState(alex)).phase).toBe('waiting');
  });

  it('accepts an on-time photo and persists it across reads', async () => {
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: ' Blue door ', crewId: null });
    expect(r.entry).toMatchObject({ date: DATE, audience: 'only_me', caption: 'Blue door', onTime: true, postId: null });
    expect(r.state.phase).toBe('completed');
    const again = await store.sideQuestState(alex);
    expect(again.phase).toBe('completed');
    expect(again.entry?.photoUrl).toBe(r.entry.photoUrl);
  });

  it('rejects a second submission, including two taps at once', async () => {
    await openWindow(alex);
    const results = await Promise.all([
      status(store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: '', crewId: null })),
      status(store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: '', crewId: null })),
      status(store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null })),
    ]);
    expect(results.filter((r) => r === 200)).toHaveLength(1);
    expect(results.filter((r) => r === 409)).toHaveLength(2);
    expect((await store.sideQuestHistory(alex)).completedCount).toBe(1);
  });

  it('rejects an expired submission on the server, whatever the browser thinks', async () => {
    const s = await openWindow(alex);
    setNow(new Date(new Date(s.deadlineAt).getTime() + SUBMIT_GRACE_MS + 1000));
    expect(await status(store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null }))).toBe(410);
    const after = await store.sideQuestState(alex);
    expect(after.phase).toBe('expired');
    expect(after.entry).toBeNull();
    expect(after.boardCount).toBe(0);
  });

  it('accepts a photo that was in flight when the deadline passed (a few seconds), not a late one', async () => {
    const s = await openWindow(alex);
    setNow(new Date(new Date(s.deadlineAt).getTime() + SUBMIT_GRACE_MS - 1000));
    expect(await status(store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: '', crewId: null }))).toBe(200);
  });

  it('cannot be extended by sending a different clock: the persisted deadline is the only one', async () => {
    const s = await openWindow(alex);
    setNow(new Date(new Date(s.deadlineAt).getTime() + 60 * 60_000));
    const late = await store.sideQuestState(alex);
    expect(late.deadlineAt).toBe(s.deadlineAt);
    expect(late.phase).toBe('expired');
  });

  it('rejects non-photos and oversized/empty payloads', async () => {
    await openWindow(alex);
    const bad = (contentType: string, n = 300) => ({ bytes: new Uint8Array(n), contentType, name: 'x' });
    expect(await status(store.sideQuestSubmit(alex, { file: bad('image/svg+xml'), audience: 'only_me', caption: '', crewId: null }))).toBe(400);
    expect(await status(store.sideQuestSubmit(alex, { file: bad('application/pdf'), audience: 'only_me', caption: '', crewId: null }))).toBe(400);
    expect(await status(store.sideQuestSubmit(alex, { file: bad('image/jpeg', 10), audience: 'only_me', caption: '', crewId: null }))).toBe(400);
  });

  it('records nothing when the upload fails, and a retry works', async () => {
    await openWindow(alex);
    vi.spyOn(store.backend, 'uploadFile').mockRejectedValueOnce(new HttpError(502, 'upload failed: storage down'));
    expect(await status(store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null }))).toBe(502);
    const mid = await store.sideQuestState(alex);
    expect(mid.entry).toBeNull();
    expect(mid.boardCount).toBe(0);
    expect(await status(store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null }))).toBe(200);
  });
});

describe('privacy', () => {
  it('keeps only-me photos off the board and away from other people', async () => {
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: 'private', crewId: null });
    expect(r.state.boardCount).toBe(0);
    const board = await store.sideQuestBoard(maya, DATE);
    expect(board.count).toBe(0);
    expect(JSON.stringify(board)).not.toContain(alex);
    // The owner can read the photo; anyone else gets a plain 404 (no hint it exists).
    await expect(store.sideQuestPhoto(alex, DATE, alex)).resolves.toBeInstanceOf(Blob);
    expect(await status(store.sideQuestPhoto(maya, DATE, alex))).toBe(404);
    expect(await status(store.sideQuestPhoto(jordan, DATE, alex))).toBe(404);
  });

  it('shares only on request and lets the person take it back', async () => {
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: 'public one', crewId: null });
    expect(r.entry.postId).toBeTruthy();
    await openWindow(maya);
    const m = await store.sideQuestSubmit(maya, { file: photo(), audience: 'only_me', caption: '', crewId: null });
    expect(m.state.boardCount).toBe(1);
    expect((await store.sideQuestBoard(maya, DATE)).entries.map((e) => e.userId)).toEqual([alex]);
    await expect(store.sideQuestPhoto(maya, DATE, alex)).resolves.toBeInstanceOf(Blob);

    const unshared = await store.sideQuestUnshare(alex, DATE);
    expect(unshared.boardCount).toBe(0);
    expect(unshared.entry).toMatchObject({ audience: 'only_me', postId: null });
    expect((await store.sideQuestBoard(maya, DATE)).count).toBe(0);
    expect(await status(store.sideQuestPhoto(maya, DATE, alex))).toBe(404);
    await expect(store.sideQuestPhoto(alex, DATE, alex)).resolves.toBeInstanceOf(Blob); // still the owner's memory
  });

  it('shows first names only for people who are not your friends', async () => {
    await openWindow(alex);
    await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    let strangers = 0;
    for (const id of [maya, jordan, profileId('priya'), profileId('sam'), profileId('leo')]) {
      await openWindow(id);
      await store.sideQuestSubmit(id, { file: photo(), audience: 'only_me', caption: '', crewId: null }).catch(() => undefined);
      const e = (await store.sideQuestBoard(id, DATE)).entries.find((x) => x.userId === alex);
      expect(e, 'every viewer who entered sees the entry').toBeTruthy();
      if (!e!.author.isFriend) { strangers++; expect(e!.author.name).not.toContain(' '); }
    }
    expect(strangers).toBeGreaterThan(0);
  });

  it('only a crew member can add the photo to a crew album', async () => {
    await openWindow(jordan);
    const [crew] = await store.crews(alex);
    expect(crew).toBeTruthy();
    expect(await status(store.sideQuestSubmit(jordan, { file: photo(), audience: 'only_me', caption: '', crewId: crew.id }))).toBe(403);
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: '', crewId: crew.id });
    expect(r.entry.crewMemoryId).toBeTruthy();
    expect((await store.memories(alex, crew.id)).some((m) => m.id === r.entry.crewMemoryId)).toBe(true);
  });

  it('keeps board posts out of the home feed and profile photos', async () => {
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    for (const viewer of [alex, maya]) {
      expect((await store.feed(viewer)).posts.map((p) => p.id)).not.toContain(r.entry.postId);
    }
    expect(await store.profilePhotos(maya, 'alex')).not.toContain(r.entry.photoUrl);
  });
});

describe('the board', () => {
  it('shows only the count until you have entered or your quest ended', async () => {
    await openWindow(alex);
    await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    await openWindow(maya);
    const before = await store.sideQuestBoard(maya, DATE);
    expect(before).toMatchObject({ count: 1, entriesVisible: false, entries: [] });
    await store.sideQuestSubmit(maya, { file: photo(), audience: 'community', caption: '', crewId: null });
    const after = await store.sideQuestBoard(maya, DATE);
    expect(after.entriesVisible).toBe(true);
    expect(after.entries.map((e) => e.userId).sort()).toEqual([alex, maya].sort());
  });

  it('opens up for someone who missed their window', async () => {
    await openWindow(alex);
    await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    const j = await openWindow(jordan);
    expect((await store.sideQuestBoard(jordan, DATE)).entriesVisible).toBe(false);
    setNow(new Date(new Date(j.deadlineAt).getTime() + 1000));
    const ended = await store.sideQuestBoard(jordan, DATE);
    expect(ended.entriesVisible).toBe(true);
    expect(ended.entries.map((e) => e.userId)).toEqual([alex]);
  });

  it('lets two personas see each other\'s shared entries', async () => {
    await openWindow(alex);
    await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: 'from alex', crewId: null });
    await openWindow(maya);
    await store.sideQuestSubmit(maya, { file: photo(), audience: 'community', caption: 'from maya', crewId: null });
    const asAlex = await store.sideQuestBoard(alex, DATE);
    const asMaya = await store.sideQuestBoard(maya, DATE);
    expect(asAlex.entries.map((e) => e.caption).sort()).toEqual(['from alex', 'from maya']);
    expect(asMaya.entries.map((e) => e.caption).sort()).toEqual(['from alex', 'from maya']);
    expect(asAlex.entries.find((e) => e.userId === alex)!.mine).toBe(true);
    expect(asAlex.challenge.id).toBe(asMaya.challenge.id);
  });

  it('records reports and refuses to report your own or a missing photo', async () => {
    await openWindow(alex);
    await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    await expect(store.sideQuestReport(maya, { date: DATE, userId: alex })).resolves.toEqual({ ok: true });
    expect((await store.view()).db.dailyReports).toHaveLength(1);
    expect(await status(store.sideQuestReport(alex, { date: DATE, userId: alex }))).toBe(400);
    expect(await status(store.sideQuestReport(maya, { date: DATE, userId: jordan }))).toBe(404);
  });

  it('shows reactions from the existing reaction system', async () => {
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    await openWindow(maya);
    await store.sideQuestSubmit(maya, { file: photo(), audience: 'only_me', caption: '', crewId: null });
    await store.react(maya, r.entry.postId!, 'love');
    const e = (await store.sideQuestBoard(maya, DATE)).entries.find((x) => x.userId === alex)!;
    expect(e.reactionCounts.love).toBe(1);
    expect(e.viewerReaction).toBe('love');
  });
});

describe('progress, Memories and the weekly streak', () => {
  it('saves every completed quest as a personal memory and counts it', async () => {
    expect((await store.sideQuestHistory(alex)).completedCount).toBe(0);
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'only_me', caption: 'kept', crewId: null });
    const h = await store.sideQuestHistory(alex);
    expect(h.completedCount).toBe(1);
    expect(h.memories[0]).toMatchObject({ date: DATE, caption: 'kept', photoUrl: r.entry.photoUrl, onTime: true });
    expect(h.week).toHaveLength(7);
    expect(h.week[6]).toMatchObject({ date: DATE, status: 'completed' });
    expect(h.week.slice(0, 6).every((d) => d.status === 'none')).toBe(true); // nothing invented for older days
  });

  it('marks a quest that ended without a photo as missed, without shame in the data', async () => {
    const s = await store.sideQuestState(alex);
    setNow(new Date('2026-11-13T20:00:00Z')); // next day, 12 PM
    const h = await store.sideQuestHistory(alex);
    expect(h.week.find((d) => d.date === DATE)?.status).toBe('missed');
    expect(s.phase).not.toBe('completed');
  });

  it('leaves the weekly in-person streak exactly as it was', async () => {
    const before = await store.streak(alex);
    await openWindow(alex);
    const r = await store.sideQuestSubmit(alex, { file: photo(), audience: 'community', caption: '', crewId: null });
    expect(await store.streak(alex)).toEqual(before);
    expect(r.state.weeklyStreak).toEqual(before);
  });
});

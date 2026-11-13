// Daily Side Quests, server side (docs/DAILY_SIDE_QUESTS.md). CoreStore exposes these as methods.
//
// The rules, all enforced here and never trusted from the browser:
// - One shared challenge per date (challengeFor). Each person's drop time and deadline are rolled
//   ONCE on the server, inside their active window, and persisted: a refresh, another device or a
//   changed device clock never rerolls or extends them.
// - A photo counts only if the server accepts it before the deadline (plus a few seconds of
//   in-flight tolerance). One entry per person per date: a second tap or request gets a 409.
// - Photos live in the private crew-photos bucket and are served only to their owner, or to
//   anyone while the owner shares them with the community. Default: only me.
// - The community board holds explicitly shared entries only. Sharing makes a public post of the
//   new 'sidequest' target (so the existing reactions work) that never reaches the home feed.
// - Demo controls exist only where the server enables them (see demoControlsEnabled).
import {
  canSubmitOnTime, challengeById, challengeFor, dateInZone, DEFAULT_WINDOW, now, phaseOf, pickSchedule,
  shiftDate, sideQuestBoardId, SIDE_QUEST_AUDIENCES, validWindow,
  type ActiveWindow, type Rand, type SideQuestAudience,
} from '@/shared';
import type {
  SideQuestBoardEntry, SideQuestBoardResponse, SideQuestDemoBody, SideQuestEntry, SideQuestHistoryItem,
  SideQuestHistoryResponse, SideQuestPrefs, SideQuestState, SideQuestSubmitResponse,
} from '@/shared/api';
import type { Memory, Post, Profile } from '@/shared';
import type { CoreStore } from './core';
import type { DailyEntryRow, SideQuestDropRow } from './db';
import { badRequest, conflict, forbidden, HttpError, notFound } from './errors';
import { publish } from './realtime-server';
import type { View } from './view';

const iso = () => now().toISOString();
const uuid = () => crypto.randomUUID();
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_CAPTION = 140;
/** Seeded demo photos (public/seed, fictional people and places). */
const DEMO_PHOTOS = ['/seed/posts/p005.webp', '/seed/posts/p006.webp', '/seed/posts/p025.webp', '/seed/posts/p026.webp', '/seed/posts/p036.webp'];
const DEMO_CAPTIONS = [
  'A drainpipe that looks like a violin.', 'Three blue bikes, one blue door.', 'The loading dock at golden hour.',
  'My shadow made a friend.', 'This crack looks like a river map.',
];
/** Demo personas that fill the board (Alex and Maya are the live demo drivers). */
const DEMO_BOARD_HANDLES = ['priya', 'sam', 'leo', 'nina', 'kai'];

/** Random integer in [0, max). The only randomness in the feature, used once per person per day. */
const rand: Rand = (max) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
};

// ---------------------------------------------------------------- demo guard
/**
 * Demo controls (trigger, deadline, reset, seed) are allowed only where the server says so:
 * OUTHERE_DEMO_CONTROLS=1 enables them anywhere (the demo deployment sets it), =0 disables them
 * everywhere, and unset means "development only" (never in production). The client only hides
 * buttons; every action is checked again here.
 */
export function demoControlsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.OUTHERE_DEMO_CONTROLS === '1') return true;
  if (env.OUTHERE_DEMO_CONTROLS === '0') return false;
  return env.NODE_ENV !== 'production';
}

function assertDemo(viewer: Profile | undefined): void {
  if (!demoControlsEnabled()) throw forbidden('demo controls are not enabled here');
  if (!viewer?.isDemoUser) throw forbidden('demo controls are for demo personas only');
}

// ---------------------------------------------------------------- locks
// Serialises work per (person, date) inside one server instance, so a double tap cannot create
// two entries or two schedules. Across instances the primary keys are the guard (409 below).
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(key, run);
  try { return await run; } finally { if (locks.get(key) === run) locks.delete(key); }
}

// ---------------------------------------------------------------- small helpers
const isSideQuestEntry = (e: DailyEntryRow): boolean => !!e.challengeId;

function windowOf(v: View, userId: string): ActiveWindow {
  const p = v.db.sideQuestPrefs.find((x) => x.userId === userId);
  return p ? { startMin: p.windowStartMin, endMin: p.windowEndMin, tz: p.tz } : DEFAULT_WINDOW;
}

function prefsOf(w: ActiveWindow): SideQuestPrefs { return { startMin: w.startMin, endMin: w.endMin, tz: w.tz }; }

function photoUrlOf(e: DailyEntryRow): string {
  return e.photoKey ? `/api/daily/photo?date=${e.date}&userId=${e.userId}` : e.photoUrl;
}

function entryView(e: DailyEntryRow): SideQuestEntry {
  return {
    date: e.date, challengeId: e.challengeId ?? '', photoUrl: photoUrlOf(e), caption: e.caption ?? '',
    audience: e.audience ?? 'only_me', onTime: e.onTime ?? true, submittedAt: e.submittedAt ?? e.createdAt,
    postId: e.postId ?? null, crewMemoryId: e.crewMemoryId ?? null,
  };
}

function communityEntries(v: View, date: string): DailyEntryRow[] {
  const boardId = sideQuestBoardId(date);
  return v.db.dailyEntries.filter((e) => e.date === date && isSideQuestEntry(e) && e.audience === 'community' && e.postId
    && v.db.posts.some((p) => p.id === e.postId && p.targetType === 'sidequest' && p.targetId === boardId));
}

/** Today's persisted drop for a person; rolls and saves one the first time it is asked for. */
async function ensureDrop(store: CoreStore, userId: string, date: string, window: ActiveWindow): Promise<SideQuestDropRow> {
  return withLock(`drop:${userId}:${date}`, async () => {
    let v = await store.view();
    const existing = v.db.sideQuestDrops.find((d) => d.date === date && d.userId === userId);
    if (existing) return existing;
    const challenge = challengeFor(date);
    const s = pickSchedule(date, challenge, window, rand);
    const row: SideQuestDropRow = {
      date, userId, challengeId: challenge.id, dropAt: s.dropAt.toISOString(), deadlineAt: s.deadlineAt.toISOString(),
      durationMinutes: s.durationMinutes, windowStartMin: window.startMin, windowEndMin: window.endMin, tz: window.tz,
      demo: false, createdAt: iso(),
    };
    try {
      await store.backend.insert('sideQuestDrops', [row]);
    } catch (e) {
      // Another instance won the race: use its row, never ours.
      v = await store.view();
      const winner = v.db.sideQuestDrops.find((d) => d.date === date && d.userId === userId);
      if (winner) return winner;
      throw e;
    }
    return row;
  });
}

/** daily_entries.date references daily_quests(date): make sure the day's row exists (and matches). */
async function ensureDailyQuest(store: CoreStore, date: string): Promise<void> {
  const c = challengeFor(date);
  await store.backend.upsert('dailyQuests', [{ date, prompt: `${c.title}: ${c.description}`, emoji: c.emoji }]);
}

// ---------------------------------------------------------------- state
export async function sideQuestState(store: CoreStore, viewerId: string): Promise<SideQuestState> {
  const v0 = await store.view();
  const window = windowOf(v0, viewerId);
  const date = dateInZone(now(), window.tz);
  const drop = await ensureDrop(store, viewerId, date, window);
  return buildState(store, viewerId, date, drop);
}

async function buildState(store: CoreStore, viewerId: string, date: string, drop: SideQuestDropRow): Promise<SideQuestState> {
  const v = await store.view();
  const entry = v.db.dailyEntries.find((e) => e.date === date && e.userId === viewerId && isSideQuestEntry(e)) ?? null;
  const challenge = challengeById(drop.challengeId) ?? challengeFor(date);
  const [crews, weeklyStreak] = await Promise.all([store.crews(viewerId), store.streak(viewerId)]);
  return {
    date, challenge,
    phase: phaseOf(now(), drop, !!entry),
    serverNow: iso(), dropAt: drop.dropAt, deadlineAt: drop.deadlineAt, durationMinutes: drop.durationMinutes,
    prefs: { startMin: windowOf(v, viewerId).startMin, endMin: windowOf(v, viewerId).endMin, tz: windowOf(v, viewerId).tz },
    entry: entry ? entryView(entry) : null,
    boardCount: communityEntries(v, date).length,
    crews: crews.map((c) => ({ id: c.id, name: c.name })),
    weeklyStreak,
    demo: demoControlsEnabled() && !!v.profileById.get(viewerId)?.isDemoUser,
  };
}

// ---------------------------------------------------------------- submit
export type SubmitInput = {
  file: { bytes: Uint8Array; contentType: string; name: string };
  audience: SideQuestAudience;
  caption: string;
  /** Also add the photo to this crew's album (a separate, explicit choice). */
  crewId: string | null;
};

export async function sideQuestSubmit(store: CoreStore, viewerId: string, input: SubmitInput): Promise<SideQuestSubmitResponse> {
  if (!SIDE_QUEST_AUDIENCES.includes(input.audience)) throw badRequest('audience must be only_me or community');
  const caption = input.caption.trim().slice(0, MAX_CAPTION);
  if (!ALLOWED_TYPES.has(input.file.contentType)) throw badRequest('Use a JPEG, PNG or WebP photo.');
  if (input.file.bytes.byteLength < 100) throw badRequest('That photo looks empty. Try again.');

  const v0 = await store.view();
  const window = windowOf(v0, viewerId);
  const date = dateInZone(now(), window.tz);

  return withLock(`submit:${viewerId}:${date}`, async () => {
    const drop = await ensureDrop(store, viewerId, date, window);
    const v = await store.view();
    const existing = v.db.dailyEntries.find((e) => e.date === date && e.userId === viewerId);
    if (existing && isSideQuestEntry(existing)) throw conflict('already_completed');

    // The server decides: before the drop it is not open yet; after the deadline it has ended.
    const at = now();
    if (at.getTime() < new Date(drop.dropAt).getTime()) throw conflict('not_dropped_yet');
    if (!canSubmitOnTime(at, drop)) throw new HttpError(410, 'quest_ended');

    let crewMemoryId: string | null = null;
    let photoKey = `daily/${date}/${viewerId}-${uuid()}`;
    let memory: Memory | null = null;
    if (input.crewId) {
      const crew = v.db.crews.find((c) => c.id === input.crewId);
      if (!crew || !v.crewMemberIds(crew.id).includes(viewerId)) throw forbidden('crew members only');
      // One stored copy: the crew memory and the entry share the same private object.
      crewMemoryId = uuid();
      photoKey = crewMemoryId;
      const c = challengeFor(date);
      memory = {
        id: crewMemoryId, crewId: crew.id, questId: crew.originQuestId, uploaderId: viewerId,
        photoUrl: `/api/memories/${crewMemoryId}/photo`, caption: `${c.emoji} ${c.title}${caption ? `: ${caption}` : ''}`, createdAt: iso(),
      };
    }

    // Upload first: if storage fails nothing is recorded and the person can simply try again.
    await store.backend.uploadFile('crew-photos', photoKey, input.file.bytes, input.file.contentType);
    await ensureDailyQuest(store, date);

    const submittedAt = iso();
    const row: DailyEntryRow = {
      date, userId: viewerId, photoUrl: '', verified: null, museNote: '', createdAt: submittedAt,
      challengeId: drop.challengeId, audience: input.audience, caption, onTime: true,
      photoKey, postId: null, crewMemoryId, submittedAt,
    };
    row.photoUrl = photoUrlOf(row);

    if (memory) await store.backend.insert('memories', [memory]);
    let post: Post | null = null;
    if (input.audience === 'community') {
      post = {
        id: uuid(), authorId: viewerId, targetType: 'sidequest', targetId: sideQuestBoardId(date), audience: 'public',
        text: caption, media: [row.photoUrl], sharedPostId: null, createdAt: submittedAt,
      };
      await store.backend.insert('posts', [post]);
      row.postId = post.id;
    }
    try {
      if (existing) await store.backend.upsert('dailyEntries', [row]); // replaces a pre-Side-Quest placeholder row
      else await store.backend.insert('dailyEntries', [row]);
    } catch (e) {
      // Lost a cross-instance race (primary key) or the write failed: undo what we added.
      if (post) await store.backend.remove('posts', { id: post.id });
      if (memory) await store.backend.remove('memories', { id: memory.id });
      throw e instanceof HttpError ? e : conflict('already_completed');
    }

    if (memory) {
      for (const m of v.crewMemberIds(memory.crewId)) if (m !== viewerId) await publish(`user:${m}`, { type: 'memory', id: memory.id });
    }
    return { entry: entryView(row), state: await buildState(store, viewerId, date, drop) };
  });
}

// ---------------------------------------------------------------- unshare / report
/** Take the entry off the community board. The photo stays in the person's own Memories. */
export async function sideQuestUnshare(store: CoreStore, viewerId: string, date: string): Promise<SideQuestState> {
  return withLock(`submit:${viewerId}:${date}`, async () => {
    const v = await store.view();
    const e = v.db.dailyEntries.find((x) => x.date === date && x.userId === viewerId && isSideQuestEntry(x));
    if (!e) throw notFound('entry_not_found');
    if (e.postId) await removePost(store, e.postId);
    await store.backend.update('dailyEntries', { date, userId: viewerId }, { audience: 'only_me', postId: null });
    const window = windowOf(v, viewerId);
    const drop = await ensureDrop(store, viewerId, dateInZone(now(), window.tz), window);
    return buildState(store, viewerId, dateInZone(now(), window.tz), drop);
  });
}

async function removePost(store: CoreStore, postId: string): Promise<void> {
  await store.backend.remove('reactions', { postId });
  await store.backend.remove('comments', { postId });
  await store.backend.remove('posts', { id: postId });
}

export async function sideQuestReport(store: CoreStore, viewerId: string, body: { date: string; userId: string }): Promise<{ ok: true }> {
  if (body.userId === viewerId) throw badRequest('You cannot report your own photo.');
  const v = await store.view();
  const reported = communityEntries(v, body.date).some((e) => e.userId === body.userId);
  if (!reported) throw notFound('entry_not_found');
  await store.backend.upsert('dailyReports', [{ date: body.date, userId: body.userId, reporterId: viewerId, createdAt: iso() }]);
  return { ok: true };
}

// ---------------------------------------------------------------- board
export async function sideQuestBoard(store: CoreStore, viewerId: string, dateArg?: string): Promise<SideQuestBoardResponse> {
  const v = await store.view();
  const window = windowOf(v, viewerId);
  const today = dateInZone(now(), window.tz);
  const date = dateArg ?? today;
  const friends = v.friendIds(viewerId);
  const rows = communityEntries(v, date).sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt));

  // Entries are revealed after you have entered, or once your own quest has ended (or the day is past).
  const mine = v.db.dailyEntries.find((e) => e.date === date && e.userId === viewerId && isSideQuestEntry(e));
  const drop = v.db.sideQuestDrops.find((d) => d.date === date && d.userId === viewerId);
  const ended = !!drop && phaseOf(now(), drop, false) === 'expired';
  const entriesVisible = !!mine || ended || date < today;

  const entries: SideQuestBoardEntry[] = entriesVisible ? rows.flatMap((e) => {
    const profile = v.profileById.get(e.userId);
    if (!profile) return [];
    const self = e.userId === viewerId;
    const friend = self || friends.has(e.userId);
    return [{
      date, userId: e.userId,
      author: { name: friend ? profile.name : profile.name.split(' ')[0] ?? profile.name, avatarUrl: profile.avatarUrl, isFriend: friend },
      photoUrl: photoUrlOf(e), caption: e.caption ?? '', onTime: e.onTime ?? true, submittedAt: e.submittedAt ?? e.createdAt,
      postId: e.postId!, reactionCounts: v.reactionCounts(e.postId!), viewerReaction: v.viewerReaction(e.postId!, viewerId), mine: self,
    }];
  }) : [];
  return { date, challenge: challengeFor(date), count: rows.length, entriesVisible, entries };
}

// ---------------------------------------------------------------- photo access
export async function sideQuestPhoto(store: CoreStore, viewerId: string, date: string, userId: string): Promise<Blob> {
  const v = await store.view();
  const e = v.db.dailyEntries.find((x) => x.date === date && x.userId === userId && isSideQuestEntry(x));
  if (!e?.photoKey) throw notFound('photo_not_found');
  const visible = userId === viewerId || (e.audience === 'community' && !!e.postId);
  if (!visible) throw notFound('photo_not_found'); // private: never confirm it exists
  return store.backend.downloadCrewPhoto(e.photoKey);
}

// ---------------------------------------------------------------- history (progress + Memories)
export async function sideQuestHistory(store: CoreStore, viewerId: string): Promise<SideQuestHistoryResponse> {
  const v = await store.view();
  const window = windowOf(v, viewerId);
  const today = dateInZone(now(), window.tz);
  const mineEntries = v.db.dailyEntries.filter((e) => e.userId === viewerId && isSideQuestEntry(e));
  const week: SideQuestHistoryItem[] = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6)).map((date) => {
    const c = challengeFor(date);
    const entry = mineEntries.find((e) => e.date === date) ?? null;
    const drop = v.db.sideQuestDrops.find((d) => d.date === date && d.userId === viewerId);
    const status: SideQuestHistoryItem['status'] = entry ? 'completed'
      : date === today ? 'today'
      : drop && new Date(drop.deadlineAt).getTime() < now().getTime() ? 'missed' : 'none';
    return { date, challengeId: c.id, title: c.title, emoji: c.emoji, status, entry: entry ? entryView(entry) : null };
  });
  const memories = mineEntries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
    const c = challengeById(e.challengeId!) ?? challengeFor(e.date);
    return { ...entryView(e), title: c.title, emoji: c.emoji };
  });
  return { week, completedCount: mineEntries.length, memories };
}

// ---------------------------------------------------------------- prefs
export async function sideQuestPrefs(store: CoreStore, viewerId: string): Promise<SideQuestPrefs> {
  return prefsOf(windowOf(await store.view(), viewerId));
}

export async function setSideQuestPrefs(store: CoreStore, viewerId: string, p: SideQuestPrefs): Promise<SideQuestPrefs> {
  if (!validWindow(p)) throw badRequest('Choose an active window of at least 2 hours inside one day.');
  await store.backend.upsert('sideQuestPrefs', [{ userId: viewerId, windowStartMin: p.startMin, windowEndMin: p.endMin, tz: p.tz, updatedAt: iso() }]);
  return p; // applies to days that have no drop yet; today's persisted drop never changes
}

// ---------------------------------------------------------------- demo controls
export async function sideQuestDemo(store: CoreStore, viewerId: string, body: SideQuestDemoBody): Promise<SideQuestState> {
  const v0 = await store.view();
  assertDemo(v0.profileById.get(viewerId));
  const window = windowOf(v0, viewerId);
  const date = dateInZone(now(), window.tz);

  switch (body.action) {
    case 'reset': {
      await resetDemoDay(store, date);
      break;
    }
    case 'trigger': {
      await withLock(`submit:${viewerId}:${date}`, async () => {
        await removeEntry(store, viewerId, date);
        await setDemoDrop(store, viewerId, date, window, body.deadlineSeconds ?? 120);
      });
      break;
    }
    case 'deadline': {
      await withLock(`submit:${viewerId}:${date}`, async () => { await setDemoDrop(store, viewerId, date, window, body.deadlineSeconds); });
      break;
    }
    case 'seed': {
      await seedBoard(store, viewerId, date);
      break;
    }
  }
  const drop = await ensureDrop(store, viewerId, date, window);
  return buildState(store, viewerId, date, drop);
}

/** The drop is open now and ends `seconds` from now. Replaces (never stacks on) the persisted row. */
async function setDemoDrop(store: CoreStore, userId: string, date: string, window: ActiveWindow, seconds: number): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) throw badRequest('deadline must be 10 to 3600 seconds');
  const at = now();
  const row: SideQuestDropRow = {
    date, userId, challengeId: challengeFor(date).id,
    dropAt: new Date(at.getTime() - 1000).toISOString(), deadlineAt: new Date(at.getTime() + seconds * 1000).toISOString(),
    durationMinutes: Math.max(5, Math.ceil(seconds / 60)), windowStartMin: window.startMin, windowEndMin: window.endMin, tz: window.tz,
    demo: true, createdAt: iso(),
  };
  await store.backend.upsert('sideQuestDrops', [row]);
}

async function removeEntry(store: CoreStore, userId: string, date: string): Promise<void> {
  const v = await store.view();
  const e = v.db.dailyEntries.find((x) => x.date === date && x.userId === userId && isSideQuestEntry(x));
  if (!e) return;
  if (e.postId) await removePost(store, e.postId);
  if (e.crewMemoryId) await store.backend.remove('memories', { id: e.crewMemoryId });
  await store.backend.remove('dailyEntries', { date, userId });
  await store.backend.remove('dailyReports', { date, userId });
}

/**
 * Reset ONLY today's Side Quest records of demo personas: their entries (with board posts and
 * crew memories), their drops, reports about them. Other dates, quests, crews, photos, map data
 * and Facebook content are untouched. Safe to run twice.
 */
async function resetDemoDay(store: CoreStore, date: string): Promise<void> {
  const v = await store.view();
  const demoIds = v.db.profiles.filter((p) => p.isDemoUser).map((p) => p.id);
  for (const id of demoIds) {
    await removeEntry(store, id, date);
    if (v.db.sideQuestDrops.some((d) => d.date === date && d.userId === id)) {
      await store.backend.remove('sideQuestDrops', { date, userId: id });
    }
  }
}

/** Fill today's board with clearly fictional entries from the other demo personas. */
async function seedBoard(store: CoreStore, viewerId: string, date: string): Promise<void> {
  await ensureDailyQuest(store, date);
  const v = await store.view();
  const challenge = challengeFor(date);
  let i = 0;
  for (const handle of DEMO_BOARD_HANDLES) {
    const p = v.db.profiles.find((x) => x.handle === handle && x.isDemoUser);
    const k = i++;
    if (!p || p.id === viewerId) continue;
    if (v.db.dailyEntries.some((e) => e.date === date && e.userId === p.id && isSideQuestEntry(e))) continue;
    const at = new Date(now().getTime() - (k + 2) * 7 * 60_000);
    const postId = uuid();
    await store.backend.upsert('sideQuestDrops', [{
      date, userId: p.id, challengeId: challenge.id, dropAt: new Date(at.getTime() - 20 * 60_000).toISOString(),
      deadlineAt: new Date(at.getTime() + 10 * 60_000).toISOString(), durationMinutes: 30,
      windowStartMin: DEFAULT_WINDOW.startMin, windowEndMin: DEFAULT_WINDOW.endMin, tz: DEFAULT_WINDOW.tz, demo: true, createdAt: at.toISOString(),
    }]);
    const photoUrl = DEMO_PHOTOS[k % DEMO_PHOTOS.length];
    const caption = DEMO_CAPTIONS[k % DEMO_CAPTIONS.length];
    await store.backend.insert('posts', [{
      id: postId, authorId: p.id, targetType: 'sidequest', targetId: sideQuestBoardId(date), audience: 'public',
      text: caption, media: [photoUrl], sharedPostId: null, createdAt: at.toISOString(),
    }]);
    await store.backend.upsert('dailyEntries', [{
      date, userId: p.id, photoUrl, verified: null, museNote: '', createdAt: at.toISOString(),
      challengeId: challenge.id, audience: 'community', caption, onTime: true, photoKey: null, postId, crewMemoryId: null, submittedAt: at.toISOString(),
    }]);
  }
}

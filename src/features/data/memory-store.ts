// MemoryStore: the seeded in-process store used when Supabase env is missing (builders, tests,
// offline dev). Rows come from the same buildSeed() as scripts/seed.ts, with times rebased on
// "now" at boot. Seat changes follow join_quest/leave_quest exactly, including quest_full.
import contentJson from '../../../supabase/seed-content.json';
import placesJson from '../../../supabase/seed-places.json';
import { floorToHour, floorToMinute, now, type ID } from '@/shared';
import { applyInsert, applyRemove, applyUpdate, applyUpsert, type Backend, type Match, type TogetherVoteResult } from './backend';
import { CoreStore } from './core';
import { emptyDb, fromRow, TABLE_KEYS, TABLE_NAMES, type Db, type RowOf, type TableKey } from './db';
import { badRequest, conflict, notFound } from './errors';
import { buildSeed, PlacesZ, SeedContentZ } from './seed-build';
import { subsetDb, TableNotLoadedError, tableList, type TableSet } from './tables';

/** Builds a fresh Db from the committed seed content, with times relative to `at`. */
export function buildMemoryDb(at: Date = now()): Db {
  const { tables } = buildSeed(SeedContentZ.parse(contentJson), PlacesZ.parse(placesJson), {
    refDate: floorToHour(at), demoNow: floorToMinute(at),
  });
  const db = emptyDb();
  const byName = Object.fromEntries(TABLE_KEYS.map((k) => [TABLE_NAMES[k], k])) as Record<string, TableKey>;
  for (const [name, rows] of Object.entries(tables)) {
    const key = byName[name];
    if (!key) continue;
    (db[key] as unknown[]) = rows.map((r) => fromRow(key, r));
  }
  return db;
}

type Files = Map<string, { bytes: Uint8Array; contentType: string }>;
const g = globalThis as unknown as { __outhereMemory?: { db: Db; files: Files } };

export function memoryFiles(): Files {
  return (g.__outhereMemory ??= { db: buildMemoryDb(), files: new Map() }).files;
}

export class MemoryBackend implements Backend {
  readonly kind = 'memory' as const;
  constructor(private db: Db, private files: Files = new Map()) {}

  /**
   * Shallow copy: writes replace table arrays, so an earlier snapshot never changes under a reader.
   * With a set, the same rows, but reading a table outside the set throws, so tests catch a set
   * that SupabaseStore would load too little for.
   */
  async snapshot(set?: TableSet): Promise<Db> {
    if (!set) return { ...this.db };
    const keys = tableList(set);
    return subsetDb(this.db, keys, (k) => { throw new TableNotLoadedError(k); });
  }

  async insert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    applyInsert(this.db, table, rows);
  }

  async upsert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    applyUpsert(this.db, table, rows);
  }

  async update<T extends TableKey>(table: T, match: Match<T>, patch: Partial<RowOf<T>>): Promise<void> {
    applyUpdate(this.db, table, match, patch);
  }

  async remove<T extends TableKey>(table: T, match: Match<T>): Promise<void> {
    applyRemove(this.db, table, match);
  }

  // Same rules as public.join_quest. JS runs this synchronously, so it is atomic in-process.
  async joinQuest(questId: ID, userId: ID, withFriendId: ID | null): Promise<number> {
    const q = this.db.quests.find((x) => x.id === questId);
    if (!q) throw notFound('quest_not_found');
    if (q.status === 'done') throw conflict('quest_closed');
    const members = this.db.questMembers.filter((m) => m.questId === questId);
    const isIn = (u: ID) => members.some((m) => m.userId === u);
    const friend = withFriendId && withFriendId !== userId ? withFriendId : null;
    const add: Db['questMembers'] = [];
    const at = now().toISOString();
    if (!isIn(userId)) add.push({ questId, userId, joinedAt: at, viaFriendId: friend });
    if (friend && !isIn(friend)) add.push({ questId, userId: friend, joinedAt: at, viaFriendId: userId });
    if (add.length === 0) return Math.max(q.capacity - members.length, 0);
    if (members.length + add.length > q.capacity) throw conflict('quest_full');
    this.db.questMembers = [...this.db.questMembers, ...add];
    const count = members.length + add.length;
    if (count >= q.capacity && q.status === 'open') {
      this.db.quests = this.db.quests.map((x) => (x.id === questId ? { ...x, status: 'full' } : x));
    }
    return q.capacity - count;
  }

  async leaveQuest(questId: ID, userId: ID): Promise<number> {
    const q = this.db.quests.find((x) => x.id === questId);
    if (!q) throw notFound('quest_not_found');
    this.db.questMembers = this.db.questMembers.filter((m) => !(m.questId === questId && m.userId === userId));
    const count = this.db.questMembers.filter((m) => m.questId === questId).length;
    if (q.status === 'full' && count < q.capacity) {
      this.db.quests = this.db.quests.map((x) => (x.id === questId ? { ...x, status: 'open' } : x));
    }
    return Math.max(q.capacity - count, 0);
  }

  async reload(): Promise<void> { /* the in-process tables are always current */ }

  // Same rules as public.vote_together. No await between reading and writing, so two votes
  // in this process are applied one after the other and the group joins all-or-nothing.
  async voteTogether(planId: ID, userId: ID, questId: ID, isIn: boolean): Promise<TogetherVoteResult> {
    const p = this.db.togetherPlans.find((x) => x.id === planId);
    if (!p || !p.memberIds.includes(userId)) throw notFound('plan_not_found');
    const at = now().toISOString();
    if (p.status !== 'proposing' || p.expiresAt <= at) {
      return { status: p.status === 'proposing' ? 'expired' : p.status, questId: p.confirmedQuestId, seatsLeft: null };
    }
    if (!p.options.some((o) => o.questId === questId)) throw badRequest('not_an_option');
    const mine = (p.votes[userId] ?? []).filter((q) => q !== questId);
    if (isIn) mine.push(questId);
    const votes = { ...p.votes, [userId]: mine };
    const setPlan = (patch: Partial<typeof p>) => {
      this.db.togetherPlans = this.db.togetherPlans.map((x) => (x.id === planId ? { ...x, ...patch } : x));
    };
    setPlan({ votes });
    const agreed = p.options.find((o) => o.seatsLeft > 0 && p.memberIds.every((m) => (votes[m] ?? []).includes(o.questId)));
    if (!agreed) return { status: 'proposing', questId: null, seatsLeft: null };
    const q = this.db.quests.find((x) => x.id === agreed.questId);
    const members = this.db.questMembers.filter((m) => m.questId === agreed.questId);
    const joining = p.memberIds.filter((m) => !members.some((x) => x.userId === m));
    if (!q || q.status === 'done' || members.length + joining.length > q.capacity) {
      setPlan({ votes, options: p.options.map((o) => (o.questId === agreed.questId ? { ...o, seatsLeft: 0 } : o)) });
      return { status: 'proposing', questId: agreed.questId, seatsLeft: q ? Math.max(q.capacity - members.length, 0) : 0 };
    }
    this.db.questMembers = [...this.db.questMembers, ...joining.map((userId) => ({ questId: q.id, userId, joinedAt: at, viaFriendId: null }))];
    const count = members.length + joining.length;
    if (count >= q.capacity && q.status === 'open') {
      this.db.quests = this.db.quests.map((x) => (x.id === q.id ? { ...x, status: 'full' } : x));
    }
    setPlan({ votes, status: 'confirmed', confirmedQuestId: q.id });
    return { status: 'confirmed', questId: q.id, seatsLeft: q.capacity - count };
  }

  async uploadFile(bucket: 'uploads' | 'memories' | 'crew-photos', path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    if (bucket === 'crew-photos') {
      this.files.set(`crew-photos:${path}`, { bytes, contentType });
      return path;
    }
    const id = path.replace(/[^a-zA-Z0-9.-]/g, '_');
    this.files.set(id, { bytes, contentType });
    return `/api/uploads/${id}`;
  }

  async downloadCrewPhoto(id: ID): Promise<Blob> {
    const file = this.files.get(`crew-photos:${id}`);
    if (!file) throw notFound('photo_not_found');
    return new Blob([new Uint8Array(file.bytes)], { type: file.contentType });
  }
}

/** A MemoryStore over its own fresh seed (tests use this). */
export function createMemoryStore(at?: Date): CoreStore {
  return new CoreStore(new MemoryBackend(buildMemoryDb(at)));
}

/** The process-wide MemoryStore, kept on globalThis so every route bundle shares it. */
export function sharedMemoryStore(): CoreStore {
  const state = (g.__outhereMemory ??= { db: buildMemoryDb(), files: new Map() });
  return new CoreStore(new MemoryBackend(state.db, state.files));
}

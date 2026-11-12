// MemoryStore: the seeded in-process store used when Supabase env is missing (builders, tests,
// offline dev). Rows come from the same buildSeed() as scripts/seed.ts, with times rebased on
// "now" at boot. Seat changes follow join_quest/leave_quest exactly, including quest_full.
import contentJson from '../../../supabase/seed-content.json';
import placesJson from '../../../supabase/seed-places.json';
import { floorToHour, floorToMinute, now, type ID } from '@/shared';
import { rowMatches, type Backend, type Match } from './backend';
import { CoreStore } from './core';
import { emptyDb, fromRow, PRIMARY_KEYS, TABLE_KEYS, TABLE_NAMES, type Db, type RowOf, type TableKey } from './db';
import { conflict, notFound } from './errors';
import { buildSeed, PlacesZ, SeedContentZ } from './seed-build';

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

  /** Shallow copy: writes replace table arrays, so an earlier snapshot never changes under a reader. */
  async snapshot(): Promise<Db> { return { ...this.db }; }

  private key<T extends TableKey>(table: T, row: RowOf<T>): string {
    return PRIMARY_KEYS[table].map((k) => String((row as Record<string, unknown>)[k])).join('|');
  }

  async insert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    const list = this.db[table] as RowOf<T>[];
    const existing = new Set(list.map((r) => this.key(table, r)));
    for (const r of rows) {
      const k = this.key(table, r);
      if (existing.has(k)) throw conflict(`duplicate key in ${TABLE_NAMES[table]}`);
      existing.add(k);
    }
    // replace the array so View snapshots taken earlier stay unchanged
    (this.db[table] as RowOf<T>[]) = [...list, ...rows.map((r) => ({ ...r }))];
  }

  async upsert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    const keys = new Map(rows.map((r) => [this.key(table, r), r]));
    const kept = (this.db[table] as RowOf<T>[]).filter((r) => !keys.has(this.key(table, r)));
    (this.db[table] as RowOf<T>[]) = [...kept, ...rows.map((r) => ({ ...r }))];
  }

  async update<T extends TableKey>(table: T, match: Match<T>, patch: Partial<RowOf<T>>): Promise<void> {
    (this.db[table] as RowOf<T>[]) = (this.db[table] as RowOf<T>[]).map((r) =>
      rowMatches(r as Record<string, unknown>, match as Record<string, unknown>) ? { ...r, ...patch } : r);
  }

  async remove<T extends TableKey>(table: T, match: Match<T>): Promise<void> {
    (this.db[table] as RowOf<T>[]) = (this.db[table] as RowOf<T>[]).filter((r) =>
      !rowMatches(r as Record<string, unknown>, match as Record<string, unknown>));
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

  async uploadFile(_bucket: 'uploads' | 'memories', path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const id = path.replace(/[^a-zA-Z0-9.-]/g, '_');
    this.files.set(id, { bytes, contentType });
    return `/api/uploads/${id}`;
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

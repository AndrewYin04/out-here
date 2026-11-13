// Table subsets for reads (issue #36). A Supabase read loads whole tables, and a full load is one
// query per table (35, plus 3 more pages for reactions). The hot routes (map, Out Here, Up next,
// Find My, invites, notifications) need 5 to 12 of them, so each of those store methods asks for
// its set with `view(TABLES.x)`. Every other method still loads every table.
//
// A snapshot built for a subset holds only those tables. Reading any other table is a bug in the
// set: MemoryStore throws (so unit and e2e tests catch it), SupabaseStore logs it and reads the
// table as empty.
import { TABLE_KEYS, type Db, type TableKey } from './db';

const PEOPLE = ['profiles', 'friendships', 'friendLists', 'friendListMembers'] as const satisfies readonly TableKey[];
/** What View.canSeeQuest and View.questFor read. */
const QUEST_VIS = [...PEOPLE, 'groups', 'groupMembers', 'quests', 'questMembers', 'questReports', 'invites'] as const satisfies readonly TableKey[];

export const TABLES = {
  /** getViewer: the persona lookup every route starts with. */
  persona: ['profiles'],
  people: PEOPLE,
  quests: QUEST_VIS,
  yourPlans: [...QUEST_VIS, 'crews', 'crewMembers'],
  questDetail: [...QUEST_VIS, 'questCheckins', 'posts'],
  availability: ['availability'],
  friendAvailability: [...PEOPLE, 'availability'],
  // quests, questMembers and hangoutRatings: the lazy "How was it?" prompt (ratings.ts promptEndedHangouts).
  notifications: [...PEOPLE, 'notifications', 'comments', 'groups', 'events', 'quests', 'questMembers', 'hangoutRatings'],
  together: [...PEOPLE, 'togetherPlans'],
  myLocation: ['locationShares'],
  locations: [...PEOPLE, 'locationShares', 'availability'],
  walk: [...QUEST_VIS, 'locationShares'],
} as const satisfies Record<string, readonly TableKey[]>;

export type TableSet = readonly TableKey[];

/** Every table (the default for a read that names no set). */
export const ALL_TABLES: TableSet = TABLE_KEYS;

/** The union of the sets, in TABLE_KEYS order, de-duplicated. */
export function tableList(set?: TableSet): TableKey[] {
  if (!set) return [...TABLE_KEYS];
  const want = new Set(set);
  return TABLE_KEYS.filter((k) => want.has(k));
}

/**
 * A Db holding `tables` for the keys in `keys`. Other keys are non-enumerable getters that call
 * `missing`, so a spread copy of the result never reads them.
 */
export function subsetDb(tables: Partial<Db>, keys: readonly TableKey[], missing: (key: TableKey) => unknown[]): Db {
  const out = {} as Db;
  const have = new Set(keys);
  for (const k of TABLE_KEYS) {
    if (have.has(k)) (out[k] as unknown) = tables[k] ?? [];
    else Object.defineProperty(out, k, { get: () => missing(k), enumerable: false, configurable: true });
  }
  return out;
}

export class TableNotLoadedError extends Error {
  constructor(readonly table: TableKey) {
    super(`table ${table} was read but is not in this view's table set (src/features/data/tables.ts)`);
    this.name = 'TableNotLoadedError';
  }
}

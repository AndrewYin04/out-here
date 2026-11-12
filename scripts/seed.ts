// Seeds a Supabase project from supabase/seed-content.json + supabase/seed-places.json and the
// demo story in src/shared/seed/story.ts. Deterministic: ids are derived from handles/slugs,
// faker is seeded with 42 and its reference date is "now" rounded down to the hour.
// Upcoming quest and availability times are relative to "now" rounded down to the minute.
//
// Usage (secrets come from .env.local through the npm scripts):
//   npm run seed                 -> dev project  (SUPABASE_DB_URL_DEV)
//   npm run seed:demo            -> demo project (SUPABASE_DB_URL)
//   npm run seed -- --fixture    -> dev project with supabase/seed-content.fixture.json
// It TRUNCATEs the app tables (never DROPs) and re-inserts everything in one transaction.
// muse_runs is kept.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { floorToHour, floorToMinute } from '../src/shared/demo';
import { profileId, seedId } from '../src/shared/seed/ids';
import {
  buildSeed, PlacesZ, SeedContentZ, TABLE_ORDER, type Row, type SeedContent, type SeedPlaces,
} from '../src/features/data/seed-build';

export { buildSeed, PlacesZ, SeedContentZ, TABLE_ORDER } from '../src/features/data/seed-build';
export type { BuildResult, Row, SeedContent, SeedPlaces, SeedTables } from '../src/features/data/seed-build';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- load ----------
export function loadContent(fixture: boolean): SeedContent {
  const file = fixture ? 'seed-content.fixture.json' : 'seed-content.json';
  return SeedContentZ.parse(JSON.parse(readFileSync(join(ROOT, 'supabase', file), 'utf8')));
}
export function loadPlaces(): SeedPlaces {
  return PlacesZ.parse(JSON.parse(readFileSync(join(ROOT, 'supabase', 'seed-places.json'), 'utf8')));
}

// ---------- write ----------
async function insertRows(client: pg.Client, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const chunk = Math.max(1, Math.floor(20000 / cols.length));
  for (let s = 0; s < rows.length; s += chunk) {
    const part = rows.slice(s, s + chunk);
    const values: unknown[] = [];
    const tuples = part.map((r) => `(${cols.map((c) => { values.push(r[c]); return `$${values.length}`; }).join(',')})`);
    await client.query(`insert into public.${table} (${cols.map((c) => `"${c}"`).join(',')}) values ${tuples.join(',')}`, values);
  }
}

/**
 * --verify: exercises join_quest/leave_quest on the seeded Dumpling Den quest inside a
 * transaction that is rolled back, so the seed stays untouched.
 */
async function verifySeats(client: pg.Client): Promise<void> {
  const q = seedId('quest', 'dumplings');
  const [alex, maya] = [profileId('alex'), profileId('maya')];
  const others = await client.query(
    `select id from public.profiles where id not in (select user_id from public.quest_members where quest_id = $1) and id <> all($2::uuid[]) order by handle limit 1`,
    [q, [alex, maya]],
  );
  const extra: string | undefined = others.rows[0]?.id;
  const seats = async (sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0].n as number;
  const status = async () => (await client.query('select status from public.quests where id = $1', [q])).rows[0].status as string;
  await client.query('begin');
  try {
    console.log(`verify: alex+maya join together -> seats_left ${await seats('select public.join_quest($1, $2, $3) as n', [q, alex, maya])}, status ${await status()}`);
    console.log(`verify: alex joins again (no-op) -> seats_left ${await seats('select public.join_quest($1, $2) as n', [q, alex])}`);
    if (extra) {
      await client.query('savepoint s1');
      try {
        await client.query('select public.join_quest($1, $2)', [q, extra]);
        console.log('verify: FAIL a fifth person got a seat');
      } catch (err) {
        console.log(`verify: fifth person -> error "${err instanceof Error ? err.message : err}"`);
        await client.query('rollback to savepoint s1');
      }
    }
    console.log(`verify: maya leaves -> seats_left ${await seats('select public.leave_quest($1, $2) as n', [q, maya])}, status ${await status()}`);
  } finally {
    await client.query('rollback');
    console.log('verify: rolled back');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => a === 'dev' || a === 'demo');
  const fixture = args.includes('--fixture');
  const envName = target === 'demo' ? 'SUPABASE_DB_URL' : target === 'dev' ? 'SUPABASE_DB_URL_DEV' : null;
  if (!envName) {
    console.error('usage: tsx scripts/seed.ts <dev|demo> [--fixture]');
    process.exit(2);
  }
  const url = process.env[envName];
  if (!url) {
    console.error(`${envName}: MISSING`);
    process.exit(2);
  }

  const now = new Date();
  const { tables, warnings } = buildSeed(loadContent(fixture), loadPlaces(), {
    refDate: floorToHour(now), demoNow: floorToMinute(now),
  });
  for (const w of warnings) console.warn(`warn: ${w}`);

  const redact = (s: string) => s.replace(/postgres(ql)?:\/\/\S*/gi, 'postgresql://[redacted]');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log(`seeding ${target} (${envName})${fixture ? ' with fixture content' : ''}`);
    await client.query('begin');
    await client.query(`truncate ${TABLE_ORDER.map((n) => `public.${n}`).join(', ')} cascade`);
    for (const name of TABLE_ORDER) await insertRows(client, name, tables[name]);
    await client.query('commit');
    const counts: Record<string, number> = {};
    for (const name of TABLE_ORDER) {
      const { rows } = await client.query(`select count(*)::int as n from public.${name}`);
      counts[name] = rows[0].n;
    }
    for (const [name, n] of Object.entries(counts)) console.log(`${name.padEnd(20)} ${n}`);
    console.log(`seed done at ${now.toISOString()}`);
    if (args.includes('--verify')) await verifySeats(client);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error(`seed failed: ${redact(err instanceof Error ? err.message : String(err))}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase() : false;
if (invoked || /seed\.ts$/i.test(process.argv[1] ?? '')) {
  void main();
}

// Applies supabase/migrations/*.sql in name order, one transaction per file,
// and records each in public._migrations. Usage: node scripts/db-migrate.mjs <dev|demo>
// dev uses SUPABASE_DB_URL_DEV, demo uses SUPABASE_DB_URL. Never prints the URL.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const target = process.argv[2];
const envName = { dev: "SUPABASE_DB_URL_DEV", demo: "SUPABASE_DB_URL" }[target];
if (!envName) {
  console.error("usage: node scripts/db-migrate.mjs <dev|demo>");
  process.exit(2);
}
const url = process.env[envName];
if (!url) {
  console.error(`${envName}: MISSING`);
  process.exit(2);
}

const redact = (s) => String(s).replace(/postgres(ql)?:\/\/\S*/gi, "postgresql://[redacted]");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log(`connected to ${target} (${envName})`);
  await client.query(
    "create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())",
  );
  const { rows } = await client.query("select name from public._migrations");
  const done = new Set(rows.map((r) => r.name));
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations(name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
      applied++;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${file}: ${err.message}`);
    }
  }
  console.log(`${applied} applied, ${files.length - applied} skipped, ${files.length} total`);
} catch (err) {
  console.error(`migration failed: ${redact(err.message)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

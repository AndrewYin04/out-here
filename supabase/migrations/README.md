# Migrations

Plain SQL files in this folder are applied by `scripts/db-migrate.mjs`, not by the Supabase CLI.

- Name files so they sort in apply order: `0001_init.sql`, `0002_...sql`.
- Each file runs inside its own transaction and is recorded in `public._migrations`; a recorded file is skipped on the next run.
- `npm run db:migrate:dev` targets the dev project (`SUPABASE_DB_URL_DEV`). `npm run db:migrate:demo` targets the demo project (`SUPABASE_DB_URL`) and needs a human's approval.
- Never edit a file that has been applied; add a new one.

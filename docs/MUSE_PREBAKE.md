# Prebaked Muse: real answers, served fast on stage

On stage, a live Muse step takes about 1 to 2.8 s (plan: parse about 1.0 s, then rank about 1.05 s; plan together: about 2.8 s; draft: 1.5 to 2 s; see the perf report on issue #36). Prebaked Muse runs the demo's scripted asks through real Muse once, after the morning reseed, stores each answer, and serves it again in about 50 ms (one database read) when the same persona makes the same ask. Live calls stay as the fallback for anything unscripted.

Every answer shown this way was produced by a real Muse call this morning and is logged in `muse_runs`. Mock and code-fallback answers are never stored.

## What gets stored, and the key

Migration `supabase/migrations/0009_muse_cache.sql` adds:

- `muse_cache (route, model, input_hash)` → `output` (the zod-validated output of a live call), `user_id`, `latency_ms` of that live call, `created_at`.
- `muse_settings (key, value)`: the `prebaked` switch the warm-up turns on.
- On `muse_runs`: `schema_name`, `cached`, `mock`, `cache_reason` (`prebaked`, `stage-timeout` or `live-failed`).

A separate table was chosen over reusing `muse_runs`: the log is append-only and holds failures, mocks and cache hits, so a lookup there would need "latest ok, live, non-mock row for this hash" on every call. `muse_cache` has one row per key with a primary-key lookup and an upsert.

Without Supabase (builders, tests, MemoryStore e2e) the same cache lives in process memory. Outside production and tests it is mirrored to `.cache/muse/` (gitignored), so a local warm-up survives a server restart.

`input_hash` is built in `src/features/muse/cache-key.ts` from canonical JSON (keys sorted) of:

| Part | Parse ("I'm free") | Rank | ✨ Draft | Other routes (filter, caption, regroup, intros) |
|---|---|---|---|---|
| route, schema name, model, effort, strict JSON schema | yes | yes | yes | yes |
| persona (user id) | yes | yes | yes | yes |
| seed version (`MUSE_SEED_VERSION`, default 1) and key version | yes | yes | yes | yes |
| system prompt, with the clock removed | yes | yes | yes | yes |
| text: NFKC, lower case, single spaces, trimmed | yes | yes | yes | no |
| intent's activities, budget, wantsFriends, openToNewPeople, vibe | | yes | | |
| the ORDERED shortlist: each quest id with the friend ids listed under it | | yes | | |
| user message, with the clock removed | | | | yes |

Left out of the parse, rank and draft keys: the clock label, the live seat counts, walk minutes, start times and "starts in" minutes, the window label, and the draft's nearby-place walk labels.

"Clock removed" means exactly these replacements (`normalizeVolatile`):

- ISO timestamps (`2026-11-13T10:45:00.000Z`, with or without seconds, offset or `Z`) become `<iso>`.
- A weekday plus 12-hour clock, as `localLabel()` prints the current time (`Fri 10:45 AM`), becomes `<now>`.
- Any other 12-hour clock (`4:50 PM`) becomes `<clock>`.
- 24-hour `HH:MM` strings stay: the prompts use them only in fixed examples.

Plan together sends Muse "notes, 43 min" with the minutes left in the shared window. Its key uses those minutes rounded to the nearest 15 (`together.ts`), so a plan warmed at 60 minutes still matches at 53 to 67.

What stays live after a cached answer:

- Parse answers are relative ("60 minutes", "17:00"), and code resolves them against the current clock.
- After a cached ranking, `validate()` recomputes travel minutes and seats from live data and drops picks that are full or no longer fit. The claim check replaces a reason, bridge or invite whose numbers no longer match.
- `validateDraft` re-checks a cached place id against today's nearby places.

## When the cache is used

In `museJSON` (`src/features/muse/client.ts`), live mode only:

1. **Prebaked mode** (`MUSE_PREBAKED=1`, or the `muse_settings.prebaked` flag the warm-up sets; each server instance re-reads the flag every 10 s): the cache is read first. A hit returns in about 50 ms. A miss calls Muse as before.
2. **Stage timeout**: a live call still running after `MUSE_STAGE_TIMEOUT_MS` (default 4000) yields to a cached answer for the same key, if one exists. A live call that fails (timeout, 5xx, invalid JSON twice) also yields to a cached answer. With nothing cached, the call behaves exactly as before: it waits, or the route's code fallback answers. The slow call keeps running in the background, is logged, and refreshes the cache when it succeeds.
3. Every successful live answer is stored (upsert), whatever the mode.

A cache read is capped at `MUSE_CACHE_READ_MS` (default 1000) and counts as a miss when slower, so a sick database adds at most 1 s before the live call.

`muse_runs` gets one row per call, written in the background (`next/server` `after()`), so logging never slows or fails a request. A cached answer is logged with `cached = true`, its `cache_reason`, the same `input_hash` as the live row that produced it, and the output.

The UI keeps its "✨ Muse" label for cached answers: the plan's `meta.source` stays `muse`. The plan route also sends `x-muse-cache: parse,rank` (or `none`) and `meta.cache: { parse, rank }`; the draft route sends `x-muse-cache: hit|miss`.

## Morning commands

Run these after `npm run seed:demo` and `npm run db:migrate:demo` (0009 must be applied first; the main session applies it):

```
# 1. Warm the deployed demo build. --clear removes yesterday's answers, so every stored answer is from this morning.
npm run warm:demo -- --base https://getouthere.vercel.app --clear

# 2. Prove it: the second run should say "served from cache" on every Muse step.
npm run warm:demo -- --base https://getouthere.vercel.app
```

The script reads `DEMO_RESET_TOKEN` from `.env.local` and presses the presenter reset before and after, so the demo state (free windows, the shared plan, intros) is back to the story when it ends. Press the presenter reset again right before going on stage as usual: rank keys depend on which plans fit the window, so the cache matches best when the stage run starts, like the warm-up did, right after a reset.

Warm close to the demo: `seed:demo` and the presenter reset time plans relative to now, and an ask made on stage matches when the same plans are open and in reach as at warm-up time.

Flags: `--base <url>` (default `http://localhost:3000`), `--clear`, `--passes 2` (runs the list twice in one go), `--no-enable` (store answers but leave prebaked off), `--no-reset`, `--only <text>`.

The asks live in one array, `STEPS` in `scripts/warm-demo.ts`: Alex's "I'm free" ask and the composer's mood and time variants, Alex and Maya showing they are free, the pre-check (Alex asking again with Maya free), plan together, Up next (no Muse call; timed only), two ✨ Draft sentences, and an intro round for Alex (skipped where `/api/intros` does not exist). **Edit it to the exact words and personas used on stage**: case and spacing do not matter, other differences do.

For each step it prints the latency and one of:

- `N live -> now cached`: Muse answered and the answer is stored.
- `served from cache (N cached)`: every Muse call in that step came from the cache.
- `N FAILED/fallback (not cached)`: Muse failed and code answered; run the warm-up again.
- `no Muse call`: the step makes no Muse call (Up next, free-with-me), or an open shared plan was reused.

## How to check it worked

- `GET /api/muse/prebake` returns `{ prebaked, source, mode, store, entries, runs }`. `runs` counts `muse_runs` rows of the last 10 minutes (`?since=<iso>` changes the window) as live, cached, failed and mock.
- In the SQL editor of the demo project:
  ```sql
  select created_at, route, schema_name, model, cached, cache_reason, latency_ms, ok
  from muse_runs order by created_at desc limit 50;
  ```
  A stage ask served from the cache shows `cached = true`, and the row with the same `input_hash` and `cached = false` from the morning is the live call that produced it.
- On stage, a cached plan's `x-muse-cache` header reads `parse,rank`.

## How to turn it off

- Read-first only: `curl -X POST <base>/api/muse/prebake -H "content-type: application/json" -H "x-demo-key: $DEMO_RESET_TOKEN" -d '{"on":false}'`. Every instance picks it up within 10 s. The stage-timeout fallback stays on.
- Everything: set `MUSE_CACHE=0` in the Vercel env and redeploy. No reads, no writes, no fallback.
- Env overrides: `MUSE_PREBAKED=0` forces read-first off and `MUSE_PREBAKED=1` forces it on, whatever the flag says. `MUSE_STAGE_TIMEOUT_MS=0` turns the stage fallback off.
- Remove stored answers: `POST /api/muse/prebake {"clear":true}`, or `warm:demo --clear`. `muse_runs` is never cleared.
- Retire every key without deleting rows: change `MUSE_SEED_VERSION`.
- Turn off run logging: `MUSE_RUNS_LOG=0`.

`POST /api/muse/prebake` needs `x-demo-key` equal to `DEMO_RESET_TOKEN` when that is set. Without it, the POST works only outside production.

## The Q&A line

"These were generated by Muse this morning and cached for stage reliability; here is the log." Then show the `muse_runs` query above: each cached row points, by `input_hash`, to the live Muse call that produced it, with its model, latency and tokens. Anything we type that was not rehearsed goes to Muse live.

## Environment variables (names only)

`MUSE_PREBAKED`, `MUSE_STAGE_TIMEOUT_MS`, `MUSE_CACHE_READ_MS`, `MUSE_CACHE`, `MUSE_SEED_VERSION`, `MUSE_RUNS_LOG`, and for the warm-up `DEMO_RESET_TOKEN` and `WARM_BASE`.

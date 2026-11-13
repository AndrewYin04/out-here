# Muse agent coordination (Phase 5)

Branch: `feature/muse-agent-backend`, isolated worktree `out-here-phase3`, based on Phase 2 plus the uncommitted Phase 3/4 work. No GLB, rig, choreography, renderer, dependencies, or unrelated teammate branches were replaced. Nothing is committed, pushed, or merged.

## Changed files for Phase 5

- `src/features/muse-encounters/protocol.ts`: validated request/message/event contracts and safe result/session types.
- `src/features/muse-encounters/server/{context,orchestrator,repository,index}.ts`: filtered agent contexts, separate model calls, evidence checks, persistence and public server exports.
- `src/app/api/muse/encounters/route.ts` and `[id]/route.ts`: start/SSE, owner-only replay and cancellation.
- `src/features/muse-encounters/{client,index}.ts`: browser streaming adapter, deduplicated replay integration and conservative chat routing.
- `src/features/muse/client.ts`: parent cancellation through the existing adapter and provider-timeout classification.
- `src/features/muse-companion/{MuseChat,controller,encounter}.ts[x]`: named-friend routing, truthful live/mock labels, Retry, safe suggestions, visual skip behavior and bounded mobile sheet height.
- `src/features/outhere/{SuggestionCard,plan-api}.ts[x]`: approval metadata and the existing invitation editor for coordination without a specific quest; no unsupported attendance claim.
- `src/features/world/World3D.tsx`: skip preserves backend results; safe scene-ready/peer-count attributes let production browser checks inspect actual actors without the development debug handle.
- `supabase/migrations/0007_muse_encounters.sql`: server-owned session table, uniqueness/CAS support and stale expiry.
- Server tests, companion encounter tests, `tests/e2e/muse-agent-backend.spec.ts`, and the Phase 4 browser readiness check. Phase 3/4 files already present in the worktree remain uncommitted alongside this work.
- This guide, the Phase 4 guide's integration note, and `docs/PROGRESS.md`.

## Run and repeat

The existing Next app runs at `http://localhost:3123/out-here?as=alex&view=3d`. Open Muse and ask **“Is Maya free to get food tonight?”** without `encounterDemo=1`. Name exactly one existing friend. Availability/coordination language plus a known friend routes to the new backend; ordinary discovery stays on the existing planner.

The local ignored `.env.local` configures the existing Muse adapter. Never print or commit it. `MUSE_MOCK=1` or a missing key runs explicitly labelled simulated coordination; `MUSE_CACHE=0` disables development caching for live verification. Every new session also has a unique ID in its prompts. `encounterDemo=1` remains the separate, development-only Phase 4 choreography simulation and does not invoke this backend.

Ask again to repeat: each submission has a fresh request key. No persona reseed, unrelated-row deletion, or extra demo button is required. Retry uses the existing error control and creates a fresh attempt; it does not create an invitation. Closing chat/navigation aborts. Dragging the map skips the visual encounter while preserving the pending result.

## Two agents

`server/orchestrator.ts` invokes **two separate `museJSON` calls** through `features/muse`, both currently Ember/minimal:

1. `muse:<initiatorId>` parses the initiator's request using its own small context and the fixed recipient identity. The server grounds monetary constraints in explicit request text.
2. `muse:<recipientId>` receives the validated structured message, its own authorized profile projection, permitted free windows, and code-filtered activity candidates. It selects evidence and a possible activity. It never sees the raw initiator request or the initiator's home-derived walking time.

The [current Meta API overview](https://dev.meta.ai/docs/overview) and the checked-in `docs/muse-api.md` describe model inference and agent-building primitives. They do not define this application's peer identities, access policy or durable encounter sessions. We therefore orchestrate existing supported Chat Completions calls on our server; we do not assume an undocumented managed peer-agent endpoint. Two turns are the hard limit; the existing adapter may retry malformed JSON or a supported transient response within the shared deadline.

Zod validates model payloads and structured message envelopes. IDs, sender/recipient identities, intent, safe summary and timestamps come from server code. Code validates returned slot/quest IDs, fresh visibility, requested window, budget, walking feasibility and open seats. Safe summaries are built from validated facts rather than arbitrary model prose. No model tools can write invitations or accepted plans.

## Permissions and truthfulness

This project deliberately uses **demo persona identity (`x-persona`)**, not a production login. The new routes use the existing viewer resolver and accepted-friend checks. They cannot be described as production-authenticated endpoints; a real identity provider must replace the demo resolver before public real-user use.

The initiating agent sees its own name, public interests, raw request, and recipient name. The recipient agent sees only public interests, city filtered by existing per-field visibility, availability windows permitted to that initiator by `canSee`, and quests visible to both. Availability **text, inferred intent, coordinates, private calendar details, private budget, messages, home and unrelated people are excluded**. Public interests have no separate sharing toggle in the current profile contract; future private preference fields need explicit filtering before integration.

Fresh store scopes recheck permissions before each peer delivery and final disclosure. A model cannot waive them. A missing window means unknown, not busy, declined or agreed. A model reporting uncertainty despite shared windows is described as uncertainty, not as missing data. Shared availability never means consent to attend.

Every result requires human approval. Existing suggestion cards say approval is still needed. With no specific quest, **Invite Maya** opens the existing draft editor; only **Send invite** calls the existing invitation endpoint. With a quest, the existing join/invite controls retain their normal behavior. A human accepts or declines through the existing app. No accepted hangout is synthesized.

## Events and animation

`POST /api/muse/encounters` validates input/permissions, reserves the session, then returns fetch-based SSE:

- `session`: ID and live/mock mode.
- `message/accepted`: authorized session, starts the existing paired travel.
- `message/sent`: the initiating agent's actual validated message has been persisted and is delivered to the recipient agent; one outgoing pulse.
- `message/received`: the recipient's actual validated response has been persisted; one return pulse.
- `result`: terminal status and safe result for the existing chat and planning card.

There are no periodic or invented message pulses. Phase 4 already queues early facts in order until the characters meet; the result appears immediately without waiting for that queue. Duplicate event IDs are ignored. GET replays safe facts without rerunning calls; dropped streams get bounded polling recovery. DELETE cancels an owner session. Navigation and stale callbacks cannot apply late results to a different persona or request. The existing low-frame-rate fallback to the 2D map is preserved, and does not discard the backend result.

## Persistence and bounds

`server/repository.ts` provides:

- **Local single-process demo:** serialized writes and atomic replacement of `.cache/muse-encounters/ledger.json` (ignored, file mode 600). Restarts reload the safe ledger. This is separate from the app's seeded MemoryStore; seeded user availability is illustrative, not a real calendar.
- **Supabase:** migration `0007_muse_encounters.sql`, RLS with no browser policies, service-role access, an owner/request-key unique constraint, one pending session per initiator, compare-and-swap versions and stale-session expiry. Apply with the existing dev migration command after configuring dev database credentials. No migration has been applied to an external database during this task. Vercel refuses to silently use a local ledger without Supabase.

Persisted: session/owner/recipient IDs, input hash and request key, safe structured messages, event ledger, proposed suggestions/final outcome, live/mock mode, status, safe failure code, timestamps, expiry and version. Raw requests, prompts, hidden reasoning, private context and credentials are not persisted here.

The session deadline is 23 seconds, each model attempt at most 11 seconds, and the client guard 25 seconds. Cancellation aborts the streaming request/provider signal; a cancellation received by a different worker prevents later writes even if its provider call is already running. Duplicate POSTs never execute a second time. Pending duplicates report conflict; GET retrieves their state. Reusing a key with changed content is rejected. Stale sessions expire, and late/stale versions cannot overwrite terminal rows. Only the initiating persona can retrieve/cancel a session.

Local file locking is deliberately **single process**, not a distributed database substitute. Hosted Supabase concurrency is implemented but requires database configuration/migration and independent verification. The request-bound orchestrator is not a durable background job; interrupted sessions become cancelled or stale rather than resuming model generation.

## Verification

Unit coverage includes separate calls and identities, context isolation, private audience filtering, unknown and shared availability, invented evidence, human approval, budget grounding, model failure, timeout, cancellation, idempotency, overlapping requests, stale replay, cross-user isolation, local persistence across repository instances, ordered/deduplicated animation events, and visual skipping without losing results. Existing Phase 3/4 tests cover navigation, reduced motion, fast replies and return motion.

`tests/e2e/muse-agent-backend.spec.ts` exercises the actual HTTP orchestration route from ordinary chat, checks live/mock mode and exact message event order, verifies owner-only retrieval, captures meeting/result views, and checks that invitation drafts require an explicit action. Set `E2E_MUSE_LIVE=1` only against a configured live server; otherwise run against the isolated mock test server. Browser/network fixtures and mock-mode tests are not evidence of live inference.

Verified locally on November 12, 2026:

- **Live inference and browser:** both agents completed separate actual Ember calls in the desktop and mobile chat flows. SSE contained accepted → sent → received → completed, owner-only GET worked, the physical encounter appeared, and the safe reply reached the existing chat. The final live suite passed four desktop/mobile cases; after the mobile sheet adjustment, both mobile cases passed again. One earlier live provider timeout was observed and safely surfaced without a fabricated reply.
- **Persistence restart:** a completed live session was read back after restarting the actual dev server, with both messages represented by its sent/received facts and approval still required. The local repository restart/owner-isolation tests also pass.
- **Checks:** 363 unit tests pass; typecheck, lint, and production build pass. Eight targeted browser regressions pass against the isolated production/mock server (desktop/mobile backend, Retry, processing, cancellation and camera). Both Phase 4 simulation browser cases pass separately on the dev server; software WebGL cleanup allows the preserved low-FPS fallback and re-entry. These are not misrepresented as production/live inference tests.
- **Visual review:** `.verify/phase5/meeting-desktop.png`, `result-desktop.png`, `meeting-phone.png`, and `result-phone.png`. Mobile chat height is bounded so longer replies scroll while the two characters remain visible. The existing low-FPS 2D fallback remains active.
- **Secret handling:** the supplied key is in an ignored local file with mode 600; a boolean-only scan found zero matches in repository source files or client chunks. No external database migration, commit, push or merge was performed.

Not verified: hosted Supabase migration/concurrency against a real database, production authentication, private calendars, or human acceptance by an actual recipient. Those are not claimed by this local demonstration. Seeded availability is fictional demo context, even though the two model calls are real.

# Phase 6: saved-photo Vision and integration handoff

## Scope and parallel ownership

Local worktree: `/Users/ally/Github/out-here-vision`, branch `feature/muse-vision`, team issue #60. It was created from the preserved Phase 5 baseline; all 39 Phase 5 changed source files were copied and hash-verified without copying credentials/cache. The original Phase 5 worktree remains unchanged. No commits, pushes, merges, rebases, resets or stashes were performed.

Claude's `out-here-ui` / `feature/ui-cleanup` worktree was inspected read-only. Its cleanup spans Facebook surfaces, plan creation and shared motion. Existing photo/arrival/Memories components are treated as integration-owner files. **Phase 6 does not edit `MemoryCapture.tsx`, `ArrivalSelfie.tsx`, `MemoriesPage.tsx`, shared UI/motion, or `World3D.tsx`.** The Phase 3–5 changes already copied into this worktree are separate from the Phase 6 delta.

This advances demo scenes 9 and 11. No Daily Side Quests, scoring, galleries, dashboards, GLB changes, extra renderer, dependencies, sharing controls or public posting were added.

## Implemented backend

The existing `POST /api/muse/caption` supports two explicit modes:

- `{ questId }`: existing context-only caption generation, preserved for old callers. Returns `caption`, `mode` and `source: "context"`; it does not claim to have examined an image.
- `{ memoryId, consent: true }`: analyzes an already-saved, private photo. Returns `memoryId`, `source: "vision"`, `mode`, a short `observation`, nullable `caption`/`reaction`, and `clarity: "clear" | "uncertain"`.

The service loads the memory server-side, verifies uploader ownership **and** current crew membership, then uses the existing authorized `memoryPhoto` storage reader. Other crew members can retain their existing viewing rights but cannot submit someone else's photo to AI or edit its caption. Photos with arbitrary/external URLs are refused; the API accepts no image URL from the browser.

Stored bytes are size/pixel-limited, auto-oriented, resized to at most 1024 pixels and encoded as JPEG without metadata. The existing Muse client sends a `user` message containing `text` and `image_url` content parts with a base64 data URL. Model role `vision` uses `MUSE_MODEL_VISION` or `muse-spark-1.3`, through the existing Chat Completions adapter and credentials. This follows [Meta's image-understanding documentation](https://dev.meta.ai/docs/media-understanding) and the checked-in API reference.

Zod validates every result, including length limits and plain text. The prompt asks for visible details only, acknowledges uncertainty, forbids identifying people or inferring sensitive traits, and excludes scores, emojis, hashtags, marketing language and fabricated events. Hangout title/venue are optional context; no profiles, friend data, locations or calendar data are included. Permission is freshly rechecked after inference before returning the private result.

Vision uses `sensitive: true`: no development response cache, no image/result content in run logs, and provider-error text is replaced with a generic safe failure. Credentials remain server-side. Missing-key/explicit mock mode returns a labelled offline response with **no invented observation or suggested caption**. A configured live failure does not silently become a simulated success.

Timeouts and cancellation propagate through the existing adapter. Analysis cannot delay or undo saving because it requires a successfully persisted memory ID and never writes a photo or caption.

## Explicit caption acceptance

`PATCH /api/memories/:id { caption }` calls the existing DataStore/Backend to update only the caption on that record. It validates the caption length, uploader and crew access. It does not upload, insert, publish, join a hangout or change sharing. Other crew members receive the existing ID-only `memory` broadcast; the client helper notifies the uploader's existing `outhere:memory-saved` listener.

Both analysis and caption responses use `private, no-store`. User-edited captions remain text, not HTML. Generated captions are suggestions until an explicit accept/edit action calls PATCH.

## Reusable client and animation integration

Public client exports live in `features/muse-vision`:

- `usePhotoAnalysis(memoryId)`: `analyze`, `cancel`, `accept`, `result`, `pending`, `error`. It does not analyze on mount. New photo selection, persona changes, pagehide and unmount cancel pending work; stale results cannot overwrite the current photo.
- `requestPhotoAnalysis(memoryId, { signal, photo?, focus? })`: sends the saved ID and explicit consent; starts the DOM scan after starting the request; validates ID/mode/result; owns a request lease in the existing companion controller. Direct helper callers also get persona/stale-result protection.
- `savePhotoCaption(memoryId, caption, signal?)`: explicit same-record update; never inserts a second photo.
- `startPhotoScan(photoElement, signal)`: a thin, low-opacity cyan scan over the DOM image; no detected-object labels, borders, photo modification or WebGL image content. Reduced motion disables it. Resize/scroll listeners, observer, animation and overlay are removed on completion, cancellation or removal.
- `transitionSavedPhoto(source, destination, signal?)`: short transform/opacity transition after successful saving. A missing destination uses a gentle fade; reduced motion skips it. It cannot save or navigate, and must not gate persistence or rating navigation.
- `photoFocusBearing(originScreenPoint, photoRect, cameraBearing)`: orientation input for an adapter in the existing world loop; no camera or renderer is created.

The companion's existing controller owns the photo request lease, reusing `evaluating`/thinking and a brief `celebrating` response. Chat/agent requests cannot compete for that lease; opening chat or navigation cancels it. Existing clips, state machine, GLB and renderer are preserved.

**Not wired into production UI yet:** Jolly's exact photo-facing pose, photo-local renderer wisps, the suggestion/accept UI, and capture-to-Memories transition. The lease currently exposes the existing Phase 3 processing signal; the renderer owner must keep photo processing localized rather than adding another orb. DOM helper tests are not evidence that these effects are installed in ArrivalSelfie.

## Required integration after Claude's cleanup

The latest `origin/main` has photo flow code newer than the Phase 5 baseline. Inspect it at integration time; do not replace its components with this worktree's older copies.

1. In the current `MemoryCapture`/`ArrivalSelfie`, get the saved `Memory` through **`onMemory(memory)` after the upload succeeds**. Never start from legacy `onSaved(crewId)`, which fires before the photo POST succeeds. Keep the existing successful save and `emitMemorySaved` behavior first.
2. Reuse the existing caption action in the saved-photo view. An explicit user action calls `analyze(savedMemory.id)`, passing its existing `<img>` ref and an optional focus adapter. Do not auto-analyze on upload without a separate explicit user setting. Do not disable photo persistence while AI is pending.
3. Show one plain observation and one editable caption suggestion inside the existing flow. Read `mode`; offline results must remain labelled. Do not overwrite a user's draft as a delayed result arrives. Accept/edit calls `accept(caption)`; ignoring leaves the original caption unchanged.
4. Have the renderer owner connect `focus` to the **existing** World3D frame loop and pose/mixer. Reuse thinking/hover clips; preserve chat and agent priorities, avoid camera motion, and suppress a global photo-processing orb in favor of the localized scan/wisps. Do not create a new character controller, RAF or renderer.
5. After successful upload, use the existing image and memory destination refs for `transitionSavedPhoto`. If either view is unmounted, fade. Never await AI or an animation before saving, emitting `MEMORY_SAVED`, opening ratings or navigating. Preserve `requestRating({ questId, crewId, photoIds: [memory.id] })`.
6. Retest the combined cleanup + Phase 5 + Phase 6 result on desktop/mobile. Caption PATCH makes the existing memory event/refetch path usable without another gallery or storage mechanism.

## Verification and evidence

Installed skills read and used: `threejs-animation` and `threejs-webgl` for reuse of controller/clip behavior, orientation inputs and resource cleanup; `vercel-react-best-practices` for cancellable hooks and stale-result isolation; `web-design-guidelines` for reduced motion, hidden decorative DOM and keyboard-safe clones; `frontend-design` and `anti-slop-design` for preserving the existing presentation and a restrained effect; `deslop-copy` for grounded caption instructions; and `deslop-ui` for the focused scanner/visual audit. UI design guidance also informs the handoff; it is not a claim that Claude's components were redesigned. No skills or frameworks were installed.

- **Real image input tested:** one actual Spark Vision request used the existing generated `boba-and-sketch.webp` fixture after saving through the real private-photo endpoint. It observed notebooks, iced drinks, pens and a plant. It suggested “Sketching in notebooks over iced drinks at the table.” The caption remained unchanged until a later explicit PATCH; the album then displayed the edited caption. This was a backend/album demonstration, not an installed photo-flow AI interface.
- **382 unit tests pass**, including image protocol, model output validation, uploader/crew authorization, fresh permission revocation, cancellation, timeout, safe logging, no automatic edits/duplicate records, lease cleanup, rapid regeneration and direct-helper persona isolation. The existing text-only transport fixtures were narrowed for the new multimodal message type without changing their behavior.
- **Typecheck, lint and production build pass.** Relevant production/mock E2E: **13 passed, one existing mobile invite case skipped by its original test**. Includes the existing Your Plans/photo upload and Memories/regroup flows plus new saved-photo/caption/privacy cases. Mock tests do not count as real vision verification.
- A test-only React browser harness checked pending photo A → photo B, regeneration, rejection of late A results and persona-change cancellation, with no runtime errors. It is not an application route or new product UI.
- Browser DOM-effect checks at 1440 and 390 pixels verified scan cleanup and reduced motion. Actual album before/after screenshots are in `.verify/phase6/album-before-{1440,390}.png` and `album-after-{1440,390}.png`; helper screenshots in `scan-helper-{1440,390}.png`. A 1280-pixel album screenshot has no horizontal overflow. Screenshots were visually inspected; they show the preserved album, not Claude's unfinished cleanup.
- The slop scanner's one match is a **false positive** on the server's real 18-second model deadline, labelled “fake-countdown.” It is not user-visible urgency or a decorative timer. No UI cleanup changes were made to Claude's components.
- Source/client key scans found zero credential matches; the server log contained no base64 image content. All 39 original Phase 5 source hashes remain unchanged. No external database migration or deployment was performed.

## Files changed for Phase 6

- `src/features/muse/client.ts`: multimodal messages, vision model selection, sensitive logging/cache controls.
- `src/app/api/muse/caption/route.ts`: saved-photo branch; existing context-only path preserved.
- `src/features/muse-vision/{protocol,client,usePhotoAnalysis,presentation}.ts`, `server/{analysis,index}.ts`, and public client exports.
- `src/features/data/{core,store}.ts`: additive caption-update method on the existing memory table/backend.
- `src/app/api/memories/[id]/route.ts`: caption-only PATCH.
- `src/features/muse-companion/{controller,index}.ts`: photo request lease and public hooks, without UI or clip changes.
- New Vision/controller tests, `tests/e2e/muse-vision.spec.ts`, and three existing text-transport test narrowings.
- This guide and the Phase 6 progress entry.

## Limits

The existing app uses demo persona identity, not production login. User/quest context and the photo fixture are fictional demo data. Hosted Supabase caption updates have not been independently exercised against a real database; they use the existing backend update path and require no new table. The new UI wiring and combined visual pass deliberately wait for the UI/arrival owners. Nothing in this handoff claims that the full seamless interaction is installed before that integration.

# Claude camera/UI work integrated with Codex Muse

## Location and lineage

Final verification branch: `integration/claude-codex-verified`, worktree `/Users/ally/Github/out-here-verified`. Local preview: http://localhost:3113/out-here?as=alex&view=3d (MemoryStore and explicit Muse mock mode).

Codex base: `c2298eb` on `feature/muse-companion-overnight`. Claude source: `/Users/ally/Github/out-here-anim`, `feature/animations` at `840b31a`, including its nine unfinished tracked files. Those files were saved as a binary Git patch before integration; no environment files were read or copied. Earlier `feature/ui-cleanup` and `integration/ui-world` changes were already in the common ancestor and were not replaced with older versions.

Claude's seven unique commits were cherry-picked with their original authorship/co-author messages. Resolved equivalents: `d888f0f`, `f2cbad6`, `5954c2d`, `e247f3f`, `cc386c5`, `8b7e4c2`, `174366c`. The original Claude and Codex worktrees/branches were left intact.

During integration, active Claude processes added checkpoints `26bf074`, `e058760` and `50b8660` in the first combined worktree (`out-here-combined`, `integration/claude-camera-muse`). They include the recovered unfinished gestures, integration hardening, and one-at-a-time narration of returned results. Final verification moved to a separate snapshot at `50b8660` to avoid agents modifying the same files while testing. Further changes in the active combined worktree are outside this snapshot.

## What is combined

- Claude's closer walking perspective: zoom22.1, close pitch82°, maximum pitch85°, pinch limit23.2. Camera remains MapLibre's existing camera; same Three.js context/layer.
- Claude's slower approach and return, larger front-facing Muse conversation, smaller mobile chat sheet with internal scrolling, quieter map labels while chatting, and the existing model's Jolly portrait in the launcher/header.
- Grounded companion walking, soft contact shadow/platform glow, bounded64-point foot sparkles, and the recovered procedural gesture/mood work. The source GLB, rig and clips remain untouched; the performance follow-up samples complete fur strands at runtime. Procedural poses are not claimed to be new authored animation clips.
- One HTML thought cloud at a time. Pending content follows actual requests/agent events; completed narration uses only returned intent/friend/candidate/reason/bridge data. Reading-time transitions happen after the response; full cards are immediately available in chat. No fictional inference stages or hidden reasoning are exposed.
- Codex's foreground/background request ownership, cancellation/persona checks, stale-response protection, cache/mock/fallback distinctions, cross-surface statuses, responsive viewport measurement, manual camera priority, and existing blue/cyan processing trails.

## Integration fixes

Kept the responsive camera/keyboard measurement and animation ownership when conflicts overlapped the older camera implementation. Closing chat now records/restores the actual zoom, including when chat opens during the initial fly-in. The phone launcher stays clear of Up next's primary action.

A one-shot gesture no longer overwrites the companion's underlying stand/walk/processing state; gestures cannot steal a pending/photo request. Idle fidgets are restrained. Fixed reversed shader smoothstep edges and removed per-frame limb-key array allocation. Ground sparkles stop spawning when stationary, expire, stay bounded, disappear immediately under reduced motion, and dispose with their actor. Existing trails detach from the scene before disposal; a completed/faded processing phase no longer permanently suppresses the walking wake.

Map labels/markers that fade during chat also leave the keyboard tab order and restore on close. The thought anchor follows manual camera movement; cloud width adapts to narrow screens. The GLB’s old black thinking dots are hidden through the existing manifest hide-list so they do not duplicate the HTML thought cloud; the asset itself is unchanged. Reduced-motion behavior remains in the existing frame loop/controller.

## Verification

Initial integration unit result:569 passing tests across74 files, including state mappings, request ownership, model retry, thought provenance/stale-reply guards, particle bounds/expiry/disposal and existing product logic. Final typecheck/lint/build/browser results and local commit are appended below after the runs finish.

Evidence is local and ignored under `.verify/claude-merge/`. Camera/portrait screenshots were inspected at1440,1280,390; actual models loaded, no horizontal overflow or JS page errors in the capture run. A controlled delayed response exercises one pending cloud, disabled gesture interaction while pending, the portrait, one map canvas and marker focus restoration. Normal/reduced-motion walking→chat→map→3D and the existing photo/Marketplace/regroup lifecycle checks are run separately.

The visual test URL uses existing development `worldQA=1` to avoid a CPU-loaded headless browser triggering the existing slow-device fallback during screenshot assertions; the normal local preview retains that fallback. This is not a claim of physical mobile GPU performance. Live Muse/Supabase/physical mobile keyboards remain unverified; no credentials, paid inference, seed mutation, push, hosted deployment or main merge was used.

The source branch's unrelated baseline Vision permission-test mismatch documented in `MUSE_OVERNIGHT_HANDOFF.md` is not changed by this integration.

The first dev browser pass had15/16 checks pass; the cold crew-page timeout passed on warm rerun. The first production pass exposed external OpenFreeMap style DNS failure and an old test sampling the walking fly-in before its new22.1 zoom settled. Camera tests now use a clearly identified minimal map-background fixture; the actual app retains live style loading and its slow-device/network fallbacks. The updated restoration check waits for the configured walking view before opening chat.

## Integration checks before the performance follow-up

- 569/569 unit tests pass across74 files; typecheck passes; lint has zero errors (six pre-existing unused-variable warnings); production build passes.
- 16/16 targeted browser checks pass against isolated production3114, using the documented map-style fixture for camera assertions and explicit offline Muse responses. Desktop and phone cover the portrait, close-up, one pending cloud, focus cleanup, fast/delayed/error/cancelled requests, exact resting-view restoration, map/3D switching, reduced motion, Marketplace, regroup approval/cancellation and caption edit preservation.
- The source Claude unfinished patch still exactly matches its saved pre-merge snapshot, and the original Codex branch remainsc2298eb.
- Local development3113 remains running with hot reload; production3114 remains running. No push, hosted deployment, or main merge occurred.
- Final visual evidence: `.verify/claude-merge/final-{idle,chat,pending}-{1440,1280,390}.png`, `final-visual.json`, browser screenshots/traces/videos under `stable-production-tests/`. These use an offline map background to make layout repeatable; the ordinary preview uses the live map style.

## Follow-up: user reported lag and unstable camera

The user identified `localhost:3113` as laggy, with inconsistent camera changes on button clicks. The baseline profiler confirmed about 60 `easeTo` calls per second even while stationary. Chat also tracked the animated body centre: a two-second idle sample changed elevation by 0.149m on desktop and 0.258m on phone. Reply-panel height fed back into composition and model scale.

The camera now uses the authored rest-pose body centre and reserved conversation footprint. Ordinary typing, gestures, pending state and returned results share one shot; keyboard/viewport changes still reframe it, and real encounters retain their wider shot. Conversation pitch is 60° with bounded phone scale; walking retains Claude's 82° view. Closing restores the captured view, including its pitch. Manual camera ownership and reduced motion stay within the existing frame loop. Unchanged camera targets no longer call MapLibre on every frame.

Rendering changes preserve the same asset and shared WebGL context. Runtime fur geometry keeps one complete authored strand out of four, after checking the topology. It owns and disposes its buffers; the cached original geometry is unchanged. This removes 351,000 triangles per Muse (75% of the fibers). In the final instrumented scene the character pass draws about 347,000 triangles. 3D pixel density is capped at 1.5 and restored on exit. At the tested phone density of 2.625 this cuts canvas pixels by about 67%; HTML text retains native density.

Final two-second samples on desktop and 390px phone show zero camera/elevation writes and zero elevation drift in stationary walking, chat and pending states. Both before and after headless samples were near 60fps, so this demonstrates reduced work and stable camera behavior, not a measured physical-phone frame-rate gain. The map-background fixture deliberately excludes tile/network variance. Evidence: `.verify/camera-performance/{before,final}.json`, production screenshots and test logs in that directory.

Unit tests: 571/571 across 74 files. Typecheck and production build pass. Lint has zero errors and six pre-existing warnings. Development browser checks: 12/12, including a new regression through typing, gestures, delayed requests, results and restoration, desktop/phone, and reduced motion. Production browser checks: 18/18 pass, including request ownership, Marketplace/regroup/caption lifecycles, phone/desktop and reduced motion. Production screenshots have one cloud, no overflow and no page/console errors.

Port3113 now serves the tested optimized production build from `.verify/performance-build` with `OUTHERE_STORE=memory MUSE_MOCK=1`; refresh an existing development tab once. Port3114 serves the same build as a verification mirror. Hot reload was available on3113 throughout implementation; the final preview removes development compilation overhead. No hosted deployment, push or main merge. Original worktrees remain intact.

## Sync: Claude's later work merged with the Codex verified branch (06:45 Fri)

`integration/claude-camera-muse` (worktree `out-here-combined`) now contains `integration/claude-codex-verified` (f5a444c, the camera stability and render-cost pass) merged as `e4e510f`, plus three Claude commits that were after the `50b8660` snapshot:

- `50b8660` (already in the snapshot): narration is a sequence of returned facts (intent, free friends, plans checked, the pick, Muse's reason and bridge), one cloud at a time, held for reading time.
- `303b2d4`: leaving 3D, Jolly flies from his last screen position to a docked, hovering Jolly at the side of the map (`useMuseInWorld`, `setMuseDockFrom`/`takeMuseDockFrom`). In 3D the launcher stays the pill.
- `189b9e7`: Muse on the 2D map while the chat is open (`src/features/map/MuseMapLayer.tsx`). The narration moved to `muse-companion` (`thought-line.ts`, `commentary.ts`, `useMuseCommentary`) and each thought carries a focus; the map lights rings on free friends and checked plans, tags dropped plans with the planner's own reason, and Jolly hops to each. A real agent encounter shows the friend's Muse over their pin with each sent/received message as an orb; `attachMuseWorld('map')` keeps a finished encounter visible 4.5 s (only `'world'` owners count for `useMuseInWorld`). `useFreeFriendNudge` + `showMuseNudge`: a friend newly sharing "I'm free" (live via `user:<id>`) makes the docked Jolly offer "Ask <name>'s Muse". Plan `meta.friendsFree` now carries `friendId` (guard test updated; suggestions already carried friendIds).

Checks on the merge: typecheck, lint 0 errors (6 old warnings), 572/572 unit tests, production build. Browser checks for the map work ran at 1440 and 390 against a production server in MemoryStore + mock mode with no page or console errors. Not run: Playwright e2e on this merge, live Muse, Supabase.

Next (Claude): the "I'm free" flow becomes a Muse-led view (Muse front and centre, the real pipeline steps and decisions shown as they happen) instead of the chatbot.

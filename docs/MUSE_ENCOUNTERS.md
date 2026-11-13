# Phase 4: physical Muse encounters

## Integration status

The visual phase is implemented on `feature/muse-agent-encounters`, preserving the earlier uncommitted Phase 3/chat-camera work in the same isolated `out-here-phase3` worktree. No commit, push, or merge was made.

**Production friend-agent transport is not connected.** The user will build it after this phase. The existing plan pipeline reads shared availability; that is not a genuine exchange between personal agents. An Intro-specific dialogue exists separately on `origin/overnight` (`src/features/intros/server/agents.ts`), but it is not on this branch and its matchmaking/consent workflow was not merged or repurposed.

Ordinary production chat continues using the existing Muse plan API. Mentioning a friend does not secretly contact them or trigger a fictional conversation.

## Preview

Keep the current development server running, then open:

`http://localhost:3123/out-here?as=alex&view=3d&encounterDemo=1`

Open the existing Muse chat and send `Is Maya free to get food?`. The recipient is resolved from the actual viewer-authorized `/api/friends` result. Unknown or ambiguous names show an error in the existing chat. The header and pending text explicitly label the interaction as a simulation; the final response says that no message was sent and availability was not checked.

The demo emits one simulated outgoing message and one simulated reply. It does not call Muse, send a message, send an invitation, or fetch a friend's private location. Staging positions are illustrative, near the viewer, rather than claims about the recipient's whereabouts. The flag and simulation transport are rejected outside development.

Existing Close/Escape cancels; navigating cleans up. Dragging/rotating the map dismisses the cinematic and cancels the request. No new permanent control, panel, dashboard, contextual orb, or navigation item was added. Draft input and conversation history remain in the existing chat.

## Architecture and files

- `src/features/muse-companion/encounter.ts`: typed transport/events/result contract and explicitly gated development simulation.
- `src/features/muse-companion/controller.ts`: the existing authoritative store owns the request, abort signal, timeout, recipient, deduplicated ordered message facts, outcome, and cleanup. A concurrent request is refused. Stale completions cannot overwrite newer state.
- `src/features/muse-companion/MuseChat.tsx`: reuses the existing submit, status, result, and error UI. Simulation routing exists only with the development flag. Production submission is unchanged.
- `src/features/world/encounter-motion.ts`: pure interpolation of an accepted encounter's travel/meeting/return progress. It never emits backend facts or fabricates a reply.
- `src/features/world/World3D.tsx`: the existing frame loop places both companions, faces them toward one another, consumes the ordered message facts, frames the pair, and restores the existing chat close-up/previous walking camera. No extra RAF or renderer.
- `src/features/world/WorldLayer.ts`: creates at most one `muse:<recipientId>` peer using the existing model cache and scene; the peer has its own mixer and Phase 1 trail. Its cyan accents and deterministic trail seed differ subtly from Jolly's. Existing actors are not duplicated or removed if another owner supplied them.
- `src/features/world/muse-trail/MuseTrail.ts`: one brief curved pulse per transport message, reusing the existing ribbon geometry/shaders and bounded particle pool. No second message particle system. There are no fabricated pulses while a slow request waits.
- `src/features/world/characters.ts`: existing GLB geometry/materials remain shared safely; a disposed peer stops and uncaches its independent mixer. No source GLB edits.

Tests are in `encounter.test.ts`, `encounter-motion.test.ts`, and `tests/e2e/muse-encounter.spec.ts`, alongside the earlier processing/camera regression tests.

## Backend adapter to connect next

Exported through `@/features/muse-companion`: `sendAgentMessage(text, recipient, transport)`, `AgentTransport`, `AgentEvent`, and `AgentRecipient`.

`AgentTransport.run(text, recipientId, signal, emit)` must:

1. Authorize eligibility, identity, privacy, and any required consent on the server. The frontend contract is not an authorization boundary.
2. Emit `accepted` only when a real authorized request exists. No peer is created before acceptance.
3. Emit `sent` and `received` only for actual transport messages, using stable event IDs and the same recipient ID. Duplicates, mismatched recipients, and pre-acceptance messages are ignored. The bounded sequence accepts at most 128 facts per request.
4. Resolve with safe, user-visible text and `success`, `unavailable`, or `no_response`; reject on failures. No raw hidden reasoning or private calendar transcript belongs in the result.
5. Honor `AbortSignal`. The current controller timeout is 25 seconds; align it with the eventual service contract rather than inventing progress to cover latency.

The animation does not infer agreement. A response appears immediately on settlement; the visual return can finish afterward. Existing invitation/approval workflows remain required. If the service only returns a final result, emit only the actual request and final response, not synthetic intermediate turns.

## Motion and rendering

Both companions use eased curved paths with an altitude arc, then face each other and hover/talk using existing clips. They wait as long as the authorized request is pending. Actual message facts cause short flowing blue/cyan pulses in order, not a looping laser exchange. Errors and cancellation reverse the flight from its current progress without a success celebration. Fast results are shown immediately while a short coherent visual trip finishes.

The peer returns to its visual entry point and is removed; Jolly smoothly resumes its companion placement. Reduced motion skips the travel and pulse movement. Trail particle budgets, adaptive quality, resource disposal, and a single MapLibre/Three.js rendering infrastructure are retained.

## Verification and limits

347 unit tests, typechecking and lint pass. Desktop/mobile browser checks cover the labelled simulation, two actors during the encounter, no message/invitation/plan POSTs, actual final disclaimer, cancellation, and removal of the peer. All six targeted encounter and Phase 3 processing/chat-camera E2E checks pass across phone and desktop. Screenshots and test traces stay local under `.verify/phase4/` and `test-results/`.

A production build is checked in a temporary copy so the live development browser remains available. No application dependencies, model assets, database schema, or service credentials changed.

Remaining limitations: real multi-user backend delivery/events, real recipient unavailability/no-response outcomes, and real network integration are not exercised. Those outcomes are tested through the transport contract, not claimed as live service behavior. The current preview reuses the same Jolly asset for both users, with trail differentiation; no customization system or private-location journey was invented.
# Phase 5 integration

The backend described in [MUSE_AGENT_BACKEND.md](MUSE_AGENT_BACKEND.md) now drives ordinary named-friend coordination. The earlier Phase 4 notes describe the development-only visual simulation, which remains explicitly gated and labelled.

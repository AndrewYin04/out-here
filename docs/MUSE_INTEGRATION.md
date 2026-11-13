# Muse integration, Phase 7

Worktree: `out-here-integration`, branch `feature/muse-integration`. This branch starts at `0faf935` plus all 59 source/document files containing the uncommitted Phases 3–6 work. The original Phase 5 and Phase 6 worktrees are preserved. No secrets were copied, no source models changed, and no commits, pushes, merges or deployments were made.

## What works

- Phase 1: platform halo and bounded cyan/blue energy wakes use the same MapLibre WebGL context and Three.js custom layer.
- Phase 2: one companion controller drives chat, follow, approach, response and independent avatar playback. Chat camera targets Muse, then restores the walking camera.
- Phase 3: genuine planner processing drives the existing thinking effect. Success releases toward the existing response; failures/cancellation fade. No contextual mini-orbs.
- Phase 4: the second Muse travels, faces the owner and returns in the same scene. Speaking and directional pulses are queued from actual `sent`/`received` events. An accepted session alone does not invent conversation.
- Phase 5: two server-side Muse agents, separate prompts and authorized context, SSE transport, bounded replay, idempotency and an owner-scoped ledger. Supported participants are accepted friends, including Alex and Maya. A shared free window is not consent; the existing invite workflow still requires explicit approval.
- Phase 6: a saved private photo can be explicitly sent to Muse Vision; the real image bytes are authorized, resized and metadata stripped server-side. The user can edit and save a caption on the same memory. A failed model request does not lose the uploaded photo.
- Phase 7: the current map arrival and past-plan photo capture now use the real saved-photo review UI. Walk to a joined, started plan, save a photo, ask Muse, edit/save the caption, open its existing crew album and return to the map.

## Reliability and transitions

Completed encounters no longer lock the 2D chat waiting for a missing world renderer. Detaching a world releases visual ownership without pretending the request failed. Cancelling a photo emits even if chat was already closed; intentional preemption does not display a false failure. Persona changes clear stale planning state. Uploads and caption edits are abortable and bound to the initiating persona; delayed private results cannot publish after ownership changes.

A recipient's speaking pose persists through its actual message pulse instead of being overwritten on the next frame. Facing interpolates along the shortest angle. Swapping placeholder characters for loaded models preserves pose, active state, shadow and trail history. Source GLB clips and independent avatar playback are retained.

Photo analysis uses the existing Muse actor and a lightweight DOM scan over the saved photo. Its overlay sits above the owning modal, tracks resize/scroll and is removed on abort/unmount. Reduced motion disables the scan and photo transition. Global processing filaments are suppressed during the photo scan. Arrival capture keeps a quest snapshot after completion removes that quest from the live map, and is not discarded by automatic slow-render fallback while open.

Closing chat retains its established explicit cancellation behavior. Dashboard minimization uses the distinct non-cancelling API below. Navigation still invalidates pending work rather than carrying a stale request into another page.

## Dashboard integration contract

Claude's `feature/ui-cleanup` worktree was audited read-only, at `2fdfaef` during initial inspection. Its consolidated dashboard is not in this branch. Do not merge unfinished UI or implement a second dashboard.

The dashboard owner can import these from `@/features/muse-companion`:

```ts
setMuseViewport({
  level: 'partial', // collapsed | partial | expanded
  occlusion: dashboardElement.getBoundingClientRect(),
});
minimizeChat(); // hides conversation, preserves pending backend work
```

Pass viewport coordinates in CSS pixels after a dashboard snap, resize or layout change. Clear `occlusion` on collapse/unmount. The map camera combines this rectangle with the existing conversation rectangle and keeps Muse in the remaining area. A fully occluded map does not attempt to reframe through the panel. This adapter does not control dashboard navigation or create controls. The level is a semantic hook; camera framing currently uses actual occlusion.

`MemoryCapture` optionally calls `onMemory(memory)` after upload succeeds. Reuse `SavedPhotoReview` in the dashboard's existing photo surface, rather than creating another gallery. The current `ArrivalSelfie` is the existing Modal primitive, not a dashboard replacement. A cancelable `outhere:open-selfie` event with `detail: questId` opens it only for a joined, visible plan. `outhere:memory-saved` refreshes the existing albums. `outhere:rate-hangout` emits `{questId, crewId, photoIds}`; the rating owner must handle and preventDefault it. No rating questionnaire is recreated here.

## Performance findings

The existing `public/models/muse-companion.glb` is 32,196,824 bytes (30.7 MiB). The default Muse subtree has 434,212 vertices / 711,366 triangles across 24 primitives; fur accounts for 312,000 vertices / 468,000 triangles. Embedded images total 7,360,736 bytes. No Draco or Meshopt compression is declared, and historical nodes remain outside the default scene. These counts establish a substantial mobile loading/rendering risk; they are not a measured device frame-rate attribution.

Safe runtime changes cache the constant map/model transform and reduced-motion media query, update only the animated effect body's ancestors when querying its world centre, skip hidden character mixer updates, and enable frustum culling for static character meshes while preserving skinned bounds behavior. The existing shared loader, trail budgets/adaptive quality and resource cleanup remain in place. No renderer or animation system was added.

A subsequent asset-owned optimization should produce a derived web export: prune unreachable history, decimate/rebuild fur LODs, resize textures and apply Meshopt/KTX2 where the existing loader supports it. Compare every view and exact animation clip before switching assets. Retain the detailed Blender original. Compression alone will not reduce triangle workload. This phase does not alter the model or add loader dependencies.

## Supported demo versus team blockers

The current backend supports Alex↔Maya accepted-friend coordination. It does not implement the canonical Alex↔Jordan stranger introduction, trust-path vetting or double opt-in into Muse chat. Those remain the separate team intro flow. A supported, active meetup is used for arrival tests; a future open house cannot be completed early in this baseline. Joining/confirming a plan and authorizing an invitation remain explicit existing actions, never inferred from an agent reply.

The dashboard, full post-hangout rating handler and live cross-device walking positions require the corresponding teammate integrations. Current movement is a local demonstration or device GPS, not shared server movement. Browser tests use the project’s seeded demo personas and MemoryStore; this is not verification of production authentication or deployed Supabase migration `0007`. Development encounter simulation is opt-in (`encounterDemo=1` in development only); offline model runs are visibly labeled and do not claim real inference.

## Files changed in Phase 7

- `muse-companion/controller.ts`, `state.ts`, `MuseChat.tsx`, `index.ts`: ownership, cancellation, dashboard adapter and terminal-state release.
- `muse-vision/client.ts`, `usePhotoAnalysis.ts`, `presentation.ts`: saved-photo targeting, cancellation/timeout handling, caption write lifetime and overlay stacking.
- `memories/MemoryCapture.tsx`, new `SavedPhotoReview.tsx`, new `ArrivalSelfie.tsx`, `MemoriesPage.tsx`, `index.ts`: actual upload-first photo journey and album refresh.
- `world/World3D.tsx`, `WorldLayer.ts`, `characters.ts`, new `muse-layout.ts`: scene continuity, camera occlusion, photo orientation, message timing and safe performance fixes.
- Focused unit and Playwright tests, this handoff and progress notes. Other uncommitted files on this branch are preserved Phases 3–6 work, not all new Phase 7 changes.

## Verification

Results and visual evidence are recorded after final checks below. Verification artifacts are local under `.verify/phase7/`, intentionally excluded from the repository.

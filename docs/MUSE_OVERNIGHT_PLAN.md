# Muse companion overnight plan

Branch: `feature/muse-companion-overnight` from `origin/main@7a21247`. Isolated worktree: `/Users/ally/Github/out-here-muse-overnight`. Issue #82. Local preview `http://localhost:3107/out-here?as=alex&view=3d` uses explicit Muse mocks and MemoryStore, no credentials copied. Handoff target Friday November 13, 2026 at 05:40 Pacific.

## Design direction
Young adults use the existing map to turn free time into a plan. The main action remains finding/joining a plan. Reuse the Facebook reference: blue #0866FF, cyan #23D9F5 only in companion effects, white #FFFFFF surfaces, #F2F4F7 wash, #080809 text, #65686C secondary. Existing Segoe/Helvetica/Arial typography, 15px body and 13px contextual text; existing card/button/sheet tokens stay intact. Muse carries expression beside the scene; chat brings the same character forward and leaves the skater separately readable. Short bubbles attach to the active character or the existing result surface.

## Work and ownership
- [x] Safe worktree, latest-main inventory, team claim, installed skill reading, local development preview.
- [x] Lead: extend existing companion controller with request identity, owner/source/target, priority, cancellation, stale completion rejection, cache-aware acknowledgement.
- [x] Lead: map filtering, plan composer, quest and alternative drafting, shared planning integration.
- [x] UI integration specialist: caption/regroup/takeaway/Marketplace, real orb state, inline accessible status, inference inventory.
- [x] Rendering specialist: existing trail paths/filaments/particles, reduced motion and bounds.
- [x] Character/camera specialist: lateral staging, viewport/sheet/keyboard framing, manual camera respect, existing clips.
- [x] Independent engineering review and fixes.
- [x] Specialist and lead visual review at1440/1280/390, two personas, timing/failures/navigation/reduced motion; independent UX reviewer interrupted by session usage limit, lead completed captures.
- [x] Unit/typecheck/lint/production build and scoped end-to-end tests; legacy Vision permission assertion mismatch documented.
- [x] Local milestone commits, final evidence and limitations, keep local app running.

## Current verification
Final unit suite:560 passed; new surface browser tests6/6; fresh production integration8/8; planner API6/6. Initial typecheck passes; lint has zero errors and pre-existing warnings. Browser fixture suite running; rendered evidence under `.verify/muse-overnight/`. Production build running. These are offline/controlled fixtures, separate from any live service verification.

No model/rig/assets, new renderer, dependencies, prompts, permissions, seed database or deployments are changed. No push, hosted deploy or merge is authorized.

# Muse companion local handoff

Friday November 13, 2026, Pacific. Branch `feature/muse-companion-overnight`, worktree `/Users/ally/Github/out-here-muse-overnight`, base `origin/main@7a21247`, team issue #82. Local commits are recorded below after verification.

## Open the work

Live development preview: http://localhost:3107/out-here?as=alex&view=3d (hot reload). Isolated production verification preview: http://localhost:3109/out-here?as=alex&view=3d. Both use `MUSE_MOCK=1` and the in-process MemoryStore. These are local fixtures, not live Muse claims. Leave both running for morning review. The starting workspace and every teammate worktree are unchanged.

## Implemented

The existing controller now owns cancellable request leases with request id, surface owner, source, presentation target, foreground/background priority and real outcome. Foreground interaction supersedes quiet presentation without cancelling another surface's fetch. Chat owns its character; stale completions cannot steal it. Settled acknowledgements release immediately on surface cleanup. Empty/error/cancel/mock/cache results do not imply live inference success.

Map filtering, planner, alternate drafts, quest drafts, group openings, context captions, crew regrouping, saved-rating takeaways and Marketplace recommendations use that controller. One short HTML acknowledgement appears beside the existing result or projected from the existing character, with durable results/errors kept in their original surfaces. Existing Vision consent, saved-photo scan, explicit caption acceptance and encounter transport remain intact. Context captions explicitly name title/venue input; editing preserves and labels the user's words. Marketplace uses fresh authorized data reads and rejects stale persona results. Fictional planner/Marketplace/group-load stage progress was removed.

Muse stages laterally from the skater in camera space. Chat measures actual panel, dashboard and visual viewport, adapts its framing and yields to manual camera gestures. Hidden authoring bubble geometry no longer lifts HTML labels. Existing model/rig/clips/scales and renderer remain unchanged. A failed cache-backed GLB download gets one no-store retry, shared between avatar and pet; this avoids a browser cache-write failure leaving the placeholder.

Existing blue/cyan effects now use asymmetric open streams below/behind the face, tapered filaments, bounded particles and immediate stationary emission stop. Reduced-motion toggles restore quality correctly and suppress moving effects. Hot-loop offset/parameter objects are reused. No renderer, context, dependency, competing loop or model asset was added.

Full route trace and inference/cache/database distinctions: `docs/MUSE_OVERNIGHT_AI_INVENTORY.md`.

## Evidence and checks

- Final full unit suite: **560 passed across72 files**. Loader retry and companion regression subset:37 passed.
- Typecheck passed; lint zero errors with six existing unused-variable warnings. Isolated production build passed; final minor launcher position changed after that build.
- Planner API smoke:6 passed across desktop and phone.
- New surface lifecycle suite:6 passed at1440 and390, including Marketplace pending/failure/retry/cached-empty/navigation, regroup approval/cancel, and context caption preserving edits.
- Integration rerun:7 passed,3 failed. One mobile photo setup exhausted the shared fixture server's daily quest-host cap after repeated tests. Two existing Vision tests expect404 for an unauthorized caption PATCH; the current main-derived backend returns403 for non-crew access, and grants caption edits to crew members. This branch did not change those permissions. Fresh isolated production rerun: **8/8 passed** across desktop and phone, covering encounters→ordinary chat, saved-photo cancel/retry/manual edits, processing error/cancel and camera restoration. This confirms the earlier mobile setup failure was accumulated fixture state, not a product permission change.
- Visual captures inspected at1440,1280,390: `.verify/muse-overnight/final-{map,chat}-{width}.png`; all three actual models ready, no page errors or horizontal overflow (`final-visual.json`). Earlier placeholder/blank-map debugging captures are not final evidence.
- Energy evidence: `energy-{idle,pending,reduced}-{1440,1280,390}.png`, `energy-lifecycle-1280.webm`, `energy-observations.json` in the same directory. Headless lab measured58–60fps, maximum3 mesh draws, walk pool40 particles, settled/reduced particles0. CPU update ~0.032–0.071ms versus baseline~0.032–0.055ms; no meaningful performance improvement is established and this is not a phone benchmark.
- Scoped design scanner:0 findings. Existing quest symbols and required Muse attribution were preserved. Browser controls keep the Facebook tokens/navigation; mobile launcher moved clear of Up next's primary action.
- Engineering review found/fixed post-completion abort cleanup, delayed Together persona race, stale Marketplace reads and fictional group-load stages. Reviewers did not edit builder files.

## Skills actually applied

Project-installed `threejs-webgl`, `threejs-animation`, `threejs-shaders`, `threejs-loaders`, `anti-slop-design`, `frontend-design`, `deslop-ui`, `deslop-copy`, `vercel-react-best-practices` (folder `react-best-practices`) and `web-design-guidelines`; relevant detailed references and fresh Vercel guidelines were read. `chunked-explaining` guided chat updates. Blender was unnecessary because assets were preserved. No requested implementation skill was unavailable.

## Remaining limits

Live Muse, real cached-service responses, hosted Supabase, a physical mobile keyboard and the full wider end-to-end suite are not verified. Controlled fixtures cover timing/cancellation and render integration without repeated paid calls. Real/model gesture limits remain those of the supplied clips; no new gesture was claimed. Teammate commits merged after session start are not incorporated. No push, PR, hosted deployment, merge or database migration was performed. The existing broader suite has baseline failures; this handoff does not claim all acceptance gates green.

Evidence/build output remains ignored locally under `.verify/`; it is intentionally uncommitted. Source and repository documentation are committed locally at handoff. No secrets or reference photos were included.

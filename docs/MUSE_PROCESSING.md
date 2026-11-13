# Muse request processing energy (Phase 3)

Implemented on `feature/muse-thinking-energy` in the isolated `out-here-phase3` worktree, based on Phase 2 commit `0faf935`. That branch already includes Phase 1 commits `318d009` and `6f86dde`. No branches were merged, pushed, or committed during this work.

## Behavior

Sending from the existing Muse chat starts the existing `/api/muse/plan` request and puts the existing companion controller into thinking. Its request-scoped `energy` signal drives the effect; typing, opening chat, navigation, and ordinary walking do not start the processing swirl.

The pending effect has a roughly 450 ms entrance and continues until that request settles. A live-source response unravels the energy toward the newest existing response container over roughly 450 ms while that container reveals over 350 ms. Response content is immediately available; there is no artificial processing delay. Mock/fallback responses fade instead of receiving the success effect. Failures fade and use the existing chat error/retry presentation.

Closing chat, clearing it, changing persona, or navigating aborts/invalidate the request. Stale completions cannot overwrite a newer request or trigger a success effect. The controller remains the sole owner of animation state; the trail class owns only its visual entrance/exit envelope.

The effect reuses Phase 1's ribbon geometry, materials, shader palette, four walk-style filaments, glow, and bounded particle pool. The same three draw calls and existing MapLibre/Three.js frame loop are used. There is no second particle system, renderer, Jolly instance, interactive orb, context icon, menu, or new control.

Energy follows the actual animated `Muse_Body` world center, excluding hidden speech-bubble bounds. Opening chat now smoothly zooms the existing MapLibre camera toward the animated body center and its actual elevation. Desktop frames Jolly in the space beside chat; mobile adapts its close-up to the space above the growing sheet. Closing chat restores the previous camera center, zoom, bearing, and elevation. Reduced motion retains the stationary glow and fades, without orbital ribbons, sparks, or result movement. The pre-existing small chat/launcher icon stays static rather than duplicating the processing animation.

No model assets, animation clips, dependencies, backend endpoints, or credentials changed.

## Verification

- 338 unit tests pass, including request cancellation, stale replies, delayed requests, failure/mock fading, unchanged trail geometry/budgets, reduced motion, result targeting, and animated body anchoring.
- Typechecking and lint pass.
- Production build passes (local MemoryStore/mock mode).
- The new `tests/e2e/muse-processing.spec.ts` passes on phone and desktop: pending request, existing recommendation card, View on Map, failure, and cancellation. Browser responses are controlled fixtures, not claims of live Muse output. No JavaScript page errors were observed.
- Visual checks cover desktop/mobile chat, the actual map effect, and the existing development trail lab with pending, faded, and reduced-motion views. Screenshots are local under `.verify/phase3/` and `test-results/muse-processing-*/`.
- The installed Playwright package expected Chromium build 1254, while this Mac has build 1248. Tests used that existing executable through an ignored local config at `.verify/phase3/playwright.config.ts`; no browser or dependency was installed.

A live Muse model call was not made. The standard wider end-to-end suite was not rerun; verification targets this request/animation integration. The existing Map/3D toggle can be covered by the composer in this branch; visual checks entered through its existing `?view=3d` URL rather than changing unrelated controls.

## Local preview

Serve this worktree, not `muse-ui`: `MUSE_MOCK=1 npm run start -- -p 3123` after building. Open `/out-here?as=alex&view=3d`. Mock mode is for offline development; a real end-to-end Muse service check still requires the project's existing authorized live environment. Do not copy credentials into this worktree.

Chat camera checks: desktop/mobile screenshots are in `.verify/phase3/chat-camera-1440.png` and `chat-camera-390.png`. Four targeted E2E checks pass across desktop and phone, including close-up zoom and restoration; no model or animation clips changed.

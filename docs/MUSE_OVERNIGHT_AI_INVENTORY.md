# Muse companion AI inventory

Verified against origin/main `7a21247` and the local overnight branch on 2026-11-13. This is an implementation trace, not a claim that paid inference was exercised for every route.

## Memories and photos

### Saved-photo analysis: `POST /api/muse/caption` with `memoryId`, `consent: true`

The existing `muse-vision/client.ts` flow starts only after a saved memory exists and explicit analysis intent is given. The server authorizes the saved photo and sends image content to Muse Vision. This is actual image analysis, unlike the context caption below. Its existing photo lease drives evaluating/celebration, projected photo target, and scan presentation; saved caption changes still require explicit accept/edit. Abort, timeout, persona change, and stale memory-id checks remain in place. Private analysis does not write image output/provider errors into general run logs or disk cache. Existing mocked photo results are separately labelled offline.

### Context caption: `POST /api/muse/caption` with `questId`

`MemoryPage.tsx` asks for a caption on the memory page. Only title and venue are supplied to the model. The server checks attendance and that the hangout has ended; this is text generation, not photo inspection. The client now identifies this input context in the story label and in the companion acknowledgement. It starts an abortable background presentation lease, fills the existing story only when that field is empty, and leaves editing/saving with the user. Stable quest identity prevents refetching inference merely because crew/member object references changed. Failure leaves a persistent explanation and manual writing available.

### Crew regrouping: `GET` and `POST /api/muse/regroup`

`MemoriesPage.tsx` uses GET for ordinary authorized crew metadata, member cards and thread ids; GET performs no inference and drives no processing animation. User-click POST reads existing shared interests, visible availability, status bubbles, nearby candidates, and the viewer's own ratings. Muse chooses from these candidates and code validates the quest id. Excluded people remain excluded. The returned suggestion appears in the existing crew card; sending to the crew or inviting friends remains a distinct user action. A foreground lease now follows the POST and settles with a short reminder that the crew has not yet agreed. Navigation aborts the request and releases its presentation.

### Post-hangout takeaway: `POST /api/muse/rating-takeaway`

`RateHangout.tsx` invokes this only after the rating save succeeds. Muse writes from the viewer's saved answers and permitted past-hangout facts; code checks mentioned people/counts. A deterministic fallback template is shown without Muse attribution when inference or validation fails. Mock output now says Offline summary rather than being attributed as live Muse. The existing done-screen note remains the durable output. The request/presentation cancel on modal unmount, and late save/read completions do not update an unmounted questionnaire.

## Marketplace

### Watch-history picks: `GET /api/muse/marketplace-picks`

`MarketplaceForYou.tsx` is the visible surface. Server code reads the viewer's own watch history, derives topics with Muse, matches listings, generates explanations and validates listing/video ids and numbers. An in-process cache can return previously generated picks; the shared Muse adapter can also return cached generation. Response source distinguishes Muse, mock, and deterministic fallback. The page now has a single honest pending line while the actual request is pending, replacing staged loading text that implied unreported backend progress. A background presentation lease follows the request; foreground work can take presentation priority without cancelling the page's fetch. Abort and persona checks protect navigation/reloads; errors offer retry and existing picks remain readable. No-result text no longer claims Muse is continuously looking after a request has ended.

### Preferences and matches: `/api/muse/wants` and `/api/muse/finds`

Server routes and `features/muse/finds.ts` exist. `parseWant` uses inference for text-to-preference parsing (with a deterministic mock/fallback and numeric validation). Listing matching is deterministic keyword, budget, drive-time and pickup-window filtering. `explainFind` uses inference for a validated explanation of an existing match. Repository search found no browser UI caller to these route strings. They remain backend-only; this work does not invent a new preference surface solely to animate them.

## Presentation rules

There is one controller and one request-scoped presentation owner. Surface requests continue independently when a presentation lease is denied or preempted. A short inline `MuseActivityStatus` appears only for the matching owner and when chat is closed; full results/errors remain in their existing containers. The world avoids a duplicate projected bubble when an inline owner is visible. The launcher and chat header orb read actual controller state rather than always displaying idle. Mock/fallback responses do not emit live success energy.

## Verification status

Implementation checks and controlled-browser fixture evidence are recorded in the final handoff. Live inference, cache behavior, consent, and two-persona flows must be reported separately from deterministic local fixtures.

## Map, planning and coordination

- `/api/muse/filter`: `features/outhere/filter-state.ts` → POST → visible Friends/Explore pins, retained explanations and result count. Server ranks via Muse with code validation; response reports live/mock, fallback and cache. A cancellable foreground lease lasts only through the request; switching mode/ask, switching the filter off, navigation and persona changes reject stale results. The existing 600ms typing debounce is before the request and never pretends inference started.
- `/api/muse/plan`: existing chat controller and `PlanSheet` call the same planner. Parsing/ranking uses Muse or its generated-result cache; candidate generation, travel/time validation and seat checks are deterministic. Result cards render immediately. Empty, mock/fallback and cached rank responses avoid the live success burst. The composer now releases on close and checks captured persona before presenting a response. Availability writes remain ordinary database work, separate from planning.
- `/api/muse/draft-hang`: `DraftHangCard` requests a draft and alternate ideas. Inference proposes the draft; code validates place/friend/time facts. It now cancels superseded/unmounted requests and acknowledges empty/failure separately. The host still presses Make this plan before a quest/invite is created; an invite never means the friend agreed.
- `/api/muse/create-quest`: existing `CreatePlanSheet` fills a draft from text. It owns a cancellable request lease and is keyed by persona. The response moves the existing draft pin and fills the existing form. Nothing is posted until the host presses Post. Mock/fallback mode stays labelled.
- `/api/together`: GET and GET-by-id retrieve shared records. POST can retrieve the group's existing open plan, await an existing in-flight open, or invoke the planner and create a proposal. Deterministic checks enforce seats and shared windows. The POST lease says it is looking for group options and never claims consent; without inference provenance on this mixed route, it does not emit a live success burst. GET-by-id now says Loading your shared plan rather than cycling through fictional inference stages. Voting and confirmed joins remain the actual database/realtime events.
- Muse-to-Muse encounters: the existing backend transport/session/event routes, accepted/sent/received event accounting, timeout, outcome and cancellation flow remain in the controller. Existing development simulation stays explicitly gated. Character travel and message pulses still follow actual accepted/sent/received events, not timers invented as backend stages. Ordinary plan requests can start after a completed encounter, verified in desktop/mobile browser tests.

## Limits of this local verification

The baseline is the latest fetched main at session start (`7a21247`, 04:07 Pacific). Teammates merged additional work afterward; those branches and worktrees were preserved and were not merged here. In particular, later restored Marketplace map pickup/wants/finds UI is outside this baseline and must be reconciled by the team when integrating. The backend-only classification above refers to this branch, not those later teammate changes.

No live credentials were available in the starting workspace's `.env.local`; that file does not exist. No credentials were read/copied and no paid calls, production database mutations, seed resets, push or hosted deploy occurred. This preview uses explicit offline fixtures; delayed/error browser responses are controlled network fixtures. Real Muse, hosted Supabase and physical mobile keyboard behavior remain unverified in this run.

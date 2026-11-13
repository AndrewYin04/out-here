# 3D world visual overhaul

Isolated branch `feature/world-visual-overhaul` in `out-here-world`, carrying the preserved Muse Phases 1–7 integration baseline. Original integration and Claude worktrees remain untouched. No commits, pushes, source-character edits or production data changes.

## Diagnosis before implementation

The actual browser baseline was inspected at 1440×900 and 390×844 with the GLB loaded. Fixed camera centres, zooms, pitch and bearing are recorded with each image in `.verify/world/before/metrics.json`. Software-WebGL fallback is bypassed only by an explicit development-only `worldQA=1` flag so the same scene can be captured before and after. It is still active in ordinary use.

- `characterScale()` enlarges the avatar by 5–40×, and Muse by that factor plus its existing manifest adjustment. This makes ordinary map buildings look smaller than the character.
- `cityTheme.ts` compresses OSM height and base to 25% above zoom 19.6. `hq.ts` separately applies the same compression to detailed campus walls and lowers rooftop scenery. A 13.5m campus building becomes 3.375m while a 1.7m person becomes at least 8.5m.
- Both tree implementations scale a cylinder’s radius by `height * .9`, so its diameter becomes about 47% of tree height; the sharp icosahedron canopy reads as a green rock. Over 582 mapped campus trees amplify that error.
- Park grids and street segment restarts repeat spacing. Street trees lack cross-road/intersection clearance and all green classes are treated similarly.
- Green background plus near-white roads makes developed blocks, parking and grass hard to separate. Nearby OSM geography is present; the default scene has detailed campus footprints and 582 mapped trees. Empty areas should not be filled with invented buildings.
- Generated scenery is limited around the actor, even after the camera is panned to another area. Distant camera views can therefore lack vegetation despite loaded tile data.
- Ambient hemisphere intensity 2.2 plus white sun 1.6 washes out the Three.js scenery, while MapLibre uses a different white light direction/intensity. Lighting changes must cover both systems.
- MapLibre 6.18 extrusion opacity is per layer, not per feature. Feature-state alpha and RGBA building colours cannot implement selective transparency. Full-height buildings and safer camera framing are the initial solution; no permanent transparent city.

## Art direction

Young adults use this map to find nearby plans and walk with friends. The map and Muse remain the focus, with existing navigation and no new decorative UI. Palette: warm limestone buildings `#E5DDCA`, slate asphalt `#75828A`, ivory sidewalks `#EEE9DD`, sage lawns `#C9D7AC`, deep foliage `#527B54`, muted blue water `#91BEC8`. Directional warm daylight, cooler ambient fill, rounded clustered foliage and small restrained props. Real footprints and roads determine composition; no fictional city grid or random buildings.

## Skills and compatibility

Read the actual installed `threejs-webgl`, `threejs-animation` and its detailed guide, `blender-web-3d` export/scripting/performance references, `frontend-design`, `anti-slop-design`, `deslop-ui`, `web-design-guidelines`, and `vercel-react-best-practices`. There is no installed skill named `blender-web-pipeline`; `blender-web-3d` is the available equivalent. Three.js 0.186.1 and MapLibre 6.18.0 are retained. No R3F, WebGPU replacement, postprocessing renderer or new dependencies.

## Asset inspection

Supplied City Kit Roads 2.2, Suburban 2.0 and Commercial 2.1 archives were inspected; all include a CC0 license. Roads has actual `light-curved`, road pieces, signs and signals. Suburban has `tree-large`/`tree-small`, both narrow conifer shapes; it does not supply rounded deciduous crowns. Commercial’s fictional buildings will not replace geographic footprints. Quaternius Stylized Tree and Ultimate Stylized Nature packs were evaluated on their official CC0 pages, but shell download resolution is unavailable in this environment, so no uninspected asset is claimed as imported. The unrelated bento UI archive is not used for environment code.

`tools/world-assets/prepare_kenney.py` runs Blender in a fresh headless process, imports only selected GLBs and palette textures, moves their ground pivot to zero, normalizes height, bakes palette colours into vertex colours and exports static GLBs. No lights/cameras/animations or decoder dependency. Original archives and Muse files remain unchanged. Exact source hashes, bounds, triangle counts and runtime bytes are in `public/models/world/asset-report.json` with the supplied licenses.

## Implemented world scale

All geometry remains in the existing east/up/south metre frame and uses the original geographic coordinates. `characterScale()` is now 1 at every zoom. The authored skater and Muse GLB, materials, rig and animation clips are unchanged.

| Element | Current rendering scale | Notes |
|---|---|---|
| Skater/person | approximately 1.70m | source bounds 1.697m top, soles approximately 0.037m above root |
| Muse plush body | approximately 0.59m after existing manifest/root adjustments | source body approximately 0.504m, manifest pet 1.3 and root 0.9 retained; headphones/effects excluded |
| Muse follow hover | feet/platform approximately 0.8m above ground | body centre near chest height; follow offset 1.1m in the existing right/behind direction |
| Street trees | approximately 5.5–8m | trunks approximately 0.25–0.36m diameter, not height-scaled boulders |
| Park/wood trees | approximately 7–11m | clustered crowns, narrow evergreen and ornamental variants |
| Individually mapped campus trees |6–9m; rooftop trees 3.7–5.5m | positions are mapped; heights/species are inferred scenery, not surveyed tags |
| Campus office floors |4.5m per floor plus 1.1m parapet | a 3-floor campus building stays 13.5m high at every zoom |
| Other buildings | mapped `render_height`, default 8m, minimum 3.5m | mapped base preserved; no close-zoom compression |
| Kenney streetlight |6.5m | approximately 0.48m wide ×2.17m arm depth; ground pivot verified |
| Local/major/motorway road styling | approximately 5.5/8/12m | inferred class-based widths, real centreline geometry |
| Pedestrian path / curb treatment |1.7m path; approximately 1.1m edge treatment | stylistic widths, not an engineering survey |
| Event beacons and campus structures | existing metre geometry retained | coordinates and backend records unchanged |

At zooms below 18.2 the existing location marker takes over from the small 3D characters. Its opacity transition respects reduced motion; character geometry never inflates. Hidden character mixers stop updating. Scenery has its own lower zoom visibility threshold.

## Geometry, roads and placement

The two original trunk/icosahedron tree implementations were replaced with one reusable vegetation builder. Rounded deciduous, broad park, small ornamental and imported Kenney evergreen prototypes are grounded and metre-normalized. Rounded crowns have several asymmetrical lobes, smooth normals, upper/lower vertex shading and modest colour variation. Each variant/detail pool is instanced; distant trees use lower geometry detail. The 582 individually mapped campus trees use the same system and retain their positions, including rooftop planting.

Generated vegetation stays deterministic, with irregular clusters/open glades and jittered street spacing. A spatial road-segment index checks road/path clearance. Building-edge margins, intersection/end clearance, sports fields, water, wetlands and the campus’s existing planting exclude generated trees. Wetlands intentionally remain open rather than becoming invented conifer forests. Scenery refreshes around a freely panned camera as well as the avatar, with bounded 480-tree/48-lamp caps and no per-frame regeneration.

The actual OpenStreetMap road network is retained. Existing road layers are restyled in place, preserving bridge/tunnel ordering; missing casings receive aligned curb layers. Asphalt, sidewalks, paths, developed land, park lawns, wetland and water have distinct muted values. Modular road tiles were inspected but not forced onto curves or intersections. No fictional road network, random buildings, invented signals or signs were added. Selected Kenney lamps follow suitable road edges, avoid crossings/buildings/water and keep clear of tree trunks. Their placement is explicitly stylized scenery in this handoff, not surveyed infrastructure.

## Lighting and occlusion

Both renderers now use a southwest warm daylight direction: MapLibre’s supported map light shades extrusions, and Three.js uses warm key light plus cooler hemisphere fill and AgX tone mapping. Upper/lower crown shading, restrained tree contact shadows and the existing avatar shadows provide depth. Roof/wall/parapet separation and full building heights remain readable. MapLibre’s sky/horizon/fog palette is softened. No full-screen bloom, SSAO or real-time scene-wide shadow pass was added.

MapLibre 6.18 does **not** support per-feature `fill-extrusion-opacity`: it is a layer-level property. Its standard extrusions therefore remain full-height and opaque in street views. For the detailed Three.js campus, a per-building vertex ID in the existing merged geometry allows selected structures to fade toward 32% opacity without splitting into dozens of draw calls. Actual wall/roof sightline intersections respect courtyard holes; the effect is disabled when the focus is offscreen. Fade values interpolate in the existing frame loop and return to opacity 1 when no longer obstructing. Distant/offscreen structures stay solid. This does not change map hit testing or geographic geometry.

This is a campus-specific fade, not a universal per-OSM-building opacity implementation. Elsewhere, full height, the higher camera framing and the existing foreground character rendering preserve visibility. A more general individual-building fade would require a separately filtered layer/geometry strategy and further testing.

## Camera and interaction corrections

Walking enters at zoom 21.3, with a 54–62° pitch curve and 48° vertical field of view; overview zooms still transition continuously to flat 2D. The initial heading follows the nearest mapped street, choosing the direction closest to the existing bearing. Camera settings, styles and FOV restore on 2D return. The fixed-camera comparison harness explicitly holds the old 36.87° FOV so comparisons remain equivalent.

Chat focuses the actual animated Muse body and the remaining unobstructed map area, at approximately 23–23.8 zoom depending on viewport. Muse moves toward the viewer side of the avatar and faces the camera, with independent avatar playback preserved. A browser-discovered camera-return bug was fixed by restoring through the existing frame loop, including reduced motion and rapid reopen, instead of mixing a separate timed map ease with following. The legacy phone Map/3D controls were moved clear of the primary action after an actual pointer-interception failure. No controls were added.

## Performance measurements

Measurements use Chromium headless with **ANGLE Metal on Apple M5**, device scale factor 1, a 7s warm-up and 5s sample. The 390px case is a phone-sized viewport on the same Mac GPU, **not a physical phone test**. Both versions use the same centre[-122.14763,37.48474], zoom 19.6, pitch 74°, bearing 0 and 36.87° comparison FOV. Counters cover both Three.js passes of the existing custom layer, not MapLibre’s internal draws.

The initial software SwiftShader samples included shader/upload stalls and were unsuitable as device-performance claims. Those raw artifacts remain for audit; native Metal is used for the final measurement and visual gates. Exact final results: `.verify/world/performance.json`. Both before and after hold approximately 60 FPS with 17ms median/p95 frame intervals on the tested Mac. The additional vegetation pools/contact shading modestly increase draw calls/triangles; they do not add a renderer or framework. The unchanged 30.7MiB Muse GLB still dominates geometry and remains a physical-phone loading/performance risk. A separate derived, visually verified web export is still advisable; no destructive asset optimization was attempted here.

## Files and integration boundaries

Rendering changes: `world/math.ts`, `WorldLayer.ts`, `World3D.tsx`, `trees.ts`, `cityTheme.ts`, `hq.ts`; new `vegetation.ts`, `scenery-assets.ts`, `street-furniture.ts`, `cutaway.ts`; selected derived assets/licenses/report in `public/models/world/`; reproducible Blender script in `tools/world-assets/`. The only additional legacy map UI change is the camera-control positioning class in `map/OutHereView.tsx`. Tests cover scale, tree bounds/coverage/determinism, road/building clearance, model bounds, exact sightline intersections,2D style restoration, cleanup and camera transitions. `CREDITS.md` records the assets.

All other Muse/chat/Vision/backend files in this branch are the preserved integration baseline. Their presence is not a rendering-phase backend change. No production user data, backend schema, model source, dependency or API contract was changed for this overhaul.

Claude’s UI branch was inspected read-only at checkpoint `b84dac7`; its audit explicitly awaits this work. No branch was merged/rebased and its worktree was not modified. `World3D.tsx`, the earlier photo integration and the legacy camera-control class require deliberate integration with the finished dashboard. User instructions prohibit commits/pushes, so source and patch handoff are supplied without creating a commit. Do not apply the full old-baseline patch blindly over the UI branch’s newer contracts. Existing hosted migration version conflicts are documented in the Muse integration handoff and remain outside this rendering change.

## Visual evidence and verification

Before/after evidence: `.verify/world/before/` and `.verify/world/after-final/`, with 16 matched views each: default comparison, close street, mid-distance, occlusion, park/wetland, dense urban, mapped trees and flat transition at 1440×900 and 390×844. Each capture records centre/zoom/pitch/bearing, tile completeness and console/page errors; actual tile bytes are cached locally for repeatable comparisons. Earlier incomplete-tile and intermediate look-development captures are not the final evidence.

Actual automatic walking/chat views are separately captured at 1440,1280 and 390px, using the new camera. Native GPU comparison screenshots were visually inspected and the initial result was revised for sightline transparency, tree detail, camera direction, loading completeness and navigation behavior. No critical JavaScript/WebGL errors or horizontal overflow were observed in the final visual captures.

Typecheck, lint,395 unit tests and the isolated production build pass. The final browser regression includes ordinary/reduced-motion walking/chat/2D return, genuine backend ledger transport in explicitly offline model mode, request-bound processing/error/retry, and saved-memory privacy/caption integrity. Photo preservation additionally exercises the actual arrival → upload → analysis → edit → existing album → map workflow, plus the shared album. Final counts and patch artifacts are recorded in the completion note below.

Remaining limits: real phone hardware and hosted Supabase behavior are unverified; open terrain/wetlands intentionally remain open; other OSM structures do not receive the campus shader fade; source GLB cost and the pending teammate dashboard merge remain. No fake scenery was added to conceal missing geographic tiles.

### Completion record, Nov 13

- 395 unit tests across 51 files pass; TypeScript, ESLint, `git diff --check` and the isolated production build pass.
- 14 production regression cases passed on phone/desktop: world/camera/reduced-motion transitions, request-bound processing, real ledger transport with explicitly offline inference, retry/error cleanup and Vision privacy/same-record edits. After the final zoom-marker refinement, all 8 world/camera cases were rerun and passed again.
- 3 additional desktop preservation cases pass: arrival photo → saved memory → map with normal/reduced motion, plus the two-attendee crew album. Earlier Phase7 live Vision verification is preserved separately; no paid inference was needed for the rendering overhaul.
- 16 complete, identical-camera before/after pairs verified. Every final capture reports loaded tiles, zero page errors and no horizontal overflow. Automatic camera screenshots at 1440/1280/390 were also inspected.
- Native Metal benchmark:60 FPS before/after on Apple M5 in both viewports;17ms median/p95. At the matched idle camera, combined Three.js counters were83 →104 calls, approximately756k →774k triangles desktop and753k →774k triangles phone viewport. These are short local samples, not physical-phone or full-map GPU guarantees.
- All 72 files in the original integration baseline hash exactly as preserved. No rendering-phase source changes outside `world/` except the documented camera-control class;0 credential-shaped matches in allowed source. Character GLB/source files and dependencies unchanged.
- `world-only.patch` applies cleanly to the preserved Muse integration baseline. `all-work.patch` applies cleanly to `0faf935` and includes the preserved Phases 3–7 work. A source-delta archive and inventories are in `.verify/world/`. Both patches were checked against separate temporary baselines; neither was staged or committed.

Preview: `http://localhost:3129/out-here?as=alex&view=3d`. Build/regression fixtures run separately on 3130 in MemoryStore/offline mode. No production records were changed. No push, merge or deployment.

The anti-slop scanner reported 8 inherited signals: existing meaningful walk/GPS/tour symbols, request-bound pending text, debug-lab glass and existing glyphs. They were retained under the project's instruction to preserve established functionality and keep unrelated UI cleanup in Claude's branch; no new decorative UI was introduced.

API references: [MapLibre extrusion opacity](https://maplibre.org/maplibre-style-spec/layers/#fill-extrusion-opacity), [OpenMapTiles schema](https://openmaptiles.org/docs/schema/), [Kenney City Kit Roads](https://kenney.nl/assets/city-kit-roads), [Quaternius asset evaluation](https://quaternius.com/packs/stylizedtree.html). Included asset licenses are copied from the supplied archives.

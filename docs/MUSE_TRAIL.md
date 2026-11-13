# Muse energy trail (Muse Animation 01)

Jolly's signature wake: a luminous, layered electric-blue energy trail that follows Muse's real movement in the 3D map. It is the shared visual language for later Muse animations (flying between people, delivering a Side Quest, agent-to-agent hand-offs, thinking, photo scoring, memory transfers). It is a procedural effect added on top of the existing character; the Jolly GLB, its materials, rig and clips are untouched.

Moves demo scene 4 ("I'm free. Muse comes over to talk", `docs/DEMO_FLOW.md`): Muse visibly flies to the avatar.

## What it looks like

Built from the written brief; the three reference images did not come through with the request, so nothing here claims visual parity with them (see Known limits).

| Layer | What | How |
|---|---|---|
| A | Restrained leading glow at Muse's tail | soft billboard, behind Muse (depth-tested), brightness follows speed |
| B | Main energy ribbon | smooth Catmull-Rom through the real path, tapered, pale-blue core to electric-blue edge, fades with age |
| C | 5 to 10 independent filaments | each with its own sideways offset, wobble, drift, lifetime, width and tint; start together and fan out as they age; fan out further on tight turns |
| D | Soft diffuse glow | a wide, low-alpha ribbon along the wake (no full-screen bloom) |
| E | Dispersing sparks | pooled particles spawned along the wake, drifting independently, twinkling, fading without popping |
| halo | Faint aura around Muse | stays when idle, sits behind Muse so it never washes out the face |

Palette: `#0866FF` (body), `#168AFF` (bright), `#23D9F5` (cyan highlights), `#B8F7FF` (pale blue-white, the hottest point). Blending is premultiplied alpha: the saturated blue body stays visible on the bright map, and the pale highlights are added as extra light.

## Styles: walk and full

- **`walk`** is what the walking view uses: the wake stems from the **platform under Muse's feet** (not its back), and it is thin and faint with at most 4 strands and 40 sparks, a short lifetime, and a steep fade, so it disappears from the tip back toward the platform as Muse walks away (and, after Muse stops, retracts the same way).
- **`full`** (default) is the showpiece wake from the lab and the later flights, deliveries and agent hand-offs.
- Choose with `new MuseTrail({ style })` or `setConfig({ style })`. The emission point is the `anchor` passed to `update()`; without one the wake leaves just behind Muse's centre.

## Behaviour

- **Mode follows speed** (`'auto'`): idle, float, fly, dash, from Muse's speed divided by its scale (character lengths per second). All layer strengths ease toward the mode's values, never jump.
- **Idle:** no wake and no sparks; only the faint aura. **Float:** thin strands, little spread, few sparks. **Fly:** the full wake. **Dash:** longer, brighter, wider spread, more sparks.
- **Turns:** path points stay where Muse was (world space), so the wake bends behind Muse and old sections never snap. The tail anchor is low-pass filtered so a sudden direction change curves instead of folding.
- **Stop:** emission stops, the wake hangs in the air, strands disperse, and everything fades over about `trailLifetime` (default 2 s), then all geometry and sparks are gone. Strands have different lifetimes so the end is not synchronised.
- **Teleports:** a step of more than 6 character lengths in one frame clears the path instead of drawing a line across the map.
- **Reduced motion** (`prefers-reduced-motion`, followed live): no long wake and no strands; only the halo and leading glow. Can also be forced with `setReducedMotion()`.

## Public interface (for later Muse animations)

```ts
import { MuseTrail } from '@/features/world/muse-trail';

const trail = new MuseTrail({ quality: 'medium', config: { intensity: 1, trailLifetime: 2 } });
scene.add(trail.object);                              // identity transform, everything inside is world space
trail.update(museCentre /* THREE.Vector3 */, dt, {
  camera: viewProjection /* local-to-clip Matrix4 */,  // faces ribbons and sparks at the camera
  scale: museWorldSize,                                // widths, spacing, speeds are relative to this
  verticalWeight: 1,                                   // 0 = ignore up/down movement (the map layer does)
});
trail.setMode('auto' | 'off' | 'idle' | 'float' | 'fly' | 'dash');   // force a look for scripted moves
trail.setConfig({ color, brightBlue, cyanAccent, paleBlue, filamentCount, particleBudget, trailLifetime, intensity, quality, samples, seed });
trail.setReducedMotion(true);
trail.reset();                                        // forget path and sparks (use after a deliberate move)
trail.stats();                                        // mode, speed, path points, live sparks, ...
trail.dispose();                                      // geometry, materials, media-query listener
```

A scripted flight (for example Muse delivering an envelope) calls `setMode('dash')` and moves the same position it passes to `update`; recolouring or a different intensity is `setConfig`. `MuseTrailConfig` also carries `seed` (one Muse always has the same strand shapes).

## Files

- `src/features/world/muse-trail/` (new, isolated): `params.ts` (modes, config, presets), `path.ts` (history and curve), `filaments.ts`, `shaders.ts`, `MuseTrail.ts`, `MuseTrailLab.tsx`, `index.ts`, `muse-trail.test.ts` (24 tests).
- `src/app/dev/muse-trail/page.tsx` (new): dev-only test lab, 404 in production builds.
- `src/features/world/WorldLayer.ts` (the only existing file touched, about 47 lines added): creates a `MuseTrail` (style `walk`) for each pet actor in the characters scene, feeds it Muse's world position, the platform position as the anchor and the layer's camera matrix every frame, hides it below the character zoom, disposes it with the actor, and adds `setTrailMode(id, mode)`. It also draws a soft ground shadow under each avatar (a depth-tested plane in the main scene, so buildings still cover it).

Minimal patch if `WorldLayer.ts` has changed upstream: add the import, a `trail: MuseTrail | null` field on `Actor`, create it in `upsertActor` when `kind === 'pet'` (`charScene.add(trail.object)`), call `a.trail.update(pos, dt, { camera: this.full, scale: s, verticalWeight: 0, anchor: platformPos })` after `a.char.update(...)` with `pos = (o.east, a.altitude * scale + a.char.height * s * 0.5, -o.north)`, and `a.trail?.dispose()` in `removeActor`.

## Test lab

`npm run dev`, then open **http://localhost:3000/dev/muse-trail** (the real trail over the real Jolly model, loaded with the app's own `loadModels`, on a bright map-like ground). Buttons: Walk style / Full style, Idle, Slow hover, Normal flight, Fast flight, Curved path, Sharp turn, Figure-eight, Spiral, Stop and fade; toggles for Reduced motion, Jolly, background (map / white / dark), quality, intensity and linger. Query parameters preselect: `?path=figure8&bg=map&quality=high&style=walk&linger=3&reduced=1&jolly=0` (`jolly=0` skips the 30 MB model for a fast run).

The lab is a test harness with its own small renderer; the app draws the trail inside the existing MapLibre/Three.js layer (no second renderer, no new dependency, no postprocessing).

## Performance

- **3 draw calls** (all ribbons in one, sparks in one, glows in one). No per-frame allocation: ribbon and particle buffers are preallocated and updated in place; the particle pool is bounded by `particleBudget` and never grows.
- **CPU per frame** (measured, 6,000 frames, sparks pool full): low 0.034 ms, medium 0.062 ms, high 0.111 ms. Vertices: 888 / 1,808 / 3,400.
- Quality presets (strands / sparks / samples): low 5 / 80 / 40, medium 7 / 180 / 60, high 10 / 320 / 88. Default `medium`. If the frame time stays above about 34 ms for 3 seconds the effect steps down one quality level (never back up automatically; off with `adaptiveQuality: false`).
- In a software-rendered headless browser the lab ran at 41 to 44 fps with 10 strands and up to 315 sparks (no Jolly); with the full 26,000-fibre Jolly the same software renderer manages 3 fps, which is the model, not the effect.

## Verification

- Unit tests (24, no GPU needed): mode rules, config clamps, path ring buffer and Catmull-Rom smoothness, the camera basis against a real camera, filament variety and dispersion, idle emits nothing, bounded sparks, the wake lingers then disappears completely, a teleport clears the path, a hard 120 degree corner does not fold, reduced motion, dispose, adaptive quality, vertical weight.
- Browser (headless Chromium for the lab, GPU Chrome for the app): the lab on map / white / dark grounds across every path with and without Jolly; the real 3D map with the avatar walking, turning, running straight and stopping. No console errors in any run.

## Known limits

- **Reference fidelity is unverified.** The three reference images were not received, so the look is built from the written description. A side-by-side comparison with the references is still to do and is likely to change colours, filament thickness and glow strength (all are parameters).
- Seen from directly behind a straight run (the default street camera), the ribbons are foreshortened and read as a narrow stream with sparks; the layered look is clearest on turns and from the side.
- No bloom: the glow is layered soft geometry, so very bright backgrounds cap how luminous it can feel.
- The app's own movement is eased, so the wake is calmer than the lab's instant corners.
- Not wired to Muse's `fly` / `think` / `talk` states yet; mode comes from speed. Muse's forced modes exist for the later animations.
- Team process: this task was not claimed on the team bulletin (creating the issue from the agent was not permitted); `src/features/world` is Alan's area with unmerged work on `feat/3d-view` and `feat/3d-stadiums`, so expect a small merge in `WorldLayer.ts`.

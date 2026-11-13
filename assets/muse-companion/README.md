# Jolly — Muse companion (Blender → GLB)

The current builder is `refine_plush.py`. It refines Muse only, preserving the existing Kenney geometry, rig, skin, scale, and animations.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --disable-autoexec -b --python assets/muse-companion/refine_plush.py
```

It reads the pre-refinement snapshot in `backups/pre-plush-refine-20261112/`. The previous mockup and smooth-Muse builders are retained as history; do not run them to rebuild this revision. The `.blend` and GLB are self-contained once generated.

For a rebuild, keep the supplied `polar_fleece_4k.blend.zip` and `Shell Texture Fur v7 - Blender 4.X.blend` in Downloads. Normal, roughness, and cream-recolored fleece textures are derived into `textures/`; original supplied files are unchanged. The 3.X shell asset was inspected as a legacy alternative. Embedded text/scripts are not executed. The shell node group is saved as an optional disabled modifier; it is not responsible for the final rendered hair.

Backups contain the previous .blend, GLB, and builder. The viewer's HTML, render gallery, and verifier are backed up under `tools/muse-viewer/backups/pre-plush-refine-20261112/`.

## Animations in `muse-companion.glb` (call by exact name)
| Name | Length | What |
|---|---|---|
| `follow_back` | 4.0 s loop | Default. Back to camera, bob + gentle ±10° sway. |
| `thinking` | 1.5 s loop | +0.15 m up, turned 90°, eyes shrink, 3 dots pulse. Then switch to `talk_front`. |
| `talk_front` | 0.5 s | Flies between the person and viewer, 0.4 m closer to the initial camera than follow mode. Faces the screen; blank bubble shown. Re-trigger per word. |
| `person_idle` / `person_run` | 1.4 s / 0.7 s | Kenney clips retargeted to the model rig (no walk clip in the pack; slow `person_run` via `timeScale`). |

Every Muse clip keys the same nodes (`Muse`, `Muse_EyeL/R`, `Muse_ThinkingDots`, `Muse_SpeechBubble`), so crossfading between states is safe.

## Nodes
`Person` (scaled to 1.7 m; move this) → `Person_Rig` → `Person_Skater`. `Muse` is a sibling at world origin in person-local coordinates: parent it to the same group as `Person`. `Muse_SpeechBubble` is an empty white plate: put text in React.

Axes: person faces glTF +Z. Person's right is glTF -X. Camera behind the person sees Muse's back in `follow_back`.

## Plush refinement

- Head, torso, arms, and feet are voxel-unioned, relaxed, and saved as one continuous watertight skin mesh. There are no separate leg, palm, finger, or arm skin objects. The flat soles are retained; arm forms are rounded mittens attached at the shoulders, with a visible air gap beside the lower torso. Their resting pose has a wider arm span than the body itself.
- Subtle pear silhouette: a slightly narrower rounded head blends into a gently fuller lower torso, with about a 7% width difference. Scale stays approximately 0.55 m tall, with follow center `(-0.35, 1.1, -0.25)` in glTF coordinates before bobbing. The blue platform sits immediately under the feet and moves with Muse.
- The face is a softly rounded oval carved into the surrounding body envelope. Only the skin inside the opening is pushed inward; no projecting rim is added. The face surface remains gently convex inside that recess. Blush is broader and stronger, using pink radial gradients.
- Coat uses the supplied polar-fleece photographic variation, normal map, and roughness while preserving the cream palette. The previous broad triangular clumps are removed. Fleece normal detail and fine-hair shading are stronger, with a denser continuous coat. Fine fibers follow small lifted arcs rather than lying flat, adding real coat volume and silhouette depth. The upper fur envelope is advanced about 6 mm and the top opening is lowered slightly to bring the hairline forward without adding a rigid rim. Blender retains 200,000 fine curved hairs; GLB has 26,000 tapered thin mesh fibers plus fleece texture detail. Fine-hair density and subsurface scattering are visibly richer in Blender than in the browser.
- Headphones, clip names/durations, empty 3D speech bubble, and independent person playback are retained. No orb, cape, star, cable, or Spotify plaque is added. The old rigid display pedestal is removed.
- The platform is a small, thin rounded blue disc with low emission. Blender stills include a short soft halo, without a strong blue lamp. The Three.js viewer supplies its own soft halo and time-fading trail.
- Four transparent 1024 × 1024 renders cover front, back, side, and three-quarter. `muse_reference_display.png` shows the platform from a raised camera. The back view hides all facial geometry.

Run `validate_plush.py` in Blender to verify the saved body has exactly one component, no boundary/nonmanifold edges, flat soles, and unchanged skater mesh/rig/UVs/weights/skin pixels/animation handles. `renders/plush-validation.json` records those checks. GLB checks compare the person and all referenced binary resources against the current backup; compact older Muse data may be omitted without changing the person. The saved geometry is a reconstruction of the plush references rather than recovered source topology.

## Viewer

Serve the repository root with `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://localhost:8765/tools/muse-viewer/`. Render gallery: `http://localhost:8765/tools/muse-viewer/renders.html`.

The viewer crossfades Muse and person independently. **Walk together** plays the existing run clip and translates a shared parent group; the Person node itself is unchanged. A world-space blue wake emits only during movement, disperses slightly, and fades over 1.7 seconds. Stopping movement or selecting idle stops emission; existing particles finish fading. During `talk_front`, it places Muse on the screen's center ray, looks directly at the current camera (including after orbiting), and eases OrbitControls' target to Muse's center. It never changes Person's transform. The GLB bubble is empty; the HTML overlay supplies the demo text.

Credit: person model/animations by Kenney (CC0, kenney.nl).

## Final visual review

The final review snapshot is `backups/pre-final-review-20261112/`. The face and carved opening now share the same lowered upper oval, eliminating the former projecting forehead shelf. Arms are shorter and fuller, with rounded mitten tips and shoulder-only attachment. Fine hair has more lift and smaller strand diameter; reduced subsurface distance preserves fiber shadows instead of washing them out. The render gallery includes the previous and revised three-quarter views for comparison.

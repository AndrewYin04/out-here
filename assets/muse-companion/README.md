# Jolly — Muse companion (Blender → GLB)

Rebuild everything: `/Applications/Blender.app/Contents/MacOS/Blender -b --python assets/muse-companion/build_muse.py`
(needs the Kenney "Animated Characters Protagonists" pack, CC0, unzipped at `~/Downloads/kenney_animated-characters-protagonists/`).

## Animations in `muse-companion.glb` (call by exact name)
| Name | Length | What |
|---|---|---|
| `follow_back` | 4.0 s loop | Default. Back to camera, bob + gentle ±10° sway. |
| `thinking` | 1.5 s loop | +0.15 m up, turned 90°, eyes shrink, 3 dots pulse. Then switch to `talk_front`. |
| `talk_front` | 0.5 s | Flies in front, faces camera, bubble plate shown, scale 1 → 1.06 → 1. Re-trigger per word. |
| `person_idle` / `person_run` | 1.4 s / 0.7 s | Kenney clips retargeted to the model rig (no walk clip in the pack; slow `person_run` via `timeScale`). |

Every Muse clip keys the same nodes (`Muse`, `Muse_EyeL/R`, `Muse_ThinkingDots`, `Muse_SpeechBubble`), so crossfading between states is safe.

## Nodes
`Person` (scaled to 1.7 m; move this) → `Person_Rig` → `Person_Skater`. `Muse` is a sibling at world origin in person-local coordinates: parent it to the same group as `Person`. `Muse_SpeechBubble` is an empty white plate: put text in React.

Axes: person faces glTF +Z. Person's right is glTF -X. Camera behind the person sees Muse's back in `follow_back`.

Credit: person model/animations by Kenney (CC0, kenney.nl).

# 3D models for the Out Here 3D view

The 3D view loads what `manifest.json` lists. Today that is Ally's **Jolly** Muse companion and the Kenney person, both in `muse-companion.glb` (built in Blender from `assets/muse-companion/`).

After re-exporting from Blender, copy the new file here:

```bash
npm run models:sync   # copies assets/muse-companion/muse-companion.glb to public/models/
```

## manifest.json

| Field | Meaning |
|---|---|
| `avatar`, `pet` | `.glb` file names in this folder (letters, digits, `.`, `_`, `-`). `null` draws the code placeholder. |
| `avatarNode`, `petNode` | Top-level node to keep from the file (`Person`, `Muse`); the rest is dropped. |
| `scale` | Multiplier on the model's own size (the view also enlarges characters by zoom). |
| `clips.avatar` | View state → clip: `idle`, `walk`, `talk`, plus one-shots `wave`, `celebrate`. |
| `clips.pet` | View state → clip: `hover` (beside you), `fly` (moving), `think` (Muse is working), `talk` (answer showing), one-shot `happy`. |
| `timeScale` | Playback speed per state (the Kenney pack has no walk, so `walk` is `person_run` at 0.6). |
| `petRelativeMotion` | `true`: the pet node's own position/rotation keys become relative to each clip's first frame, so the bob and sway play but the view decides where the pet floats and which way it faces. |
| `hide` | Nodes to hide (`Muse_SpeechBubble`: the view draws the text bubble itself). |

A state with no clip falls back to the contract names in `docs/3D_VIEW_PLAN.md` section 3; a one-shot with no clip (wave, celebrate) plays a small hop. Check a file at https://gltf-viewer.donmccurdy.com/ before committing it.

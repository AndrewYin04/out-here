# 3D models for the Out Here 3D view

Drop the avatar and Muse pet `.glb` files here and name them in `manifest.json`:

```json
{ "version": 1, "avatar": "avatar-base.glb", "pet": "muse-pet.glb", "scale": { "avatar": 1, "pet": 1 } }
```

While `avatar` or `pet` is `null`, the 3D view draws a placeholder for it. File names may only use letters, digits, `.`, `_` and `-`, and must end in `.glb`.

The full spec (orientation, size budget, rig, exact animation clip names, tint material names) is section 3 of `docs/3D_VIEW_PLAN.md`. Check a file at https://gltf-viewer.donmccurdy.com/ before committing it.

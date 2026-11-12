# Avatar looks (for the 3D third-person view)

People customise their avatar on their profile (**Avatar** card, **Edit avatar**): a body (A or B)
and colours for skin, hair, top, bottoms and shoes. The look is used **only in the 3D
third-person map view**. Everywhere else (2D map pins, cards, Memories) people show their profile
photo.

## For the 3D map

```ts
import { useLook, renderLookTexture } from '@/features/avatar';

const look = useLook(person.id);            // the person's look (their edit, else a mock look)
const url = await renderLookTexture(look);  // 1024x1024 PNG data URL, cached per look
// Kenney person GLB (same rig/UVs as the Protagonists characterMedium model):
const tex = await new THREE.TextureLoader().loadAsync(url);
tex.flipY = false;                          // glTF UV convention
tex.colorSpace = THREE.SRGBColorSpace;
mesh.material.map = tex;
mesh.material.needsUpdate = true;
```

`look.body` picks the base texture (`/avatars/masc|femme/atlas-*.png`); both bodies share the
same mesh, so only the texture changes. `useLook` re-renders when the person saves a new look
(in this browser; other tabs update live).

## Data

- Demo personas have hand-picked looks; everyone else gets a stable one from their id (`mockLook`).
- Edits are saved in the browser per person id (`saveLook`), not on the server. Demo only.

## Assets

`assets/avatars/build_avatars.py` (Blender, headless) writes `public/avatars/<body>/`:
`atlas-white.png` + `atlas-id.png` (texture space, for the 3D view) and `portrait|full-shade|id.png`
(the profile card preview). Source: Kenney "Animated Characters Protagonists" (CC0).

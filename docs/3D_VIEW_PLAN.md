# 3D view plan: third-person map with your avatar and Muse pet

Status: W0–W2 built on branch `feat/3d-view` (Thu Nov 12), plus the plan beacons and friend avatars from W4 and live GPS (section 4a). The view runs on placeholder characters until Ally's `.glb` files land in `public/models/` (section 3). Open it with the **3D** button at the bottom left of the Out Here map, or `/out-here?view=3d`.

Covers Andrew's ideas in `docs/HANDOFF.md`: the third-person "Pokémon Go" view, the first-person "stadiums", Muse as a companion, and Muse-delivered announcements. Ally is building the 3D models for the avatar and the Muse pet. Section 3 is the model spec for Ally.

## 1. What we are building

Out Here gets a second camera mode. **Map** is today's overhead map, unchanged. **3D** is a tilted street-level view that follows **your avatar** from just behind and above it. A small **Muse pet** floats next to your avatar.

- **Same data, new camera.** Quests, seats, friends, bubbles and the Muse plan all come from the same hooks that `OutHereView` uses today. The 3D view is a new way to show them, not a second app.
- **The pet is the Muse UI.** When you ask Muse something, the pet flies in front of your avatar and answers in a speech bubble, then returns to your side. The existing `PlanSheet` pipeline produces the content.
- **The 2D map is the fallback.** If WebGL, the models or performance fail, the toggle returns to Map and the demo loop still works.

Things that never change: Muse ranks only real candidates; seats, walking time and budget are checked in code; friend locations follow the Find My privacy rules (audience, approximate mode, pause); and we never read real GPS without consent. The demo moves the avatar along a simulated route.

## 2. How it fits the current code

### Rendering approach: three.js as a MapLibre custom layer

- MapLibre draws the map, the 3D buildings (`fill-extrusion` on the `building` source-layer, `render_height`, as planned in M4) and the camera.
- **three.js** draws the avatars and the pet inside the same WebGL context, through MapLibre's custom layer interface (`CustomLayerInterface`: `onAdd`, `render`). Follow MapLibre's official "Add a 3D model using three.js" example for the installed `maplibre-gl` version, because the matrix argument changed between major versions.
- One custom layer, one `THREE.Scene`, one `AnimationMixer` per character. Characters are positioned with `MercatorCoordinate.fromLngLat(lngLat, altitude)` and scaled by `meterInMercatorCoordinateUnits()`.
- **Why not deck.gl or a separate three.js canvas:** deck.gl is a large new dependency with less control over animation states. A separate canvas has to copy the map camera every frame and gets depth wrong behind buildings. The custom layer shares depth with the 3D buildings, so avatars correctly go behind them.
- **HTML stays HTML.** Quest pins, seat badges, status bubbles and the pet's speech bubble stay as MapLibre `Marker` DOM elements (the existing pins already work at any pitch). Speech bubbles are positioned with `map.project()` on the character's position each frame. Text is sharp, accessible and testable with Playwright `data-testid`s, as it is today.

### New dependency (log in `docs/DECISIONS.md` first, per `10-architecture`)

- `three` (+ `@types/three`), pinned to an exact version. `GLTFLoader`, `SkeletonUtils` and `AnimationMixer` come from `three` itself (`three/examples/jsm/...`), so nothing else is needed.
- No Draco or KTX2 decoders (they need extra hosted files). See the size budget in section 3.

### Folder ownership

New area **world**, owned by one builder. Core adds it to the table in `10-architecture`.

| Path | Contents |
|---|---|
| `src/features/world/**` | custom layer, scene, model loading, character controller, pet controller, camera follow, joystick, LOD |
| `public/models/**` | Ally's `.glb` files and `manifest.json` (Ally commits here; the world builder reviews) |

- `src/features/map/**` (map area) adds the **Map / 3D toggle** and mounts `<World3D>` through `@/features/world` (the barrel).
- `src/features/outhere/**` exposes what the pet needs (the current ask, the plan state, the suggestions) through its barrel. `usePlanAsk`, `usePlanSuggestions` and `setPlanOpen` already exist.
- `src/shared/types.ts` (core) gets one new type, `AvatarConfig` (section 4).

### Component sketch

```
OutHereView (map area)
 ├─ MapCanvas            existing; gains: pitch/bearing unlocked in 3D mode, 3D buildings layer
 ├─ ViewToggle           new: Map | 3D (remembers choice in localStorage, try/catch)
 └─ World3D (world area, client-only, dynamic import)
     ├─ useWorldLayer(map)        adds/removes the three.js custom layer
     ├─ AvatarController          viewer avatar: position, heading, Idle/Walk/Wave...
     ├─ PetController             Muse pet: follow, talk, think, deliver, negotiate
     ├─ OthersLayer               friends' avatars from useFriendPins (LOD + cap)
     ├─ FollowCamera              third-person camera: jumpTo each frame, smoothed
     ├─ Joystick / TapToWalk      movement input
     └─ SpeechBubble (DOM)        pet and friend speech, positioned by map.project()
```

## 3. Model spec for Ally

Any tool works (Blender is easiest). Following these rules means the files drop into `public/models/` and work without code changes.

### Files and format
- **glTF 2.0 binary (`.glb`)**, one file per character, textures embedded.
- `avatar-base.glb` (the human), `muse-pet.glb` (the pet). Later variants: `avatar-<name>.glb`, or one avatar file with swappable parts (see below).

### Orientation and scale
- **Units: meters.** Avatar about 1.7 m tall, pet about 0.4–0.6 m. We scale both up in code so they read at street zoom.
- **Y-up, facing +Z.** That's Blender's glTF exporter default with "+Y Up" checked.
- **Origin at the feet**, centered (the pet's origin at the center of its body; we set the hover height in code).
- Apply all transforms before export (Ctrl+A → All Transforms in Blender).

### Budget (it runs in a phone browser next to a map)
| | Avatar | Pet |
|---|---|---|
| Triangles | ≤ 15,000 | ≤ 5,000 |
| Materials | ≤ 3 | ≤ 2 |
| Textures | ≤ 1024×1024, PNG or JPG | ≤ 512×512 |
| File size | ≤ 4 MB | ≤ 1.5 MB |

### Rig and animations
- One humanoid skeleton for every avatar variant, so all variants share the same animation clips. Mixamo-style bone names help if Ally uses Mixamo animations.
- **In-place animations** (no root motion): code moves the character.
- **Clip names must match exactly** (case-sensitive). Required ones are bold.

| Avatar clip | Loop | Used when |
|---|---|---|
| **`Idle`** | yes | standing |
| **`Walk`** | yes | moving (speed-matched in code) |
| **`Wave`** | no | tapping a friend (the "Poke"), greeting |
| **`Celebrate`** | no | joined a plan, earned something |
| `Run` | yes | fast travel / tap-to-walk far away |
| `Talk` | yes | listening to the pet, chatting with a friend |
| `Sit` | yes | at a venue during a hangout |

| Pet clip | Loop | Used when |
|---|---|---|
| **`Hover`** | yes | following you (idle float) |
| **`Fly`** | yes | moving to the front, to a friend, delivering |
| **`Talk`** | yes | its speech bubble is open |
| **`Think`** | yes | waiting on Muse (covers the 1–4 s latency) |
| `Happy` | no | plan found, invite accepted |
| `Wave` | no | arrives at a friend |

- Optional but great for the pet: a **morph target named `mouthOpen`** (0–1). Code animates it while the bubble text appears, so the pet looks like it's talking.

### Customization (optional, for later)
- Swappable parts as separate meshes with these name prefixes: `Hair_*`, `Top_*`, `Bottom_*`, `Shoes_*`, `Acc_*` (e.g. `Hair_Bun`, `Acc_DumplingHat`). Code shows one per group and hides the rest.
- Tintable materials named `Mat_Primary`, `Mat_Secondary`, `Mat_Accent`. Code changes their color per persona. Leave skin, eyes and the pet's face as fixed materials.

### Checking the file before committing
1. Drop the `.glb` on https://gltf-viewer.donmccurdy.com/ and check: it faces forward, the size is right, and every clip in the tables plays.
2. Commit it to `public/models/` and add a line to `public/models/manifest.json`:
   ```json
   { "avatar": "avatar-base.glb", "pet": "muse-pet.glb", "scale": { "avatar": 1, "pet": 1 }, "version": 1 }
   ```
3. Post `FYI: models v1 in public/models` on the board.

**Ship a rough version first.** A blocked-out avatar and pet with just `Idle`/`Walk` and `Hover`/`Fly` (a few hours of work) unblocks integration. Polished versions replace the same files later with no code changes.

### Until Ally's files land
The world builder uses a placeholder: a capsule plus sphere, or a CC0 rigged test model whose license is checked and recorded in `CREDITS.md`. The controller code depends only on the clip names above, so the swap is one file change in `manifest.json`.

## 4. Behaviour spec

### Camera (third-person follow)
- 3D mode: `pitch` about 60–65 (raise `maxPitch` to 75), `zoom` about 18.5–19, `bearing` = the avatar's heading. Enable `dragRotate`/`touchPitch` only in 3D mode.
- Every frame: `map.jumpTo({ center, bearing, pitch, zoom })`, eased toward the avatar's position and heading (exponential smoothing, about 0.15 per frame). Drag to orbit for a moment; release and the camera eases back behind the avatar.
- Entering 3D: one `flyTo` from the current overhead view down to behind the avatar (about 1.2 s). Leaving: `flyTo` back to the overhead framing.
- `prefers-reduced-motion`: no fly animation, jump straight to the view.

### Moving the avatar (simulated, no GPS)
- **Tap a quest pin ("stadium") or a spot on the map → walk there.** The route is a straight line, or a seeded polyline for the demo route (Alex → Dumpling Den) so the walk follows streets. Speed matches the server's walking math (80 m/min shown as a countdown, sped up ×20 visually so a 9-minute walk takes about 25 s on screen; the countdown still shows real minutes).
- **Joystick** (bottom-left on phones) and **WASD/arrow keys** (desktop) for free walking.
- The avatar's position is local to the viewer's screen. It's never written to the database (privacy: your real shared location stays what Find My shares).
- Reaching a quest's walk radius (about 30 m) opens its `QuestPanel`, as tapping a pin does today.

### Quest "stadiums"
- Each quest pin becomes a landmark: the existing pin and seat badge are lifted onto a tall glowing column (a three.js cylinder or beacon in the quest's category color) that can be seen from far away.
- **Muse picks** get a gold ring and a taller beam (same rule as the 2D "✨ Muse pick" highlight). Non-picks dim.
- Full quests drop their beam. Live seat updates arrive through the existing `quest:<id>` channel, so beams change on every screen at once.

### The Muse pet

States, driven by Out Here's existing plan state:

| State | Trigger | Pet does |
|---|---|---|
| `follow` | default | floats at your right shoulder, lagging slightly behind (spring), `Hover` |
| `listen` | the composer opens (`setPlanOpen(true)`) | turns to face you, `Hover` |
| `think` | a plan request is in flight | flies in front of you, `Think`, small spinner in the bubble |
| `talk` | the plan returns | stays in front, `Talk`; bubble shows `MusePlan.summary`, then the top suggestion's `reason`. Tapping the bubble opens the full `PlanSheet` card with Join / Invite |
| `negotiate` | invite sent (and later Click and agent-to-agent plans) | flies from your avatar to the friend's avatar (if on screen), exchanges bubbles with their pet, returns |
| `deliver` | host broadcasts an announcement (later) | flies off-screen toward the recipients; on their screens a pet arrives, plays the message, shows Join / Not now |
| `celebrate` | joined / invite accepted | `Happy` loop, then back to `follow` |

The bubble text is real data from the plan response, never canned filler. Long text is clipped to 2 lines with "More" opening the card.

### Other people on the map
- **Friends** come from `useFriendPins` (already privacy-filtered and fuzzed by the server). Within about 400 m of your avatar, each friend is a 3D avatar standing at their pin, with their `StatusBubble` as a DOM bubble above it. Farther away, they stay as the existing face pins.
- **Cap: 12 animated characters on screen.** The nearest 12 get models; others stay as face pins. Clone models with `SkeletonUtils.clone` so geometry and textures load once.
- **Tap a friend avatar → radial menu:** 👋 Wave (plays `Wave` on your avatar, and on theirs on their screen through a realtime broadcast), Want to hang? (opens the existing invite flow), View profile.
- Strangers never appear as avatars, only as seat counts on public quests (same rule as today).

### `AvatarConfig` (new shared type, core)
```ts
export type AvatarConfig = {
  model: string;                                   // key in public/models/manifest.json
  parts: Partial<Record<'hair' | 'top' | 'bottom' | 'shoes' | 'acc', string>>;  // mesh names
  colors: Partial<Record<'primary' | 'secondary' | 'accent', string>>;          // hex
  petColor: string | null;
};
```
Seeded for each persona in `scripts/seed.ts`. Until a migration adds a column, the world area derives a stable default config from the user id (hash → parts and colors), so every friend looks different from day one.

### Performance and fallbacks
- Lazy-load three.js and the models only when 3D mode is first opened (dynamic import). The Map view's load time doesn't change.
- Target 30+ fps on a mid-range phone at 390 px. If the frame time stays above 50 ms for 3 s, drop shadows, reduce the character cap to 6, then fall back to Map with a toast.
- No WebGL2, or a model fails to load → the toggle shows 3D as unavailable and stays on Map.
- Pause the render loop when the tab is hidden.

## 4a. GPS and the zoom continuum

**One camera, not two modes.** In 3D the tilt is a function of zoom (`pitchForZoom` in `src/features/world/math.ts`): flat at zoom 15 and below, 65° at 18.5 and above, smooth in between. Pinching out from street level turns into the overhead map; pinching in tilts back down. Characters hide below zoom 15.8 and the 3D buildings fade out below 16.5, so the zoomed-out view is today's map. Dragging the map stops following; **◎ Back to me** flies back down behind the avatar.

**Where you are: two sources, one switch** (bottom right in 3D):
- **🕹️ Demo walk** (default): the avatar starts at the viewer's seeded home. Joystick (phones), arrow keys / WASD (desktop), or **🚶 Walk there** on a selected plan. The walk uses the server's walking math (80 m/min, ×1.3 route factor) for the countdown and plays 20× faster on screen.
- **📡 Live GPS**: `watchPosition` with high accuracy. Fixes worse than 60 m or implying more than 9 m/s are dropped; the avatar eases toward each fix. Heading comes from the GPS course while moving and from the compass while standing (iPhone asks for compass access on the tap). If the fix is more than 5 km from Menlo Park, a note offers the demo walk. If location is blocked, it falls back to the demo walk with a note.

**Privacy:** the 3D view never sends a position to the server. GPS moves your own avatar and walking countdown only, and the chip says "stays on this device". Sharing with friends stays with Find My (audience, precision, pause, expiry). Strangers never appear as avatars.

**Arrival:** within 35 m of a plan you get "📍 You're at …"; a "Walk there" that arrives also opens the plan's panel.

**Not built yet** (next GPS step): a server check-in (`POST /api/quests/:id/checkin` verifying distance to the exact location for members, broadcasting `{hereCount}` on `quest:<id>`), "🔴 Live · N here" badges, hangout mode (members see each other en route, auto-off at the end), and the second check-in triggering the photo prompt. That needs a migration on both Supabase projects.

## 5. Build order

Each phase ends with something demoable, merged into `overnight` and deployed as a preview. Stop at any phase and the demo still works.

| Phase | Deliverable | Needs Ally? |
|---|---|---|
| ✅ **W0 — Toggle + 3D city** | Map / 3D toggle; 3D mode tilts to pitch 60, 3D buildings, camera follows a placeholder marker at Alex's origin | No |
| ✅ **W1 — Avatar walks** | three.js custom layer, placeholder avatar with Idle/Walk, joystick + WASD, tap-a-pin-to-walk with countdown, quest panel opens on arrival | No (placeholder) |
| ✅ **W2 — Muse pet talks** | Pet follows; `listen` / `think` / `talk` wired to the real plan pipeline; speech bubble shows the real summary and reason; tap → plan card | No (placeholder) |
| ✅ **GPS** | Live GPS / demo walk switch, zoom continuum, arrival (section 4a). Server check-in not built | No |
| ✅ **W3 — Ally's models in** | Jolly (Muse) and the Kenney person from `assets/muse-companion` are live via `public/models/manifest.json`, which maps her nodes and clips (`follow_back`, `thinking`, `talk_front`, `person_idle`, `person_run`) to the view's states; `npm run models:sync` copies a new export. See `public/models/README.md` | Done |
| ◐ **W4 — Stadiums + friends** | ✅ Quest beacons (Muse picks and the selected plan in blue, full plans have none); ✅ friend avatars within 600 m (nearest 12) with name + status labels; ✅ tap a friend → your avatar waves and their Find My card opens. Not yet: the wave on the friend's own screen (realtime) | Avatar variants nice-to-have |
| **W5 — Negotiate + celebrate** | Invite sent → pet flies to Maya's avatar, bubbles, returns; accepted → `Celebrate`/`Happy` on both screens | No |
| **W6 — Polish** | Camera easing, reduced motion, performance fallbacks, Playwright smoke (`3d-toggle` testid, bubble text present), reviewer + ui-critic pass | Polished models |
| Later | `deliver` announcements, Click agent-to-agent intros on the map, customization UI, earned items | — |

**Cut line for the Fri 10:30 PT submission:** W0–W3 plus the friend avatars from W4 is a strong demo. If anything is shaky by Fri 06:00 PT, demo the 2D map live and show the 3D view as a recorded clip.

## 6. Demo segment (replaces step 2–4 of the HANDOFF demo, about 2 min)

1. On Alex's screen, tap **3D**. The camera flies down behind Alex's avatar; the Muse pet waves beside him. Dumpling Den's beacon is visible down the street.
2. Tap **✨ I'm free**, type "hungry, got like 40 min, under $15". The pet flies in front of Alex and thinks, then says: "Maya's on a long lunch and craving dumplings. Dumpling Den has 2 seats, 9 min walk, $12."
3. Tap the bubble → **Invite Maya**. The pet flies down the street to Maya's avatar and back.
4. On Maya's screen, her pet arrives with the invite. Accept. Both avatars play `Celebrate`, and Dumpling Den's beam drops to **Full** on both screens.
5. Tap the beacon → Alex walks there, countdown running.

## 7. Open questions

1. **Ally:** which tool (Blender?), and when can a rough v1 with `Idle`/`Walk` and `Hover`/`Fly` land? That sets when W3 starts.
2. **Ally:** one avatar with swappable parts, or a few complete avatars? The first allows customization later; the second is faster.
3. **Team:** who builds the world area: a human, an agent slice, or both (human on models and feel, agent on wiring)?
4. **Team:** is 3D mode the default on the Out Here tab for the demo, or a toggle from the 2D map? Recommendation: open in Map, tap into 3D on stage, because the fly-down is the reveal.

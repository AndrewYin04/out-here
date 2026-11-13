# Jolly Muse viewer

From the repository root, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://localhost:8765/tools/muse-viewer/>. Render gallery: <http://localhost:8765/tools/muse-viewer/renders.html>.

No build step or repository npm dependencies. Internet access is required for Three.js, GLTFLoader, and OrbitControls, pinned to Three.js 0.170.0 on jsDelivr.

Muse and person actions run independently with 0.3-second crossfades. Auto demo loops follow_back (3 s), thinking (1.5 s), and talk_front (3 s). Manual Muse selection stops the demo; person selection does not. Clicking talk_front again replays its bounce.

Talk mode brings Muse onto the screen's center ray, 0.4 m closer than the neutral follow pose, and keeps its face aligned to the actual camera after orbiting. The camera target eases to Muse's center. Person's transform stays unchanged. The HTML message follows Muse_SpeechBubble; the 3D bubble remains blank.

## Checks

Headless Chromium tests all five buttons, independent playback, rapid crossfades, OrbitControls, auto-demo timing, mobile layout, Muse dimensions and follow placement, direct camera eye contact, centered talk framing, and Person's unchanged origin. Screenshots and results are in `screenshots/`. `follow-side-clearance.png` shows the gap behind the torso; `render-comparison.png` shows the three transparent Blender render checks together.

```sh
node tools/muse-viewer/verify.cjs /absolute/path/to/playwright /absolute/path/to/chromium
```

Use an existing Playwright installation; the verifier adds no dependencies. `MUSE_VIEWER_URL` overrides the default URL. Screenshot capture may produce Chromium GPU ReadPixels performance warnings, recorded separately from console errors.

The current Muse follows the plush-photo refinement: one continuous round body and feet, shoulder-attached resting mitten arms, an inward recessed oval face, stronger blush, fine fleece/hair, and a small blue platform. `assets/muse-companion/refine_plush.py` builds this revision. Assets and viewer are backed up under their `backups/pre-plush-refine-20261112/` folders.

The `.blend` retains 200,000 fine curved hairs. The GLB uses 26,000 thin mesh fibers plus supplied fleece texture detail, omitting the dense curve layer. The supplied 4.X shell-fur graph is available as a disabled Blender alternative. Only shader/geometry data were inspected; embedded scripts were not executed.

**Walk together** translates a shared parent group and plays the original run clip. It never edits the skater or its local transform. The camera follows the group. The platform emits a soft world-space trail from its actual position; particles stay behind, disperse, and fade in 1.7 seconds. Emission stops on pause/idle, and the old wake finishes fading. The lightweight halo and trail are runtime viewer effects rather than GLB features; the emissive platform itself is embedded in the GLB.

The verifier checks motion, world-space persistence, fade completion, stationary emission stop, and eye contact while moving, alongside all previous animation/orbit/mobile checks. Screenshots include `walking-platform-trail.png`, `walking-talk_front.png`, and `stationary-platform.png`. Blender's independent asset checks are in `assets/muse-companion/renders/plush-validation.json`.

Blender MCP remained unresponsive, so the revision and transparent renders were produced using the installed Blender executable. No pushes or commits were made; the user explicitly requested no commits or pushes.

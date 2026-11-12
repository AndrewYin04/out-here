# Credits

Out Here is a hackathon demo. Every person, post, message, event, listing and
venue in the seed data is fictional. Venue names such as "Dumpling Den" and
"The Signal Room" are made up and do not refer to real businesses.

## Images

- All images under `public/seed/` (62 portraits, 12 group covers, 45 post
  photos, 16 stories, 20 event covers, 30 listing photos) were generated with
  **Meta Muse Image (`muse-image-1.0`)** on 2026-11-12 by
  `scripts/gen-images.mjs`. The portraits show fictional people, not real
  individuals; prompts never name a real person.
- Any image the model refused is replaced by a locally drawn SVG placeholder
  (initials on a solid color, or a plain gradient), logged in
  `docs/evidence/M1-content.md`.

## Text

- Profile bios, posts, comments, Messenger threads, group descriptions, event
  descriptions and Marketplace listings in `supabase/seed-content.json` were
  generated with **Meta Muse Ember (`muse-ember-1.0`)** on 2026-11-12 by
  `scripts/gen-content.mjs`, from a fixed outline written in that script.

## Map

- Map tiles: OpenFreeMap © OpenMapTiles Data from OpenStreetMap.

## Avatars

- Person model, rig and idle pose: [Kenney "Animated Characters Protagonists"](https://kenney.nl/assets/animated-characters-protagonists) (CC0). Recolourable textures and renders in `public/avatars/` are built from it by `assets/avatars/build_avatars.py`.

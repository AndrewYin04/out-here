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
- Two images were added later for the comic open house story, outside
  `scripts/gen-images.mjs`: `public/seed/people/theo.webp` is a
  [DiceBear](https://www.dicebear.com/) `notionists` avatar (CC0, seed
  "TheoNakamura"), and `public/seed/listings/l31.webp` is an SVG drawing of
  invented comic covers rendered with `sharp`.
- The comic open house text (Theo's profile, listing l31, post p301, the
  Inkwell Comics Café plan) was written by hand. Its comic titles are invented.

## Text

- Profile bios, posts, comments, Messenger threads, group descriptions, event
  descriptions and Marketplace listings in `supabase/seed-content.json` were
  generated with **Meta Muse Ember (`muse-ember-1.0`)** on 2026-11-12 by
  `scripts/gen-content.mjs`, from a fixed outline written in that script.

## Map

- Map tiles: OpenFreeMap © OpenMapTiles Data from OpenStreetMap.

## Meta HQ 3D data

`public/geo/meta-hq.json` (building footprints and floor counts, MPK 20's rooftop park, plazas and individually mapped trees around 1 Hacker Way) is derived from OpenStreetMap by `scripts/fetch-hq-osm.mjs`. © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0): https://www.openstreetmap.org/copyright. The 3D models built from it (facades, roofs, trees) are generated in code; OSM has no floor count for MPK 21, so it is drawn with 3 floors.

## 3D characters

The Muse companion "Jolly" is by Ally Chen (`assets/muse-companion/`). The person model and its idle/run animations are from Kenney's "Animated Characters Protagonists" pack (CC0, https://kenney.nl).

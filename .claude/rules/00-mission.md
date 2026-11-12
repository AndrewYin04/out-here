# 00 — Mission and product scope

## The hackathon
- **Facebook — Closer Together AI Hackathon 2026.** Deadline **Thu Nov 13 2026, 10:30 AM PT**.
- Brief: build the AI-powered Facebook feature you wish existed for **young adults** (new city, new friends, finding your scene, turning group-chat plans into real plans).
- **A Muse model (Spark / Wonder / Ember) must power the core AI experience.**
- Judging: **AI Integration 30%** (AI does real work, natural part of the product) · **Product Thinking & User Impact 25%** (clear young-adult need, fits Facebook, reason to come back) · **Execution & Demo 25%** (working, polished, no unnecessary mockups) · **Originality & Cohesion 20%**.
- Final: **5-minute live demo + 3 minutes of Q&A**. Submission: Devpost page, public GitHub repo, optional video.

## The product: Out Here
A live Facebook map of nearby plans you can join right now — real-world **side quests** (dumplings after a show, a thrift walk, the last spot in a pickup game). **Muse** turns "I'm free" into an actual plan with a friend and a chance to meet new people.

### The one loop (everything must serve it)
**I'm free → Muse finds the plan → join live → photo together → do it again.**

If a feature doesn't make a step of this loop better, it is out of scope. Our own critique of Facebook is that it's cluttered; Out Here must feel like one focused tab, not five apps.

### Feature tiers
Do not start a tier until every item in the tier above works end-to-end on the deployed build.

**P0 — must work live in the demo**
1. **Live map** (MapLibre + OpenFreeMap) with **Friends** / **Explore** toggle. Explore = public quest pins with open-seat badges. Friends = friends' shared availability + quests friends joined.
2. **"I'm free" composer**: free text + optional time window ("hungry, 30 min, under $15").
3. **Micro-hangouts / time-fit**: Muse only suggests plans that fit the window **including walking time** there.
4. **Muse plan**: parse intent → candidate generation (code) → Muse ranks, explains in plain language, adds friend-bridge line, drafts invite → validation (code). Returns 2–3 suggestions.
5. **Friend overlap**: your window ∩ friend's shared window ∩ open quest → "Maya's free after work till 6 and you both like dumplings — 2 seats left at Dumpling Den, 9 min walk."
6. **Invite + join live**: send invite, friend accepts (second browser/device with demo user switcher), **seat count updates live on every screen**.
7. **Demo user switcher** (no real auth) with seeded personas.

**P1 — the reason to come back**
8. **"We're done" → photo prompt** for everyone who joined (BeReal-style "take a photo together") → **shared crew album**; Muse writes the caption.
9. **Social Continuity — "Get this group together again"**: a crew forms automatically after a hangout; Muse remembers shared preferences and proposes the next time/place/activity that fits everyone's windows. No group chat or recurring event to manage.
10. **Create a quest from a vague idea** ("someone to try pho with") → Muse fills place, time, group size, title, invite copy.

**P2 — engagement layer**
11. **Daily Quest**: one prompt per day for everyone (Wordle/BeReal energy, open all day), e.g. "Eat something you've never tried — with someone." Muse generates prompts and checks the photo matches (vision) if the Muse API supports images.
12. **Streaks — weekly, not daily**: "weeks in a row you hung out in person". Daily streaks for IRL hangouts push people to game or burn out; say this in Q&A.
13. **Out Here Wrapped**: monthly recap (Spotify-Wrapped style cards) of photos, quests, people met, places, top vibe — Muse writes the story. Use seeded history so it looks full.

### Explicitly cut (do not build)
- Calendar/location "skipping class" inference — creepy. Calendar only appears on a slide as opt-in free/busy.
- Real auth, real payments, DMs/chat, notifications infra, native apps.
- Friend Bridges is **not** a feature — it is one optional line (`bridge`) inside Muse's explanation.

## Why it fits Facebook (use in pitch copy)
Groups give people communities; Events give them a place; Out Here connects both **in the moment** using the social graph other apps don't have — you start with someone you know and meet new people through something you both want to do.

## Safety and privacy model (build it in, and it's the Q&A answer)
- Availability is **friends-only**; Explore shows first names + interests only.
- Quest location is **approximate (~200 m fuzz) until you join**; public venues only.
- **Join-with-a-friend** is the default path; min group size 3 for stranger quests.
- Interests used for matching are ones the user chose to share; Muse explanations never reveal private data (e.g. never "Maya's friend Sam is going" unless Sam's attendance is public).
- Report/block affordance on every quest sheet (UI only is fine).

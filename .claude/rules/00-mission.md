# 00 — Mission and product scope

## The hackathon
- **Facebook — Closer Together AI Hackathon 2026.** Deadline **Fri Nov 13 2026, 10:30 AM PT**.
- Brief: build the AI-powered Facebook feature you wish existed for **young adults** (new city, new friends, finding your scene, turning group-chat plans into real plans).
- **A Muse model (Spark / Wonder / Ember) must power the core AI experience.**
- Judging: **AI Integration 30%** (AI does real work, natural part of the product) · **Product Thinking & User Impact 25%** (clear young-adult need, fits Facebook, reason to come back) · **Execution & Demo 25%** (working, polished, no unnecessary mockups) · **Originality & Cohesion 20%**.
- Final: **5-minute live demo + 3 minutes of Q&A**. Submission: Devpost page, public GitHub repo, optional video.

## The product: a Facebook web app, with Out Here as one tab in it
The product is a Facebook web app with fictional people; Out Here is one tab in it (top bar, mobile bottom bar, left nav). The Facebook base (shell, Feed, Profile, Friends, Notifications, Groups, then Messenger, Events, Search) makes Out Here invites arrive the way Facebook delivers things: as notifications, Messenger messages, and hangouts on a Group page. Build on Facebook surfaces only: no Instagram, Threads, or WhatsApp UI. The master plan is `MVP-BUILD-PLAN-itr-1.md`; its section 5 holds the Facebook base detail.

**Priority when time runs short:** Out Here P0 inside a believable Facebook shell is the demo. Facebook surfaces the demo does not pass through come after it.

## Out Here
A live Facebook map of nearby plans you can join right now — real-world **side quests** (dumplings after a show, a thrift walk, the last spot in a pickup game). **Muse** turns "I'm free" into an actual plan with a friend and a chance to meet new people.

### The one loop (everything must serve it)
**I'm free → Muse finds the plan → join live → photo together → do it again.**

If a feature doesn't make a step of this loop better, it is out of scope. Our own critique of Facebook is that it's cluttered; Out Here must feel like one focused tab, not five apps.

### Feature tiers
Do not start a tier until every item in the tier above works end-to-end on the deployed build.

**P0 — must work live in the demo**
1. **Live map** (MapLibre + OpenFreeMap) with **Friends** / **Explore** toggle. Explore = public quest pins with open-seat badges. Friends = friends' shared live locations with status bubbles (item 1a), friends' shared availability, and quests friends joined.
1a. **Friend locations + status bubbles ("Find My" inside Facebook), shown regardless of any Muse match.**
   - Each friend who shares with you appears on the Friends map as their avatar pin.
   - Each pin has a **status bubble** with up to three parts: a thought or status line with an emoji ("craving dumplings 🥟"), what they're doing ("at work till 5:15"), and what they want to do ("want to try the new boba place"). The bubble also shows "updated N min ago".
   - Tapping a friend opens a card: name, distance and walking minutes, the bubble, and actions View profile, Message, and "Want to hang?". "Want to hang?" sends an invite that suggests a nearby quest or place.
   - A friends list or sheet ("People", sorted by distance) mirrors the pins, like Find My's People tab. Friends far away (other cities) appear with city and distance, and the map can zoom out to them.
   - **You set your own sharing:**
     - Who sees you: friends, Close friends, a custom list, or nobody. This is the same Audience model and `canSee` as posts.
     - Precision: exact, or approximate (about 500 m to 1 km, fuzzed).
     - Pause sharing at any time.
     - Edit your status bubble.
     - Shared locations expire, for example after 4 hours unless refreshed.
   - Live: a friend's pin and bubble update on every screen within about 2 s when they move or edit their status, over a Broadcast `location:<userId>` event carrying ids only, after which clients refetch.
   - Muse builds on this layer, it does not replace it. Muse uses bubbles and availability to propose overlaps ("Maya's bubble says craving dumplings and she's 9 min away").
2. **"I'm free" composer**: free text + optional time window ("hungry, 30 min, under $15").
3. **Micro-hangouts / time-fit**: Muse only suggests plans that fit the window **including walking time** there.
4. **Muse plan**: parse intent → candidate generation (code) → Muse ranks, explains in plain language, adds friend-bridge line, drafts invite → validation (code). Returns 2–3 suggestions.
5. **Friend overlap**: your window ∩ friend's shared window ∩ open quest → "Maya's free after work till 6 and you both like dumplings — 2 seats left at Dumpling Den, 9 min walk."
6. **Invite + join live**: send invite, friend accepts (second browser/device with demo user switcher), **seat count updates live on every screen**.
7. **Demo user switcher** (no real auth) with seeded personas.

1b. **Muse Intros (Boardy-style warm intros).** Muse introduces two people one to one, the way a trusted friend would. Kinds: Friendship, Networking/coffee chat, and Dating (opt-in on both sides). Hookups are out of the demo.
   - Reach is friends-of-friends and members of your Groups, and every intro names its trust path ("you both know Maya").
   - The quality bar is strict: score at least 85, 2 or more concrete reasons, and a trust path. Otherwise nothing is sent. At most 1 intro per person per week, plus intros you ask for.
   - Double opt-in like Boardy: both people privately accept before anything is shared; then Muse opens a 3-person Messenger thread and stays in it to schedule a time and place.
   - Full spec: MVP-BUILD-PLAN-itr-1.md, "Muse Intros". Built in M4 as its own slice, after the M3 checkpoint.

**P1 — the reason to come back**
8. **"We're done" → photo prompt** for everyone who joined (BeReal-style "take a photo together") → **shared crew album**; Muse writes the caption.
9. **Social Continuity — "Get this group together again"**: a crew forms automatically after a hangout; Muse remembers shared preferences and proposes the next time/place/activity that fits everyone's windows. No group chat or recurring event to manage.
10. **Create a quest from a vague idea** ("someone to try pho with") → Muse fills place, time, group size, title, invite copy.

**P2 — engagement layer**
11. **Daily Quest**: one prompt per day for everyone (Wordle/BeReal energy, open all day), e.g. "Eat something you've never tried — with someone." Muse generates prompts and checks the photo matches (vision) if the Muse API supports images.
12. **Streaks — weekly, not daily**: "weeks in a row you hung out in person". Daily streaks for IRL hangouts push people to game or burn out; say this in Q&A.
13. **Out Here Wrapped**: monthly recap (Spotify-Wrapped style cards) of photos, quests, people met, places, top vibe — Muse writes the story. Use seeded history so it looks full.

### Facebook base tiers
Order of work across both tier lists: FB-P0 shell and Out Here P0 first (they meet at the M3 checkpoint), then FB-P1 with Out Here P1, then the P2 tiers.

**FB-P0: needed for the demo and for "looks like Facebook"**
- **Shell.** Top bar: search, center tabs (Home, Friends, Out Here, Groups, Marketplace), Messenger, notifications with a live badge, avatar menu with the persona switcher. Left nav, right rail with Contacts and live online dots. Mobile bottom bar.
- **Feed.** Stories tray (seeded; the viewer opens). Composer with text, a photo upload to Storage, and an audience picker (public, friends, or a friend list). Posts with the 7 reactions (Like, Love, Care, Haha, Wow, Sad, Angry), comments with one reply level, and share.
- **Profile.** Cover, avatar, friend count with an avatar stack, an Intro card that applies per-field visibility, and Posts, About, Friends, and Photos tabs.
- **Friends.** Requests (Confirm and Delete work), Suggestions ranked by mutual friends, All friends, and Friend lists (create, add, remove; "Close friends" is seeded).
- **Notifications.** Friend requests, comments, reactions, and Out Here invites and joins. Each one links to its object.
- **Groups.** Group page with Discussion, Members ("N friends are members"), and a **Hangouts** tab listing that Group's Out Here quests. Join and leave work.

**FB-P1: after the Out Here P0 checkpoint**
- **Messenger.** `/messages` inbox plus docked chat windows. Out Here invites also arrive as a Messenger message with Accept and Decline. New messages appear within 2 s for the other persona.
- **Events.** Discover, an event page with Going and Interested and live counts, and guest lists showing friends first.
- **Search.** People, Groups, Events, and quests.

**FB-P2**
- Marketplace grid and item page.
- Reels viewer with 6 to 8 vertical clips from Mixkit or Coverr, under 4 MB each, listed in `CREDITS.md`.
- Photos tab albums.
- Gaming and Dating are left out of the nav.

### Explicitly cut (do not build)
- Calendar/location "skipping class" inference — creepy. Calendar only appears on a slide as opt-in free/busy.
- Real auth, real payments, native apps. (Messenger and notifications are Facebook base surfaces now, so they are in scope.)
- Friend Bridges is **not** a feature — it is one optional line (`bridge`) inside Muse's explanation.

## Why it fits Facebook (use in pitch copy)
Groups give people communities; Events give them a place; Out Here connects both **in the moment** using the social graph other apps don't have — you start with someone you know and meet new people through something you both want to do.

## Safety and privacy model (build it in, and it's the Q&A answer)
- Availability is **friends-only**; Explore shows first names + interests only.
- Quest location is **approximate (~200 m fuzz) until you join**; public venues only.
- **Join-with-a-friend** is the default path; min group size 3 for stranger quests.
- Interests used for matching are ones the user chose to share; Muse explanations never reveal private data (e.g. never "Maya's friend Sam is going" unless Sam's attendance is public).
- Report/block affordance on every quest sheet (UI only is fine).

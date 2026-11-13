# Post-hangout rating

After a hangout ends, every attendee gets a short questionnaire modeled on Beli: rate the hangout, add photos, and answer "Hang out with them again?" yes or no for each other person. The data feeds two features other teammates are building:

- **Recap** (Ally): reads photos, verdict counts and highlight chips for one hangout.
- **Muse matching** (Alex): reads each user's private "hang again" answers and rating history, on the server only, to decide who to match.

Branch: `feat/hangout-ratings`, cut from `feat/your-plans-memories` (it reuses that branch's photo capture). Coordination issue: see the link in the board. Types: `src/shared/types.ts` (section "Post-hangout rating"). Routes: `src/shared/api.ts`.

## What the user sees

1. A hangout ends: someone taps "We're done" (`POST /api/quests/:id/complete`), or the quest's end time passes. Every member gets a `hangout_rate` notification, "How was Dumpling Den?", which opens the questionnaire.
2. **Step 1, the verdict.** Three choices, as in Beli: "Loved it", "It was fine", "Not for me".
3. **Step 2, placement.** If the user has rated other hangouts in the same bucket, the app asks "Which was better?" against at most 3 of them (binary search). The answer places this hangout and sets its 0-10 score inside the bucket's range (`VERDICT_RANGES`: loved 6.7-10, fine 3.4-6.6, meh 0-3.3). With no past ratings in that bucket, the score is the bucket's midpoint. The user can skip this step, which also gives the midpoint.
4. **Step 3, highlights and photos.** Chips from `HANGOUT_HIGHLIGHTS` ("great conversation", "too loud", ...), an optional private note, and a dashed "Add photos" tile (`AddPhotoTile`). Each picked photo uploads at once through `POST /api/memories`, with no caption form, and shows as a thumbnail. The resulting memory ids go into `photoIds`.
5. **Step 4, "Hang out with them again?"** One row per other attendee, with avatar, name, and Yes / No buttons. The text under it reads "Only Muse sees this. It helps Muse suggest who to invite next time." A person can be left unanswered.
6. Done screen: "Saved. Muse will use this next time.", the score ("8.4, your #2 hangout"), and a "✨ Muse" line. `POST /api/muse/rating-takeaway` asks Muse (Ember, minimal effort) to write it from the saved verdict, the chips (each mapped to a phrase: "met someone new" is "meeting new people", "too loud" is "somewhere quieter"), the venue, the first names of people marked yes, and the viewer's past "loved" hangouts (count in this category, count with each yes person, venues). Code rejects a line that names any other attendee or a number that is not one of those counts. In mock mode, or when Muse fails or its line is rejected, the code template `fallbackTakeaway` is shown, for example "Next time I'll look for good food and great conversation like this, with Maya." or "Noted. Next time I'll look for somewhere quieter."; after a failure it is shown without the "✨ Muse" label. It never names someone marked no or left unanswered.

Editing a rating starts with the saved verdict and score selected. Next keeps the score and goes to the details step; placement runs again only for a different verdict or "Re-rank", and Skip during a re-rank with the same verdict keeps the saved score instead of the bucket midpoint.

"We're done" opens only this dialog; the plan card's own photo form stays closed. After saving, the card shows "You rated it 8.6" and the photos added in the dialog.

On the Memories crew card, when the viewer's verdict is "Not for me" or they said no to every other member, "Get this group together again" is replaced by "Find a different plan" (with "Regroup anyway" when someone is still a yes or unanswered).

A rating can be edited later from the hangout's card in Memories (PUT is an upsert).

## Data

Migration `supabase/migrations/0004_hangout_ratings.sql` (0003 is taken twice already: `0003_crew_photos` and `0003_intros`; the runner records full filenames, so that is fine).

```sql
create table hangout_ratings (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references quests(id) on delete cascade,
  rater_id uuid not null references profiles(id) on delete cascade,
  verdict text not null check (verdict in ('loved','fine','meh')),
  score numeric(3,1) not null check (score between 0 and 10),
  highlights text[] not null default '{}',
  note text not null default '',
  photo_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quest_id, rater_id)
);
create table hang_again (
  quest_id uuid not null references quests(id) on delete cascade,
  rater_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references profiles(id) on delete cascade,
  again boolean not null,
  created_at timestamptz not null default now(),
  primary key (quest_id, rater_id, subject_id),
  check (rater_id <> subject_id)
);
-- RLS on, no anon policies, as for every table.
```

## Rules the server enforces

- Only a member of the quest can rate it, and only after its start time.
- `score` must lie inside `VERDICT_RANGES[verdict]`. `highlights` must come from `HANGOUT_HIGHLIGHTS`. Each `subjectId` must be another member of the same quest. `photoIds` must be memories of that quest.
- **Privacy.** A hangout is rated, never a person, and nobody ever sees a score for a person.
  - No route returns another user's `hang_again` rows or `note`.
  - The recap shows counts and chips, not who said what. **k-anonymity:** until 3 members other than the viewer have rated (`RECAP_MIN_OTHER_RATERS`), `countsHidden` is true, `verdicts` is null, and `highlights` holds only positive chips every rater picked. Below that threshold no "Not for me" count and no complaint-chip count is returned, because on a 2-person hangout the viewer's own vote would reveal the other one.
  - Muse may use the answers but never reveals them: no "Maya said she'd hang again", and no hinting that someone said no.

## Reading the data

**Routes** (viewer from `x-persona`):

| Route | Returns | For |
|---|---|---|
| `GET /api/quests/:id/rating` | `HangoutRatingState`: the viewer's rating, the viewer's own hang-again answers, the other attendees, and past ratings for placement | the questionnaire |
| `PUT /api/quests/:id/rating` | `{ rating }` | the questionnaire |
| `GET /api/quests/:id/recap` | `HangoutRecap`: quest, members, photos, `ratedCount`, verdict counts, highlight counts, the viewer's own rating | **Ally's recap** |
| `GET /api/me/ratings` | the viewer's rated hangouts, by score | Memories, Wrapped |

**Server-only functions** for **Alex's Muse matching**, exported from the data area's server barrel (`src/features/data`, store methods). Call them only from route handlers or Muse server code, never from a client component:

```ts
hangAgainSignals(userId: ID): Promise<HangAgain[]>         // answers this user gave
hangAgainAbout(userId: ID): Promise<HangAgain[]>           // answers others gave about this user
mutualHangAgain(a: ID, b: ID): Promise<'both_yes' | 'one_no' | 'unknown'>
hangoutRatings(userId: ID): Promise<HangoutRating[]>        // this user's ratings, with highlights
```

Already applied by `POST /api/muse/regroup`: members the viewer said no to are left out of the context and the seat check (409 when nobody is left), `GET /api/muse/regroup` returns them per crew as `notAgainIds` (the viewer's own answers) so the card never invites them, and the viewer's "Loved it" chips go to Muse as `likedBefore`. The call logs `{ pastHangoutsRated, likedBefore, membersLeftOut }` in `muse_runs.output.signals` (`museJSON` option `logSignals`).

Suggested matching rules (Alex decides):

- Never pair two people when either said no.
- Rank pairs where both said yes first.
- Use high-scoring highlights ("good food", "great conversation") as preference signals.
- Log the signal in `muse_runs.output` so "why did Muse suggest this" can show that it used past hangouts, without saying whose answer it was.

## Deploying

Apply `0004_hangout_ratings.sql` to out-here-dev and out-here-demo before deploying this branch. Without it, `npm run seed` / `seed:demo` fail (they truncate `hangout_ratings` and `hang_again`), and the "How was it?" notification is rejected by the old `notifications_type_check`. "We're done" still succeeds then: the rating prompt is isolated from the completion.

## Seed

`npm run seed` adds ratings and hang-again answers for Alex's 3 past hangouts and their crews, so the recap and matching have data on day one. Mutual yes: Alex and Maya. One "no" about a non-demo persona, so the "never pair" rule can be tested.

## Coordination

- Agents talk on the coordination issue. Start each comment with your feature in brackets: `[ratings]`, `[recap]`, `[matching]`.
- To change a type or route in this doc, comment the exact change first. The ratings branch owns `src/shared` for these types until it merges.
- If you need a field that is not here (for example `cityLabel` on the recap), ask on the issue. Do not add a parallel table.

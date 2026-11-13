# Demo guide: Out Here, 45 Minutes to Thrift (3:00)

The 5-minute slot is 1:00 of intro, this 3:00 demo, and a 1:00 close and buffer. Follow it exactly: the prompts below are the words the rehearsal typed, and the Muse cache is warmed with them.

## Setup

### Who drives what

| Screen | Persona | URL (production, or the verified preview) | Size |
|---|---|---|---|
| Laptop A, projected | Alex (demo driver) | `/out-here?as=alex` | 1440 x 900 |
| Phone (or a narrow window beside A) | Maya | `/out-here?as=maya` | 390 x 844 |
| Laptop B, teammate | Leo (seller) | `/out-here?as=leo&sell=popup` | 1440 |

Each tab keeps its own persona (`?as=` is stored per tab), so all three can be tabs in one Chrome profile. Leo's URL opens the "Campus Thrift Pop-Up" sheet with the $20 track jacket and the Y2K denim shoulder bag already filled in. Leave it open and do not tap it until beat 3.

### Before going on stage (10:00 to 10:20 AM PT)

1. The main session reseeds `out-here-demo` (`npm run seed:demo`) at about 6 AM PT, after applying any migration on main.
2. On Alex's tab: avatar menu (top right) → **Reset demo** → type the presenter key → **Reset shared demo**. This sets every time relative to now: Maya is free for the next 90 minutes, the boba quest moves to the afternoon, every listing hold and every rehearsal photo is cleared.
3. Warm Muse's cache from Andrew's laptop: `npm run warm:demo -- --base https://<production or preview URL>`. Its first step is the exact stage ask below, then it resets again.
4. Open the three tabs above and reload each once after the reset. Check on Alex's map that Maya's avatar has a green ring and that Up next shows nothing.
5. Close every other tab. Turn off notifications on the presenting laptop.

What must be on screen at 0:00: Alex's Out Here map (Friends tab), Maya's phone on her Out Here map, Leo's laptop on the open pop-up sheet.

## The script

### Beat 1. Two friends have 45 minutes (0:00 to 0:25)

| | |
|---|---|
| Screen | Alex (projected) |
| Click | Hover Maya's avatar on the map: her bubble shows. Then tap **I'm free** (the blue button above the dashboard). |
| Type | **"I've got 45 minutes. Can I grab boba with someone nearby?"** then press Enter |
| Say | "Alex has 45 minutes between things. Maya's status says she's free after class and down for boba. Alex just tells Muse what he wants." |
| Audience sees | Maya's bubble "🧋 Free after class · Down for boba · updated N min ago", then Muse's steps: reading the ask, checking who's free, checking plans nearby. |

### Beat 2. Muse makes the plan (0:25 to 1:10)

| | |
|---|---|
| Screen | Alex, then Maya, then both |
| Click | Alex: **Make this plan**. Maya (phone): **Accept** on the invite card, then **Let's go**. Alex: **Let's go**. |
| Type | nothing |
| Say | "Nothing posted fits, so Muse drafts one: Maya is free, they both like boba, Bobalicious Corner is a 4-minute walk. One tap sends it. Maya says yes on her phone, and both of them are on their way." |
| Audience sees | "✨ Muse drafted a plan for you and Maya": a title like "Boba run", Bobalicious Corner, 4 min · Maya 8, about $7, and Muse's why ("You both like boba, Maya is down for boba, and it's only a 4 min walk for you"). After Make this plan: "Plan made · Maya's invited". Maya's phone gets the invite within about 2 s. After Let's go the 3D street view opens with both avatars walking. Keep the walk to about 5 s. |

### Beat 3. The thrift pop-up goes live (1:10 to 2:15)

| | |
|---|---|
| Screen | Leo, then Alex and Maya, then Leo, then Alex |
| Click | Leo: **Open the pop-up**. Alex: **View** on the Muse card → **Reserve for pickup** → **Send request**. Leo: **Accept** on the request card at the top. |
| Type | nothing |
| Say | "While they walk, a student opens a thrift pop-up on campus. Muse knows Alex set a watch for a track jacket under $25, and Maya saved a denim styling Reel. Same public sale, a different reason for each of them. Alex reserves the jacket, the seller accepts, and it's held for him." |
| Audience sees | The pop-up's pin appears on every map within about 2 s. Alex: a Muse card about the $20 track jacket matching his watch. Maya: a Muse card about the Y2K denim bag, citing the denim Reel she saved. Alex's sheet: "Requested", then "Held for you · N min left" with the countdown. |

### Beat 4. Fit check into Memories (2:15 to 2:45)

| | |
|---|---|
| Screen | Alex, then Maya |
| Click | Alex: when the photo prompt opens at Bobalicious Corner ("You made it"), take or upload the fit-check photo and tap **Save**. Then show Maya's phone. |
| Type | nothing |
| Say | "They made it. One fit check, the jacket and the drinks, saved to their shared album. Muse writes the caption, and offers to get the group together again." |
| Audience sees | The photo in the shared album on both screens, the ✨ Muse caption on it, and "Get this group together again". |

### Close (2:45 to 3:00)

Say: "Forty-five minutes, one sentence to Muse, a friend, a find, and a memory. That's Out Here."

## Fallbacks

- **Muse is slow (no draft card after about 8 s):** keep talking over the "Muse is working" steps; the warmed cache normally answers in under 2 s. If nothing after 20 s, tap **Change** and send the same text again.
- **No Muse card about the jacket or the bag (beat 3):** the team's fallback. On Alex, switch the dashboard to Explore, tap the jacket's pin, and run **Reserve for pickup** on it as a single listing. Say Muse's reason yourself.
- **The walking view stalls or renders blank:** tap the **3D** button to return to the map and continue there; the plan, the pop-up and the photo all work on the flat map.
- **The photo prompt does not open on arrival:** open the plan from Up next (or Explore) and tap the camera tile (**Take a photo together**).
- **Invite does not arrive on Maya's phone within 3 s:** pull down or reload Maya's tab; the invite is in Out Here and in Notifications.
- **Anything is left over from a rehearsal:** Reset demo (Setup step 2) and reload all three tabs.

## Measured in the final rehearsal

See the table at the end of this file (filled in from the last full run).

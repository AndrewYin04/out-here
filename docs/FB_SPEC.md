# Facebook UI reference spec (for the Out Here shell)

**Survey run 2026-11-12** with Claude in Chrome on facebook.com, logged in, read-only.
Screenshots are in `reference/fb/` (gitignored, never commit). No real names, faces,
post text or other people's content belong in this file.

How the values were measured, and the limits:

- **Theme.** The surveyed account uses dark mode. Light-theme colors below were read
  from Facebook's own stylesheet: the `:root, .__fb-light-mode` rule that defines its
  CSS variables. Two generations of that rule ship together; the newer one is the one
  in use (its dark twin matches the live dark page exactly), so its values are listed.
  Each color row gives light and dark. Our app uses the **light** values.
- **Viewport.** The browser window could not be resized: it stays maximized at a CSS
  viewport of **1298x854** (screen 1536x960 at device pixel ratio 1.25, with a browser
  side panel open). So "desktop" below means 1298 px wide, not 1440. Widths that scale
  with the viewport (feed column, rails) will be somewhat larger at 1440.
- **Mobile (390 px) was not measured.** Window resizing had no effect, and
  `m.facebook.com` redirects a desktop browser to `www`. Every mobile row stays
  "unverified".
- **Profile page was not measured.** `facebook.com/me` hung the tab on every attempt
  (blank page under the top bar, screenshot timeouts). Section 9 stays "unverified".
- Labels: "verified (measured 2026-11-12)" means read from computed styles or element
  boxes; "verified (screenshot)" means read off a screenshot; "verified (stylesheet)"
  means read from Facebook's light-theme CSS variables.

## 1. Global tokens

| Token | Light | Dark (live) | FB variable | Source |
|---|---|---|---|---|
| `--fb-bg` page background | `#F2F4F7` | `#1C1C1D` | `--web-wash` | verified (stylesheet; dark measured 2026-11-12) |
| `--fb-surface` cards, top bar, panels | `#FFFFFF` | `#252728` | `--surface-background`, `--card-background` | verified (stylesheet; dark measured) |
| `--fb-surface-flat` flat card fill | `#F8F9FB` | not read | `--card-background-flat` | verified (stylesheet) |
| `--fb-blue` primary button, active tab, accent | `#0866FF` | `#0866FF` | `--primary-button-background`, `--accent` | verified (stylesheet; dark measured) |
| `--fb-link` text links ("See all") | `#0064D1` | `#5AA7FF` | `--blue-link` | verified (stylesheet; dark measured) |
| `--fb-blue-tint` deemphasized button fill (Join, Add friend, selected chip) | `#DDEDFE` | `rgba(29,133,252,0.2)` | `--primary-deemphasized-button-background` | verified (stylesheet; dark measured) |
| `--fb-blue-tint-text` text on that tint | `#0064D1` | `#75B6FF` | `--primary-deemphasized-button-text` | verified (stylesheet; dark measured) |
| `--fb-toggle-active` | `#EBF5FF` | not read | `--toggle-active-background` | verified (stylesheet) |
| `--fb-text` primary text and icons | `#080809` | `#E2E5E9` | `--primary-text`, `--primary-icon` | verified (stylesheet; dark measured) |
| `--fb-text-2` secondary text, timestamps, inactive icons, placeholder | `#65686C` | `#B0B3B8` | `--secondary-text`, `--secondary-icon`, `--placeholder-text` | verified (stylesheet; dark measured) |
| `--fb-divider` | `#D0D3D7` | `#65686C` | `--divider` | verified (stylesheet; dark measured) |
| `--fb-input` search field, composer pill, comment bubble | `#F0F2F5` | `#333334` | `--comment-background` | verified (stylesheet; dark measured) |
| `--fb-hover` row hover overlay | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.1)` | `--non-media-hovered`, `--hover-overlay` | verified (stylesheet; dark measured) |
| `--fb-pressed` | `rgba(70,72,75,0.15)` | not read | `--non-media-pressed` | verified (stylesheet) |
| `--fb-secondary-btn` grey button and top-bar circle fill | `#E2E5E9` | `rgba(255,255,255,0.1)` | `--secondary-button-background` | verified (stylesheet; dark measured) |
| `--fb-secondary-btn-text` | `#080809` | `#E8EAEE` | `--secondary-button-text` | verified (stylesheet; dark measured) |
| `--fb-disabled` text and icon | `#B0B3B8` | not read | `--disabled-text` | verified (stylesheet) |
| `--fb-wash` | `#C9CCD1` | not read | `--wash` | verified (stylesheet) |
| `--fb-green` positive, online | `#24832C` | `#3FBB46` | `--positive` | verified (stylesheet; dark measured) |
| `--fb-green-tint` | `#F2FCF0` | not read | `--positive-deemphasized` | verified (stylesheet) |
| `--fb-red` notification badge | `#DD2334` | `#DD2334` | `--notification-badge` | verified (stylesheet; dark measured) |
| `--fb-media-border` 1 px inner border on photos | `rgba(0,0,0,0.1)` | not read | `--media-inner-border` | verified (stylesheet) |
| Card radius | 12 px | | `--card-corner-radius` | verified (stylesheet and measured on post, composer, friend, event cards) |
| Large card radius | 16 px | | `--card-large-corner-radius` | verified (stylesheet) |
| Dialog radius | 12 px | | `--dialog-corner-radius` | verified (stylesheet) |
| Bottom sheet radius (mobile) | 20 px | | `--bottom-sheet-corner-radius` | verified (stylesheet) |
| Button radius | 8 px (small, default, large) | | `--button-corner-radius` | verified (stylesheet and measured) |
| Chip and badge radius | fully round (255 px) | | `--chip-corner-radius` | verified (stylesheet; measured chips 18 px on a 36 px height) |
| Comment bubble radius | 16 px | | `--comment-bubble` | verified (stylesheet) |
| Checkbox radius | 4 px | | `--checkbox-corner-radius` | verified (stylesheet) |
| Card shadow | `0 1px 2px rgba(0,0,0,0.2)` | same | | verified (measured on post and composer cards) |
| Popover shadow | `0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)` | same | | verified (measured on notifications panel) |
| Input border width | 1 px | | `--input-border-width` | verified (stylesheet) |
| Font stack | `"Segoe UI Historic", "Segoe UI", Helvetica, Arial, sans-serif` | | `--font-family-segoe` | verified (measured on body, Windows) |
| Body base size | 12 px (text elements set their own size) | | | verified (measured) |

### Type scale

| Role | Size / weight / line height | Source |
|---|---|---|
| Post body text | 15 px / 400 / 20 px, `--fb-text` | verified (measured 2026-11-12) |
| Post author name | 15 px / 600 / 20 px | verified (measured) |
| Post meta line (time, audience) | 13 px / 400 / 16 px, `--fb-text-2`; "Anonymous member" style labels 13 px / 600 | verified (measured) |
| Left-nav row label (home) | 15 px / 500 | verified (measured) |
| Left-nav row label (Friends page panel) | 17 px / 500 | verified (measured) |
| Rail section header ("Sponsored", "Friend requests", "Birthdays") | 17 px / 600, `--fb-text-2` | verified (measured) |
| "See all" link in a rail header | 15 px / 400, `--fb-link` | verified (measured) |
| Side-panel page title (Friends, Events, Marketplace, Search results, Notifications) | 24 px / 700 | verified (measured) |
| Content section heading ("Friend Requests", "Today's picks") | 20 px / 700 | verified (measured) |
| "Discover events" heading inside a card | 24 px / 700 | verified (measured) |
| Group name | 28 px / 700 | verified (measured) |
| Profile name | 32 px / 700 | unverified (profile page did not load) |
| Button label | 15 px / 600 | verified (measured) |
| Badge count | 13 px / 500, white on `--fb-red` | verified (measured) |
| Card title (friend card name, event title) | 17 px / 600 | verified (measured) |
| Search result name | 17 px / 500 | verified (measured) |

### Spacing

| Item | Value | Source |
|---|---|---|
| Card inner padding | 12 px left and top in post header (avatar at x 12, y 12); 16 px on composer and panels | verified (measured) |
| Gap between feed cards | about 12 to 16 px | verified (screenshot) |
| Left-nav row | 52 to 55 px tall, 8 px outer inset (row box x 8, width 264 in a 280 px column), icon at x 16 | verified (measured) |
| Icon-to-label gap in left nav | 12 px (36 px icon at x 16, label at x 64) | verified (measured) |
| Base unit | 4 px | unverified |

### Icons

Facebook draws its own glyphs. Top-bar tab icons are 24x24 px; active fill `--fb-blue`
(measured `#0866FF`), inactive `--fb-text-2`. Left-nav rows use 36 px full-color
icons (rounded, colorful glyphs: people, groups, clock, bookmark, play, storefront,
calendar). Top-bar right buttons hold 20 px glyphs inside 40 px circles. For our build,
`lucide-react` at 24 px (top bar) and 20 px (buttons) with stroke 2 is close enough.
(verified (measured) for sizes; icon set itself is Facebook's)

## 2. Home feed

### Desktop (measured at 1298x854)

Three columns under a fixed top bar.

| Region | Size and layout | Source |
|---|---|---|
| Top bar | 56 px tall (`--header-height`), `--fb-surface` fill, full width, fixed | verified (measured 2026-11-12) |
| Top bar left | 40 px blue circular "f" logo at x 16; then a pill search field 40 px tall, 212 px wide at x 92, radius 50 px, `--fb-input` fill, magnifier icon, placeholder "Search Facebook" 15 px | verified (measured) |
| Top bar left, narrow pages | on Marketplace the search field collapses to a 40 px circle with a magnifier | verified (measured) |
| Top bar center | 5 tabs: Home, Friends, Reels, Marketplace, Groups (Video is now Reels). Each tab 112 px wide, 56 px tall, about 8 px apart, centered. Active tab: icon `#0866FF` and a 3 px `#0866FF` bar along the bottom edge, 108 px wide, top corners rounded. Inactive: grey icon, hover fill on a rounded inner box | verified (measured) |
| Top bar right | 3 circles 40 px (radius 50%) with `--fb-secondary-btn` fill, 8 px apart: menu grid, Messenger, Notifications; then the 40 px account avatar with a small chevron badge. Count badge 19x19 px, `--fb-red`, fully round, 13 px / 500 white, overlapping the top right of the circle | verified (measured) |
| Left nav | 280 px column, no card background, rows 52 to 55 px: own avatar + name, Meta AI, Friends, Groups, Memories, Saved, Reels, Marketplace, Feeds, Events, "See more"; divider; "Your shortcuts" (17 px / 600 grey header) with group rows; footer links 13 px grey | verified (measured and screenshot) |
| Center feed | column 658 px wide (x 312 at 1298 viewport), inside a 722 px main area | verified (measured) |
| Right rail | 280 px column: "Sponsored" (two ad rows: 138 px square image with 12 px radius, title 15 px / 600, domain 13 px grey); divider; "Friend requests" with "See all" link, one request row (60 px avatar, name 15 px / 600, time in blue with dot, "N mutual friends" 13 px grey, Confirm blue + Delete grey buttons 84x36); "Birthdays" (gift icon + one line). No Contacts list was visible at this width | verified (measured and screenshot) |
| Floating button | 48 px round "new message" button at bottom right of the viewport | verified (screenshot) |

### Center feed components, top to bottom

1. **Composer card** (now first, above stories): single row, card 658x62 px,
   radius 12 px, card shadow. 40 px avatar at left; pill field 40 px tall, radius
   20 px, `--fb-input` fill, padding 8 px 12 px, placeholder "What's on your mind,
   <first name>?" 17 px grey; then three bare 24 px colored icons at right: Live video
   (red), Photo/video (green), Feeling/activity (yellow). No divider and no labeled
   three-button row. (verified (measured 2026-11-12))
2. **Stories tray**: horizontal row of portrait cards **110x160 px**, radius 10 px,
   card shadow, about 8 px apart; 5 visible plus a partial sixth, and a 48 px round
   arrow button at the right edge. First card "Create story": own photo top part,
   a blue 40 px "+" circle on the divider, label "Create story" 13 px / 600 below.
   Other cards: full-bleed image, 40 px avatar with a blue ring at top left, white
   13 px / 600 name at bottom left over a dark gradient. (verified (measured) for
   size and radius; ring and gradient from screenshot)
3. **Post card**: `--fb-surface`, radius 12 px, card shadow `0 1px 2px rgba(0,0,0,0.2)`.
   - Header: 40 px avatar at 12 px inset (group posts: 36 px group image with a 24 px
     member avatar overlapping its bottom right); name 15 px / 600; meta 13 px grey
     ("16h · " + audience globe); at right a 20 px "..." and an "X" hide button.
   - Body text 15 px / 400 / 20 px, side padding 12 to 16 px; "See more" 15 px / 600.
   - Media full card width, no inner radius. Link previews: grey domain line 13 px caps,
     title 15 px / 600, "Learn more" grey button.
   - **Combined action row (new layout)**: one row about 40 px tall. At left, compact
     buttons 32 px tall: Like (thumb icon + count, 64 px), Comment (bubble icon +
     count, 59 px), Share (arrow icon + count, 44 px), icons 20 px grey, counts 15 px
     grey. At right, the stacked 18 px reaction emoji circles. There is **no separate
     counts row and no divider above the actions**, and buttons have no text labels.
   - Comment preview: not seen on the surveyed feed. Bubble radius token is 16 px.
   (verified (measured 2026-11-12) unless noted)
4. **People you may know**: a card in the feed with a header (people icon + 15 px / 600
   title, "..." right), a carousel of person cards (about 184x296 px, photo square on
   top, radius 8 px, "X" dismiss, name 17 px / 600, mutual line, full-width tinted
   "Add friend" button with person-plus icon), a round arrow, and a centered "See all"
   link. (verified (screenshot))
5. **Reactions**: hover pill with 7 emoji (Like, Love, Care, Haha, Wow, Sad, Angry) and
   chosen-reaction label colors Like `#0866FF`, Love `#F33E58`, Care/Haha/Wow/Sad
   `#F7B125`, Angry `#E9710F`. (unverified: hovering was avoided to stay read-only)

### Mobile (390x844, mobile web)

| Difference | Detail | Source |
|---|---|---|
| Top bar | 44 to 48 px: blue "facebook" wordmark at left; "+", search and Messenger circles at right | unverified (mobile width could not be set) |
| Tab bar | second row under the header on m.facebook.com, or a bottom tab bar in the app | unverified |
| Rails | left nav and right rail gone; items live in the Menu tab | unverified |
| Cards | full width, radius 0, separated by 8 px bands of `--fb-bg` | unverified |
| Composer | single row: avatar, field, photo icon (matches the new desktop composer) | unverified |
| Stories | cards about 96x170 px | unverified |

### States

| State | Value | Source |
|---|---|---|
| Row hover | `--fb-hover` overlay, radius 8 px | verified (stylesheet for color; radius measured on active rows) |
| Pressed | `rgba(70,72,75,0.15)` | verified (stylesheet) |
| Selected side-panel row | radius 8 px; dark `rgba(255,255,255,0.1)` (Search, Marketplace) or `#1C1C1D` (Friends) | verified (measured, dark only) |
| Loading | grey rounded placeholder bars ("glimmer") in the shape of the content, seen on the Group page | verified (screenshot) |
| Focus ring, empty feed | not observed | unverified |

## 3. Notifications panel

Opens from the bell as a popover under the top bar, right-aligned to the bell area
(panel x 906 to 1266 at 1298 viewport, about 16 px from the right edge).
Opening it marks notifications as seen (the badge clears).

| Region | Detail | Source |
|---|---|---|
| Panel | 360 px wide, top at y 53 (overlaps the top bar by 3 px), height to about 20 px above the viewport bottom (782 px at 854), `--fb-surface`, radius 12 px, popover shadow, scrolls internally | verified (measured 2026-11-12) |
| Header | "Notifications" 24 px / 700, "..." button right | verified (measured) |
| Filter chips | "All" and "Unread", 36 px tall, fully round (18 px radius); selected chip uses `--fb-blue-tint` fill and `--fb-blue-tint-text` 15 px / 600; unselected has no fill, primary text 15 px / 600 | verified (measured) |
| Push prompt card | inset card radius 12 px, `--fb-input` fill, with title, line, and two buttons ("Turn on" tinted, "Not now" grey) | verified (measured) |
| Section labels | "New", "Earlier" 17 px / 600 primary text; "See all" 15 px / 400 `--fb-link` at right | verified (measured) |
| Row | 56 px avatar with a 28 px round colored type badge overlapping its bottom right; text 15 px / 400 with the actor name bold; relative time 13 px, blue when unread; a 12 px round `--fb-link`-colored dot at the right when unread | verified (measured) |
| Friend-request rows | two buttons under the text: "Confirm" blue, "Delete" grey, 36 px tall, radius 8 px | verified (measured and screenshot) |
| Empty state | bell illustration + "You have no notifications" | unverified |

Mobile: full-screen page instead of a popover. (unverified)

## 4. Friends page (facebook.com/friends)

| Region | Detail | Source |
|---|---|---|
| Left panel | 360 px, full height under the top bar, `--fb-surface` fill. "Friends" title 24 px / 700 with a 36 px round gear button. Rows 56 px: Home, Friend requests, Suggestions, All friends, Birthdays, Custom lists; each has a 36 px round grey icon, a 17 px / 500 label and a chevron where it opens a sub-list. Active row radius 8 px | verified (measured 2026-11-12) |
| Content | section heading "Friend Requests" 20 px / 700 with "See all" link right; grid of person cards, **4 per row** at 1298, about 8 px gutter | verified (measured and screenshot) |
| Person card | **207x359 px**, `--fb-surface`, radius 12 px, 1 px border (`--fb-media-border` style); square photo 205 px on top; name 17 px / 600; mutual line with two stacked 16 px avatars and "N mutual friends" grey; two full-width buttons 36 px tall, radius 8 px, 6 px apart: blue "Confirm" (white 15 px / 600) and grey "Delete" | verified (measured) |
| Suggestions card variant | same frame with a tinted "Add friend" button and grey "Remove" | unverified (seen only on the home feed carousel) |
| Empty | "When you have friend requests or suggestions, you'll see them here." | unverified |

Mobile: list rows instead of a grid. (unverified)

## 5. Group page (public group)

| Region | Detail | Source |
|---|---|---|
| Cover | **1250 px wide, 463 px tall** at x 16 under the top bar, bottom corners radius 8 px | verified (measured 2026-11-12) |
| Header block | group name **28 px / 700**; meta "globe Public group · N members" 15 px grey (count 600); buttons right: blue "Join group" (people icon, 119x36), grey "Share" (84x36), grey chevron (48x36), all radius 8 px | verified (measured) |
| Tabs | divider, then a 60 px row: About, Discussion, Featured, People, Events, Media, Files; labels 15 px / 600; active tab `--fb-link` text with a 3 px underline 74 px wide; at right a grey search button and a grey "..." button | verified (measured) |
| Body | two cards on `--fb-bg`: left feed about 680 px (composer card: 40 px avatar + chevron, pill "Write something..." 578x40 radius 20, then a row Anonymous post / Feeling/activity / Poll with colored icons; then a "Featured" card and posts), right about 494 px "About" card (title 17 px / 600; rows "Public" and "Visible" with icons, 17 px / 500 label and 13 px grey description) | verified (measured and screenshot) |
| Search results page | left 360 px panel: "Search results" 24 px / 700, "Filters" label, rows All, People, Reels, Marketplace, Pages, Groups, Events (52 px, radius 8 px, 36 px round icons); under Groups: "City" dropdown, toggles "Near me", "Public groups", "My groups". Results: each in its own card 680x92 px radius 12 px; 60 px rounded-square group image; name 17 px / 500; "Public · 10K members · N posts a day" 15 px grey; tinted "Join" button 52x36 at right | verified (measured) |

Mobile: cover about 210 px tall; name and buttons stack; tabs scroll horizontally.
(unverified)

## 6. Events page (facebook.com/events)

| Region | Detail | Source |
|---|---|---|
| Left panel | 360 px: "Events" 24 px / 700, pill search "Search events", rows Home (active), Your events (expandable), Notifications; full-width blue "+ Create new event" button (36 px, radius 8 px); divider; "Categories" header with rows (Classics, Comedy, Crafts, Dance, Drinks, Fitness & Workouts, Foods, Games, ...) | verified (measured and screenshot) |
| Content | one large card (834 px wide, radius 12 px) on `--fb-bg` holding "Discover events" 24 px / 700 and the grid | verified (measured) |
| Filters | chip row 36 px tall: "My location" and "Any date" dropdown buttons (grey, radius 8 px, with icons); then pill chips Top (selected: tint fill, tint text), Friends, Following | verified (measured) |
| Event card | **2 per row** at 1298; card 382x354 px, radius 12 px, `--fb-surface` (slightly lighter than the container in dark mode); cover 382x180 on top; date line **13 px / 600 in primary text color, sentence case** ("Sat, Jan 23, 2027 at 4 PM CST"); title 17 px / 600; venue 15 px grey; "N interested · N going" 13 px grey; bottom row: grey "Interested" button with star icon (290x36) and a grey share button (48x36), radius 8 px; "..." round button on the cover top right | verified (measured 2026-11-12) |
| Event detail | wide cover, date block, Interested / Going / Invite / "..." buttons, About and map cards | unverified (not opened) |

## 7. Marketplace (facebook.com/marketplace)

| Region | Detail | Source |
|---|---|---|
| Left panel | 360 px: "Marketplace" 24 px / 700 + gear; pill "Search Marketplace"; rows Browse all (active, radius 8 px, 52 px), Jobs, Notifications, Inbox, Marketplace status, Buying, Selling (15 px / 500, 36 px round icons, chevrons where expandable); **tinted** "+ Create new listing" (328x36, `--fb-blue-tint` fill, tint text), grey "Create multiple listings"; "Categories" (Vehicles, Property Rentals, ...) | verified (measured 2026-11-12) |
| Grid | "Today's picks" 20 px / 700 with a location link at right ("pin Place · 40 mi", 15 px `--fb-link`); **3 items per row** at 1298 (main area 860 px); item = square image 279 px, radius 6 px; price 17 px / 600; title 15 px / 400 one line; location 13 px grey; no card background | verified (measured) |
| Item page | full-viewport layout with no top-bar tabs: left black (`#000`) image viewer 843 px wide (about 65%) with a round "X" and the "f" logo top-left, 48 px round light arrow buttons at the sides (`#E2E5E9` fill), thumbnail strip at the bottom; right panel about 455 px, `--fb-surface`, padding 16 px: title 24 px / 700, price 17 px / 500, "Listed N weeks ago in <place>" 13 px grey, button row (grey "Message" 254x36, grey 48x36 Save, Share, "..."), "Details" 17 px / 600 with Condition row and description, a map preview with "Location is approximate", "Seller information" with "Seller details" link and star rating, an ad block, and a pinned "Send seller a message" composer with a blue "Send" button at the bottom | verified (measured and screenshot) |

Mobile: two items per row; item page stacks image over details. (unverified)

## 8. Reels viewer (facebook.com/reel/)

| Region | Detail | Source |
|---|---|---|
| Layout | top bar stays (Reels tab active). Page background **pure black `#000`**. Left column (no card) with "Reels" 24 px / 700 and rows For you, Following, Profile (outline icons) | verified (measured 2026-11-12) |
| Video | centered 9:16 player box **431x766 px** at 1298x854 (x 471, y 72); a 44 px round mute button (`rgba(51,51,52,0.67)`) at its top left | verified (measured) |
| Right of video | vertical stack of **bare white 24 px icons** (no circle fill) with counts under each in 13 px / 600 white: Like, Comment, Share, then "..." | verified (measured) |
| Overlay (under the video, bottom) | 32 px avatar, creator name 15 px / 600 white with "· Follow", audio line with music icon 13 px, caption 15 px / 400 white with hashtags; a thin progress bar under it | verified (measured and screenshot) |
| Navigation | up/down 48 px round buttons at the right edge of the viewport, fill `rgba(255,255,255,0.15)` | verified (measured) |

Mobile: video fills the screen; actions overlay the right edge. (unverified)

## 9. Profile page (own profile, header only)

Not measured: the profile page hung the tab on every load. All rows unverified.
Related measured values: the Group page cover is 1250x463 px with 8 px bottom radius
and header buttons are 36 px tall with 8 px radius; the profile header likely uses the
same frame.

| Region | Detail | Source |
|---|---|---|
| Cover | up to 1250 px wide, about 460 px tall, bottom radius 8 px; "Edit cover photo" button bottom-right | unverified |
| Avatar | 168 px circle with a 4 px white ring, overlapping the cover bottom by about 84 px; 36 px camera button | unverified |
| Name block | name 32 px / 700; "N friends" 15 px / 600 grey; stacked 32 px friend avatars | unverified |
| Actions | right-aligned: blue "+ Add to story", grey "Edit profile", grey chevron | unverified |
| Tabs | 60 px row: Posts, About, Friends, Photos, Videos, Reels, "More"; active blue with 3 px underline (matches the measured Group tabs) | unverified |
| Body | left "Intro" card (bio, detail rows with icons), "Photos" and "Friends" cards; right composer and posts | unverified |

## 10. Messenger and docked chat

Not surveyed (the task forbids opening private messages). Measured top-bar fact: the
Messenger button is a 40 px circle with a count badge. A floating 48 px "new message"
button sits at the bottom right of the home page.

- `facebook.com/messages`: three panes, about 360 px chat list, conversation, and a
  collapsible info pane. (unverified)
- Docked chat window at the bottom right: about 328 px wide, 455 px tall, top corners
  rounded, 48 px header; outgoing bubbles `--fb-blue` with white text, incoming
  `--fb-input`, about 18 px radius, 15 px text. (unverified)

## 11. What to copy for Out Here

- Light tokens from section 1 as Tailwind theme values. Note the current palette:
  page `#F2F4F7`, text `#080809`, secondary `#65686C`, divider `#D0D3D7`, grey button
  `#E2E5E9`, links `#0064D1`, tint `#DDEDFE`, badge `#DD2334`, green `#24832C`.
- Card radius **12 px**, button radius **8 px**, chips fully round, map bottom sheet
  20 px (Facebook's own bottom-sheet token).
- Top bar: 56 px, white, 40 px logo at x 16, 40 px pill search, 112 px center tabs with
  a 3 px blue bottom bar on the active tab, 40 px grey circles at right with 19 px red
  badges.
- Feed post: 40 px avatar, 15 px / 600 name, 13 px grey meta, and the **combined
  action row** (icon + count buttons left, reaction stack right). Do not build the old
  separate counts row with labeled Like / Comment / Share.
- Composer: single row (avatar, pill, three colored icons), above the stories tray.
- Stories: 110x160 cards, radius 10 px.
- Group page: 28 px name, 1250x463 cover, 60 px tab row; our "Hangouts" tab sits in
  that row with the same 3 px underline.
- Event cards: date line in primary text, 13 px / 600, sentence case (not red caps).
- Re-run the survey for mobile (390 px) and the Profile page with a resizable,
  non-maximized Chrome window.

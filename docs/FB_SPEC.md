# Facebook UI reference spec (for the Out Here shell)

**Status: every value in this file is unverified (no browser).** The S4 survey could
not run because the Claude in Chrome extension refused the connection from the
subagent (account mismatch between the extension and Claude Code). No screenshots
exist in `reference/fb/`. The values below come from public knowledge of the
facebook.com layout as of late 2025 and from the starting tokens in
`MVP-BUILD-PLAN-itr-1.md`. Each table carries a `Source` column; when someone
re-runs the survey with a working browser, change a row to `verified` or correct it.

Scope: structure, sizes, colors, type and states only. No real names, faces, post
text or other people's content belong in this file.

## 1. Global tokens

| Token | Value | Use | Source |
|---|---|---|---|
| `--fb-bg` | `#F0F2F5` | page background behind cards | unverified (no browser) |
| `--fb-surface` | `#FFFFFF` | cards, top bar, panels | unverified (no browser) |
| `--fb-blue` | `#0866FF` | primary buttons, links, active tab, logo | unverified (no browser) |
| `--fb-blue-hover` | `#0861F2` | primary button hover | unverified (no browser) |
| `--fb-blue-tint` | `#EBF5FF` | active left-nav row, selected chip background | unverified (no browser) |
| `--fb-text` | `#050505` | primary text | unverified (no browser) |
| `--fb-text-2` | `#65676B` | secondary text, timestamps, inactive icons | unverified (no browser) |
| `--fb-divider` | `#CED0D4` | 1 px dividers inside cards | unverified (no browser) |
| `--fb-input` | `#F0F2F5` | search field and comment field fill | unverified (no browser) |
| `--fb-hover` | `#F2F2F2` | row hover (`rgba(0,0,0,0.05)` over white) | unverified (no browser) |
| `--fb-secondary-btn` | `#E4E6EB` | grey secondary button fill | unverified (no browser) |
| `--fb-green` | `#31A24C` | online dot | unverified (no browser) |
| `--fb-red` | `#E41E3F` | notification count badge | unverified (no browser) |
| Card radius | 8 px | feed cards, panels | unverified (no browser) |
| Button radius | 6 px | rectangular buttons | unverified (no browser) |
| Pill radius | 18 to 20 px | search field, composer field, chips | unverified (no browser) |
| Card shadow | `0 1px 2px rgba(0,0,0,0.2)` | feed cards on desktop | unverified (no browser) |
| Popover shadow | `0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)` | menus, notifications panel | unverified (no browser) |
| Font stack | `Segoe UI Historic, Segoe UI, Helvetica, Arial, sans-serif` (Windows); `-apple-system, BlinkMacSystemFont` first on Apple | all text | unverified (no browser) |

### Type scale

| Role | Size / weight / line height | Source |
|---|---|---|
| Body, post text | 15 px / 400 / 20 px | unverified (no browser) |
| Post author name | 15 px / 600 | unverified (no browser) |
| Timestamp, meta line | 13 px / 400, `--fb-text-2` | unverified (no browser) |
| Left-nav row label | 15 px / 500 | unverified (no browser) |
| Section header in rails ("Contacts", "Sponsored") | 17 px / 600, `--fb-text-2` | unverified (no browser) |
| Page title (Friends, Events, Marketplace) | 24 px / 700 | unverified (no browser) |
| Profile name | 32 px / 700 | unverified (no browser) |
| Button label | 15 px / 600 | unverified (no browser) |
| Badge count | 13 px / 700, white on `--fb-red` | unverified (no browser) |
| Short text-only post (large style) | 24 px / 400 on a colored background | unverified (no browser) |

### Spacing

Base unit 4 px. Card inner padding 12 to 16 px. Gap between feed cards 16 px.
Row height in left nav 52 px with 8 px horizontal padding. Icon-to-label gap 12 px.
(unverified (no browser))

### Icons

Facebook draws its own filled glyph icons (house, people pair, play square,
storefront, bell, chat bubble, grid of 9 dots). For our build, `lucide-react` icons at
20 to 24 px with stroke 2 are close enough; inactive color `--fb-text-2`, active
color `--fb-blue`. Left-nav rows use 36 px full-color circular or square icons.
(unverified (no browser))

## 2. Home feed

### Desktop (1440x900)

Three columns under a fixed top bar.

| Region | Size and layout | Source |
|---|---|---|
| Top bar | 56 px tall, white, bottom shadow `0 1px 2px rgba(0,0,0,0.1)`, fixed | unverified (no browser) |
| Top bar left | 40 px blue circular "f" logo, then a 240 px pill search field (40 px tall, `--fb-input` fill, magnifier icon, placeholder "Search Facebook") | unverified (no browser) |
| Top bar center | 5 tab icons (Home, Friends, Video/Reels, Marketplace, Groups), each about 112 px wide and 56 px tall; active tab has a blue icon and a 3 px blue bar on the bottom edge; inactive tabs show a grey rounded hover fill | unverified (no browser) |
| Top bar right | 4 circular 40 px buttons with `--fb-secondary-btn` fill: menu grid, Messenger, Notifications bell, account avatar; red count badge top-right of a button | unverified (no browser) |
| Left nav | about 280 to 360 px wide, no card background, scrolls with page; rows: own avatar + name, Friends, Memories, Saved, Groups, Video, Marketplace, Feeds, Events, "See more"; then a "Your shortcuts" section | unverified (no browser) |
| Center feed | 590 to 680 px wide column, centered | unverified (no browser) |
| Right rail | about 280 to 360 px wide: "Sponsored" block, birthdays line, then "Contacts" list (36 px avatars with green online dot, 52 px rows), then "Group chats" | unverified (no browser) |

### Center feed components, top to bottom

1. **Stories tray**: a horizontal row of portrait cards about 112x200 px, radius 12 px,
   with 4 to 5 visible and a circular arrow button to page right. First card is
   "Create story" (own photo top two thirds, a blue 40 px "+" circle on the divider,
   label below). Other cards: full-bleed image, 40 px avatar with a 4 px blue ring at top
   left, white 13 px / 600 name at bottom left over a dark gradient.
   (unverified (no browser))
2. **Composer card**: white card, radius 8 px, padding 12 px 16 px. Row 1: 40 px avatar
   and a pill field (40 px tall, `--fb-input`, placeholder "What's on your mind, <first
   name>?"). Divider. Row 2: three equal buttons with colored icons: Live video (red),
   Photo/video (green), Feeling/activity (yellow). (unverified (no browser))
3. **Post card**: white, radius 8 px, 16 px gap below.
   - Header (padding 12 px 16 px): 40 px avatar, name 15 px / 600, meta line 13 px grey
     ("2h · " + globe or people audience icon), a "..." button and an "X" hide button on
     the right, 36 px circles.
   - Body text 15 px, padding 0 16 px 12 px; "See more" link in `--fb-text-2` / 600.
   - Media full card width, no radius inside the card.
   - Counts row (height 40 px, 15 px grey): stacked 18 px reaction emoji circles plus
     total on the left; "N comments · N shares" on the right.
   - Divider, then an action row of three equal buttons 36 px tall: Like (thumb),
     Comment (bubble), Share (arrow), each 15 px / 600 grey; hover fill `--fb-hover`
     radius 4 px. Liked state turns the label and icon `--fb-blue`.
   - Comment preview: 32 px avatar, grey bubble (`--fb-input`, radius 18 px, padding
     8 px 12 px), name 13 px / 600 above text 15 px; under it "Like · Reply · 1h" in
     12 px / 700 grey.
   (all unverified (no browser))
4. **Reactions**: hover on Like for about 0.5 s opens a white pill (radius 40 px,
   popover shadow) holding 7 animated emoji at 39 px: Like, Love, Care, Haha, Wow, Sad,
   Angry. Chosen reaction recolors the label: Like blue `#0866FF`, Love red `#F33E58`,
   Care/Haha/Wow/Sad yellow `#F7B125`, Angry orange `#E9710F`.
   (unverified (no browser))

### Mobile (390x844, mobile web)

| Difference | Detail | Source |
|---|---|---|
| Top bar | 44 to 48 px: blue "facebook" wordmark at left; "+", search and Messenger circles at right | unverified (no browser) |
| Tab bar | a second row under the header on m.facebook.com, or a bottom tab bar in the app: Home, Reels, Friends, Marketplace, Notifications, Menu/Profile (Dec 2025 app layout puts Reels, Friends, Marketplace and Profile in the bar) | unverified (no browser) |
| Rails | left nav and right rail are gone; their items live in the Menu tab | unverified (no browser) |
| Cards | full width, radius 0, separated by 8 px bands of `--fb-bg` instead of shadows | unverified (no browser) |
| Composer | single row: avatar, field, photo icon; no three-button row | unverified (no browser) |
| Stories | cards shrink to about 96x170 px | unverified (no browser) |

### States

Hover rows: `--fb-hover` fill, radius 8 px. Pressed: darker fill `rgba(0,0,0,0.1)`.
Focus: 2 px blue ring. Empty feed: centered grey illustration plus "No more posts"
text and a "Find friends" button. Loading: grey shimmer blocks in the shape of a
post card. (unverified (no browser))

## 3. Notifications panel

Opens from the bell as a popover anchored to the top bar, right edge 16 px.
(unverified (no browser))

| Region | Detail | Source |
|---|---|---|
| Panel | 360 px wide, max height about 90% of viewport, white, radius 8 px, popover shadow, scrolls internally | unverified (no browser) |
| Header | "Notifications" 24 px / 700, "..." button right | unverified (no browser) |
| Filter chips | "All" and "Unread" pills, 36 px tall; selected chip `--fb-blue-tint` fill with blue text | unverified (no browser) |
| Section labels | "New", "Earlier" 17 px / 600 with "See all" blue link right | unverified (no browser) |
| Row | 56 px avatar with a 28 px colored type badge at bottom right (blue thumb, green people, red heart, etc.); 15 px text with the actor name in 600; 13 px blue relative time when unread, grey when read; 12 px blue dot on the right when unread; row hover `--fb-hover` radius 8 px | unverified (no browser) |
| Friend-request rows | two buttons under the text: "Confirm" blue, "Delete" grey | unverified (no browser) |
| Empty state | bell illustration + "You have no notifications" | unverified (no browser) |

Mobile: full-screen page instead of a popover; same rows.

## 4. Friends page

| Region | Detail | Source |
|---|---|---|
| Left nav | 360 px white panel full height: "Friends" title 24 px / 700 with gear icon; rows Home, Friend requests, Suggestions, All friends, Birthdays, Custom lists; active row `--fb-blue-tint` | unverified (no browser) |
| Content | grid of person cards on `--fb-bg`, gutter 8 px, 4 to 6 cards per row at 1440 | unverified (no browser) |
| Person card | about 210x370 px, white, radius 8 px, border 1 px `rgba(0,0,0,0.1)`; square photo on top; name 17 px / 600; "N mutual friends" 13 px grey with stacked 16 px avatars; two full-width 36 px buttons: blue "Confirm" or "Add friend" (fill `--fb-blue-tint`, blue text), grey "Delete" or "Remove" | unverified (no browser) |
| Empty | "When you have friend requests or suggestions, you'll see them here." centered grey text | unverified (no browser) |

Mobile: list rows (80 px avatar left, name and buttons right) instead of a grid.

## 5. Group page (public group)

| Region | Detail | Source |
|---|---|---|
| Cover | full content width up to 1250 px, about 460 px tall on desktop, bottom corners radius 8 px | unverified (no browser) |
| Header block | group name 32 px / 700; "Public group · N members" 15 px grey with globe icon; row of up to 8 stacked 32 px member avatars; buttons right: blue "Join group", grey "Share" and "v" | unverified (no browser) |
| Tabs | 60 px row: About, Discussion, Featured, People, Events, Media, Files; active tab blue text with a 3 px blue underline; "..." overflow | unverified (no browser) |
| Body | two columns: left feed 500 px (composer card, then post cards), right 360 px "About" card (description, Public/Visible rows with icons, location, "Learn more") | unverified (no browser) |
| Search results page | left 360 px filter panel ("Search results" title, filters All, Posts, People, Groups...); result rows 60 px rounded-square group image, name 17 px / 600, "Public · N members · N posts a day", "Join" button right | unverified (no browser) |

Mobile: cover about 210 px tall; name and buttons stack below; tabs become a
horizontally scrolling chip row; About card moves above the feed.

## 6. Events page

| Region | Detail | Source |
|---|---|---|
| Left nav | 360 px panel: "Events" title, search field, rows Home, Your events, Birthdays, Notifications; blue "+ Create new event" button; category list | unverified (no browser) |
| Filters | chip row: location, date range ("Any date", "Today", "This weekend"), category | unverified (no browser) |
| Event card | grid of 3 to 4 per row, white, radius 8 px; cover image 16:9 top radius 8 px; date line 13 px / 600 in red-orange caps ("SAT, NOV 15 AT 7 PM"); title 17 px / 600; venue 15 px grey; "N interested · N going" 13 px grey; full-width grey "Interested" button with star icon | unverified (no browser) |
| Event detail | wide cover, date block (month abbreviation small red caps over a large day number) to the left of the title, buttons Interested / Going / Invite / "...", then About card and a map card | unverified (no browser) |

The date-block pattern (red month over large day) suits our quest sheet start time.

## 7. Marketplace

| Region | Detail | Source |
|---|---|---|
| Left nav | 360 px: "Marketplace" title + gear, search field, rows Browse all, Notifications, Inbox, Buying, Selling; blue "+ Create new listing"; location + radius line; Categories list | unverified (no browser) |
| Grid | "Today's picks" 20 px / 700 header with location link right; 4 to 6 items per row; item = square image radius 8 px, price 17 px / 700, title 15 px / 400 one line, location 13 px grey; no card background | unverified (no browser) |
| Item page | full-height layout: left about 70% black image viewer with arrows and thumbnail dots; right 360 px white panel with title 24 px / 700, price 17 px, "Listed N days ago in <place>", buttons (Message blue, Save, Share), Details list, seller block, map preview, and since Nov 2025 a reactions/comments row under the listing | unverified (no browser) |

Mobile: two items per row; item page stacks image on top and details below.

## 8. Reels viewer

| Region | Detail | Source |
|---|---|---|
| Layout | black or `#18191A` background; centered 9:16 video about 420x750 px at 1440x900, radius 8 px | unverified (no browser) |
| Right of video | vertical stack of 48 px circular grey buttons with counts below in 13 px: Like, Comment, Share, "...", and a small square audio thumbnail | unverified (no browser) |
| Overlay | bottom-left white 15 px / 600 creator name with Follow link, 15 px caption with "more", audio line with music icon | unverified (no browser) |
| Navigation | up/down arrow buttons at the right edge of the viewport; close "X" and logo top-left | unverified (no browser) |

Mobile: video fills the screen; the action stack overlays the right edge.

## 9. Profile page (own profile, header only)

| Region | Detail | Source |
|---|---|---|
| Cover | up to 1250 px wide, about 460 px tall, bottom radius 8 px; "Edit cover photo" button bottom-right (white, radius 6 px) | unverified (no browser) |
| Avatar | 168 px circle with a 4 px white ring, overlapping the cover bottom by about 84 px; camera button 36 px grey circle at bottom right | unverified (no browser) |
| Name block | name 32 px / 700; "N friends" 15 px / 600 grey; row of stacked 32 px friend avatars | unverified (no browser) |
| Actions | right-aligned: blue "+ Add to story", grey "Edit profile", grey "v" | unverified (no browser) |
| Tabs | divider, then 60 px tab row: Posts, About, Friends, Photos, Videos, Reels, "More v"; active blue with 3 px underline | unverified (no browser) |
| Body | left 360 px "Intro" card (bio, details rows with icons), "Photos" and "Friends" cards; right 500 px composer and posts | unverified (no browser) |

Mobile: cover about 140 px; avatar about 120 px centered or left; actions become two
full-width buttons; tabs become a chip row.

## 10. Messenger and docked chat

- Desktop Messenger lives at `facebook.com/messages` as a three-pane layout: 360 px
  chat list, conversation, and a collapsible 300 px info pane.
  (unverified (no browser))
- The Messenger button in the top bar opens a 360 px popover chat list; picking a
  chat opens a docked chat window at the bottom right: 328 px wide, about 455 px tall,
  radius 8 px top corners, header 48 px with avatar, name and minimize/close buttons;
  outgoing bubbles `--fb-blue` with white text, incoming `#F0F0F0`, radius 18 px,
  15 px text. (unverified (no browser))
- Out Here does not build chat (cut in `00-mission.md`). The invite sheet can borrow
  the docked-window frame for the "invite sent" moment.

## 11. What to copy for Out Here

- Use the tokens in section 1 as Tailwind theme values; keep radius 8 px for cards
  and 16 px for the map bottom sheet (kit rule 10-architecture asks for 12 to 16 px).
- Top bar: 56 px desktop, 48 px inside the phone frame, white with the blue wordmark.
- Bottom nav (Map, Memories, Me): match the mobile app tab bar, 24 px icons, 11 px
  labels, active `--fb-blue`, inactive `--fb-text-2`.
- Reuse the post-card header (40 px avatar, 15 px / 600 name, 13 px grey meta) for
  quest sheets and suggestion cards, and the reactions pill pattern for crew album
  photos.
- Before trusting any number here, re-run S4 with a working Chrome connection and
  update the `Source` column.

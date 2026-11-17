# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: map.spec.ts >> phone 390 >> Friends view shows only plans friends joined
- Location: tests\e2e\map.spec.ts:125:3

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e3]:
    - link "fb·demo home" [ref=e5] [cursor=pointer]:
      - /url: /
      - text: fb·demo
    - generic [ref=e6]:
      - link "Search" [ref=e7] [cursor=pointer]:
        - /url: /search
      - button "Messenger" [ref=e12]:
        - generic [ref=e15]:
          - generic [aria-hidden] [ref=e16]: "7"
          - generic [ref=e17]: 7 unread chats
      - 'button "Account: Alex Rivera" [ref=e19]'
  - main [ref=e22]:
    - generic [ref=e23]:
      - heading "Out Here map, Menlo Park" [level=1] [ref=e24]
      - generic [ref=e26]:
        - generic:
          - region "Map" [ref=e27]
          - button "Dumplings before the rush, starts in 23 min, 2 left, Kai going" [ref=e28] [cursor=pointer]:
            - generic [ref=e29]: 🥟
            - generic [ref=e30]: 2 left
            - generic: Dumplings · in 23 min
          - button "Easy 5K along the bay trail, starts in 58 min, 7 left, Olivia and Liam going" [ref=e31] [cursor=pointer]:
            - generic [ref=e32]: 🏃
            - generic [ref=e33]: 7 left
            - generic: Easy 5K · in 58 min
          - button "Bouldering intro, starts 5:25 PM, 3 left, Kai going" [ref=e34] [cursor=pointer]:
            - generic [ref=e35]: 🧗
            - generic [ref=e36]: 3 left
            - generic: Bouldering intro · 5:25 PM
          - generic:
            - button "Pho run, starts 6:15 PM, 2 left, Kai going" [ref=e37] [cursor=pointer]:
              - generic [ref=e38]: 🍜
              - generic [ref=e39]: 2 left
              - generic: Pho run · 6:15 PM
            - button "1 more plan here. Zoom in" [ref=e40] [cursor=pointer]: "+1"
          - button "Board game night, starts 6:45 PM, 2 left, Zara going" [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: 🎲
            - generic [ref=e43]: 2 left
            - generic: Board game night · 6:45 PM
          - button "Bayfront Park sunset walk, starts 8:45 PM, 6 left, Olivia and Lena going" [ref=e44] [cursor=pointer]:
            - generic [ref=e45]: 🌅
            - generic [ref=e46]: 6 left
          - img "You" [ref=e47]
          - generic "Your location" [ref=e48]: You
          - button "Ethan Wu, ☕ need a second coffee, updated 11 min ago" [ref=e54]:
            - generic [ref=e56]:
              - generic [aria-hidden] [ref=e57]: ☕
              - generic [ref=e58]: need a second coff…
          - button "Maya Chen, 🥟 craving dumplings, updated 5 min ago" [ref=e62]:
            - generic [ref=e64]:
              - generic [aria-hidden] [ref=e65]: 🥟
              - generic [ref=e66]: craving dumplings
          - button "Zara Ahmed, 🎲 board game brain, updated 20 min ago" [ref=e70]:
            - generic [ref=e72]:
              - generic [aria-hidden] [ref=e73]: 🎲
              - generic [ref=e74]: board game brain
          - button "Kai Nakamura, 🧗 chalked up, updated 14 min ago" [ref=e78]:
            - generic [ref=e80]:
              - generic [aria-hidden] [ref=e81]: 🧗
              - generic [ref=e82]: chalked up
          - button "Rosa Delgado, 🎧 new playlist on repeat, updated 43 min ago" [ref=e86]:
            - generic [ref=e88]:
              - generic [aria-hidden] [ref=e89]: 🎧
              - generic [ref=e90]: new playlist on re…
          - button "Liam O'Connor, 🚲 biking home later, updated 36 min ago" [ref=e94]
          - button "Lena Kowalski, 🌮 taco tuesday energy, updated 27 min ago" [ref=e98]
          - button "Kayla Nguyen, 🌁 in the city for the weekend, updated 17 min ago" [ref=e102]
          - button "Andre Washington, 🏀 pickup at 6, updated 39 min ago" [ref=e106]
          - button "Jess Thompson, 🐶 walking the dog, updated 16 min ago" [ref=e110]
          - button "Tyler Brennan, 🎮 new game came out, updated 46 min ago" [ref=e114]
          - button "Josh Patel, 🍔 burger craving, updated 54 min ago" [ref=e118]
          - button "Diego Morales, ⚽ watching the match, updated 1 hr ago" [ref=e122]
          - button "Mia Fernandez, ❄️ chains on the tires, updated 1 hr ago" [ref=e126]
          - button "Sofia Alvarez, 🌴 sunny again, updated 24 min ago" [ref=e130]
          - button "Tariq Haddad, 🏄 surf was flat, updated 50 min ago" [ref=e134]
          - button "Hannah Lindqvist, 🍩 donut run, updated 57 min ago" [ref=e138]
          - button "Devon Hayes, 🌧️ rain, as promised, updated 33 min ago" [ref=e142]
          - button "Chloe Dubois, 🏔️ first snow!, updated 1 hr ago" [ref=e146]
          - button "Emily Tran, 🎸 live music tonight, updated 29 min ago" [ref=e150]
          - button "Aisha Mohammed, 🧣 it is cold already, updated 1 hr ago" [ref=e154]
          - button "Ben Goldstein, 🍕 dollar slice dinner, updated 10 min ago" [ref=e158]
      - generic [ref=e161]:
        - group "Map view" [ref=e162]:
          - button "Explore" [ref=e163]
          - button "Friends" [active] [pressed] [ref=e164]
        - button "Muse filter" [ref=e165]: ✨ Muse filter
      - button "People 22" [ref=e166]:
        - text: People
        - generic [ref=e172]: "22"
      - status: Plans your friends joined · 7
      - button "I'm free" [ref=e174]:
        - generic [aria-hidden] [ref=e175]: ✨
        - text: I'm free
      - paragraph [ref=e176]:
        - link "OpenFreeMap" [ref=e177] [cursor=pointer]:
          - /url: https://openfreemap.org
        - link "© OpenMapTiles" [ref=e178] [cursor=pointer]:
          - /url: https://www.openmaptiles.org/
        - text: Data from
        - link "OpenStreetMap" [ref=e179] [cursor=pointer]:
          - /url: https://www.openstreetmap.org/copyright
  - navigation "Tab bar" [ref=e180]:
    - link "Home" [ref=e181] [cursor=pointer]:
      - /url: /
    - link "Out Here" [ref=e186] [cursor=pointer]:
      - /url: /out-here
    - link "Friends" [ref=e192] [cursor=pointer]:
      - /url: /friends
    - link "Groups" [ref=e199] [cursor=pointer]:
      - /url: /groups
    - link "13 new notifications Notifications" [ref=e208] [cursor=pointer]:
      - /url: /notifications
      - generic [ref=e213]:
        - generic [aria-hidden] [ref=e214]: "13"
        - generic [ref=e215]: 13 new notifications
      - text: Notifications
    - link "Menu" [ref=e216] [cursor=pointer]:
      - /url: /menu
  - status
  - alert [ref=e219]
```
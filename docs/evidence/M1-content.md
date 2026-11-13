# M1 content: seed text and images

Written by `scripts/gen-content.mjs` and `scripts/gen-images.mjs`. No keys are recorded.

<!-- content:start -->
## Text (npm run gen:content), 2026-11-12T10:36:51.978Z

Model muse-ember-1.0, reasoning_effort minimal, strict json_schema. Cache: .cache/muse/content/.

| Key | Value |
|---|---|
| people | 62 |
| groups | 12 |
| posts | 300 |
| groupPosts | 120 |
| postImages | 45 |
| comments | 200 |
| stories | 16 |
| threads | 20 |
| groupChats | 6 |
| events | 20 |
| listings | 30 |
| alexFriends | 28 |
| droppedPosts | 0 |
| museCalls | 16 |
| cachedBatches | 12 |
| retries | 0 |
| tokensIn | 24902 |
| tokensOut | 17747 |
| spendUsd | 0.0114 |
| seconds | 13 |

Validation: OK (zod contract, references, counts within 10%)

| Batch | ms | ok | cached | tokens in/out |
|---|---|---|---|---|
| people-1 | 0 | true | true | / |
| people-2 | 0 | true | true | / |
| people-3 | 0 | true | true | / |
| people-4 | 0 | true | true | / |
| groups | 0 | true | true | / |
| threads-2 | 0 | true | true | / |
| threads-3 | 0 | true | true | / |
| threads-4 | 0 | true | true | / |
| events-1 | 0 | true | true | / |
| events-2 | 0 | true | true | / |
| listings-1 | 0 | true | true | / |
| listings-2 | 0 | true | true | / |
| posts-03 | 2956 | true | false | 1549/1038 |
| posts-02 | 3500 | true | false | 1711/1234 |
| posts-01 | 3988 | true | false | 1960/1430 |
| posts-04 | 4100 | true | false | 1756/1285 |
| posts-06 | 2292 | true | false | 1646/959 |
| posts-05 | 3466 | true | false | 1618/1133 |
| posts-08 | 2965 | true | false | 1269/812 |
| threads-1 | 7464 | true | false | 1015/1120 |
| posts-07 | 4413 | true | false | 2127/1553 |
| posts-09 | 2908 | true | false | 1559/1130 |
| posts-10 | 2927 | true | false | 1536/722 |
| posts-11 | 2348 | true | false | 1387/840 |
| posts-14 | 2434 | true | false | 1381/962 |
| posts-12 | 3557 | true | false | 1445/1112 |
| posts-15 | 2895 | true | false | 1423/1091 |
| posts-13 | 4062 | true | false | 1520/1326 |
<!-- content:end -->

<!-- images:start -->
## Images (npm run gen:images)



Model muse-image-1.0, $0.01/image, cache .cache/images/, cap 200/run.



### Run 2026-11-12T10:50:02.241Z

`referenced=185 processed=185 generated=185 cacheHits=0 fallbacks=1 failures=0 stillMissing=0 spendUsd=1.85 publicSeedMB=7.43 seconds=730`

| Kind | Files | Avg KB |
|---|---|---|
| portrait | 62 | 11.8 |
| cover | 12 | 57.9 |
| post | 45 | 59.8 |
| story | 16 | 83.3 |
| event | 20 | 63.7 |
| listing | 30 | 29.7 |

| Path | ms | ok | how | KB |
|---|---|---|---|---|
| /seed/events/bayfront-overlook-photo-walk.webp | 11444 | true | generated | 62.8 |
| /seed/events/bayfront-sunset-5k.webp | 18860 | true | generated | 54.9 |
| /seed/events/boba-sketch-sunday.webp | 11301 | true | generated | 72.1 |
| /seed/events/boulder-bay-intro-night.webp | 16789 | true | generated | 54.8 |
| /seed/events/coffee-works-zine-swap.webp | 14882 | true | generated | 72.6 |
| /seed/events/dumpling-den-dumpling-night.webp | 28873 | true | generated | 68.1 |
| /seed/events/film-lab-darkroom-night.webp | 21273 | true | generated | 72.9 |
| /seed/events/gallery-1600-grad-mixer.webp | 19840 | true | generated | 59.2 |
| /seed/events/hacker-way-sunday-volleyball.webp | 18568 | true | generated | 65.0 |
| /seed/events/k-food-potluck-bayfront.webp | 11709 | true | generated | 76.7 |
| /seed/events/kaiten-bay-birthday.webp | 26767 | true | generated | 70.2 |
| /seed/events/library-study-sprint.webp | 14676 | true | generated | 58.0 |
| /seed/events/new-grads-taco-night.webp | 11384 | true | generated | 54.9 |
| /seed/events/noodle-theory-ramen-meetup.webp | 19210 | true | generated | 67.7 |
| /seed/events/pho-saigon-soup-run.webp | 10907 | true | generated | 69.6 |
| /seed/events/pixel-arcade-smash-night.webp | 17516 | true | generated | 55.4 |
| /seed/events/ravenswood-game-night.webp | 26304 | true | generated | 56.8 |
| /seed/events/signal-room-indie-night.webp | 11664 | true | generated | 60.8 |
| /seed/events/signal-room-open-mic.webp | 26359 | true | generated | 52.3 |
| /seed/events/willow-thrift-walk.webp | 18148 | true | generated | 69.1 |
| /seed/groups/bay-area-local-shows.webp | 19332 | true | generated | 30.9 |
| /seed/groups/boba-and-sketch.webp | 29084 | true | generated | 34.7 |
| /seed/groups/boulder-buddies-bay.webp | 9115 | true | generated | 60.3 |
| /seed/groups/cheap-eats-south-bay.webp | 16252 | true | generated | 71.6 |
| /seed/groups/film-photo-walks-bay.webp | 19420 | true | generated | 46.2 |
| /seed/groups/k-food-crew.webp | 9716 | true | generated | 48.9 |
| /seed/groups/menlo-park-new-grads.webp | 14602 | true | generated | 71.4 |
| /seed/groups/peninsula-board-game-night.webp | 23932 | true | generated | 74.9 |
| /seed/groups/peninsula-thrift-walks.webp | 10429 | true | generated | 60.3 |
| /seed/groups/pickup-volleyball-peninsula.webp | 24296 | true | generated | 52.1 |
| /seed/groups/stanford-grad-socials.webp | 10493 | true | generated | 60.2 |
| /seed/groups/sunset-runners-bayfront.webp | 11364 | true | generated | 83.3 |
| /seed/listings/l01.webp | 9187 | true | generated | 28.5 |
| /seed/listings/l02.webp | 9506 | true | generated | 32.6 |
| /seed/listings/l03.webp | 9316 | true | generated | 24.6 |
| /seed/listings/l04.webp | 9034 | true | generated | 19.6 |
| /seed/listings/l05.webp | 9120 | true | generated | 24.6 |
| /seed/listings/l06.webp | 16789 | true | generated | 29.7 |
| /seed/listings/l07.webp | 19414 | true | generated | 32.5 |
| /seed/listings/l08.webp | 17689 | true | generated | 51.5 |
| /seed/listings/l09.webp | 25894 | true | generated | 45.4 |
| /seed/listings/l10.webp | 10559 | true | generated | 28.1 |
| /seed/listings/l11.webp | 9522 | true | generated | 15.6 |
| /seed/listings/l12.webp | 16950 | true | generated | 24.1 |
| /seed/listings/l13.webp | 16935 | true | generated | 29.4 |
| /seed/listings/l14.webp | 25937 | true | generated | 29.8 |
| /seed/listings/l15.webp | 9722 | true | generated | 26.8 |
| /seed/listings/l16.webp | 16974 | true | generated | 32.0 |
| /seed/listings/l17.webp | 16347 | true | generated | 26.8 |
| /seed/listings/l18.webp | 18023 | true | generated | 27.0 |
| /seed/listings/l19.webp | 15896 | true | generated | 30.8 |
| /seed/listings/l20.webp | 7949 | true | generated | 29.8 |
| /seed/listings/l21.webp | 15858 | true | generated | 29.8 |
| /seed/listings/l22.webp | 10098 | true | generated | 25.6 |
| /seed/listings/l23.webp | 16760 | true | generated | 33.6 |
| /seed/listings/l24.webp | 8307 | true | generated | 24.0 |
| /seed/listings/l25.webp | 20149 | true | generated | 30.2 |
| /seed/listings/l26.webp | 16740 | true | generated | 32.9 |
| /seed/listings/l27.webp | 24144 | true | generated | 30.7 |
| /seed/listings/l28.webp | 16529 | true | generated | 30.1 |
| /seed/listings/l29.webp | 9100 | true | generated | 37.7 |
| /seed/listings/l30.webp | 15829 | true | generated | 27.3 |
| /seed/people/aisha.webp | 8740 | true | generated | 12.5 |
| /seed/people/alex.webp | 8398 | true | generated | 13.0 |
| /seed/people/andre.webp | 9089 | true | generated | 9.6 |
| /seed/people/arjun.webp | 10448 | true | generated | 10.1 |
| /seed/people/ava.webp | 14767 | true | generated | 13.0 |
| /seed/people/bea.webp | 13107 | true | generated | 10.1 |
| /seed/people/ben.webp | 9612 | true | generated | 10.6 |
| /seed/people/chloe.webp | 8942 | true | generated | 9.8 |
| /seed/people/daniel.webp | 7219 | true | generated | 12.2 |
| /seed/people/dante.webp | 25022 | true | generated | 12.8 |
| /seed/people/devon.webp | 17899 | true | generated | 12.5 |
| /seed/people/diego.webp | 15393 | true | generated | 10.9 |
| /seed/people/elle.webp | 8165 | true | generated | 11.7 |
| /seed/people/emily.webp | 9803 | true | generated | 9.9 |
| /seed/people/ethan.webp | 15003 | true | generated | 11.0 |
| /seed/people/fatima.webp | 22163 | true | generated | 18.6 |
| /seed/people/felix.webp | 9075 | true | generated | 13.0 |
| /seed/people/gabby.webp | 8965 | true | generated | 9.1 |
| /seed/people/grace.webp | 9302 | true | generated | 11.4 |
| /seed/people/hana.webp | 22148 | true | generated | 10.0 |
| /seed/people/hannah.webp | 9398 | true | generated | 17.0 |
| /seed/people/isaac.webp | 6735 | true | generated | 12.1 |
| /seed/people/ivy.webp | 21531 | true | generated | 15.3 |
| /seed/people/jamal.webp | 18087 | true | generated | 10.2 |
| /seed/people/jess.webp | 7620 | true | generated | 11.5 |
| /seed/people/jordan.webp | 18757 | true | generated | 12.9 |
| /seed/people/josh.webp | 8868 | true | generated | 7.8 |
| /seed/people/june.webp | 9022 | true | generated | 13.0 |
| /seed/people/kai.webp | 10941 | true | generated | 10.7 |
| /seed/people/kayla.webp | 17196 | true | generated | 11.0 |
| /seed/people/kiana.webp | 8499 | true | generated | 10.7 |
| /seed/people/lena.webp | 13923 | true | generated | 11.0 |
| /seed/people/leo.webp | 9358 | true | generated | 14.4 |
| /seed/people/liam.webp | 12781 | true | generated | 12.5 |
| /seed/people/luna.webp | 10294 | true | generated | 11.3 |
| /seed/people/marco.webp | 9112 | true | generated | 10.7 |
| /seed/people/marcus.webp | 17732 | true | generated | 8.9 |
| /seed/people/mateo.webp | 13119 | true | generated | 11.8 |
| /seed/people/maya.webp | 12756 | true | generated | 12.7 |
| /seed/people/mei.webp | 15398 | true | generated | 9.6 |
| /seed/people/mia.webp | 16631 | true | generated | 9.2 |
| /seed/people/nate.webp | 9205 | true | generated | 8.0 |
| /seed/people/nina.webp | 8422 | true | generated | 14.2 |
| /seed/people/noah.webp | 7773 | true | generated | 12.3 |
| /seed/people/noor.webp | 10907 | true | generated | 12.1 |
| /seed/people/olivia.webp | 14178 | true | generated | 11.8 |
| /seed/people/owen.webp | 14731 | true | generated | 12.5 |
| /seed/people/priya.webp | 16755 | true | generated | 16.5 |
| /seed/people/rafael.webp | 24689 | true | generated | 10.9 |
| /seed/people/riley.webp | 20162 | true | generated | 15.7 |
| /seed/people/rosa.webp | 8135 | true | generated | 14.2 |
| /seed/people/ryan.webp | 17147 | true | generated | 14.8 |
| /seed/people/sage.webp | 11118 | true | generated | 13.9 |
| /seed/people/sam.webp | 7893 | true | generated | 8.3 |
| /seed/people/sofia.webp | 8683 | true | generated | 12.5 |
| /seed/people/tariq.webp | 7946 | true | generated | 9.9 |
| /seed/people/tess.webp | 7765 | true | generated | 12.6 |
| /seed/people/tomas.webp | 14800 | true | generated | 9.1 |
| /seed/people/tyler.webp | 8292 | true | generated | 9.1 |
| /seed/people/will.webp | 21160 | true | generated | 9.5 |
| /seed/people/yuki.webp | 9352 | true | generated | 14.3 |
| /seed/people/zara.webp | 11813 | true | generated | 11.3 |
| /seed/posts/p005.webp | 19229 | true | generated | 50.5 |
| /seed/posts/p006.webp | 16105 | true | generated | 56.3 |
| /seed/posts/p025.webp | 21629 | true | generated | 65.6 |
| /seed/posts/p026.webp | 25929 | true | generated | 53.7 |
| /seed/posts/p036.webp | 23340 | true | generated | 73.0 |
| /seed/posts/p042.webp | 20438 | true | generated | 57.9 |
| /seed/posts/p052.webp | 20351 | true | generated | 58.7 |
| /seed/posts/p063.webp | 14831 | true | generated | 71.3 |
| /seed/posts/p065.webp | 11226 | true | generated | 61.8 |
| /seed/posts/p068.webp | 23264 | true | generated | 60.1 |
| /seed/posts/p072.webp | 24390 | true | generated | 62.5 |
| /seed/posts/p075.webp | 13614 | true | generated | 57.9 |
| /seed/posts/p079.webp | 24932 | true | generated | 62.0 |
| /seed/posts/p082.webp | 12880 | true | generated | 38.6 |
| /seed/posts/p090.webp | 19345 | true | generated | 64.0 |
| /seed/posts/p091.webp | 10310 | true | generated | 50.4 |
| /seed/posts/p095.webp | 24184 | true | generated | 63.3 |
| /seed/posts/p098.webp | 20160 | true | generated | 45.8 |
| /seed/posts/p100.webp | 16823 | true | generated | 66.5 |
| /seed/posts/p113.webp | 20082 | true | generated | 63.7 |
| /seed/posts/p115.webp | 17576 | true | generated | 66.8 |
| /seed/posts/p124.webp | 13201 | true | generated | 46.2 |
| /seed/posts/p125.webp | 18624 | true | generated | 66.5 |
| /seed/posts/p126.webp | 21898 | true | generated | 68.7 |
| /seed/posts/p134.webp | 14240 | true | generated | 55.6 |
| /seed/posts/p136.webp | 20784 | false | fallback svg (HTTP 400 content_policy_violation: 400 The response was filtered due to the prompt triggering our content managemen) | 2.3 |
| /seed/posts/p138.webp | 25765 | true | generated | 60.1 |
| /seed/posts/p154.webp | 19150 | true | generated | 40.7 |
| /seed/posts/p162.webp | 8233 | true | generated | 48.4 |
| /seed/posts/p167.webp | 19896 | true | generated | 74.3 |
| /seed/posts/p176.webp | 21005 | true | generated | 71.4 |
| /seed/posts/p186.webp | 19441 | true | generated | 72.5 |
| /seed/posts/p188.webp | 23170 | true | generated | 54.1 |
| /seed/posts/p191.webp | 11165 | true | generated | 60.5 |
| /seed/posts/p206.webp | 17133 | true | generated | 71.6 |
| /seed/posts/p209.webp | 22714 | true | generated | 40.9 |
| /seed/posts/p210.webp | 14760 | true | generated | 69.0 |
| /seed/posts/p217.webp | 12933 | true | generated | 58.2 |
| /seed/posts/p234.webp | 14882 | true | generated | 56.7 |
| /seed/posts/p249.webp | 19765 | true | generated | 72.2 |
| /seed/posts/p268.webp | 19395 | true | generated | 66.7 |
| /seed/posts/p272.webp | 21260 | true | generated | 78.7 |
| /seed/posts/p289.webp | 21072 | true | generated | 74.5 |
| /seed/posts/p297.webp | 18741 | true | generated | 87.3 |
| /seed/posts/p300.webp | 27575 | true | generated | 43.5 |
| /seed/stories/1.webp | 6795 | true | generated | 46.8 |
| /seed/stories/10.webp | 10934 | true | generated | 158.8 |
| /seed/stories/11.webp | 9672 | true | generated | 57.2 |
| /seed/stories/12.webp | 22331 | true | generated | 69.6 |
| /seed/stories/13.webp | 12085 | true | generated | 77.6 |
| /seed/stories/14.webp | 9198 | true | generated | 103.2 |
| /seed/stories/15.webp | 23434 | true | generated | 68.6 |
| /seed/stories/16.webp | 9613 | true | generated | 48.9 |
| /seed/stories/2.webp | 18499 | true | generated | 121.4 |
| /seed/stories/3.webp | 29938 | true | generated | 54.7 |
| /seed/stories/4.webp | 22326 | true | generated | 97.8 |
| /seed/stories/5.webp | 15515 | true | generated | 130.4 |
| /seed/stories/6.webp | 25710 | true | generated | 89.5 |
| /seed/stories/7.webp | 30914 | true | generated | 76.9 |
| /seed/stories/8.webp | 10470 | true | generated | 51.8 |
| /seed/stories/9.webp | 10285 | true | generated | 78.9 |

### Run 2026-11-13T05:32:24.167Z

`referenced=199 processed=14 generated=14 cacheHits=0 fallbacks=0 failures=0 stillMissing=0 spendUsd=0.14 publicSeedMB=8.01 seconds=83`

| Kind | Files | Avg KB |
|---|---|---|
| portrait | 62 | 11.8 |
| cover | 12 | 57.9 |
| post | 45 | 61.0 |
| story | 16 | 83.3 |
| event | 20 | 63.7 |
| listing | 30 | 29.7 |
| video | 14 | 38.3 |

| Path | ms | ok | how | KB |
|---|---|---|---|---|
| /seed/videos/basement-set.webp | 21838 | true | generated | 48.1 |
| /seed/videos/bass-lines.webp | 19444 | true | generated | 33.3 |
| /seed/videos/comic-haul.webp | 22233 | true | generated | 34.1 |
| /seed/videos/desk-tour.webp | 15412 | true | generated | 23.7 |
| /seed/videos/dj-mix.webp | 15165 | true | generated | 28.9 |
| /seed/videos/dumpling-folds.webp | 21969 | true | generated | 64.9 |
| /seed/videos/everyday-makeup.webp | 20558 | true | generated | 25.9 |
| /seed/videos/film-basics.webp | 37276 | true | generated | 40.5 |
| /seed/videos/film-walk.webp | 21618 | true | generated | 37.2 |
| /seed/videos/first-v3.webp | 20038 | true | generated | 37.7 |
| /seed/videos/ink-timelapse.webp | 25526 | true | generated | 52.3 |
| /seed/videos/panel-layout.webp | 13414 | true | generated | 41.9 |
| /seed/videos/volley-rally.webp | 23178 | true | generated | 41.2 |
| /seed/videos/zine-fold.webp | 10683 | true | generated | 27.1 |

### Run 2026-11-13T07:34:23.581Z

`referenced=223 processed=24 generated=24 cacheHits=0 fallbacks=0 failures=0 stillMissing=0 spendUsd=0.24 publicSeedMB=9.99 seconds=114`

| Kind | Files | Avg KB |
|---|---|---|
| portrait | 62 | 11.8 |
| cover | 12 | 57.9 |
| post | 45 | 61.0 |
| story | 16 | 83.3 |
| event | 20 | 63.7 |
| listing | 30 | 29.7 |
| video | 20 | 43.9 |
| clip | 18 | 94.0 |

| Path | ms | ok | how | KB |
|---|---|---|---|---|
| /seed/videos/frames/lamp-rewire-1.webp | 26788 | true | generated | 53.0 |
| /seed/videos/frames/lamp-rewire-2.webp | 14084 | true | generated | 27.7 |
| /seed/videos/frames/lamp-rewire-3.webp | 9976 | true | generated | 54.2 |
| /seed/videos/frames/polaroid-walk-1.webp | 19635 | true | generated | 137.2 |
| /seed/videos/frames/polaroid-walk-2.webp | 18497 | true | generated | 94.5 |
| /seed/videos/frames/polaroid-walk-3.webp | 11752 | true | generated | 145.1 |
| /seed/videos/frames/spot-vintage-denim-1.webp | 22929 | true | generated | 102.1 |
| /seed/videos/frames/spot-vintage-denim-2.webp | 12137 | true | generated | 108.3 |
| /seed/videos/frames/spot-vintage-denim-3.webp | 17686 | true | generated | 92.7 |
| /seed/videos/frames/thrift-haul-1.webp | 10368 | true | generated | 87.7 |
| /seed/videos/frames/thrift-haul-2.webp | 32736 | true | generated | 257.3 |
| /seed/videos/frames/thrift-haul-3.webp | 29678 | true | generated | 97.2 |
| /seed/videos/frames/vintage-watch-1.webp | 12091 | true | generated | 92.1 |
| /seed/videos/frames/vintage-watch-2.webp | 22336 | true | generated | 53.7 |
| /seed/videos/frames/vintage-watch-3.webp | 10712 | true | generated | 69.9 |
| /seed/videos/frames/vinyl-dig-1.webp | 10781 | true | generated | 85.0 |
| /seed/videos/frames/vinyl-dig-2.webp | 12628 | true | generated | 66.0 |
| /seed/videos/frames/vinyl-dig-3.webp | 21744 | true | generated | 68.0 |
| /seed/videos/lamp-rewire.webp | 27270 | true | generated | 46.2 |
| /seed/videos/polaroid-walk.webp | 14263 | true | generated | 35.4 |
| /seed/videos/spot-vintage-denim.webp | 27924 | true | generated | 85.6 |
| /seed/videos/thrift-haul.webp | 21250 | true | generated | 57.8 |
| /seed/videos/vintage-watch.webp | 13057 | true | generated | 75.6 |
| /seed/videos/vinyl-dig.webp | 17656 | true | generated | 39.7 |

### Run 2026-11-13T08:40:37.571Z

`referenced=241 processed=18 generated=18 cacheHits=0 fallbacks=0 failures=0 stillMissing=0 spendUsd=0.18 publicSeedMB=17.64 seconds=106`

| Kind | Files | Avg KB |
|---|---|---|
| portrait | 62 | 11.8 |
| cover | 12 | 57.9 |
| post | 45 | 61.0 |
| story | 16 | 83.3 |
| event | 20 | 63.7 |
| listing | 30 | 29.7 |
| reelposter | 3 | 44.2 |
| video | 20 | 43.9 |
| reelframe | 15 | 81.2 |
| clip | 18 | 94.0 |

| Path | ms | ok | how | KB |
|---|---|---|---|---|
| /seed/videos/frames/reel-denim-5-ways-1.webp | 16992 | true | generated | 75.8 |
| /seed/videos/frames/reel-denim-5-ways-2.webp | 14254 | true | generated | 69.9 |
| /seed/videos/frames/reel-denim-5-ways-3.webp | 21818 | true | generated | 123.6 |
| /seed/videos/frames/reel-denim-5-ways-4.webp | 11650 | true | generated | 91.9 |
| /seed/videos/frames/reel-denim-5-ways-5.webp | 11185 | true | generated | 72.1 |
| /seed/videos/frames/reel-flea-market-finds-1.webp | 38349 | true | generated | 100.0 |
| /seed/videos/frames/reel-flea-market-finds-2.webp | 15386 | true | generated | 95.7 |
| /seed/videos/frames/reel-flea-market-finds-3.webp | 10595 | true | generated | 65.7 |
| /seed/videos/frames/reel-flea-market-finds-4.webp | 9964 | true | generated | 66.3 |
| /seed/videos/frames/reel-flea-market-finds-5.webp | 19352 | true | generated | 83.4 |
| /seed/videos/frames/reel-thrift-outfit-40-1.webp | 20993 | true | generated | 77.7 |
| /seed/videos/frames/reel-thrift-outfit-40-2.webp | 25750 | true | generated | 76.1 |
| /seed/videos/frames/reel-thrift-outfit-40-3.webp | 22962 | true | generated | 54.5 |
| /seed/videos/frames/reel-thrift-outfit-40-4.webp | 24572 | true | generated | 96.4 |
| /seed/videos/frames/reel-thrift-outfit-40-5.webp | 18570 | true | generated | 68.0 |
| /seed/videos/reel-denim-5-ways.webp | 33753 | true | generated | 49.9 |
| /seed/videos/reel-flea-market-finds.webp | 39664 | true | generated | 40.0 |
| /seed/videos/reel-thrift-outfit-40.webp | 36485 | true | generated | 42.6 |

### Run 2026-11-13T11:31:34.484Z

`referenced=246 processed=5 generated=5 cacheHits=0 fallbacks=0 failures=0 stillMissing=0 spendUsd=0.05 publicSeedMB=20.01 seconds=32`

| Kind | Files | Avg KB |
|---|---|---|
| portrait | 62 | 11.8 |
| cover | 12 | 57.9 |
| post | 45 | 61.0 |
| story | 16 | 83.3 |
| event | 20 | 63.7 |
| listing | 34 | 33.0 |
| reelposter | 4 | 44.8 |
| video | 20 | 43.9 |
| reelframe | 15 | 81.2 |
| clip | 18 | 94.0 |

| Path | ms | ok | how | KB |
|---|---|---|---|---|
| /seed/listings/p01.webp | 31762 | true | generated | 37.6 |
| /seed/listings/p02.webp | 11245 | true | generated | 76.1 |
| /seed/listings/p03.webp | 9607 | true | generated | 50.3 |
| /seed/listings/p04.webp | 19530 | true | generated | 65.9 |
| /seed/videos/reel-denim-bag-styling.webp | 21634 | true | generated | 46.5 |
<!-- images:end -->

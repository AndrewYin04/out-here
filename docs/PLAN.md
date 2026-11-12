# Overnight plan (live)

Master plan: MVP-BUILD-PLAN-itr-1.md (section 7). Times are PT. Freeze Fri Nov 13 07:00, handoff 08:00, deadline 10:30.

| # | Target (PT) | Work | State |
|---|---|---|---|
| S | Thu 03:30 | Phase S: hooks, agents, kit reconcile, scaffold, FB survey (unverified, no browser), preview pipeline | ✅ |
| M1 | Thu 06:00 | Contracts, schema + migration (dev + demo), seed content (Muse), images (Muse), seed dev/demo | ✅ (images finishing) |
| M2a | Thu 07:00 | Data layer (store, API, identity, realtime) · Muse pipeline · FB shell + UI kit | 🔨 |
| M2b | Thu 10:00 | FB-P0 surfaces (feed, profile, friends, notifications, groups) · Out Here map tab | ⏳ |
| M3 | Thu 13:00 (P0 checkpoint) | Integrate; invites, join_quest, live seats; demo.spec.ts; P0 checkpoint on preview with real Muse | ⏳ |
| M4 | Thu 19:30 = demo-ready + draft HANDOFF | Muse Intros (double opt-in, 2nd degree + groups, score ≥85) · Groups Hangouts, Messenger, Events, Search · memories loop · 3D walking view | ⏳ |
| M5 | until freeze | Kit P2 (Daily Quest, streaks, Wrapped), FB-P2 (Marketplace, Reels), polish queue, judge-driven fixes | ⏳ |
| M6 | Fri 07:30-08:30 | Fixes only, seed:demo, final e2e on preview, HANDOFF.md, DEVPOST.md, screenshots, README | ⏳ |

## Next tasks
1. Finish Phase S (workflow running: S1 docs, S3 scaffold, S4 FB survey).
2. Commit Phase S, dry-run the builder → verifier → merge loop, deploy scaffold preview.
3. M1 contracts + schema.

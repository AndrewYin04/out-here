# Realtime channels

Live updates use Supabase **Broadcast** on public channels (plan section 4, item 3). The browser
never reads tables; it subscribes to these channels and refetches through the API when a message
arrives.

## Rules

- Only route handlers send. They send **after** the mutation commits, using the server client
  (secret key).
- Payloads carry **ids and counts only**: no names, profile fields, text, or locations. Anyone
  can subscribe to a public channel, so a payload must be safe for a stranger to read.
- A client that receives a message refetches the object through its API route. That route applies
  `canSee` for the persona in `x-persona`.
- Event name: every message uses the Broadcast event `"update"`, except `presence:online`, which
  uses Presence.
- Ids are the uuids from the database (`src/shared/seed/ids.ts` derives the seeded ones).

## Channels

| Channel | Sent when | Payload |
|---|---|---|
| `quest:<questId>` | join, leave, complete, status change, check-in, a post on the plan page | `{ seatsLeft: number, memberCount: number, hereCount?: number }` or `{ postCount: number }` |
| `quests:new` | someone posts a new plan | `{ questId: string }` (every map refetches `/api/quests`, which applies `canSeeQuest`, so a Group or invite-only plan reaches only the people who may see it) |
| `user:<userId>` | a notification, invite, message, friendship, availability, memory, quest or shared-plan change for that user | `{ type: "notification" \| "invite" \| "message" \| "friendship" \| "availability" \| "memory" \| "quest" \| "together", id: string }` |
| `location:<userId>` | a friend whose Find My share reaches this user moved, edited their bubble or changed sharing (also the user's own share, for their other tabs) | `{ type: "location", id: ownerId }` |
| `walk:<questId>` | a member of the plan took a walk step (every 1.5 s while walking there in 3D) | `{}` (no walker id: the channel is public and keyed by a quest id non-members can see, so an id would name guests the API shows as `hidden:<n>`; the walkers hook refetches) |
| `thread:<threadId>` | a message is posted in the thread | `{ messageId: string }` |
| `presence:online` | (Presence) a tab opens or closes | presence state: `{ userId: string }` per tab |
| `together:<planId>` | a member votes "I'm in" (or takes it back), or the plan locks | `{ status: 'proposing' \| 'confirmed' \| 'expired', confirmedQuestId: string \| null }` |
| `post:<postId>` | a reaction or comment changes | `{ reactions: number, comments: number }` (totals) |
| `event:<eventId>` | an RSVP changes (Facebook Events) | `{ goingCount: number, interestedCount: number }` |

Movement has its own channels, so it never refetches the `user:` hooks. About 11 hooks in a tab
listen on `user:<me>` (notifications, invites, availability, Up next, friends, profile and others).
A walk step every 1.5 s used to send `user:<friend>`, and each of those hooks then did a fresh
database read in every open tab of every friend (issue #36). Now only the Find My hooks
(`/api/locations/friends`, `/api/locations/me`) listen on `location:<me>`, and only the walkers hook
listens on `walk:<questId>`. Like `user:`, `location:` is keyed by the recipient, so a message says
only that something changed for that viewer, never where anyone is.

The `id` in a `user:` message is the id of the new notification, invite, or message. The client
loads it through `/api/notifications`, `/api/invites/...`, or `/api/threads/:id/messages`.

## TypeScript shapes

```ts
type QuestBroadcast = { seatsLeft: number; memberCount: number; hereCount?: number } | { postCount: number };
type NewQuestBroadcast = { questId: string };
type UserBroadcast = { type: 'notification' | 'invite' | 'message' | 'friendship' | 'availability' | 'memory' | 'quest' | 'together'; id: string };
type LocationBroadcast = { type: 'location'; id: string }; // id: the share owner
type WalkBroadcast = { id: string }; // id: the walker
type ThreadBroadcast = { messageId: string };
type PostBroadcast = { reactions: number; comments: number };
type OnlinePresence = { userId: string };
```

## Sending from a route handler (sketch)

```ts
const channel = supabaseServer.channel(`quest:${questId}`);
await channel.send({ type: 'broadcast', event: 'update', payload: { seatsLeft, memberCount } });
await supabaseServer.removeChannel(channel);
```

`seatsLeft` comes from the return value of `join_quest` / `leave_quest`, the Postgres functions in
`supabase/migrations/0001_init.sql`. They are the only way to take or give back a seat. A full
quest raises the error message `quest_full`, which the route maps to HTTP 409.

## Refetching on the client

`useApi` (`src/features/data/hooks.ts`) sends every refetch through a tab-wide coalescer
(`src/features/data/coalesce.ts`), keyed by persona, path and freshness. The first message fetches
at once. Every message gets one arrival mark, shared by all the hooks it reaches, and a hook joins
the fetch in flight when that fetch started after the message, so one message costs 1 GET per path
per tab however many hooks read the path (`useFriendPins` is mounted 3 times on the Out Here map).
Messages that arrive while an older fetch is in flight, or within 250 ms of its start, share exactly
one trailing fetch. A burst of 5 messages therefore costs at most 2 GETs per path per tab, instead
of 5 per hook. `useQuests` skips the refetch for a `quests:new` whose `questId` is already on its
map, and `useMyShare` skips a `location:<me>` message whose `id` is a friend, so a friend's walk
step costs a watching tab 1 GET (`/api/locations/friends`).

## MemoryStore fallback

Without Supabase env, the MemoryStore sends the same channel names and payloads in-process, and the
browser receives them over Server-Sent Events from `GET /api/realtime?channels=...` (the route only
accepts the channel names in this table). Hooks therefore handle both stores the same way.

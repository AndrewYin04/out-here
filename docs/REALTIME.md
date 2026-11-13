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
| `user:<userId>` | a notification, invite, message, friendship, availability, memory or location change for that user | `{ type: "notification" \| "invite" \| "message" \| "friendship" \| "availability" \| "memory" \| "location", id: string }` |
| `thread:<threadId>` | a message is posted in the thread | `{ messageId: string }` |
| `presence:online` | (Presence) a tab opens or closes | presence state: `{ userId: string }` per tab |
| `post:<postId>` | a reaction or comment changes | `{ reactions: number, comments: number }` (totals) |
| `event:<eventId>` | an RSVP changes (Facebook Events) | `{ goingCount: number, interestedCount: number }` |

The `id` in a `user:` message is the id of the new notification, invite, or message. The client
loads it through `/api/notifications`, `/api/invites/...`, or `/api/threads/:id/messages`.

## TypeScript shapes

```ts
type QuestBroadcast = { seatsLeft: number; memberCount: number; hereCount?: number } | { postCount: number };
type NewQuestBroadcast = { questId: string };
type UserBroadcast = { type: 'notification' | 'invite' | 'message' | 'friendship' | 'availability' | 'memory' | 'location'; id: string };
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

## MemoryStore fallback

Without Supabase env, the MemoryStore sends the same channel names and payloads in-process, and the
browser receives them over Server-Sent Events from `GET /api/realtime?channels=...` (the route only
accepts the channel names in this table). Hooks therefore handle both stores the same way.

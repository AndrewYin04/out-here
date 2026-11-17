// Server-only static demo data for the shell, built from supabase/seed-content.json and the
// shared friend graph. Import this from server components only (it pulls in the seed JSON);
// client code gets the result through ShellDataProvider props.
import content from '../../../../supabase/seed-content.json';
import { PERSONA_HANDLES, DEMO_DRIVER_HANDLE } from '@/shared/demo';
import { deriveFriendGraph, friendAdjacency } from '@/shared/seed/graph';
import { mulberry32, profileId } from '@/shared/seed/ids';
import type { ShellContact, ShellPerson, ShellStaticData, ShellViewerData } from './types';

type SeedPerson = (typeof content.people)[number];
type SeedGroup = (typeof content.groups)[number];

const people: SeedPerson[] = content.people;
const byHandle = new Map(people.map((p) => [p.handle, p]));
const handleById = new Map(people.map((p) => [profileId(p.handle), p.handle]));

const toPerson = (p: SeedPerson): ShellPerson => ({ handle: p.handle, name: p.name, avatarUrl: p.avatar ?? null });

/** Stable pseudo-random "online" flag per handle (presence replaces it at integration). */
function isOnline(handle: string): boolean {
  if (handle === 'maya') return true;
  let seed = 0;
  for (const ch of handle) seed = (seed * 33 + ch.charCodeAt(0)) >>> 0;
  return mulberry32(seed)() < 0.55;
}

let cache: ShellStaticData | null = null;

export function getDemoShellData(): ShellStaticData {
  if (cache) return cache;
  const friendships = deriveFriendGraph(people.map((p) => ({ handle: p.handle, circles: p.circles })));
  const adjacency = friendAdjacency(friendships);
  const personaSet = new Set<string>(PERSONA_HANDLES);

  const viewers: Record<string, ShellViewerData> = {};
  for (const handle of PERSONA_HANDLES) {
    const me = byHandle.get(handle);
    if (!me) continue;
    const friendHandles = [...(adjacency.get(profileId(handle)) ?? [])]
      .map((id) => handleById.get(id))
      .filter((h): h is string => Boolean(h));
    const friends = friendHandles
      .map((h) => byHandle.get(h)!)
      .sort((a, b) => {
        const pa = personaSet.has(a.handle) ? 0 : 1;
        const pb = personaSet.has(b.handle) ? 0 : 1;
        return pa - pb || a.name.localeCompare(b.name);
      });
    const contacts: ShellContact[] = friends.slice(0, 16).map((p) => ({ ...toPerson(p), online: isOnline(p.handle) }));
    const shortcuts = (content.groups as SeedGroup[])
      .filter((g) => g.memberHandles.includes(handle))
      .map((g) => ({ slug: g.slug, name: g.name, imageUrl: g.cover ?? null }));
    const myThreads = content.threads.filter((t) => t.memberHandles.includes(handle));
    const groupChats = myThreads
      .filter((t) => t.name)
      .map((t) => ({
        id: t.id,
        name: t.name as string,
        members: t.memberHandles.filter((h) => h !== handle).map((h) => byHandle.get(h)).filter(Boolean).map((p) => toPerson(p!)),
      }));
    const unreadThreads = myThreads.filter((t) => {
      const last = t.messages[t.messages.length - 1];
      return last && last.fromHandle !== handle;
    }).length;
    const incomingRequests = friendships.filter(
      (f) => f.status === 'pending' && f.requesterId !== profileId(handle) && (f.userA === profileId(handle) || f.userB === profileId(handle)),
    ).length;
    const birthdayFriend = friends.find((p) => !personaSet.has(p.handle));

    viewers[handle] = {
      viewer: toPerson(me),
      contacts,
      shortcuts,
      groupChats,
      birthdays: birthdayFriend ? [toPerson(birthdayFriend)] : [],
      notificationCount: incomingRequests + 2,
      messageCount: unreadThreads,
    };
  }

  cache = {
    personas: PERSONA_HANDLES.map((h) => byHandle.get(h)).filter(Boolean).map((p) => toPerson(p!)),
    viewers,
    defaultHandle: DEMO_DRIVER_HANDLE,
  };
  return cache;
}

/** A seeded group by slug, for route titles (null when unknown). */
export function getDemoGroup(slug: string): { slug: string; name: string; privacy: string; memberCount: number; coverUrl: string | null } | null {
  const g = (content.groups as SeedGroup[]).find((x) => x.slug === slug);
  return g ? { slug: g.slug, name: g.name, privacy: g.privacy, memberCount: g.memberHandles.length, coverUrl: g.cover ?? null } : null;
}

/** A seeded person by handle, for route titles (null when unknown). */
export function getDemoPerson(handle: string): ShellPerson | null {
  const p = byHandle.get(handle);
  return p ? toPerson(p) : null;
}

// Friend graph derived from circles. Pure and deterministic, so tests and the seed agree.
import type { FriendshipStatus, ID } from '../types';
import { mulberry32, profileId, shuffled } from './ids';

export type CirclePerson = { handle: string; circles: string[] };

export type SeedFriendship = {
  userA: ID; userB: ID;          // userA < userB
  requesterId: ID;
  status: FriendshipStatus;
};

export type GraphOptions = {
  seed?: number;
  /** Chance that two people who share a circle are friends. */
  keepProbability?: number;
  /** Extra random friendships between people in different circles, per 10 people. */
  bridgesPer10?: number;
  /** Handle that receives and sends the pending requests. */
  focusHandle?: string;
  incomingPending?: number;
  outgoingPending?: number;
  /** Pairs that are always accepted friends. */
  mustBeFriends?: [string, string][];
  /** Circles where the focus person is a newcomer: pending requests come from these. */
  localCircles?: string[];
  idOf?: (handle: string) => ID;
};

export const LOCAL_CIRCLES = [
  'coworkers', 'maya-roommates', 'climbing-gym', 'local-shows', 'volleyball',
  'thrift', 'board-games', 'stanford-grad',
];

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Someone with no circles (for example Leah, the closet sale seller) knows nobody in the seed: they
 * get no friendships, no bridges and no friend requests, and leave everyone else's graph as is.
 */
export const inFriendGraph = (p: { circles?: readonly string[] | null }) => (p.circles?.length ?? 0) > 0;

export function deriveFriendGraph(allPeople: readonly CirclePerson[], opts: GraphOptions = {}): SeedFriendship[] {
  const people = allPeople.filter(inFriendGraph);
  const {
    seed = 42,
    keepProbability = 0.85,
    bridgesPer10 = 1,
    focusHandle = 'alex',
    incomingPending = 3,
    outgoingPending = 2,
    mustBeFriends = [['alex', 'maya']],
    localCircles = LOCAL_CIRCLES,
    idOf = profileId,
  } = opts;
  const rng = mulberry32(seed);
  const handles = new Set(people.map((p) => p.handle));
  const accepted = new Map<string, [string, string]>(); // key -> [a, b] handles

  const add = (a: string, b: string) => {
    if (a === b || !handles.has(a) || !handles.has(b)) return;
    accepted.set(pairKey(a, b), a < b ? [a, b] : [b, a]);
  };

  // 1. Circles: most people in a circle know each other.
  const circles = new Map<string, string[]>();
  for (const p of people) for (const c of p.circles) {
    if (!circles.has(c)) circles.set(c, []);
    circles.get(c)!.push(p.handle);
  }
  for (const c of [...circles.keys()].sort()) {
    const members = circles.get(c)!.slice().sort();
    for (let i = 0; i < members.length; i++) {
      let keptAny = false;
      for (let j = i + 1; j < members.length; j++) {
        if (rng() < keepProbability) { add(members[i], members[j]); keptAny = true; }
      }
      // nobody is a stranger in their own circle
      if (!keptAny && i + 1 < members.length) add(members[i], members[i + 1]);
    }
  }

  // 2. Bridges: a few friendships across circles, never involving the focus person
  //    (the newcomer should not gain local friends by accident).
  const others = people.map((p) => p.handle).filter((h) => h !== focusHandle).sort();
  const bridgeCount = Math.round((people.length / 10) * bridgesPer10);
  for (let k = 0; k < bridgeCount && others.length > 1; k++) {
    const a = others[Math.floor(rng() * others.length)];
    const b = others[Math.floor(rng() * others.length)];
    add(a, b);
  }

  // 3. Fixed pairs.
  for (const [a, b] of mustBeFriends) add(a, b);

  // 4. Pending requests for the focus person, from people they do not know yet.
  const pending: { from: string; to: string }[] = [];
  if (handles.has(focusHandle)) {
    const isFriend = (h: string) => accepted.has(pairKey(focusHandle, h));
    const byHandle = new Map(people.map((p) => [p.handle, p]));
    const strangers = others.filter((h) => !isFriend(h));
    const local = strangers.filter((h) => byHandle.get(h)!.circles.some((c) => localCircles.includes(c)));
    const pool = shuffled(local, rng).concat(shuffled(strangers.filter((h) => !local.includes(h)), rng));
    for (const h of pool.slice(0, incomingPending)) pending.push({ from: h, to: focusHandle });
    for (const h of pool.slice(incomingPending, incomingPending + outgoingPending)) {
      pending.push({ from: focusHandle, to: h });
    }
  }

  const out: SeedFriendship[] = [];
  for (const key of [...accepted.keys()].sort()) {
    const [a, b] = accepted.get(key)!;
    out.push(normalize(idOf(a), idOf(b), rng() < 0.5 ? idOf(a) : idOf(b), 'accepted'));
  }
  for (const p of pending) out.push(normalize(idOf(p.from), idOf(p.to), idOf(p.from), 'pending'));
  return out;
}

function normalize(x: ID, y: ID, requesterId: ID, status: FriendshipStatus): SeedFriendship {
  return x < y ? { userA: x, userB: y, requesterId, status } : { userA: y, userB: x, requesterId, status };
}

/** Accepted-friend adjacency (both directions) from friendship rows. */
export function friendAdjacency(rows: readonly SeedFriendship[]): Map<ID, Set<ID>> {
  const adj = new Map<ID, Set<ID>>();
  const link = (a: ID, b: ID) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const r of rows) if (r.status === 'accepted') { link(r.userA, r.userB); link(r.userB, r.userA); }
  return adj;
}

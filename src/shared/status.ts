// "Am I free?" as one of three states, derived from a person's shared availability windows.
// Busy is simply "no window now or later": there is no busy row, so a Busy person gives
// friends' agents nothing to read and no reason.
import { formatDemoTime } from './demo';

export type FreeStatus =
  | { kind: 'free'; until: string }
  | { kind: 'later'; from: string; until: string }
  | { kind: 'busy' };

type Window = { startsAt: string; endsAt: string };

export function freeStatus(windows: readonly Window[], now: Date = new Date()): FreeStatus {
  const t = now.getTime();
  const open = windows
    .filter((w) => Date.parse(w.endsAt) > t)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = open.find((w) => Date.parse(w.startsAt) <= t);
  if (current) return { kind: 'free', until: current.endsAt };
  const next = open[0];
  return next ? { kind: 'later', from: next.startsAt, until: next.endsAt } : { kind: 'busy' };
}

/** "Free till 12:10 PM", "Free at 1:00 PM", "Busy". */
export function freeStatusLabel(s: FreeStatus): string {
  if (s.kind === 'free') return `Free till ${formatDemoTime(s.until)}`;
  if (s.kind === 'later') return `Free at ${formatDemoTime(s.from)}`;
  return 'Busy';
}

/** Where two windows overlap from `now` on, or null. */
export function overlapWindow(a: Window, b: Window, now: Date = new Date()): { from: string; until: string } | null {
  const from = Math.max(Date.parse(a.startsAt), Date.parse(b.startsAt), now.getTime());
  const until = Math.min(Date.parse(a.endsAt), Date.parse(b.endsAt));
  return until > from ? { from: new Date(from).toISOString(), until: new Date(until).toISOString() } : null;
}

// ---- Who's free when you are: a ranked list and a suggested group ----

export type FreeFriendInput = {
  id: string;
  from: string; until: string;       // the overlap with the viewer's window
  friendUntil: string;               // the friend's own window end
  sharedInterests: string[];         // viewer ∩ friend, from what the friend shares
};

export type RankedFreeFriend = FreeFriendInput & {
  score: number;
  freeNow: boolean;
  knows: string[];                   // other free friends this friend is friends with
};

/**
 * Ranks friends who are free when the viewer is: free now beats free later, then shared
 * interests (up to 3), knowing others who are free (up to 2), and a long enough overlap
 * (30 min+). Ties go to whoever's free time ends first. The group is the top friend plus the
 * free friends who already know them, up to 3 people.
 */
export type PairSignalFn = (a: string, b: string) => 'both_yes' | 'one_no' | 'unknown';

export function rankFreeFriends(
  items: readonly FreeFriendInput[],
  areFriends: (a: string, b: string) => boolean,
  now: Date = new Date(),
  /** Private post-hangout "hang again" signal (server only). Omitted = all unknown. */
  match?: { viewerId: string; pair: PairSignalFn },
): { ranked: RankedFreeFriend[]; group: string[] } {
  const t = now.getTime();
  const pair: PairSignalFn = match?.pair ?? (() => 'unknown');
  const ranked = items.map((f) => {
    const freeNow = Date.parse(f.from) <= t + 60_000;
    const knows = items.filter((o) => o.id !== f.id && areFriends(f.id, o.id)).map((o) => o.id);
    const long = Date.parse(f.until) - Math.max(Date.parse(f.from), t) >= 30 * 60_000;
    // Both said they'd hang again: a strong signal, used for order only, never shown.
    const again = match && pair(match.viewerId, f.id) === 'both_yes' ? 2 : 0;
    const score = (freeNow ? 3 : 0) + Math.min(f.sharedInterests.length, 3) + Math.min(knows.length, 2) + (long ? 1 : 0) + again;
    return { ...f, score, freeNow, knows };
  }).sort((a, b) => b.score - a.score || a.until.localeCompare(b.until) || a.friendUntil.localeCompare(b.friendUntil));
  // The group: the best friend the viewer may be paired with, plus free friends who know them,
  // never two people when either said no about the other (viewer included).
  const ok = (a: string, b: string) => pair(a, b) !== 'one_no';
  const viewerOk = (id: string) => !match || ok(match.viewerId, id);
  const top = ranked.find((f) => viewerOk(f.id));
  if (!top) return { ranked, group: [] };
  const group = [top.id];
  for (const f of ranked) {
    if (group.length >= 3) break;
    if (f.id === top.id || !top.knows.includes(f.id) || f.freeNow !== top.freeNow || !viewerOk(f.id)) continue;
    if (group.every((g) => ok(g, f.id))) group.push(f.id);
  }
  return { ranked, group };
}

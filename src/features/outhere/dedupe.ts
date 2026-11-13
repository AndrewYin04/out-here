// Keeps the plan sheet from saying the same thing three times: the card's reason, its overlap
// line and the summary under the cards. Pure and client-safe.
import { formatDemoTime, type PlanSuggestion } from '@/shared';

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9:$ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * True when the card's reason already names this friend and when they are free, so the overlap
 * line ("Maya can make it · free till 4:44 PM") would only repeat it.
 */
export function reasonCoversOverlap(reason: string, names: string[], freeUntil: string | undefined, bridge: string | null): boolean {
  if (!reason || names.length !== 1) return false;
  const r = norm(reason);
  if (!r.includes(norm(names[0]))) return false;
  if (bridge && r.includes(norm(bridge))) return true;
  return !!freeUntil && r.includes(norm(formatDemoTime(freeUntil)));
}

/**
 * The summary without the sentences that repeat the top card: its title ("Best bet: Dumplings
 * before the rush."), its reason or bridge, or its friend's name with the same free-until time.
 * Returns '' when nothing new is left.
 */
export function summaryWithoutTop(summary: string, top: PlanSuggestion | undefined, topFriend?: { name: string; freeUntil?: string }): string {
  if (!top) return summary;
  const sentences = summary.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [summary];
  const title = norm(top.title);
  const copies = [top.reason, top.bridge].filter((x): x is string => !!x).map(norm);
  const time = topFriend?.freeUntil ? norm(formatDemoTime(topFriend.freeUntil)) : null;
  const kept = sentences.filter((raw) => {
    const s = norm(raw);
    if (!s) return false;
    if (title && s.includes(title)) return false;
    if (copies.some((c) => c === s || c.includes(s) || s.includes(c))) return false;
    if (topFriend && time && s.includes(norm(topFriend.name)) && s.includes(time)) return false;
    return true;
  });
  return kept.join('').trim();
}

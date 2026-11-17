// Pure helpers for the feed: reaction metadata, relative times, counts.
import { REACTION_TYPES, type Audience, type ReactionCounts, type ReactionType } from '@/shared';

export const REACTIONS: readonly { type: ReactionType; label: string; emoji: string; color: string }[] = [
  { type: 'like', label: 'Like', emoji: '👍', color: '#0866FF' },
  { type: 'love', label: 'Love', emoji: '❤️', color: '#F33E58' },
  { type: 'care', label: 'Care', emoji: '🥰', color: '#F7B125' },
  { type: 'haha', label: 'Haha', emoji: '😆', color: '#F7B125' },
  { type: 'wow', label: 'Wow', emoji: '😮', color: '#F7B125' },
  { type: 'sad', label: 'Sad', emoji: '😢', color: '#F7B125' },
  { type: 'angry', label: 'Angry', emoji: '😡', color: '#E9710F' },
];

export function reactionMeta(type: ReactionType) {
  return REACTIONS.find((r) => r.type === type)!;
}

export function totalReactions(counts: ReactionCounts): number {
  return REACTION_TYPES.reduce((n, t) => n + (counts[t] ?? 0), 0);
}

export function topReactions(counts: ReactionCounts, max = 3): ReactionType[] {
  return REACTION_TYPES.filter((t) => (counts[t] ?? 0) > 0).sort((a, b) => counts[b] - counts[a]).slice(0, max);
}

/** Counts after the viewer changes their reaction from `prev` to `next` (null = none). */
export function applyReaction(counts: ReactionCounts, prev: ReactionType | null, next: ReactionType | null): ReactionCounts {
  const out = { ...counts };
  if (prev) out[prev] = Math.max(0, (out[prev] ?? 0) - 1);
  if (next) out[next] = (out[next] ?? 0) + 1;
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Facebook-style short time: "Just now", "5m", "3h", "2d", then "November 3". */
export function shortTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const s = Math.floor((now.getTime() - t.getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const month = MONTHS[t.getMonth()];
  return t.getFullYear() === now.getFullYear() ? `${month} ${t.getDate()}` : `${month} ${t.getDate()}, ${t.getFullYear()}`;
}

/** Comment time: "Just now" or "5m", "3h", "2d", "1w". */
export function commentTime(iso: string, now: Date = new Date()): string {
  const s = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export function audienceLabel(a: Audience, listName?: string): string {
  if (a === 'public') return 'Public';
  if (a === 'friends') return 'Friends';
  if (a === 'only_me') return 'Only me';
  return listName ?? 'Custom';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "1.2K" style compact counts for the action row. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.floor(n / 1000)}K`;
}

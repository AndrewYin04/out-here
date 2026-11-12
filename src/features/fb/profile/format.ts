import type { Audience, Profile, ProfileField, ReactionType } from '@/shared/types';

const TZ = 'America/Los_Angeles';

/** Facebook-style post time: "5m", "3h", "2d", then "November 3". */
export function postTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: TZ });
}

/** Full date for the time link's tooltip. */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

export const REACTION_EMOJI: Record<ReactionType, string> = {
  like: '👍', love: '❤️', care: '🤗', haha: '😆', wow: '😮', sad: '😢', angry: '😡',
};

export function audienceLabel(a: Audience | undefined): string {
  if (!a || a === 'public') return 'Public';
  if (a === 'friends') return 'Friends';
  if (a === 'only_me') return 'Only me';
  return 'Custom list';
}

export function compactCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K` : String(n);
}

export type IntroRow = { field: ProfileField; text: string };

/**
 * Intro and About rows from the profile the server returned. Fields the viewer may not see
 * arrive as null (canSee per fieldVisibility), so they never render.
 */
export function introRows(p: Profile): IntroRow[] {
  const rows: IntroRow[] = [];
  if (p.job) rows.push({ field: 'job', text: p.job });
  if (p.school) {
    const what = p.major ? `Studied ${p.major} at ` : 'Went to ';
    const year = p.gradYear ? ` · Class of ${p.gradYear}` : '';
    rows.push({ field: 'school', text: `${what}${p.school}${year}` });
  }
  if (p.currentCity) rows.push({ field: 'currentCity', text: `Lives in ${p.currentCity}` });
  if (p.hometown) rows.push({ field: 'hometown', text: `From ${p.hometown}` });
  if (p.pronouns) rows.push({ field: 'pronouns', text: p.pronouns });
  return rows;
}

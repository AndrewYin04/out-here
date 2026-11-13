import type { QuestVisibility } from '@/shared';

/** The four "who can see it" choices, in picker order, with the copy shown to hosts and guests. */
export const VISIBILITY_OPTIONS: { value: QuestVisibility; icon: string; label: string; hint: string }[] = [
  { value: 'community', icon: '🌍', label: 'Community', hint: 'Anyone nearby can see it and join' },
  { value: 'group', icon: '👥', label: 'Group', hint: 'Only members of one of your Groups' },
  { value: 'open', icon: '🤝', label: 'Open hangout', hint: 'Your friends and their friends' },
  { value: 'friends', icon: '🔒', label: 'Friends', hint: 'Only friends you invite' },
];

const BY_VALUE = new Map(VISIBILITY_OPTIONS.map((o) => [o.value, o]));

export function visibilityMeta(v: QuestVisibility | undefined) {
  return BY_VALUE.get(v ?? 'community') ?? VISIBILITY_OPTIONS[0];
}

/** The chip a guest sees on a plan: "🌍 Community", "👥 Menlo Park New Grads", "🔒 Invite only". */
export function visibilityChip(v: QuestVisibility | undefined, groupName?: string | null): string {
  switch (v ?? 'community') {
    case 'group': return `👥 ${groupName ?? 'Group members only'}`;
    case 'open': return '🤝 Friends of friends';
    case 'friends': return '🔒 Invite only';
    default: return '🌍 Community';
  }
}

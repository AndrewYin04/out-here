// Pure helpers for Messenger: chat titles, list snippets, bubble grouping and time labels.
import type { Message } from '@/shared';
import type { PersonCard, ThreadView } from '@/shared/api';

const TZ = 'America/Los_Angeles';

/** Everyone in the thread except the viewer (the viewer alone if nobody else is left). */
export function otherMembers(t: ThreadView, viewerId: string): PersonCard[] {
  const others = t.members.filter((m) => m.id !== viewerId);
  return others.length ? others : t.members;
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** Thread name, or the other person's name, or "Maya, Jordan and 2 others". */
export function threadTitle(t: ThreadView, viewerId: string): string {
  if (t.name) return t.name;
  const others = otherMembers(t, viewerId);
  if (!t.isGroup && others.length === 1) return others[0].name;
  const names = others.map((m) => firstName(m.name));
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

/** "You: see you there", "Maya: on my way" (groups) or the plain text (1:1). */
export function snippet(t: ThreadView, viewerId: string): string {
  const m = t.lastMessage;
  if (!m) return 'Say hi 👋';
  const body = m.kind === 'invite' ? `Sent an Out Here invite: ${m.text}` : m.text;
  if (m.fromId === viewerId) return `You: ${body}`;
  if (t.isGroup) {
    const from = t.members.find((p) => p.id === m.fromId);
    if (from) return `${firstName(from.name)}: ${body}`;
  }
  return body;
}

export function lastActivity(t: ThreadView): string {
  return t.lastMessage?.createdAt ?? t.lastMessageAt ?? t.createdAt;
}

/** Newest first. */
export function sortThreads(threads: ThreadView[]): ThreadView[] {
  return [...threads].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
}

/** Facebook-style short relative time for the chat list: "Just now", "5m", "3h", "2d", "1w". */
export function shortAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 52) return `${w}w`;
  return `${Math.floor(d / 365)}y`;
}

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Divider label between message groups: "3:15 PM", "Tue 3:15 PM" or "Nov 3, 3:15 PM". */
export function dividerLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  if (dayKey(d) === dayKey(new Date(now))) return time;
  if (now - d.getTime() < 6 * 86_400_000) {
    return `${d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${time}`;
  }
  return `${d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}, ${time}`;
}

export type MessageGroup = {
  key: string;
  fromId: string;
  /** Set when a time divider goes above this group. */
  divider: string | null;
  messages: Message[];
};

const SAME_GROUP_MS = 5 * 60_000;
const DIVIDER_MS = 15 * 60_000;

/**
 * Groups consecutive messages from one sender sent within 5 minutes of each other; a time
 * divider goes above the first group and wherever 15 minutes pass between messages.
 */
export function groupMessages(messages: Message[], now: number = Date.now()): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let prev: Message | null = null;
  for (const m of messages) {
    const gap = prev ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity;
    const divider = gap >= DIVIDER_MS ? dividerLabel(m.createdAt, now) : null;
    const last = groups[groups.length - 1];
    if (last && !divider && last.fromId === m.fromId && gap < SAME_GROUP_MS && m.kind !== 'invite' && last.messages[last.messages.length - 1].kind !== 'invite') {
      last.messages.push(m);
    } else {
      groups.push({ key: m.id, fromId: m.fromId, divider, messages: [m] });
    }
    prev = m;
  }
  return groups;
}

/** Server messages plus this tab's optimistic sends that the server has not returned yet. */
export function mergeMessages(server: Message[], pending: Message[]): Message[] {
  const ids = new Set(server.map((m) => m.id));
  const extra = pending.filter((m) => !ids.has(m.id));
  return [...server, ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

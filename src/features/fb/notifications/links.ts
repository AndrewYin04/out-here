// Where a notification row navigates. The server sends an `href`, but some of its targets have
// no page in this app yet (/messages/<id>, /events/<slug>) or are empty when the object is gone
// (/profile/, /groups/). This maps every object type to a route that exists, so no row 404s.
import type { NotificationObjectType, NotificationType } from '@/shared';
import type { NotificationView } from '@/shared/api';

export const NOTIFICATIONS_PATH = '/notifications';

type LinkInput = Pick<NotificationView, 'objectType' | 'objectId' | 'href'> & { type?: NotificationType };

/** Keeps the server href only when it has the expected prefix and a non-empty tail. */
function keep(href: string | undefined, prefix: string): string | null {
  if (!href || !href.startsWith(prefix)) return null;
  const rest = href.slice(prefix.length).split(/[?#]/)[0];
  return rest.length > 0 && !rest.includes('/') ? href : null;
}

export function notificationLink(n: LinkInput): string {
  const id = encodeURIComponent(n.objectId);
  // "How was Dumpling Den?" opens the rating questionnaire for that hangout.
  if (n.type === 'hangout_rate') return `/memories?rate=${id}`;
  switch (n.objectType as NotificationObjectType) {
    case 'post': return `/posts/${id}`;
    case 'comment': return keep(n.href, '/posts/') ?? NOTIFICATIONS_PATH;
    case 'profile': return keep(n.href, '/profile/') ?? NOTIFICATIONS_PATH;
    case 'group': return keep(n.href, '/groups/') ?? NOTIFICATIONS_PATH;
    case 'event': return '/events';
    case 'quest': return `/out-here?quest=${id}`;
    case 'invite': return `/out-here?invite=${id}`;
    case 'thread': return `/messages?thread=${id}`;
    case 'intro': return `/intros#${id}`;
    case 'listing': return `/out-here?listing=${id}`;
    default: return NOTIFICATIONS_PATH;
  }
}

/** Every object type, for tests and exhaustiveness checks. */
export const NOTIFICATION_OBJECT_TYPES: readonly NotificationObjectType[] = [
  'post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread', 'intro', 'listing',
];

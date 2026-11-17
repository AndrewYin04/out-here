import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_OBJECT_TYPES, NOTIFICATIONS_PATH, notificationLink } from './links';
import { startsLabel, timeAgo } from './time';

const APP = join(process.cwd(), 'src', 'app', '(fb)');

/** True when the App Router has a page for this path (static segments or a single [param]). */
function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean);
  let dir = APP;
  for (const s of segs) {
    if (existsSync(join(dir, s))) { dir = join(dir, s); continue; }
    const param = readdirSync(dir).find((d) => /^\[[^.\]]+\]$/.test(d));
    if (!param) return false;
    dir = join(dir, param);
  }
  return existsSync(join(dir, 'page.tsx'));
}

const SERVER_HREFS: Record<string, string> = {
  post: '/posts/p1', comment: '/posts/p1', profile: '/profile/maya', group: '/groups/cheap-eats-south-bay',
  event: '/events/some-event', quest: '/out-here?quest=q1', invite: '/out-here?invite=i1', thread: '/messages/t1',
  intro: '/intros#i1',
};

describe('notificationLink', () => {
  it.each(NOTIFICATION_OBJECT_TYPES)('%s maps to an existing route', (objectType) => {
    const href = notificationLink({ objectType, objectId: 'abc-123', href: SERVER_HREFS[objectType] });
    expect(href.startsWith('/')).toBe(true);
    expect(routeExists(href), href).toBe(true);
  });

  it('never links to a page that does not exist', () => {
    expect(notificationLink({ objectType: 'thread', objectId: 't1', href: '/messages/t1' })).toBe('/messages?thread=t1');
    expect(notificationLink({ objectType: 'event', objectId: 'e1', href: '/events/slug' })).toBe('/events');
    expect(notificationLink({ objectType: 'profile', objectId: 'x', href: '/profile/' })).toBe(NOTIFICATIONS_PATH);
    expect(notificationLink({ objectType: 'group', objectId: 'x', href: '/groups/' })).toBe(NOTIFICATIONS_PATH);
    expect(notificationLink({ objectType: 'comment', objectId: 'x', href: '/' })).toBe(NOTIFICATIONS_PATH);
  });

  it('keeps valid server targets', () => {
    expect(notificationLink({ objectType: 'group', objectId: 'g', href: '/groups/cheap-eats-south-bay' })).toBe('/groups/cheap-eats-south-bay');
    expect(notificationLink({ objectType: 'post', objectId: 'p9', href: '/posts/p9' })).toBe('/posts/p9');
  });

  it('existence check sees the routes the links rely on', () => {
    expect(routeExists('/notifications')).toBe(true);
    expect(routeExists('/nope/really')).toBe(false);
  });
});

describe('time labels', () => {
  const now = Date.parse('2026-11-12T18:00:00Z');
  it('timeAgo', () => {
    expect(timeAgo('2026-11-12T17:59:40Z', now)).toBe('Just now');
    expect(timeAgo('2026-11-12T17:55:00Z', now)).toBe('5m');
    expect(timeAgo('2026-11-12T15:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-11-10T18:00:00Z', now)).toBe('2d');
  });
  it('startsLabel', () => {
    expect(startsLabel('2026-11-12T18:25:00Z', '2026-11-12T19:00:00Z', now)).toBe('Starts in 25 min');
    expect(startsLabel('2026-11-12T19:10:00Z', '2026-11-12T20:00:00Z', now)).toBe('Starts in 1 hr 10 min');
    expect(startsLabel('2026-11-12T17:50:00Z', '2026-11-12T19:00:00Z', now)).toBe('Happening now');
  });
});

'use client';

import { Bell, House, MapPin, Menu, Users, UserGroup } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, cn } from '@/features/ui';
import { MOBILE_TABS, isActivePath, type MobileTabId } from './nav';
import { useNotificationBadge } from '@/features/fb/notifications';

const ICONS: Record<MobileTabId, typeof House> = {
  home: House,
  'out-here': MapPin,
  friends: Users,
  groups: UserGroup,
  notifications: Bell,
  menu: Menu,
};

/** Out Here's own pages use the compact bar: the map gets the attention, the tabs stay one tap away. */
const COMPACT_ON = /^\/(out-here|memories)(\/|$)/;

/**
 * Bottom tab bar below 768 px: 24 px icons, active blue. Everywhere else every tab shows its
 * 11 px label. Inside Out Here it is compact: the active tab shows its icon and label in a soft
 * pill, the others only their icon (the label stays as the accessible name), and the pill's
 * width eases between tabs. Same height, same links, same badge.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  const { count: notificationCount } = useNotificationBadge();
  const compact = COMPACT_ON.test(pathname);
  return (
    <nav
      aria-label="Tab bar"
      data-testid="mobile-tab-bar"
      data-compact={compact || undefined}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 h-14 border-t border-fb-divider-soft bg-fb-surface pb-[env(safe-area-inset-bottom)] md:hidden',
        compact ? 'flex items-center gap-1 px-2' : 'grid grid-cols-6',
      )}
    >
      {MOBILE_TABS.map((tab) => {
        // Memories is part of Out Here, so the Out Here tab stays selected there.
        const active = isActivePath(pathname, tab.href) || (compact && tab.id === 'out-here' && pathname.startsWith('/memories'));
        const Icon = ICONS[tab.id];
        const badge = tab.id === 'notifications' && (
          <Badge count={notificationCount} floating className="-right-2.5" label={`${notificationCount} new notifications`} />
        );
        if (compact) {
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              data-testid={`mtab-${tab.id}`}
              className={cn(
                'flex h-10 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-3 transition-[flex-grow,background-color] duration-200 ease-out motion-reduce:transition-none',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue',
                active ? 'min-w-fit grow-[2.4] bg-fb-blue-tint text-fb-blue' : 'grow text-fb-text-2 hover:bg-fb-hover',
              )}
            >
              <span className="relative shrink-0">
                <Icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {badge}
              </span>
              {active && <span aria-hidden className="whitespace-nowrap text-[15px] font-semibold">{tab.label}</span>}
            </Link>
          );
        }
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-testid={`mtab-${tab.id}`}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              active ? 'text-fb-blue' : 'text-fb-text-2',
            )}
          >
            {active && <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-fb-blue" />}
            <span className="relative">
              <Icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden />
              {badge}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

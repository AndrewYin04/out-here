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

/** Bottom tab bar below 768 px: 24 px icons, 11 px labels, active blue. */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  const { count: notificationCount } = useNotificationBadge();
  return (
    <nav
      aria-label="Tab bar"
      data-testid="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-6 border-t border-fb-divider-soft bg-fb-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        const Icon = ICONS[tab.id];
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
              {tab.id === 'notifications' && (
                <Badge count={notificationCount} floating className="-right-2.5" label={`${notificationCount} new notifications`} />
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

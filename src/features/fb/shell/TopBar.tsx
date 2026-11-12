'use client';

import { Bell, House, LayoutGrid, MapPin, MessageCircle, Search, Store, Users, UserGroup } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, IconButton, IconLink, MenuLabel, MenuLink, MenuSeparator, Popover, cn } from '@/features/ui';
import { AccountMenu } from './AccountMenu';
import { Wordmark } from './Brand';
import { DestinationIcon, MORE_DESTINATIONS, PRIMARY_DESTINATIONS } from './destinations';
import { CENTER_TABS, ROUTES, isActivePath, type CenterTabId } from './nav';
import { useShellData } from './ShellDataProvider';

const TAB_ICONS: Record<CenterTabId, typeof House> = {
  home: House,
  friends: Users,
  'out-here': MapPin,
  groups: UserGroup,
  marketplace: Store,
};

function SearchField() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `${ROUTES.search}?q=${encodeURIComponent(query)}` : ROUTES.search);
  };
  return (
    <form role="search" onSubmit={submit} className="hidden md:block">
      <label className="flex h-10 w-10 items-center gap-2 rounded-pill bg-fb-input px-3 xl:w-[240px]">
        <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
        <span className="sr-only">Search</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people and plans"
          className="hidden w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 xl:block"
        />
      </label>
    </form>
  );
}

function CenterTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden h-full items-stretch justify-center md:flex" data-testid="center-tabs">
      {CENTER_TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        const Icon = TAB_ICONS[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            title={tab.label}
            data-testid={`tab-${tab.id}`}
            className={cn(
              'group relative flex items-center justify-center px-1 py-1',
              tab.showLabel ? 'min-w-[112px] lg:min-w-[136px]' : 'w-[72px] lg:w-[112px]',
            )}
          >
            <span
              className={cn(
                'flex h-full w-full items-center justify-center gap-2 rounded-card transition-colors',
                active ? 'text-fb-blue' : 'text-fb-text-2 group-hover:bg-fb-hover',
              )}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden fill={active && tab.id !== 'out-here' ? 'currentColor' : 'none'} fillOpacity={0.15} />
              {tab.showLabel && <span className="text-[15px] font-semibold">{tab.label}</span>}
            </span>
            {active && <span aria-hidden className="absolute inset-x-1 bottom-0 h-[3px] rounded-t bg-fb-blue" />}
          </Link>
        );
      })}
    </nav>
  );
}

function MenuGrid() {
  return (
    <Popover
      label="Menu"
      width={360}
      trigger={(props, open) => (
        <IconButton label="Menu" {...props} active={open} data-testid="menu-grid-button">
          <LayoutGrid size={20} aria-hidden />
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Menu</MenuLabel>
          {PRIMARY_DESTINATIONS.map((d) => (
            <MenuLink key={d.id} href={d.href} onNavigate={close} icon={<DestinationIcon d={d} />} description={d.description}>
              {d.label}
            </MenuLink>
          ))}
          <MenuSeparator />
          {MORE_DESTINATIONS.filter((d) => d.id !== 'home').map((d) => (
            <MenuLink key={d.id} href={d.href} onNavigate={close} icon={<DestinationIcon d={d} />}>
              {d.label}
            </MenuLink>
          ))}
        </>
      )}
    </Popover>
  );
}

/** 56 px white top bar: wordmark + search, center tabs, then menu, Messenger, notifications and account. */
export function TopBar() {
  const pathname = usePathname() ?? '/';
  const { notificationCount, messageCount } = useShellData();
  return (
    <header
      role="banner"
      data-testid="top-bar"
      className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-fb-surface px-2 shadow-topbar md:px-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Wordmark />
        <SearchField />
      </div>
      <CenterTabs pathname={pathname} />
      <div className="flex items-center justify-end gap-2">
        <IconLink label="Search" href={ROUTES.search} className="md:hidden">
          <Search size={20} aria-hidden />
        </IconLink>
        <div className="hidden md:block">
          <MenuGrid />
        </div>
        <IconLink
          label="Messenger"
          href={ROUTES.messages}
          active={isActivePath(pathname, ROUTES.messages)}
          badge={<Badge count={messageCount} floating label={`${messageCount} unread chats`} />}
        >
          <MessageCircle size={20} aria-hidden />
        </IconLink>
        {/* below 768 px Notifications lives in the bottom tab bar */}
        <div className="hidden md:block">
          <IconLink
            label="Notifications"
            href={ROUTES.notifications}
            active={isActivePath(pathname, ROUTES.notifications)}
            badge={<Badge count={notificationCount} floating label={`${notificationCount} new notifications`} />}
          >
            <Bell size={20} aria-hidden />
          </IconLink>
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}

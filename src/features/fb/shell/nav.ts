// Routes and navigation config for the shell. Change a destination here and every
// surface (top bar, left nav, mobile tab bar, menus) follows.

export const ROUTES = {
  home: '/',
  friends: '/friends',
  outHere: '/out-here',
  groups: '/groups',
  group: (slug: string) => `/groups/${slug}`,
  marketplace: '/marketplace',
  events: '/events',
  messages: '/messages',
  thread: (id: string) => `/messages?thread=${encodeURIComponent(id)}`,
  chatWith: (handle: string) => `/messages?to=${encodeURIComponent(handle)}`,
  notifications: '/notifications',
  profile: (handle: string) => `/profile/${handle}`,
  search: '/search',
  menu: '/menu',
  saved: '/saved',
  /**
   * Memories (crew album, Wrapped) belongs to the memories area, which has no route yet.
   * Until it does, the Memories link opens the Out Here tab on its memories view.
   */
  memories: '/out-here?view=memories',
} as const;

export type CenterTabId = 'home' | 'friends' | 'out-here' | 'groups' | 'marketplace';
export type CenterTab = { id: CenterTabId; label: string; href: string; showLabel?: boolean };

export const CENTER_TABS: CenterTab[] = [
  { id: 'home', label: 'Home', href: ROUTES.home },
  { id: 'friends', label: 'Friends', href: ROUTES.friends },
  { id: 'out-here', label: 'Out Here', href: ROUTES.outHere, showLabel: true },
  { id: 'groups', label: 'Groups', href: ROUTES.groups },
  { id: 'marketplace', label: 'Marketplace', href: ROUTES.marketplace },
];

export type MobileTabId = 'home' | 'out-here' | 'friends' | 'groups' | 'notifications' | 'menu';
export const MOBILE_TABS: { id: MobileTabId; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: ROUTES.home },
  { id: 'out-here', label: 'Out Here', href: ROUTES.outHere },
  { id: 'friends', label: 'Friends', href: ROUTES.friends },
  { id: 'groups', label: 'Groups', href: ROUTES.groups },
  { id: 'notifications', label: 'Notifications', href: ROUTES.notifications },
  { id: 'menu', label: 'Menu', href: ROUTES.menu },
];

/** True when `pathname` is `href` or a page under it ("/" matches only itself). */
export function isActivePath(pathname: string, href: string): boolean {
  const path = href.split('?')[0];
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * feed: left nav + center column + right rail (Home, Friends, Groups index, Events...).
 * full: the page owns the whole width under the top bar (map, Messenger, profile, group page).
 */
export type ShellLayout = 'feed' | 'full';

export function layoutFor(pathname: string): ShellLayout {
  if (
    isActivePath(pathname, ROUTES.outHere) ||
    isActivePath(pathname, ROUTES.messages) ||
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/groups/')
  ) {
    return 'full';
  }
  return 'feed';
}

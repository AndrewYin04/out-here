// Routes and navigation config for the shell. Change a destination here and every
// surface (top bar, left nav, mobile tab bar, menus) follows.

export const ROUTES = {
  home: '/',
  friends: '/friends',
  outHere: '/out-here',
  groups: '/groups',
  group: (slug: string) => `/groups/${slug}`,
  marketplace: '/marketplace',
  /** Video (Watch): the viewer's videos; Muse picks Marketplace items from what they watch. */
  watch: '/watch',
  events: '/events',
  messages: '/messages',
  thread: (id: string) => `/messages?thread=${encodeURIComponent(id)}`,
  chatWith: (handle: string) => `/messages?to=${encodeURIComponent(handle)}`,
  notifications: '/notifications',
  profile: (handle: string) => `/profile/${handle}`,
  search: '/search',
  menu: '/menu',
  saved: '/saved',
  /** Memories: crew albums and 'Get this group together again' (memories area). */
  memories: '/memories',
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
 * feed: left nav + center column + right rail (Home, Events, Notifications...).
 * full: the page owns the whole width under the top bar (map, Messenger, profile, group page).
 * section: a section sidebar (see SECTIONS) + a wide main column, no right rail (Friends, Groups).
 */
export type ShellLayout = 'feed' | 'full' | 'section';

export function layoutFor(pathname: string): ShellLayout {
  if (sectionFor(pathname)) return 'section';
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

/**
 * Section pages (/friends, /groups) swap the home left nav for their own sidebar and drop the
 * right rail, as Facebook does. Each row is the section page with ?tab=<id> (none for the
 * first row); surface builders read that param to pick what the main column shows.
 */
export type SectionId = 'friends' | 'groups';
export type SectionRow = { id: string; label: string; href: string };
export type Section = { id: SectionId; title: string; base: string; rows: SectionRow[]; search?: { label: string } };

const sectionRows = (base: string, rows: [string, string][]): SectionRow[] =>
  rows.map(([id, label], i) => ({ id, label, href: i === 0 ? base : `${base}?tab=${id}` }));

export const SECTIONS: Record<SectionId, Section> = {
  friends: {
    id: 'friends',
    title: 'Friends',
    base: ROUTES.friends,
    rows: sectionRows(ROUTES.friends, [
      ['home', 'Home'],
      ['requests', 'Friend requests'],
      ['suggestions', 'Suggestions'],
      ['all', 'All friends'],
      ['birthdays', 'Birthdays'],
      ['lists', 'Custom lists'],
    ]),
  },
  groups: {
    id: 'groups',
    title: 'Groups',
    base: ROUTES.groups,
    search: { label: 'Search groups' },
    rows: sectionRows(ROUTES.groups, [
      ['feed', 'Your feed'],
      ['discover', 'Discover'],
      ['yours', 'Your groups'],
    ]),
  },
};

/** The section a pathname belongs to (only the index pages, not /groups/<slug>). */
export function sectionFor(pathname: string): Section | null {
  if (pathname === ROUTES.friends) return SECTIONS.friends;
  if (pathname === ROUTES.groups) return SECTIONS.groups;
  return null;
}

/** The selected row for a ?tab= value; unknown or missing values select the first row. */
export function sectionRow(section: Section, tab: string | null | undefined): SectionRow {
  return section.rows.find((r) => r.id === tab) ?? section.rows[0];
}

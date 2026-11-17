import {
  Bell,
  Bookmark,
  CalendarDays,
  House,
  Images,
  MapPin,
  MessageCircle,
  Search,
  Store,
  Users,
  UserGroup,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from './nav';

export type Destination = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Fill of the round 36 px icon tile in the left nav and menus. */
  color: string;
  description?: string;
};

// Main destinations, in left-nav order. Colors stand in for Facebook's full-color glyphs.
export const PRIMARY_DESTINATIONS: Destination[] = [
  { id: 'friends', label: 'Friends', href: ROUTES.friends, icon: Users, color: '#1B74E4', description: 'Requests and suggestions' },
  { id: 'out-here', label: 'Out Here', href: ROUTES.outHere, icon: MapPin, color: '#0866FF', description: 'Plans near you, right now' },
  { id: 'groups', label: 'Groups', href: ROUTES.groups, icon: UserGroup, color: '#2ABBA7', description: 'Your communities' },
  { id: 'marketplace', label: 'Marketplace', href: ROUTES.marketplace, icon: Store, color: '#1877F2', description: 'Buy and sell nearby' },
  { id: 'events', label: 'Events', href: ROUTES.events, icon: CalendarDays, color: '#F3425F', description: 'Shows, games, meetups' },
  { id: 'memories', label: 'Memories', href: ROUTES.memories, icon: Images, color: '#9360F7', description: 'Crew albums and recaps' },
  { id: 'saved', label: 'Saved', href: ROUTES.saved, icon: Bookmark, color: '#B24FD6', description: 'Things you saved' },
];

// Revealed by "See more".
export const MORE_DESTINATIONS: Destination[] = [
  { id: 'messages', label: 'Messenger', href: ROUTES.messages, icon: MessageCircle, color: '#0866FF' },
  { id: 'notifications', label: 'Notifications', href: ROUTES.notifications, icon: Bell, color: '#E41E3F' },
  { id: 'search', label: 'Search', href: ROUTES.search, icon: Search, color: '#65676B' },
  { id: 'home', label: 'Home', href: ROUTES.home, icon: House, color: '#1B74E4' },
];

export function DestinationIcon({ d, size = 36 }: { d: Destination; size?: number }) {
  const Icon = d.icon;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: d.color }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.25} />
    </span>
  );
}

// Shell barrel (client-safe). Server code that needs the static demo data imports
// '@/features/fb/shell/server' instead, so the seed JSON never reaches the browser bundle.
export { AppShell } from './AppShell';
export { TopBar } from './TopBar';
export { LeftNav } from './LeftNav';
export { RightRail } from './RightRail';
export { MobileTabBar } from './MobileTabBar';
export { AccountMenu } from './AccountMenu';
export { Wordmark, BrandFooter } from './Brand';
export { ShellDataProvider, useShellData, usePersonaHandle, UNRESOLVED_VIEWER_DATA } from './ShellDataProvider';
export type { ShellDataProviderProps } from './ShellDataProvider';
export {
  PERSONA_STORAGE_KEY,
  PERSONA_QUERY_PARAM,
  resolvePersonaHandle,
  defaultSwitchPersona,
} from './persona';
export { ROUTES, CENTER_TABS, MOBILE_TABS, SECTIONS, isActivePath, layoutFor, sectionFor, sectionRow } from './nav';
export { SectionSidebar, SectionChips } from './SectionNav';
export type { ShellLayout, CenterTab, CenterTabId, MobileTabId, Section, SectionId, SectionRow } from './nav';
export { PRIMARY_DESTINATIONS, MORE_DESTINATIONS, DestinationIcon } from './destinations';
export type { Destination } from './destinations';
export {
  PageHeader,
  PostSkeleton,
  FeedSkeleton,
  StoriesSkeleton,
  ComposerSkeleton,
  ListSkeleton,
  CardGridSkeleton,
  ChipRowSkeleton,
  CoverHeaderSkeleton,
  SplitBodySkeleton,
} from './skeletons';
export type {
  ShellPerson,
  ShellContact,
  ShellShortcut,
  ShellGroupChat,
  ShellViewerData,
  ShellStaticData,
  ShellContextValue,
} from './types';

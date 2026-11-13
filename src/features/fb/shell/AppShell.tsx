'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/features/ui';
import { InviteInbox } from '@/features/outhere';
import { RateHangoutListener } from '@/features/memories';
import { LeftNav } from './LeftNav';
import { MobileTabBar } from './MobileTabBar';
import { ROUTES, layoutFor, sectionFor, type ShellLayout } from './nav';
import { RightRail } from './RightRail';
import { SectionChips, SectionSidebar } from './SectionNav';
import { TopBar } from './TopBar';

const RAIL = 'sticky top-14 h-[calc(100vh-56px)] overflow-y-auto overscroll-contain';

/**
 * Facebook-style frame. Desktop "feed" pages: left nav (280-360 px), center column up to
 * 680 px, right rail (280-360 px). The left nav appears at 1024 px, the right rail at 1280 px.
 * "section" pages (Friends, Groups) get a 360 px section sidebar from 1024 px and no right
 * rail; below 1024 px the sidebar rows become a chip row.
 * "full" pages (map, Messenger, profile, group) get the whole width. Below 768 px the
 * rails are gone and the bottom tab bar appears.
 */
export function AppShell({ children, layout }: { children: ReactNode; layout?: ShellLayout }) {
  const pathname = usePathname() ?? '/';
  const mode = layout ?? layoutFor(pathname);
  const section = sectionFor(pathname);
  // The Menu page already renders the left nav in its main column.
  const leftNav = pathname !== ROUTES.menu;
  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-btn bg-fb-surface px-3 py-2 font-semibold text-fb-blue focus:not-sr-only focus:fixed focus:left-2 focus:top-16"
      >
        Skip to content
      </a>
      <TopBar />
      <div className="pb-14 pt-14 md:pb-0">
        {mode === 'section' && section ? (
          <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside aria-label={`${section.title} navigation`} className={`hidden bg-fb-surface shadow-card lg:block ${RAIL}`}>
              <SectionSidebar section={section} />
            </aside>
            <main id="main" data-layout="section" className="mx-auto w-full min-w-0 max-w-[1160px] md:px-4 md:py-4 lg:px-8">
              <SectionChips section={section} />
              {children}
            </main>
          </div>
        ) : mode === 'feed' ? (
          <div className="lg:grid lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(280px,360px)]">
            <aside aria-label="Left navigation" className={leftNav ? `hidden lg:block ${RAIL}` : 'hidden lg:block'}>
              {leftNav && <LeftNav />}
            </aside>
            <main id="main" data-layout="feed" className="mx-auto w-full min-w-0 max-w-[680px] md:px-4 md:py-4">
              {children}
            </main>
            <aside aria-label="Contacts and birthdays" className={`hidden xl:block ${RAIL}`}>
              <RightRail />
            </aside>
          </div>
        ) : (
          <main id="main" data-layout="full" className="min-w-0">
            {children}
          </main>
        )}
      </div>
      {/* In Messenger the invite arrives as a card in the chat, so the toast would show it twice. */}
      {pathname !== ROUTES.messages && <InviteInbox />}
      <RateHangoutListener />
      <MobileTabBar />
    </ToastProvider>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/features/ui';
import { LeftNav } from './LeftNav';
import { MobileTabBar } from './MobileTabBar';
import { ROUTES, layoutFor, type ShellLayout } from './nav';
import { RightRail } from './RightRail';
import { TopBar } from './TopBar';

const RAIL = 'sticky top-14 h-[calc(100vh-56px)] overflow-y-auto overscroll-contain';

/**
 * Facebook-style frame. Desktop "feed" pages: left nav (280-360 px), center column up to
 * 680 px, right rail (280-360 px). The left nav appears at 1024 px, the right rail at 1280 px.
 * "full" pages (map, Messenger, profile, group) get the whole width. Below 768 px the
 * rails are gone and the bottom tab bar appears.
 */
export function AppShell({ children, layout }: { children: ReactNode; layout?: ShellLayout }) {
  const pathname = usePathname() ?? '/';
  const mode = layout ?? layoutFor(pathname);
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
        {mode === 'feed' ? (
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
      <MobileTabBar />
    </ToastProvider>
  );
}

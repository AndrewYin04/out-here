'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Avatar, Divider, Skeleton, cn } from '@/features/ui';
import { BrandFooter } from './Brand';
import { DestinationIcon, MORE_DESTINATIONS, PRIMARY_DESTINATIONS } from './destinations';
import { ROUTES, isActivePath } from './nav';
import { useShellData } from './ShellDataProvider';

function Row({ href, icon, children, active }: { href: string; icon: ReactNode; children: ReactNode; active?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-[52px] items-center gap-3 rounded-card px-2 text-[15px] font-medium text-fb-text hover:bg-fb-hover',
          active && 'bg-fb-blue-tint hover:bg-fb-blue-tint',
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{children}</span>
      </Link>
    </li>
  );
}

/**
 * Left navigation: viewer, main destinations, "See more", "Your shortcuts" (groups) and the
 * brand footer. Also used as the body of the mobile Menu page.
 */
export function LeftNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? '/';
  const { viewer, shortcuts, ready } = useShellData();
  const [more, setMore] = useState(false);
  const [allShortcuts, setAllShortcuts] = useState(false);
  const shownShortcuts = allShortcuts ? shortcuts : shortcuts.slice(0, 5);

  return (
    <div className={cn('flex flex-col gap-2 px-2 py-4', className)} data-testid="left-nav">
      <nav aria-label="Shortcuts">
        <ul>
          {ready ? (
            <Row
              href={ROUTES.profile(viewer.handle)}
              active={pathname === ROUTES.profile(viewer.handle)}
              icon={<Avatar src={viewer.avatarUrl} name={viewer.name} size={36} decorative />}
            >
              {viewer.name}
            </Row>
          ) : (
            // persona not known yet (server HTML, hydration): no name rather than a wrong one
            <li aria-hidden className="flex min-h-[52px] items-center gap-3 px-2" data-testid="viewer-placeholder">
              <Skeleton shape="circle" width={36} height={36} />
              <Skeleton width={120} />
            </li>
          )}
          {PRIMARY_DESTINATIONS.map((d) => (
            <Row key={d.id} href={d.href} active={d.id !== 'memories' && isActivePath(pathname, d.href)} icon={<DestinationIcon d={d} />}>
              {d.label}
            </Row>
          ))}
          {more &&
            MORE_DESTINATIONS.map((d) => (
              <Row key={d.id} href={d.href} active={isActivePath(pathname, d.href)} icon={<DestinationIcon d={d} />}>
                {d.label}
              </Row>
            ))}
          <li>
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-card px-2 text-[15px] font-medium hover:bg-fb-hover"
            >
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-fb-secondary-btn">
                {more ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </span>
              {more ? 'See less' : 'See more'}
            </button>
          </li>
        </ul>
      </nav>

      <Divider className="mx-2 w-auto" />

      <nav aria-label="Your shortcuts">
        <h2 className="px-2 pb-1 pt-1 text-fb-rail font-semibold text-fb-text-2">Your shortcuts</h2>
        {!ready ? (
          <div aria-hidden className="space-y-4 px-2 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton shape="block" width={36} height={36} />
                <Skeleton width={`${60 - i * 8}%`} />
              </div>
            ))}
          </div>
        ) : shortcuts.length === 0 ? (
          <p className="px-2 text-fb-meta text-fb-text-2">Groups you join show up here.</p>
        ) : (
          <ul>
            {shownShortcuts.map((g) => (
              <Row
                key={g.slug}
                href={ROUTES.group(g.slug)}
                active={pathname === ROUTES.group(g.slug)}
                icon={
                  // eslint-disable-next-line @next/next/no-img-element
                  g.imageUrl ? <img src={g.imageUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-card bg-fb-skeleton object-cover" /> : <span className="h-9 w-9 rounded-card bg-fb-skeleton" />
                }
              >
                {g.name}
              </Row>
            ))}
            {shortcuts.length > 5 && (
              <li>
                <button
                  type="button"
                  aria-expanded={allShortcuts}
                  onClick={() => setAllShortcuts((v) => !v)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-card px-2 text-[15px] font-medium hover:bg-fb-hover"
                >
                  <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-fb-secondary-btn">
                    {allShortcuts ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                  {allShortcuts ? 'See less' : 'See more'}
                </button>
              </li>
            )}
          </ul>
        )}
      </nav>

      <BrandFooter className="mt-2" />
    </div>
  );
}

'use client';

import {
  Compass,
  Gift,
  House,
  List,
  ListChecks,
  Newspaper,
  Search,
  UserGroup,
  UserPlus,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChipLink, Divider, Skeleton, cn } from '@/features/ui';
import { ROUTES, sectionRow, type Section } from './nav';
import { useShellData } from './ShellDataProvider';

const ROW_ICONS: Record<string, LucideIcon> = {
  'friends:home': Users,
  'friends:requests': UserPlus,
  'friends:suggestions': UserRoundPlus,
  'friends:all': List,
  'friends:birthdays': Gift,
  'friends:lists': ListChecks,
  'groups:feed': Newspaper,
  'groups:discover': Compass,
  'groups:yours': UserGroup,
};

function useActiveRowId(section: Section): string {
  const params = useSearchParams();
  return sectionRow(section, params?.get('tab')).id;
}

/**
 * Section nav whose selected row follows ?tab=. There is no Suspense boundary, because
 * /friends and /groups await searchParams and so render per request, where useSearchParams
 * resolves on the server. A boundary here made React stream a second, hidden copy of the
 * sidebar next to its fallback. Both pages export dynamic = 'force-dynamic'; without it `next build` fails with
 * "useSearchParams() should be wrapped in a suspense boundary".
 */
function WithActiveRow({ section, render }: { section: Section; render: (activeId: string | null) => ReactNode }) {
  return <>{render(useActiveRowId(section))}</>;
}

function SectionSearch({ section }: { section: Section }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  if (!section.search) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `${ROUTES.search}?q=${encodeURIComponent(query)}&in=${section.id}` : ROUTES.search);
  };
  return (
    <form role="search" aria-label={section.search.label} onSubmit={submit} className="px-2 pb-2">
      <label className="flex h-9 items-center gap-2 rounded-pill bg-fb-input px-3">
        <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
        <span className="sr-only">{section.search.label}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={section.search.label}
          className="w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
        />
      </label>
    </form>
  );
}

/** Groups the viewer belongs to, under the Groups sidebar rows. */
function JoinedGroups() {
  const pathname = usePathname() ?? '/';
  const { shortcuts, ready } = useShellData();
  return (
    <nav aria-label="Groups you've joined">
      <Divider className="mx-2 my-2 w-auto" />
      <h2 className="px-2 pb-1 text-fb-rail font-semibold text-fb-text">Groups you&apos;ve joined</h2>
      {!ready ? (
        <div aria-hidden className="space-y-4 px-2 py-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton shape="block" width={48} height={48} />
              <Skeleton width={`${60 - i * 10}%`} />
            </div>
          ))}
        </div>
      ) : shortcuts.length === 0 ? (
        <p className="px-2 text-fb-meta text-fb-text-2">Groups you join show up here.</p>
      ) : (
        <ul>
          {shortcuts.map((g) => (
            <li key={g.slug}>
              <Link
                href={ROUTES.group(g.slug)}
                aria-current={pathname === ROUTES.group(g.slug) ? 'page' : undefined}
                className="flex min-h-[60px] items-center gap-3 rounded-card px-2 text-[15px] font-medium text-fb-text hover:bg-fb-hover"
              >
                {g.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.imageUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-card bg-fb-skeleton object-cover" />
                ) : (
                  <span aria-hidden className="h-12 w-12 shrink-0 rounded-card bg-fb-skeleton" />
                )}
                <span className="min-w-0 truncate">{g.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Desktop sidebar for a section page: title, optional search, section rows. */
export function SectionSidebar({ section }: { section: Section }) {
  return <WithActiveRow section={section} render={(activeId) => <SidebarView section={section} activeId={activeId} />} />;
}

function SidebarView({ section, activeId }: { section: Section; activeId: string | null }) {
  return (
    <div className="flex flex-col py-3" data-testid="section-sidebar">
      <p className="px-4 pb-2 text-fb-title font-bold text-fb-text" aria-hidden>
        {section.title}
      </p>
      <SectionSearch section={section} />
      <nav aria-label={`${section.title} sections`} className="px-2">
        <ul>
          {section.rows.map((row) => {
            const Icon = ROW_ICONS[`${section.id}:${row.id}`] ?? House;
            const selected = row.id === activeId;
            return (
              <li key={row.id}>
                <Link
                  href={row.href}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 rounded-card px-2 text-[17px] font-semibold text-fb-text hover:bg-fb-hover',
                    selected && 'bg-fb-hover',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-fb-blue text-white' : 'bg-fb-secondary-btn text-fb-text',
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  {row.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {section.id === 'groups' && (
        <div className="px-2">
          <JoinedGroups />
        </div>
      )}
    </div>
  );
}

/** Below 1024 px the sidebar is hidden; the same rows show as a chip row above the content. */
export function SectionChips({ section }: { section: Section }) {
  return <WithActiveRow section={section} render={(activeId) => <ChipsView section={section} activeId={activeId} />} />;
}

function ChipsView({ section, activeId }: { section: Section; activeId: string | null }) {
  const navRef = useRef<HTMLElement>(null);
  // Scroll the chip row (not the page) so the selected chip is in view, centered when possible.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !chip) return;
    const left = chip.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = Math.max(0, left - (nav.clientWidth - chip.offsetWidth) / 2);
  }, [activeId]);
  return (
    <nav
      ref={navRef}
      aria-label={`${section.title} sections`}
      data-testid="section-chips"
      className="flex gap-2 overflow-x-auto bg-fb-surface px-4 py-3 md:bg-transparent md:px-0 lg:hidden"
    >
      {section.rows.map((row) => (
        <ChipLink key={row.id} href={row.href} selected={row.id === activeId}>
          {row.label}
        </ChipLink>
      ))}
    </nav>
  );
}

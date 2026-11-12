'use client';

import { Gift, Search } from 'lucide-react';
import Link from 'next/link';
import { Avatar, Divider, IconLink, Skeleton } from '@/features/ui';
import { ROUTES } from './nav';
import { useShellData } from './ShellDataProvider';

const firstName = (name: string) => name.split(' ')[0];

/** Right rail: birthdays, contacts with online dots, group conversations. */
export function RightRail() {
  const { birthdays, contacts, groupChats, ready } = useShellData();
  return (
    <div className="flex flex-col gap-3 px-2 py-4" data-testid="right-rail">
      {birthdays.length > 0 && (
        <section aria-labelledby="rr-birthdays">
          <h2 id="rr-birthdays" className="px-2 pb-2 text-fb-rail font-semibold text-fb-text-2">
            Birthdays
          </h2>
          <Link
            href={ROUTES.profile(birthdays[0].handle)}
            className="flex items-center gap-3 rounded-card px-2 py-2 text-[15px] hover:bg-fb-hover"
          >
            <Gift size={28} className="shrink-0 text-[#F3425F]" aria-hidden />
            <span>
              <strong className="font-semibold">{firstName(birthdays[0].name)}</strong>
              {birthdays.length > 1
                ? ` and ${birthdays.length - 1} other${birthdays.length > 2 ? 's' : ''} have birthdays today.`
                : "'s birthday is today."}
            </span>
          </Link>
          <Divider className="mx-2 mt-2 w-auto" />
        </section>
      )}

      <section aria-labelledby="rr-contacts">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 id="rr-contacts" className="text-fb-rail font-semibold text-fb-text-2">
            Contacts
          </h2>
          <IconLink label="Search contacts" href={ROUTES.friends} tone="plain" size="md">
            <Search size={16} className="text-fb-text-2" aria-hidden />
          </IconLink>
        </div>
        {!ready ? (
          <div aria-hidden className="space-y-4 px-2 py-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton shape="circle" width={36} height={36} />
                <Skeleton width={`${55 - (i % 3) * 10}%`} />
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <p className="px-2 text-fb-meta text-fb-text-2">Add friends to see them here.</p>
        ) : (
          <ul data-testid="contacts-list">
            {contacts.map((c) => (
              <li key={c.handle}>
                <Link
                  href={ROUTES.chatWith(c.handle)}
                  className="flex h-[52px] items-center gap-3 rounded-card px-2 text-[15px] font-medium hover:bg-fb-hover"
                >
                  <Avatar src={c.avatarUrl} name={c.name} size={36} online={c.online} decorative />
                  <span className="truncate">{c.name}</span>
                  {c.online && <span className="sr-only">(active now)</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groupChats.length > 0 && (
        <section aria-labelledby="rr-groups">
          <Divider className="mx-2 mb-3 w-auto" />
          <h2 id="rr-groups" className="px-2 pb-1 text-fb-rail font-semibold text-fb-text-2">
            Group conversations
          </h2>
          <ul>
            {groupChats.map((g) => (
              <li key={g.id}>
                <Link
                  href={ROUTES.thread(g.id)}
                  className="flex h-[52px] items-center gap-3 rounded-card px-2 text-[15px] font-medium hover:bg-fb-hover"
                >
                  <span className="relative h-9 w-9 shrink-0" aria-hidden>
                    {g.members[0] && (
                      <Avatar src={g.members[0].avatarUrl} name={g.members[0].name} size={24} decorative className="absolute right-0 top-0" />
                    )}
                    {g.members[1] && (
                      <Avatar src={g.members[1].avatarUrl} name={g.members[1].name} size={24} decorative className="absolute bottom-0 left-0 ring-2 ring-fb-bg" />
                    )}
                  </span>
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

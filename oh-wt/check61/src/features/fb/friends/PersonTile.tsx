'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { PersonCard } from '@/shared/api';
import { ROUTES } from '@/features/fb/shell';
import { Avatar, Button, cn } from '@/features/ui';

export function mutualLabel(n: number): string {
  return n === 1 ? '1 mutual friend' : `${n} mutual friends`;
}

/** Square photo with an initials fallback, used on person cards. */
function SquarePhoto({ person }: { person: PersonCard }) {
  const [failed, setFailed] = useState(false);
  if (!person.avatarUrl || failed) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-fb-skeleton">
        <Avatar name={person.name} size={80} decorative />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatarUrl} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
  );
}

export type TileAction = { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'tint'; disabled?: boolean };

/**
 * Facebook friends card: 4 per row on desktop (square photo, name, mutual line, two stacked
 * full-width buttons); on phones a list row with an 80 px photo and side-by-side buttons.
 * `note` replaces the buttons after an action ("Request removed").
 */
export function PersonTile({
  person,
  primary,
  secondary,
  note,
  mutualFriends,
}: {
  person: PersonCard;
  primary?: TileAction;
  secondary?: TileAction;
  note?: ReactNode;
  mutualFriends?: { name: string; src?: string | null }[];
}) {
  const href = ROUTES.profile(person.handle);
  const buttons = note ? (
    <p className="flex h-9 items-center text-fb-meta text-fb-text-2 md:justify-center">{note}</p>
  ) : (
    <div className="flex gap-2 md:flex-col md:gap-1.5">
      {primary && (
        <Button block variant={primary.variant ?? 'primary'} onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </Button>
      )}
      {secondary && (
        <Button block variant={secondary.variant ?? 'secondary'} onClick={secondary.onClick} disabled={secondary.disabled}>
          {secondary.label}
        </Button>
      )}
    </div>
  );
  return (
    <li
      data-testid="person-tile"
      data-handle={person.handle}
      className="flex items-center gap-3 px-4 py-2 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:rounded-card md:border md:border-fb-divider-soft md:bg-fb-surface md:p-0"
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="h-20 w-20 shrink-0 overflow-hidden rounded-full md:aspect-square md:h-auto md:w-full md:rounded-none"
      >
        <SquarePhoto person={person} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:p-3">
        <Link href={href} className="truncate text-[17px] font-semibold leading-[22px] text-fb-text hover:underline">
          {person.name}
        </Link>
        <p className={cn('flex min-h-4 items-center gap-1.5 text-fb-meta text-fb-text-2')}>
          {person.mutualFriendCount > 0 && (
            <>
              {mutualFriends && mutualFriends.length > 0 && (
                <span className="flex -space-x-1">
                  {mutualFriends.slice(0, 2).map((m) => (
                    <Avatar key={m.name} name={m.name} src={m.src} size={20} decorative className="ring-1 ring-white" />
                  ))}
                </span>
              )}
              {mutualLabel(person.mutualFriendCount)}
            </>
          )}
        </p>
        {buttons}
      </div>
    </li>
  );
}

export function TileGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 bg-fb-surface py-1 md:grid-cols-3 md:gap-2 md:bg-transparent md:py-0 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </ul>
  );
}

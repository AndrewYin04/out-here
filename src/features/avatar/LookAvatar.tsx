'use client';

// Drop-in replacements for the photo Avatar that show a person's avatar look instead. While the
// look renders (first paint, a few ms), the profile photo shows, so nothing pops to blank.
import { Avatar, cn, type AvatarSize } from '@/features/ui';
import type { Framing } from './compose';
import { useAvatarImage, useLook, useLookImage } from './useAvatar';
import type { AvatarLook } from './looks';

export type LookPerson = { id: string; name: string; avatarUrl?: string | null };

export function LookAvatar({ person, size = 40, decorative = false, online = false, ring = false, className }: {
  person: LookPerson; size?: AvatarSize; decorative?: boolean; online?: boolean; ring?: boolean; className?: string;
}) {
  const url = useAvatarImage(person.id, 'portrait');
  return (
    <span className={cn('inline-flex rounded-full bg-[#E7EEF8]', className)} data-testid="look-avatar" data-look-ready={url ? 'true' : 'false'}>
      <Avatar src={url ?? person.avatarUrl ?? null} name={person.name} size={size} decorative={decorative} online={online} ring={ring} />
    </span>
  );
}

/** Overlapping row of avatar looks (crew members). */
export function LookAvatarStack({ people, size = 32, max = 5 }: { people: LookPerson[]; size?: AvatarSize; max?: number }) {
  return (
    <span className="flex -space-x-2">
      {people.slice(0, max).map((p) => (
        <LookAvatar key={p.id} person={p} size={size} className="ring-2 ring-white" />
      ))}
      {people.length > max && (
        <span className="flex items-center justify-center rounded-full bg-fb-secondary-btn text-[12px] font-semibold text-fb-text ring-2 ring-white" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}

/** Full-body picture of a look (profile card, customizer preview). */
export function LookFigure({ look, personId, label, className, framing = 'full' }: {
  look?: AvatarLook; personId?: string; label: string; className?: string; framing?: Framing;
}) {
  const fallback = useLook(personId ?? '');
  const url = useLookImage(look ?? fallback, framing);
  return (
    <span className={cn('relative block', framing === 'full' ? 'aspect-[1/2]' : 'aspect-square', className)} data-testid="look-figure">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={label} className="h-full w-full object-contain" />
        : <span className="absolute inset-0 animate-shimmer rounded-card bg-fb-skeleton" role="img" aria-label={label} />}
    </span>
  );
}

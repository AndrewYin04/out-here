'use client';

import { useState } from 'react';
import { cn } from './cn';

export type AvatarSize = 20 | 24 | 28 | 32 | 36 | 40 | 48 | 56 | 60 | 80 | 120 | 168;

export type AvatarProps = {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  /** Blue story ring around the photo. */
  ring?: boolean;
  /** True when the name is already shown next to the avatar, so screen readers skip it. */
  decorative?: boolean;
  className?: string;
};

const PALETTE = ['#0866FF', '#31A24C', '#F7B125', '#E9710F', '#9360F7', '#F33E58', '#2ABBA7', '#45BD62'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Round avatar with an initials fallback when the image is missing or fails to load. */
export function Avatar({ src, name, size = 40, online = false, ring = false, decorative = false, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const dot = Math.max(8, Math.round(size * 0.28));
  const outer = size + (ring ? 6 : 0);
  return (
    <span
      className={cn('relative inline-flex shrink-0 rounded-full', ring && 'p-[3px] ring-[3px] ring-fb-blue', className)}
      style={{ width: outer, height: outer }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : online ? `${name}, active now` : name}
      aria-hidden={decorative || undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full bg-fb-skeleton object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ background: colorFor(name), fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          data-testid="online-dot"
          className="absolute bottom-0 right-0 rounded-full bg-fb-green ring-2 ring-white"
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

export type AvatarStackProps = { people: { name: string; src?: string | null }[]; size?: AvatarSize; max?: number };

/** Overlapping row of avatars, e.g. "mutual friends" or group members. */
export function AvatarStack({ people, size = 32, max = 8 }: AvatarStackProps) {
  return (
    <span className="flex -space-x-2">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.name} name={p.name} src={p.src} size={size} className="ring-2 ring-white" />
      ))}
    </span>
  );
}

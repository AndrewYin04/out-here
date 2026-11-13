'use client';

import { useState } from 'react';
import type { Memory } from '@/shared';

/**
 * The URL to render a memory's photo. An uploaded photo is served by /api/memories/<id>/photo,
 * which checks crew membership from ?as=, so the handle is appended there. A seeded photo is a
 * static /seed/... file and is used as stored.
 */
export function memoryImgSrc(memory: Pick<Memory, 'id' | 'photoUrl'>, handle: string): string {
  return memory.photoUrl === `/api/memories/${memory.id}/photo`
    ? `${memory.photoUrl}?as=${encodeURIComponent(handle)}`
    : memory.photoUrl;
}

/** A small photo tile that removes itself when the image fails to load, so no alt text shows. */
export function MemoryThumb({ memory, handle, className, alt = 'Hangout photo' }: {
  memory: Pick<Memory, 'id' | 'photoUrl'>; handle: string; className: string; alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <li className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={memoryImgSrc(memory, handle)} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
    </li>
  );
}

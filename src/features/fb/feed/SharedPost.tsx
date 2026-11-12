'use client';

import Link from 'next/link';
import type { PostView } from '@/shared/api';
import { Avatar, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell';
import { AudienceIcon } from './AudienceIcon';
import { shortTime } from './format';

/** The original post inside a share, or in the Share dialog. */
export function SharedPostPreview({ post, compact = false }: { post: PostView; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-btn border border-fb-divider" data-testid="shared-post">
      {post.media[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media[0]} alt="" className={cn('w-full bg-fb-skeleton object-cover', compact ? 'max-h-[160px]' : 'max-h-[420px]')} />
      )}
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar name={post.author.name} src={post.author.avatarUrl} size={compact ? 32 : 40} decorative />
        <div className="min-w-0">
          <Link href={ROUTES.profile(post.author.handle)} className="text-[15px] font-semibold leading-5 hover:underline">
            {post.author.name}
          </Link>
          <p className="flex items-center gap-1 text-fb-meta text-fb-text-2">
            {shortTime(post.createdAt)} · <AudienceIcon audience={post.audience} />
          </p>
        </div>
      </div>
      {post.text && <p className={cn('whitespace-pre-line px-3 pb-3 pt-2 text-[15px] leading-5', compact && 'line-clamp-3')}>{post.text}</p>}
    </div>
  );
}

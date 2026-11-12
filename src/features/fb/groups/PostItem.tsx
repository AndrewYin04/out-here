'use client';

import { Globe, MessageCircle, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { apiPost } from '@/features/data';
import { Avatar, Card, cn } from '@/features/ui';
import { timeAgo } from '@/features/fb/notifications';
import { REACTION_TYPES, type ReactionCounts, type ReactionType } from '@/shared';
import type { PostView, ReactResponse } from '@/shared/api';

const REACTION_EMOJI: Record<ReactionType, string> = {
  like: '👍', love: '❤️', care: '🤗', haha: '😆', wow: '😮', sad: '😢', angry: '😡',
};

const total = (c: ReactionCounts) => REACTION_TYPES.reduce((s, t) => s + (c[t] ?? 0), 0);

/**
 * A post card in the measured Facebook layout: header, text, media, then one action row of
 * icon + count buttons with the reaction stack at the right. Like toggles live; Comment opens
 * the post page.
 */
export function PostItem({ post, showGroup = false }: { post: PostView; showGroup?: boolean }) {
  const [counts, setCounts] = useState(post.reactionCounts);
  const [mine, setMine] = useState<ReactionType | null>(post.viewerReaction);
  const [busy, setBusy] = useState(false);
  const likes = total(counts);
  const top = REACTION_TYPES.filter((t) => (counts[t] ?? 0) > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 3);

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiPost<ReactResponse>(`/api/posts/${post.id}/reactions`, { type: mine ? null : 'like' });
      setCounts(r.reactionCounts);
      setMine(r.viewerReaction);
    } catch { /* keep the old state */ } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="article" flushOnMobile className="pt-3" data-testid="post">
      <header className="flex items-center gap-2 px-3 md:px-4">
        <Link href={`/profile/${post.author.handle}`} className="shrink-0">
          <Avatar src={post.author.avatarUrl} name={post.author.name} size={40} decorative />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-fb-text">
            <Link href={`/profile/${post.author.handle}`} className="hover:underline">{post.author.name}</Link>
            {showGroup && post.group && (
              <>
                <span className="font-normal text-fb-text-2"> ▸ </span>
                <Link href={`/groups/${post.group.slug}`} className="hover:underline">{post.group.name}</Link>
              </>
            )}
          </p>
          <p className="flex items-center gap-1 text-fb-meta text-fb-text-2">
            <Link href={`/posts/${post.id}`} className="hover:underline">{timeAgo(post.createdAt)}</Link>
            <span aria-hidden>·</span>
            <Globe size={12} aria-label="Shared with Public" />
          </p>
        </div>
      </header>
      {post.text && <p className="whitespace-pre-line px-3 pb-3 pt-2 text-fb-body text-fb-text md:px-4">{post.text}</p>}
      {post.media.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media[0]} alt="" className="max-h-[600px] w-full object-cover" />
      )}
      <div className="flex h-10 items-center justify-between px-2 md:px-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={mine !== null}
            aria-label={mine ? 'Remove Like' : 'Like'}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-btn px-2 text-[15px] hover:bg-fb-hover',
              mine ? 'font-semibold text-fb-blue' : 'text-fb-text-2',
            )}
          >
            <ThumbsUp size={20} aria-hidden fill={mine ? 'currentColor' : 'none'} />
            {likes > 0 && <span data-testid="like-count">{likes}</span>}
          </button>
          <Link
            href={`/posts/${post.id}`}
            aria-label={`Comment, ${post.commentCount} comments`}
            className="flex h-8 items-center gap-1.5 rounded-btn px-2 text-[15px] text-fb-text-2 hover:bg-fb-hover"
          >
            <MessageCircle size={20} aria-hidden />
            {post.commentCount > 0 && <span>{post.commentCount}</span>}
          </Link>
        </div>
        {top.length > 0 && (
          <span className="flex -space-x-1" aria-label={`${likes} reactions`}>
            {top.map((t) => (
              <span key={t} aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[13px] leading-none ring-2 ring-white">
                {REACTION_EMOJI[t]}
              </span>
            ))}
          </span>
        )}
      </div>
    </Card>
  );
}

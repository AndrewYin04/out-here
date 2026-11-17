'use client';

import { Globe, Lock, MessageCircle, ThumbsUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { apiPost } from '@/features/data';
import { ROUTES } from '@/features/fb/shell';
import { Avatar, Card, cn, useToast } from '@/features/ui';
import type { PostView, ReactResponse } from '@/shared/api';
import { REACTION_TYPES, type ReactionType } from '@/shared/types';
import { audienceLabel, compactCount, fullTime, postTime, REACTION_EMOJI } from './format';

function AudienceIcon({ audience }: { audience: PostView['audience'] }) {
  const Icon = audience === 'public' ? Globe : audience === 'only_me' ? Lock : Users;
  return (
    <span title={audienceLabel(audience)} className="inline-flex">
      <Icon size={12} aria-label={audienceLabel(audience)} />
    </span>
  );
}

function MediaGrid({ media }: { media: string[] }) {
  if (media.length === 0) return null;
  const shown = media.slice(0, 4);
  return (
    <div className={cn('grid gap-0.5', shown.length > 1 && 'grid-cols-2')}>
      {shown.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src + i}
          src={src}
          alt=""
          loading="lazy"
          className={cn('w-full bg-fb-skeleton object-cover', shown.length === 1 ? 'max-h-[560px]' : 'aspect-square')}
        />
      ))}
    </div>
  );
}

/** A profile timeline post: header, text, media, then one row of reaction/comment counts. */
export function PostCard({ post }: { post: PostView }) {
  const toast = useToast();
  const [counts, setCounts] = useState(post.reactionCounts);
  const [mine, setMine] = useState<ReactionType | null>(post.viewerReaction);
  const [busy, setBusy] = useState(false);
  const total = REACTION_TYPES.reduce((n, t) => n + (counts[t] ?? 0), 0);
  const top = [...REACTION_TYPES].filter((t) => (counts[t] ?? 0) > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 3);

  const toggleLike = async () => {
    setBusy(true);
    try {
      const r = await apiPost<ReactResponse>(`/api/posts/${post.id}/reactions`, { type: mine ? null : 'like' });
      setCounts(r.reactionCounts);
      setMine(r.viewerReaction);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not react');
    } finally {
      setBusy(false);
    }
  };

  const ReactIcon = mine ? null : ThumbsUp;
  return (
    <Card as="article" flushOnMobile className="pt-3" data-testid="profile-post" aria-label={`Post by ${post.author.name}`}>
      <header className="flex items-center gap-2 px-4">
        <Link href={ROUTES.profile(post.author.handle)} aria-hidden tabIndex={-1}>
          <Avatar src={post.author.avatarUrl} name={post.author.name} size={40} decorative />
        </Link>
        <div className="min-w-0">
          <Link href={ROUTES.profile(post.author.handle)} className="block truncate text-[15px] font-semibold text-fb-text hover:underline">
            {post.author.name}
          </Link>
          <p className="flex items-center gap-1 text-fb-meta text-fb-text-2">
            <time dateTime={post.createdAt} title={fullTime(post.createdAt)}>{postTime(post.createdAt)}</time>
            <span aria-hidden>·</span>
            <AudienceIcon audience={post.audience} />
          </p>
        </div>
      </header>
      {post.text && <p className="whitespace-pre-line px-4 pb-3 pt-2 text-[15px] leading-5 text-fb-text">{post.text}</p>}
      {!post.text && <div className="h-3" />}
      <MediaGrid media={post.media} />
      <div className="mx-4 flex h-11 items-center gap-1 border-b border-fb-divider-soft text-fb-text-2 md:mx-3">
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy}
          aria-pressed={Boolean(mine)}
          aria-label={mine ? 'Remove reaction' : 'Like'}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-btn px-2 text-[15px] font-semibold hover:bg-fb-hover',
            mine ? 'text-fb-blue' : 'text-fb-text-2',
          )}
        >
          {ReactIcon ? <ReactIcon size={20} aria-hidden /> : <span aria-hidden className="text-[18px] leading-none">{REACTION_EMOJI[mine!]}</span>}
          {total > 0 && <span data-testid="reaction-total">{compactCount(total)}</span>}
        </button>
        <span className="inline-flex h-9 items-center gap-1.5 px-2 text-[15px] font-semibold" aria-label={`${post.commentCount} comments`}>
          <MessageCircle size={20} aria-hidden />
          {post.commentCount > 0 && compactCount(post.commentCount)}
        </span>
        {top.length > 0 && (
          <span className="ml-auto flex -space-x-1" aria-label={`Reactions: ${top.join(', ')}`}>
            {top.map((t) => (
              <span key={t} aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-fb-surface text-[13px] ring-2 ring-white">
                {REACTION_EMOJI[t]}
              </span>
            ))}
          </span>
        )}
      </div>
      {post.previewComments.length > 0 && (
        <ul className="space-y-2 px-4 py-2" aria-label="Comments">
          {post.previewComments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <Avatar src={c.author.avatarUrl} name={c.author.name} size={32} decorative />
              <div className="min-w-0 rounded-[18px] bg-fb-input px-3 py-2">
                <Link href={ROUTES.profile(c.author.handle)} className="block text-fb-meta font-semibold text-fb-text hover:underline">
                  {c.author.name}
                </Link>
                <p className="text-[15px] leading-5 text-fb-text">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {post.previewComments.length === 0 && <div className="h-1" />}
    </Card>
  );
}

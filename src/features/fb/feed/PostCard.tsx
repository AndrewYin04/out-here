'use client';

import Link from 'next/link';
import { Forward, MessageCircle, Share2, SquarePen, ThumbsUp, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ReactionCounts, ReactionType } from '@/shared';
import type { PostView, ReactResponse } from '@/shared/api';
import { apiPost, type PostWithShared } from '@/features/data';
import { Avatar, Card, MenuItem, Popover, cn, useToast } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell';
import { AudienceIcon } from './AudienceIcon';
import { CommentsSection } from './Comments';
import { CreatePostModal } from './Composer';
import { REACTIONS, applyReaction, compactCount, reactionMeta, shortTime, topReactions, totalReactions } from './format';
import { SharedPostPreview } from './SharedPost';

const LONG_TEXT = 320;

export function PostCard({ post, onHide, onShared }: {
  post: PostWithShared;
  onHide?: (id: string) => void;
  onShared?: (p: PostView) => void;
}) {
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<{ counts: ReactionCounts; mine: ReactionType | null } | null>(null);
  const pending = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const focusComment = useRef<(() => void) | null>(null);

  // A refetch from the server replaces local guesses once no request is in flight.
  useEffect(() => {
    if (pending.current === 0) setOptimistic(null);
  }, [post.reactionCounts, post.viewerReaction]);
  useEffect(() => { setCommentDelta(0); }, [post.commentCount]);

  const counts = optimistic?.counts ?? post.reactionCounts;
  const mine = optimistic ? optimistic.mine : post.viewerReaction;
  const total = totalReactions(counts);
  const top = topReactions(counts);
  const commentCount = post.commentCount + commentDelta;

  const react = useCallback(async (next: ReactionType | null) => {
    const prevMine = optimistic ? optimistic.mine : post.viewerReaction;
    const prevCounts = optimistic?.counts ?? post.reactionCounts;
    if (next === prevMine) next = null;
    setOptimistic({ counts: applyReaction(prevCounts, prevMine, next), mine: next });
    pending.current++;
    try {
      const r = await apiPost<ReactResponse>(`/api/posts/${post.id}/reactions`, { type: next });
      setOptimistic({ counts: r.reactionCounts, mine: r.viewerReaction });
    } catch {
      setOptimistic({ counts: prevCounts, mine: prevMine });
      toast.show("Couldn't save your reaction. Try again.");
    } finally {
      pending.current--;
    }
  }, [optimistic, post.id, post.reactionCounts, post.viewerReaction, toast]);

  const shareTarget: PostView = post.sharedPost ?? post;
  const shareNow = async () => {
    try {
      const r = await apiPost<{ post: PostWithShared }>('/api/posts', { text: '', audience: 'friends', sharedPostId: shareTarget.id });
      toast.show('Shared to your feed.');
      onShared?.(r.post);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't share this post.");
    }
  };

  const long = post.text.length > LONG_TEXT;
  const text = long && !showAll ? `${post.text.slice(0, LONG_TEXT).trimEnd()}…` : post.text;
  const bigText = !post.media.length && !post.sharedPost && post.text.length < 85;

  return (
    <Card as="article" flushOnMobile aria-label={`Post by ${post.author.name}`} data-testid="post-card" data-post-id={post.id}>
      <header className="flex items-start gap-2 px-3 pt-3 md:px-4">
        <Link href={ROUTES.profile(post.author.handle)} className="shrink-0" tabIndex={-1}>
          <Avatar name={post.author.name} src={post.author.avatarUrl} size={40} decorative />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-5">
            <Link href={ROUTES.profile(post.author.handle)} className="font-semibold hover:underline">{post.author.name}</Link>
            {post.group && (
              <>
                <span className="text-fb-text-2"> ▸ </span>
                <Link href={ROUTES.group(post.group.slug)} className="font-semibold hover:underline">{post.group.name}</Link>
              </>
            )}
            {post.sharedPost && <span className="text-fb-text-2"> shared a post.</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-fb-meta text-fb-text-2">
            <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}>
              {shortTime(post.createdAt)}
            </time>
            <span aria-hidden>·</span>
            <AudienceIcon audience={post.audience} />
          </p>
        </div>
        {onHide && (
          <button
            type="button"
            aria-label="Hide post"
            onClick={() => onHide(post.id)}
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover"
          >
            <X size={20} aria-hidden />
          </button>
        )}
      </header>

      {post.text && (
        <div className={cn('whitespace-pre-line break-words px-3 pt-3 md:px-4', bigText ? 'text-[20px] leading-6' : 'text-fb-body')}>
          {text}
          {long && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="ml-1 font-semibold hover:underline">See more</button>
          )}
        </div>
      )}

      {post.media.length > 0 && <PostMedia urls={post.media} />}
      {post.sharedPost && (
        <div className="px-3 pt-3 md:px-4"><SharedPostPreview post={post.sharedPost} /></div>
      )}

      <div className="flex h-11 items-center px-2 md:px-3" data-testid="post-actions">
        <LikeButton mine={mine} total={total} onReact={react} />
        <ActionButton
          label={`Comment${commentCount ? `, ${commentCount} comment${commentCount === 1 ? '' : 's'}` : ''}`}
          onClick={() => { setExpanded(true); setTimeout(() => focusComment.current?.(), 0); }}
          testId="comment-button"
        >
          <MessageCircle size={20} aria-hidden />
          {commentCount > 0 && <span>{compactCount(commentCount)}</span>}
        </ActionButton>
        <Popover
          label="Share"
          kind="menu"
          align="left"
          width={300}
          trigger={(props) => (
            <ActionButton {...props} label={`Share${post.shareCount ? `, ${post.shareCount} share${post.shareCount === 1 ? '' : 's'}` : ''}`} testId="share-button">
              <Share2 size={20} aria-hidden />
              {post.shareCount > 0 && <span>{compactCount(post.shareCount)}</span>}
            </ActionButton>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<Forward size={20} />} onSelect={() => { close(); void shareNow(); }}>Share now (Friends)</MenuItem>
              <MenuItem icon={<SquarePen size={20} />} onSelect={() => { close(); setShareOpen(true); }}>Share to Feed</MenuItem>
            </>
          )}
        </Popover>
        {total > 0 && (
          <span className="ml-auto flex items-center" title={REACTIONS.filter((r) => counts[r.type]).map((r) => `${r.label} ${counts[r.type]}`).join(', ')} data-testid="reaction-summary">
            <span className="sr-only">{total} {total === 1 ? 'reaction' : 'reactions'}</span>
            {top.map((t, i) => (
              <span
                key={t}
                aria-hidden
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[12px] leading-none ring-2 ring-white"
                style={{ marginLeft: i ? -4 : 0, zIndex: 3 - i }}
              >
                {reactionMeta(t).emoji}
              </span>
            ))}
          </span>
        )}
      </div>

      {(expanded || post.previewComments.length > 0) && (
        <CommentsSection
          postId={post.id}
          preview={post.previewComments}
          total={commentCount}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
          onCountChange={(d) => setCommentDelta((x) => x + d)}
          registerFocus={(fn) => { focusComment.current = fn; }}
        />
      )}
      {!expanded && post.previewComments.length === 0 && <div className="h-1" />}

      {shareOpen && (
        <CreatePostModal
          sharedPost={shareTarget}
          onClose={() => setShareOpen(false)}
          onPosted={(p) => { setShareOpen(false); onShared?.(p); }}
        />
      )}
    </Card>
  );
}

function ActionButton({ label, onClick, children, testId, className, ...rest }: {
  label: string; onClick: () => void; children: React.ReactNode; testId?: string; className?: string;
  'aria-expanded'?: boolean; 'aria-haspopup'?: 'menu' | 'dialog'; 'aria-controls'?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-testid={testId}
      className={cn('flex h-8 items-center gap-1.5 rounded-btn px-2 text-[15px] text-fb-text-2 hover:bg-fb-hover active:bg-fb-pressed', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Like button with a hover (mouse) or long-press (touch) reaction picker. */
function LikeButton({ mine, total, onReact }: { mine: ReactionType | null; total: number; onReact: (t: ReactionType | null) => void }) {
  const [picker, setPicker] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const touchOpen = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!picker) touchOpen.current = false; }, [picker]);

  const clear = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPicker(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [picker]);

  const enter = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clear();
    openTimer.current = setTimeout(() => { openTimer.current = null; setPicker(true); }, 450);
  };
  const move = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse' || picker || openTimer.current) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    openTimer.current = setTimeout(() => { openTimer.current = null; setPicker(true); }, 450);
  };
  const leave = (e: ReactPointerEvent) => {
    // A picker opened by long-press stays until a choice or a tap outside.
    if (e.pointerType !== 'mouse' || touchOpen.current) return;
    clear();
    closeTimer.current = setTimeout(() => setPicker(false), 350);
  };
  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' || picker) return;
    longPressed.current = false;
    clear();
    openTimer.current = setTimeout(() => {
      openTimer.current = null; longPressed.current = true; touchOpen.current = true; setPicker(true);
    }, 450);
  };
  const up = () => { if (openTimer.current && !picker) { clearTimeout(openTimer.current); openTimer.current = null; } };

  const meta = mine ? reactionMeta(mine) : null;
  return (
    <div ref={root} className="relative" onPointerEnter={enter} onPointerMove={move} onPointerLeave={leave}>
      {picker && (
        <div
          role="toolbar"
          aria-label="Reactions"
          data-testid="reaction-picker"
          className="absolute bottom-[calc(100%+4px)] left-0 z-30 flex items-center gap-1 rounded-full bg-fb-surface px-1.5 py-1 shadow-popover"
        >
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              aria-label={r.label}
              aria-pressed={mine === r.type}
              title={r.label}
              onClick={() => { clear(); setPicker(false); onReact(r.type); }}
              className={cn('flex h-10 w-10 items-center justify-center rounded-full text-[28px] leading-none transition-transform hover:-translate-y-1 hover:scale-125', mine === r.type && 'bg-fb-blue-tint')}
            >
              <span aria-hidden>{r.emoji}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid="like-button"
        aria-label={meta ? `Remove ${meta.label}` : 'Like'}
        aria-pressed={!!mine}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => { if (longPressed.current || picker) e.preventDefault(); }}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return; }
          clear();
          setPicker(false);
          onReact(mine ? null : 'like');
        }}
        className="flex h-8 select-none items-center gap-1.5 rounded-btn px-2 text-[15px] text-fb-text-2 hover:bg-fb-hover active:bg-fb-pressed [-webkit-touch-callout:none]"
        style={meta ? { color: meta.color } : undefined}
      >
        {meta && mine !== 'like' ? (
          <span className="text-[18px] leading-none" aria-hidden>{meta.emoji}</span>
        ) : (
          <ThumbsUp size={20} aria-hidden fill={mine === 'like' ? 'currentColor' : 'none'} />
        )}
        {total > 0 && <span className={cn(meta && 'font-semibold')} data-testid="like-count">{compactCount(total)}</span>}
      </button>
    </div>
  );
}

function PostMedia({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    return (
      <div className="mt-3 bg-fb-skeleton">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" className="mx-auto max-h-[600px] w-full object-cover" data-testid="post-media" />
      </div>
    );
  }
  const shown = urls.slice(0, 4);
  return (
    <div className="mt-3 grid grid-cols-2 gap-0.5">
      {shown.map((u, i) => (
        <div key={u + i} className="relative aspect-square bg-fb-skeleton">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" data-testid="post-media" />
          {i === 3 && urls.length > 4 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[32px] font-semibold text-white">+{urls.length - 4}</span>
          )}
        </div>
      ))}
    </div>
  );
}


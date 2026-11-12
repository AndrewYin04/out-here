'use client';

// The public neighborhood board in Memories: moments people chose to share from their hangouts,
// each tagged with the hangout (venue and day, never a location). The server sends strangers'
// names as first names with no handle, so this card never links to a stranger's profile.
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send, ThumbsUp, Users } from 'lucide-react';
import type { BoardPlace, CommentView, CommunityBoardResponse, PostView, ReactResponse } from '@/shared';
import { apiFetch, apiPost } from '@/features/data';
import { Avatar, Button, Card, cn, EmptyState, Skeleton } from '@/features/ui';
import { BoardComposer, type HangoutOption } from './BoardComposer';
import type { CrewRow } from './data';
import { formatJourneyDay } from './journey';

export function CommunityBoard({ crews }: { crews: CrewRow[] }) {
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [places, setPlaces] = useState<Record<string, BoardPlace>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // You can share from hangouts you went to (each crew's own hangout).
  const hangouts: HangoutOption[] = crews.map((c) => ({
    questId: c.originQuestId,
    label: [c.place?.emoji, c.place?.venueName ?? c.meta?.originTitle ?? c.name, formatJourneyDay(c.place?.startsAt ?? c.lastHangoutAt)]
      .filter(Boolean).join(' '),
  }));
  const ownPlaces: Record<string, BoardPlace> = Object.fromEntries(crews.flatMap((c) => c.place ? [[c.originQuestId, {
    questId: c.originQuestId, title: c.meta?.originTitle ?? c.name, emoji: c.place.emoji ?? '📍',
    venueName: c.place.venueName ?? c.name, startsAt: c.place.startsAt ?? c.lastHangoutAt,
  }]] : []));

  const load = useCallback(async (after: string | null) => {
    const q = after ? `?cursor=${encodeURIComponent(after)}` : '';
    const page = await apiFetch<CommunityBoardResponse>(`/api/community/posts${q}`);
    setPosts((prev) => [...(after ? prev ?? [] : []), ...page.posts]);
    setPlaces((prev) => ({ ...prev, ...page.places }));
    setCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    load(null).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the board'));
  }, [load]);

  return (
    <div className="flex flex-col gap-3" data-testid="community-board">
      <div className="px-4 md:px-0">
        <h2 className="text-[17px] font-semibold text-fb-text">Around Menlo Park</h2>
        <p className="text-[13px] text-fb-text-2">Moments people shared from their hangouts. Ideas for your next one.</p>
      </div>
      <BoardComposer kind="community" hangouts={hangouts} onPosted={(p) => setPosts((prev) => [p, ...(prev ?? [])])} />
      {error && <Card padded className="text-fb-text-2" role="alert">Could not load the board: {error}</Card>}
      {!error && posts === null && [0, 1].map((i) => <Card key={i} padded><Skeleton className="h-5 w-40" /><Skeleton className="mt-3 h-40 w-full" /></Card>)}
      {posts && posts.length === 0 && (
        <Card><EmptyState icon={<Users size={40} />} title="No shared moments yet" body="Be the first: share a photo from a hangout you went to." /></Card>
      )}
      {posts?.map((p) => <CommunityPostCard key={p.id} post={p} place={places[p.targetId] ?? ownPlaces[p.targetId] ?? null} />)}
      {cursor && (
        <Button variant="secondary" disabled={loadingMore} onClick={() => { setLoadingMore(true); load(cursor).finally(() => setLoadingMore(false)); }}>
          {loadingMore ? 'Loading…' : 'See older posts'}
        </Button>
      )}
    </div>
  );
}

function CommunityPostCard({ post, place }: { post: PostView; place: BoardPlace | null }) {
  const [liked, setLiked] = useState(post.viewerReaction !== null);
  const [likes, setLikes] = useState(Object.values(post.reactionCounts).reduce((a, b) => a + b, 0));
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [count, setCount] = useState(post.commentCount);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const r = await apiPost<ReactResponse>(`/api/posts/${post.id}/reactions`, { type: next ? 'like' : null });
      setLikes(Object.values(r.reactionCounts).reduce((a, b) => a + b, 0));
      setLiked(r.viewerReaction !== null);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };

  const openComments = async () => {
    setOpen((o) => !o);
    if (comments === null) {
      apiFetch<{ comments: CommentView[] }>(`/api/posts/${post.id}/comments`)
        .then((r) => setComments(r.comments)).catch(() => setComments([]));
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const { comment } = await apiPost<{ comment: CommentView }>(`/api/posts/${post.id}/comments`, { text });
      setComments((c) => [...(c ?? []), comment]);
      setCount((n) => n + 1);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const when = formatJourneyDay(post.createdAt);
  return (
    <Card as="article" className="overflow-hidden" data-testid="community-post">
      <div className="flex items-center gap-2 p-3">
        <Avatar src={post.author.avatarUrl} name={post.author.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fb-text" data-testid="community-post-author">{post.author.name}</p>
          <p className="truncate text-[13px] text-fb-text-2">
            {place ? <>{place.emoji} {place.venueName} · {formatJourneyDay(place.startsAt)}</> : when}
          </p>
        </div>
      </div>
      {post.text && <p className="whitespace-pre-wrap px-3 pb-3 text-[15px] text-fb-text">{post.text}</p>}
      {post.media.length > 0 && (
        <div className={cn('grid gap-0.5', post.media.length > 1 && 'grid-cols-2')}>
          {post.media.slice(0, 4).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m} src={m} alt="" loading="lazy" className={cn('w-full object-cover', post.media.length > 1 ? 'aspect-square' : 'max-h-[420px]')} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-3 pt-2 text-[13px] text-fb-text-2">
        <span>{likes > 0 ? `${likes} ${likes === 1 ? 'like' : 'likes'}` : ' '}</span>
        <span>{count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : ''}</span>
      </div>
      <div className="mx-3 mt-1 flex border-t border-fb-divider-soft py-1">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          className={cn('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-btn text-[15px] font-semibold hover:bg-fb-hover', liked ? 'text-fb-blue' : 'text-fb-text-2')}
          data-testid="community-like"
        >
          <ThumbsUp size={18} aria-hidden /> Like
        </button>
        <button
          type="button"
          onClick={openComments}
          aria-expanded={open}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-btn text-[15px] font-semibold text-fb-text-2 hover:bg-fb-hover"
        >
          <MessageCircle size={18} aria-hidden /> Comment
        </button>
      </div>
      {open && (
        <div className="border-t border-fb-divider-soft px-3 py-2">
          {comments === null ? <Skeleton className="h-8 w-full" /> : (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <Avatar src={c.author.avatarUrl} name={c.author.name} size={28} />
                  <div className="rounded-[16px] bg-fb-bg px-3 py-1.5">
                    <p className="text-[13px] font-semibold text-fb-text">{c.author.name}</p>
                    <p className="text-[15px] text-fb-text">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="sr-only" htmlFor={`c-${post.id}`}>Write a comment</label>
            <input
              id={`c-${post.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder="Write a comment…"
              className="min-w-0 flex-1 rounded-pill bg-fb-input px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-fb-blue"
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send comment" className="text-fb-blue disabled:text-fb-text-2">
              <Send size={20} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}

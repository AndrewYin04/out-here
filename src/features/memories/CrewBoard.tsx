'use client';

// A crew's private board (crew members only): notes, extra photos, reactions and comments about
// their hangouts. Uses the Facebook post card, so reactions and comments work as in the feed.
import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import type { FeedResponse, PostView } from '@/shared';
import { apiFetch } from '@/features/data';
import { PostCard } from '@/features/fb/feed';
import { Button, EmptyState, Skeleton } from '@/features/ui';
import { BoardComposer } from './BoardComposer';

type Item = PostView & { sharedPost: PostView | null };
const withShared = (p: PostView): Item => ({ ...p, sharedPost: (p as Partial<Item>).sharedPost ?? null });

export function CrewBoard({ crewId, crewName }: { crewId: string; crewName: string }) {
  const [posts, setPosts] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (after: string | null) => {
    const q = after ? `?cursor=${encodeURIComponent(after)}` : '';
    const page = await apiFetch<FeedResponse>(`/api/crews/${encodeURIComponent(crewId)}/posts${q}`);
    setPosts((prev) => [...(after ? prev ?? [] : []), ...page.posts.map(withShared)]);
    setCursor(page.nextCursor);
  }, [crewId]);

  useEffect(() => {
    setPosts(null);
    load(null).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the board'));
  }, [load]);

  return (
    <div className="flex flex-col gap-3" data-testid="crew-board">
      <p className="text-[13px] text-fb-text-2">Only people in {crewName} see this board.</p>
      <BoardComposer kind="crew" crewId={crewId} onPosted={(p) => setPosts((prev) => [withShared(p), ...(prev ?? [])])} />
      {error && <p className="text-[15px] text-fb-text-2" role="alert">{error}</p>}
      {!error && posts === null && <Skeleton className="h-32 w-full rounded-card" />}
      {posts && posts.length === 0 && (
        <EmptyState icon={<MessagesSquare size={36} />} title="Nothing here yet" body="Post a note or a photo the album missed." />
      )}
      {posts?.map((p) => (
        <PostCard key={p.id} post={p} onHide={(id) => setPosts((prev) => prev?.filter((x) => x.id !== id) ?? null)} />
      ))}
      {cursor && (
        <Button
          variant="secondary"
          disabled={loadingMore}
          onClick={() => { setLoadingMore(true); load(cursor).finally(() => setLoadingMore(false)); }}
        >
          {loadingMore ? 'Loading…' : 'See older posts'}
        </Button>
      )}
    </div>
  );
}

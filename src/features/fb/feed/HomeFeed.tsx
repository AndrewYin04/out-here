'use client';

import { Newspaper } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedResponse, PostView } from '@/shared/api';
import { apiFetch, useFeed, useViewer, type PostWithShared } from '@/features/data';
import { Button, Card, EmptyState, Skeleton, SkeletonGroup, useToast } from '@/features/ui';
import { ComposerCard } from './Composer';
import { PostCard } from './PostCard';
import { StoriesTray } from './Stories';

/** Home: composer, stories tray, then the live feed. */
export function HomeFeed({ children }: { children?: React.ReactNode }) {
  const { handle } = useViewer();
  const feed = useFeed();
  const toast = useToast();
  const [mine, setMine] = useState<PostWithShared[]>([]);
  const [older, setOlder] = useState<PostWithShared[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  // Persona switch: start over.
  useEffect(() => { setMine([]); setOlder([]); setCursor(undefined); setHidden(new Set()); }, [handle]);

  const firstPage = useMemo(() => (feed.data?.posts ?? []) as PostWithShared[], [feed.data]);
  const nextCursor = cursor === undefined ? feed.data?.nextCursor ?? null : cursor;

  const posts = useMemo(() => {
    const seen = new Set<string>();
    const out: PostWithShared[] = [];
    for (const p of [...mine, ...firstPage, ...older]) {
      if (seen.has(p.id) || hidden.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    // Fresh copies from the live first page win over the locally added ones.
    return out.map((p) => firstPage.find((f) => f.id === p.id) ?? p);
  }, [mine, firstPage, older, hidden]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await apiFetch<FeedResponse>(`/api/feed?cursor=${encodeURIComponent(nextCursor)}`);
      setOlder((o) => [...o, ...(r.posts as PostWithShared[])]);
      setCursor(r.nextCursor);
    } catch { /* the button stays for a retry */ } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !nextCursor) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loadMore]);

  const added = (p: PostView) => {
    setMine((m) => [p as PostWithShared, ...m]);
    void feed.refetch();
  };

  const hide = (id: string) => {
    setHidden((h) => new Set(h).add(id));
    toast.show('Post hidden from your feed.', {
      action: { label: 'Undo', onClick: () => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }) },
    });
  };

  return (
    <div className="flex flex-col gap-2 md:gap-4" data-testid="home-feed">
      <ComposerCard onPosted={added} />
      <div className="bg-fb-surface md:bg-transparent">
        <StoriesTray />
      </div>
      {children}
      {feed.loading && !feed.data ? (
        <FeedLoading />
      ) : feed.error && !feed.data ? (
        <Card flushOnMobile>
          <EmptyState
            title="Couldn't load your feed"
            body="Check your connection and try again."
            action={<Button onClick={() => void feed.refetch()}>Try again</Button>}
          />
        </Card>
      ) : posts.length === 0 ? (
        <Card flushOnMobile>
          <EmptyState
            icon={<Newspaper size={40} />}
            title="No posts yet"
            body="When you and your friends post, you'll see it here."
          />
        </Card>
      ) : (
        <>
          {posts.map((p) => <PostCard key={p.id} post={p} onHide={hide} onShared={added} />)}
          <div ref={sentinel} aria-hidden />
          {nextCursor && (
            loadingMore ? <FeedLoading count={1} /> : (
              <Button variant="secondary" onClick={() => void loadMore()} className="mx-4 md:mx-0">See more posts</Button>
            )
          )}
        </>
      )}
    </div>
  );
}

function FeedLoading({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup label="posts" className="flex flex-col gap-2 md:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} flushOnMobile className="px-4 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <Skeleton shape="circle" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton width="35%" />
              <Skeleton width="20%" className="h-2.5" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton width="92%" />
            <Skeleton width="70%" />
          </div>
          {i % 2 === 1 && <Skeleton shape="block" className="mt-3 h-[220px] w-full rounded-none" />}
          <div className="mt-2 flex h-10 items-center gap-4">
            <Skeleton width={44} />
            <Skeleton width={44} />
            <Skeleton width={44} />
            <Skeleton width={40} className="ml-auto" />
          </div>
        </Card>
      ))}
    </SkeletonGroup>
  );
}

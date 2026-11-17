'use client';

import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch, useApi, useViewer } from '@/features/data';
import { EmptyState, LinkButton, Skeleton, SkeletonGroup } from '@/features/ui';
import type { FeedResponse, GroupView, PostView } from '@/shared/api';
import { GroupCard } from './GroupCard';
import { PostItem } from './PostItem';

export type GroupsTab = 'feed' | 'discover' | 'yours';

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 pb-3 pt-4 md:px-0 md:pt-2">
      <h1 className="text-[20px] font-bold leading-6 text-fb-text">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] text-fb-text-2">{subtitle}</p>}
    </div>
  );
}

function GridSkeleton() {
  return (
    <SkeletonGroup label="groups" className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 md:px-0 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} shape="block" height={260} className="rounded-card" />)}
    </SkeletonGroup>
  );
}

function GroupGrid({ groups }: { groups: GroupView[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 md:px-0 xl:grid-cols-3 2xl:grid-cols-4">
      {groups.map((g) => <GroupCard key={g.id} group={g} />)}
    </div>
  );
}

/** "Your feed": the newest posts across the groups the viewer belongs to. */
function GroupFeed() {
  const { handle } = useViewer();
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setPosts(null);
    (async () => {
      try {
        const { groups } = await apiFetch<{ groups: GroupView[] }>('/api/groups?filter=mine');
        const pages = await Promise.all(groups.slice(0, 8).map((g) =>
          apiFetch<FeedResponse>(`/api/groups/${g.slug}/posts`).catch(() => ({ posts: [], nextCursor: null }))));
        const all = pages.flatMap((p) => p.posts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (live) setPosts(all.slice(0, 20));
      } catch {
        if (live) setError(true);
      }
    })();
    return () => { live = false; };
  }, [handle]);

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-2 pb-4 md:gap-4">
      <Header title="Recent activity" />
      {error ? (
        <EmptyState title="Couldn’t load your feed" body="Check your connection and try again." />
      ) : !posts ? (
        <SkeletonGroup label="posts" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} shape="block" height={180} className="rounded-card" />)}
        </SkeletonGroup>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="No posts from your groups yet"
          body="Join groups to see their posts here."
          action={<LinkButton href="/groups?tab=discover">Discover groups</LinkButton>}
        />
      ) : (
        posts.map((p) => <PostItem key={p.id} post={p} showGroup />)
      )}
    </div>
  );
}

function DiscoverGroups() {
  const { data, error } = useApi<{ groups: GroupView[] }>('/api/groups?filter=discover');
  return (
    <div className="pb-4" data-testid="groups-discover">
      <Header title="Suggested for you" subtitle="Groups you might be interested in." />
      {error ? <EmptyState title="Couldn’t load groups" /> : !data ? <GridSkeleton /> : data.groups.length === 0
        ? <EmptyState icon={<Users size={48} />} title="You’ve joined every group" />
        : <GroupGrid groups={data.groups} />}
    </div>
  );
}

function YourGroups() {
  const { data, error } = useApi<{ groups: GroupView[] }>('/api/groups?filter=mine');
  return (
    <div className="pb-4" data-testid="groups-yours">
      <Header title={data ? `All groups you’ve joined (${data.groups.length})` : 'All groups you’ve joined'} />
      {error ? <EmptyState title="Couldn’t load groups" /> : !data ? <GridSkeleton /> : data.groups.length === 0
        ? <EmptyState icon={<Users size={48} />} title="You haven’t joined any groups" action={<LinkButton href="/groups?tab=discover">Discover groups</LinkButton>} />
        : <GroupGrid groups={data.groups} />}
    </div>
  );
}

export function GroupsIndex({ tab }: { tab: GroupsTab }) {
  if (tab === 'discover') return <DiscoverGroups />;
  if (tab === 'yours') return <YourGroups />;
  return <GroupFeed />;
}

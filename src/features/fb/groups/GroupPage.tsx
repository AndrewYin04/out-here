'use client';

import { ChevronDown, Eye, Globe, Lock, LogOut, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, apiPost, useApi, useViewer } from '@/features/data';
import {
  Avatar, AvatarStack, Button, Card, EmptyState, MenuItem, Popover, Skeleton, SkeletonGroup, Tabs, useToast,
} from '@/features/ui';
import type { FeedResponse, GroupResponse, GroupView, PersonCard, PostView } from '@/shared/api';
import { GroupCover, PrivacyLine } from './GroupCard';
import { Hangouts } from './Hangouts';
import { PostItem } from './PostItem';

export type GroupTab = 'discussion' | 'members' | 'hangouts';
const TABS: { id: GroupTab; label: string }[] = [
  { id: 'discussion', label: 'Discussion' },
  { id: 'members', label: 'Members' },
  { id: 'hangouts', label: 'Hangouts' },
];

function JoinButton({ group, onChange }: { group: GroupView; onChange: (g: GroupView) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const call = async (kind: 'join' | 'leave') => {
    setBusy(true);
    try {
      const r = await apiPost<{ group: GroupView }>(`/api/groups/${group.slug}/${kind}`);
      onChange(r.group);
      toast.show(kind === 'join' ? `You joined ${group.name}` : `You left ${group.name}`);
    } catch {
      toast.show('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!group.viewerRole) {
    return (
      <Button onClick={() => call('join')} disabled={busy} icon={<Users size={16} aria-hidden />} data-testid="join-group">
        Join group
      </Button>
    );
  }
  return (
    <Popover
      label="Membership"
      width={280}
      trigger={(props) => (
        <Button variant="secondary" {...props} disabled={busy} icon={<UserCheck size={16} aria-hidden />} data-testid="joined-group">
          Joined <ChevronDown size={16} aria-hidden />
        </Button>
      )}
    >
      {(close) => (
        <MenuItem icon={<LogOut size={20} aria-hidden />} onSelect={() => { close(); void call('leave'); }}>
          Leave group
        </MenuItem>
      )}
    </Popover>
  );
}

function Composer({ group, onPosted }: { group: GroupView; onPosted: (p: PostView) => void }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!group.viewerRole) {
    return <Card padded className="text-[15px] text-fb-text-2">Join this group to post and comment.</Card>;
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await apiPost<{ post: PostView }>('/api/posts', { text: t, audience: 'public', target: { type: 'group', slug: group.slug } });
      onPosted(r.post);
      setText('');
    } catch {
      toast.show('Your post couldn’t be shared. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card as="section" padded aria-label="Create a post">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Avatar src={viewer.avatarUrl} name={viewer.name} size={40} decorative />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Write something</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write something..."
            data-testid="group-composer"
            className="h-10 w-full rounded-pill bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 hover:bg-fb-secondary-btn"
          />
        </label>
        <Button type="submit" disabled={busy || !text.trim()}>Post</Button>
      </form>
    </Card>
  );
}

function Discussion({ group }: { group: GroupView }) {
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [error, setError] = useState(false);
  const { handle } = useViewer();
  useEffect(() => {
    let live = true;
    setPosts(null);
    apiFetch<FeedResponse>(`/api/groups/${group.slug}/posts`)
      .then((r) => { if (live) setPosts(r.posts); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [group.slug, handle, group.viewerRole]);
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <Composer group={group} onPosted={(p) => setPosts((list) => [p, ...(list ?? [])])} />
      {error ? <Card><EmptyState title="Couldn’t load posts" /></Card> : !posts ? (
        <SkeletonGroup label="posts" className="flex flex-col gap-3">
          {[0, 1].map((i) => <Skeleton key={i} shape="block" height={180} className="rounded-card" />)}
        </SkeletonGroup>
      ) : posts.length === 0 ? (
        <Card><EmptyState title="No posts yet" body="Be the first to post in this group." /></Card>
      ) : posts.map((p) => <PostItem key={p.id} post={p} />)}
    </div>
  );
}

function MemberRow({ p }: { p: PersonCard }) {
  return (
    <li>
      <Link href={`/profile/${p.handle}`} className="flex items-center gap-3 rounded-btn px-2 py-2 hover:bg-fb-hover" data-testid="member">
        <Avatar src={p.avatarUrl} name={p.name} size={60} decorative />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-fb-text">{p.name}</span>
          <span className="block truncate text-fb-meta text-fb-text-2">
            {p.isFriend ? 'Friend' : p.mutualFriendCount > 0 ? `${p.mutualFriendCount} mutual friend${p.mutualFriendCount === 1 ? '' : 's'}` : 'Member'}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Members({ slug }: { slug: string }) {
  const { data, error } = useApi<{ members: PersonCard[]; friendCount: number }>(`/api/groups/${slug}/members`);
  if (error) return <Card><EmptyState title="Couldn’t load members" /></Card>;
  if (!data) return <Skeleton shape="block" height={240} className="rounded-card" />;
  const friends = data.members.filter((m) => m.isFriend);
  const others = data.members.filter((m) => !m.isFriend);
  return (
    <Card as="section" aria-label="Members" className="p-2 md:p-4" data-testid="members">
      <h2 className="px-2 text-[17px] font-semibold text-fb-text">
        Members · <span className="font-normal text-fb-text-2">{data.members.length.toLocaleString('en-US')}</span>
      </h2>
      {friends.length > 0 && (
        <div className="px-2 pt-3">
          <AvatarStack people={friends.map((f) => ({ name: f.name, src: f.avatarUrl }))} size={32} max={10} />
          <p className="pt-2 text-[15px] text-fb-text" data-testid="friends-are-members">
            {data.friendCount === 1 ? '1 friend is a member' : `${data.friendCount} friends are members`}
          </p>
        </div>
      )}
      <ul className="pt-2">
        {[...friends, ...others].map((p) => <MemberRow key={p.id} p={p} />)}
      </ul>
    </Card>
  );
}

function About({ group }: { group: GroupView }) {
  const Icon = group.privacy === 'public' ? Globe : Lock;
  return (
    <Card as="aside" padded aria-label="About" className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold text-fb-text">About</h2>
      {group.description && <p className="text-[15px] text-fb-text">{group.description}</p>}
      <div className="flex gap-3">
        <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-fb-text-2" />
        <div>
          <p className="text-[17px] font-medium text-fb-text">{group.privacy === 'public' ? 'Public' : 'Private'}</p>
          <p className="text-fb-meta text-fb-text-2">
            {group.privacy === 'public' ? 'Anyone can see who’s in the group and what they post.' : 'Only members can see who’s in the group and what they post.'}
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <Eye size={20} aria-hidden className="mt-0.5 shrink-0 text-fb-text-2" />
        <div>
          <p className="text-[17px] font-medium text-fb-text">Visible</p>
          <p className="text-fb-meta text-fb-text-2">Anyone can find this group.</p>
        </div>
      </div>
    </Card>
  );
}

function HeaderSkeleton() {
  return (
    <SkeletonGroup label="group" className="mx-auto max-w-[1250px]">
      <Skeleton shape="block" className="h-[180px] w-full md:h-[350px] md:rounded-b-btn" />
      <div className="flex flex-col gap-2 p-4"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-4 w-1/4" /></div>
    </SkeletonGroup>
  );
}

export function GroupPage({ slug, initialTab }: { slug: string; initialTab: GroupTab }) {
  const router = useRouter();
  const { data, error } = useApi<GroupResponse>(`/api/groups/${slug}`);
  const [group, setGroup] = useState<GroupView | null>(null);
  const [tab, setTab] = useState<GroupTab>(initialTab);
  useEffect(() => { if (data) setGroup(data.group); }, [data]);

  const changeTab = (id: string) => {
    const t = id as GroupTab;
    setTab(t);
    router.replace(t === 'discussion' ? `/groups/${slug}` : `/groups/${slug}?tab=${t}`, { scroll: false });
  };

  if (error) {
    return <Card className="mx-auto mt-4 max-w-[680px]"><EmptyState title="This group isn’t available" body="It may have been removed, or the link may be broken." /></Card>;
  }
  if (!group) return <HeaderSkeleton />;

  return (
    <div className="pb-6" data-testid="group-page">
      <div className="bg-fb-surface shadow-card">
        <div className="mx-auto max-w-[1250px]">
          <GroupCover group={group} className="aspect-[1250/463] max-h-[463px] w-full md:rounded-b-btn" />
          <div className="flex flex-col gap-3 px-4 pb-3 pt-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="text-[24px] font-bold leading-7 text-fb-text md:text-[28px] md:leading-8">{group.name}</h1>
              <p className="mt-1 text-[15px] text-fb-text-2" data-testid="group-meta"><PrivacyLine group={group} /></p>
            </div>
            <JoinButton group={group} onChange={setGroup} />
          </div>
          <div className="mx-4 border-t border-fb-divider">
            <Tabs items={TABS} value={tab} onChange={changeTab} label="Group sections" className="h-[60px]" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1250px] gap-4 px-0 pt-4 md:px-4 lg:grid-cols-[minmax(0,680px)_minmax(0,1fr)] lg:justify-center">
        <div className="min-w-0">
          {tab === 'discussion' && <Discussion group={group} />}
          {tab === 'members' && <Members slug={slug} />}
          {tab === 'hangouts' && <Hangouts slug={slug} />}
        </div>
        <div className="hidden lg:block"><div className="sticky top-[72px]"><About group={group} /></div></div>
      </div>
    </div>
  );
}

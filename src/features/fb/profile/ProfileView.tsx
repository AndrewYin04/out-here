'use client';

import {
  Briefcase, Camera, GraduationCap, Heart, House, MapPin, MessageCircle, Pencil, Search, UserCheck, UserPlus, UserX, User,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { apiFetch, useApi, useViewer } from '@/features/data';
import { errorText, MESSENGER_TO_READY, mutualLabel, removeFriend, respondRequest, sendRequest } from '@/features/fb/friends';
import { CoverHeaderSkeleton, ROUTES, SplitBodySkeleton } from '@/features/fb/shell';
import {
  Avatar, AvatarStack, Button, Card, EmptyState, LinkButton, MenuItem, Popover, Skeleton, Tabs, useToast,
} from '@/features/ui';
import type { FeedResponse, PersonCard, PostView, ProfileResponse } from '@/shared/api';
import type { ProfileField } from '@/shared/types';
import { audienceLabel, coverFor, introRows } from './format';
import { EditProfileModal } from './EditProfileModal';
import { OutHereCard } from './OutHereCard';
import { PostCard } from './PostCard';

export type ProfileTab = 'posts' | 'about' | 'friends' | 'photos';

const FIELD_ICONS: Record<ProfileField, LucideIcon> = {
  job: Briefcase, school: GraduationCap, major: GraduationCap, gradYear: GraduationCap,
  currentCity: House, hometown: MapPin, pronouns: User,
};

const firstName = (name: string) => name.split(' ')[0];
const friendsLabel = (n: number) => (n === 1 ? '1 friend' : `${n} friends`);

// ---------- header ----------

function Actions({ data, onChanged, onEdit }: { data: ProfileResponse; onChanged: () => void; onEdit: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const p = data.profile;
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.show(done);
      onChanged();
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const message = MESSENGER_TO_READY && (
    <LinkButton href={ROUTES.chatWith(p.handle)} variant={data.relationship === 'friends' ? 'primary' : 'secondary'} icon={<MessageCircle size={16} aria-hidden />}>
      Message
    </LinkButton>
  );

  switch (data.relationship) {
    case 'self':
      return (
        <Button variant="secondary" icon={<Pencil size={16} aria-hidden />} onClick={onEdit}>
          Edit profile
        </Button>
      );
    case 'friends':
      return (
        <>
          <Popover
            label="Friend options"
            align="right"
            width={260}
            trigger={(props) => (
              <Button {...props} variant="secondary" icon={<UserCheck size={16} aria-hidden />} disabled={busy}>
                Friends
              </Button>
            )}
          >
            {(close) => (
              <MenuItem
                icon={<UserX size={20} aria-hidden />}
                onSelect={() => {
                  close();
                  void run(() => removeFriend(p.id), `You unfriended ${p.name}`);
                }}
              >
                Unfriend
              </MenuItem>
            )}
          </Popover>
          {message}
        </>
      );
    case 'request_sent':
      return (
        <>
          <Button variant="tint" icon={<UserX size={16} aria-hidden />} disabled={busy} onClick={() => run(() => removeFriend(p.id))}>
            Cancel request
          </Button>
          {message}
        </>
      );
    case 'request_received':
      return (
        <>
          <Button icon={<UserCheck size={16} aria-hidden />} disabled={busy} onClick={() => run(() => respondRequest(p.id, 'confirm'), `You and ${firstName(p.name)} are now friends`)}>
            Confirm request
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => respondRequest(p.id, 'delete'))}>
            Delete request
          </Button>
          {message}
        </>
      );
    default:
      return (
        <>
          <Button icon={<UserPlus size={16} aria-hidden />} disabled={busy} onClick={() => run(() => sendRequest(p.id))}>
            Add friend
          </Button>
          {message}
        </>
      );
  }
}

function Cover({ url, name }: { url: string; name: string }) {
  return (
    <div className="relative h-[200px] overflow-hidden bg-fb-skeleton md:h-[300px] md:rounded-b-card lg:h-[360px]" data-testid="profile-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${name}'s cover photo`} className="h-full w-full object-cover" />
    </div>
  );
}

function Header({ data, tab, onChanged, onEdit }: { data: ProfileResponse; tab: ProfileTab; onChanged: () => void; onEdit: () => void }) {
  const p = data.profile;
  const base = ROUTES.profile(p.handle);
  const tabs = [
    { id: 'posts', label: 'Posts', href: base },
    { id: 'about', label: 'About', href: `${base}?tab=about` },
    { id: 'friends', label: 'Friends', href: `${base}?tab=friends` },
    { id: 'photos', label: 'Photos', href: `${base}?tab=photos` },
  ];
  return (
    <header className="bg-fb-surface shadow-card" data-testid="profile-header">
      <div className="mx-auto max-w-[1250px]">
        <Cover url={p.coverUrl ?? coverFor(p.handle)} name={p.name} />
      </div>
      <div className="mx-auto max-w-[1100px] px-4 md:px-8">
        <div className="flex flex-col items-center gap-3 pb-4 md:flex-row md:items-end md:gap-5">
          <div className="relative z-10 -mt-[84px] shrink-0 rounded-full bg-fb-surface p-1 ring-4 ring-white" data-testid="profile-avatar">
            <Avatar src={p.avatarUrl} name={p.name} size={168} decorative />
          </div>
          <div className="min-w-0 flex-1 text-center md:pb-2 md:text-left">
            <h1 className="text-[32px] font-bold leading-[38px] text-fb-text">{p.name}</h1>
            <p className="mt-1 text-[15px] font-semibold text-fb-text-2">
              <Link href={`${base}?tab=friends`} className="hover:underline" data-testid="friend-count">
                {friendsLabel(data.friendCount)}
              </Link>
              {data.relationship !== 'self' && data.mutualFriendCount > 0 && (
                <>
                  {' · '}
                  <Link href={`${base}?tab=friends&show=mutual`} className="hover:underline" data-testid="mutual-count">
                    {data.mutualFriendCount} mutual
                  </Link>
                </>
              )}
            </p>
            {data.friendPreview.length > 0 && (
              <div className="mt-2 flex justify-center md:justify-start">
                <AvatarStack people={data.friendPreview.map((f) => ({ name: f.name, src: f.avatarUrl }))} size={32} max={8} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 md:pb-2" data-testid="profile-actions">
            <Actions data={data} onChanged={onChanged} onEdit={onEdit} />
          </div>
        </div>
        <div className="border-t border-fb-divider-soft">
          <Tabs items={tabs} value={tab} label={`${p.name}'s profile sections`} />
        </div>
      </div>
    </header>
  );
}

// ---------- cards ----------

function IntroCard({ data, onEdit }: { data: ProfileResponse; onEdit: () => void }) {
  const p = data.profile;
  const rows = introRows(p);
  return (
    <Card flushOnMobile className="p-4" data-testid="intro-card">
      <h2 className="text-[20px] font-bold text-fb-text">Intro</h2>
      {p.bio && <p className="mt-3 text-center text-[15px] text-fb-text">{p.bio}</p>}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const Icon = FIELD_ICONS[r.field];
            return (
              <li key={r.field} className="flex items-start gap-3 text-[15px] text-fb-text" data-field={r.field}>
                <Icon size={20} className="mt-0.5 shrink-0 text-fb-text-2" aria-hidden />
                <span>{r.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {p.interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.interests.map((i) => (
            <span key={i} className="rounded-pill bg-fb-input px-3 py-1.5 text-fb-meta font-semibold text-fb-text">
              {i}
            </span>
          ))}
        </div>
      )}
      {data.relationship === 'self' && (
        <Button variant="secondary" block className="mt-4" onClick={onEdit}>
          Edit details
        </Button>
      )}
    </Card>
  );
}

function usePhotos(handle: string) {
  return useApi<{ photos: string[] }>(`/api/profile/${handle}/photos`);
}

function PhotoGrid({ photos, max, rounded }: { photos: string[]; max?: number; rounded?: boolean }) {
  const shown = max ? photos.slice(0, max) : photos;
  return (
    <ul className={`grid grid-cols-3 gap-1 ${rounded ? 'overflow-hidden rounded-card' : ''}`} aria-label="Photos">
      {shown.map((src, i) => (
        <li key={src + i} className="aspect-square bg-fb-skeleton" data-testid="profile-photo">
          <a href={src} target="_blank" rel="noreferrer" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function PhotosCard({ handle }: { handle: string }) {
  const { data } = usePhotos(handle);
  if (!data || data.photos.length === 0) return null;
  return (
    <Card flushOnMobile className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[20px] font-bold text-fb-text">Photos</h2>
        <Link href={`${ROUTES.profile(handle)}?tab=photos`} className="rounded-btn px-2 py-1 text-[15px] text-fb-link hover:bg-fb-hover">
          See all photos
        </Link>
      </div>
      <PhotoGrid photos={data.photos} max={9} rounded />
    </Card>
  );
}

function FriendsCard({ data }: { data: ProfileResponse }) {
  const p = data.profile;
  if (data.friendPreview.length === 0) return null;
  return (
    <Card flushOnMobile className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-bold text-fb-text">Friends</h2>
        <Link href={`${ROUTES.profile(p.handle)}?tab=friends`} className="rounded-btn px-2 py-1 text-[15px] text-fb-link hover:bg-fb-hover">
          See all friends
        </Link>
      </div>
      <p className="mb-3 text-[15px] text-fb-text-2">
        {friendsLabel(data.friendCount)}
        {data.relationship !== 'self' && data.mutualFriendCount > 0 && ` (${data.mutualFriendCount} mutual)`}
      </p>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
        {data.friendPreview.slice(0, 9).map((f) => (
          <li key={f.id}>
            <Link href={ROUTES.profile(f.handle)} className="block">
              <FriendSquare person={f} />
              <span className="mt-1 block text-fb-meta font-semibold leading-4 text-fb-text">{f.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FriendSquare({ person }: { person: PersonCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-fb-skeleton">
      {person.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Avatar name={person.name} size={56} decorative />
      )}
    </span>
  );
}

// ---------- tabs ----------

function PostsList({ handle, name }: { handle: string; name: string }) {
  const toast = useToast();
  const { data, error } = useApi<FeedResponse>(`/api/profile/${handle}/posts`);
  const [more, setMore] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const next = cursor === undefined ? data?.nextCursor ?? null : cursor;

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<FeedResponse>(`/api/profile/${handle}/posts?cursor=${encodeURIComponent(next)}`);
      setMore((m) => [...m, ...page.posts]);
      setCursor(page.nextCursor);
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  };

  if (error) return <Card flushOnMobile><EmptyState title="Couldn't load posts" body={error} /></Card>;
  if (!data) {
    return (
      <Card flushOnMobile className="space-y-3 p-4" aria-busy>
        <Skeleton width="40%" />
        <Skeleton width="90%" />
        <Skeleton width="70%" />
      </Card>
    );
  }
  const posts = [...data.posts, ...more];
  return (
    <section aria-label="Posts" className="space-y-4">
      <Card flushOnMobile className="px-4 py-3">
        <h2 className="text-[20px] font-bold text-fb-text">Posts</h2>
      </Card>
      {posts.length === 0 ? (
        <Card flushOnMobile>
          <EmptyState title="No posts available" body={`When ${firstName(name)} shares something you can see, it will show up here.`} />
        </Card>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
      {next && (
        <Button variant="secondary" block onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'See more posts'}
        </Button>
      )}
    </section>
  );
}

function AboutTab({ data }: { data: ProfileResponse }) {
  const p = data.profile;
  const rows = introRows(p);
  const self = data.relationship === 'self';
  return (
    <Card flushOnMobile className="p-4" data-testid="about-card">
      <h2 className="text-[20px] font-bold text-fb-text">About</h2>
      {self && (
        <p className="mt-1 text-fb-meta text-fb-text-2">
          Each detail shows who can see it. People only see the details your settings allow.
        </p>
      )}
      <h3 className="mt-4 text-[17px] font-semibold text-fb-text">Overview</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[15px] text-fb-text-2">No details to show</p>
      ) : (
        <ul className="mt-2 divide-y divide-fb-divider-soft">
          {rows.map((r) => {
            const Icon = FIELD_ICONS[r.field];
            return (
              <li key={r.field} className="flex items-center gap-3 py-3 text-[15px] text-fb-text" data-field={r.field}>
                <Icon size={24} className="shrink-0 text-fb-text-2" aria-hidden />
                <span className="min-w-0 flex-1">{r.text}</span>
                {self && (
                  <span className="shrink-0 rounded-pill bg-fb-input px-2 py-1 text-fb-meta text-fb-text-2" data-testid="field-audience">
                    {audienceLabel(p.fieldVisibility[r.field])}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.bio && (
        <>
          <h3 className="mt-4 text-[17px] font-semibold text-fb-text">Details about {firstName(p.name)}</h3>
          <p className="mt-2 text-[15px] text-fb-text">{p.bio}</p>
        </>
      )}
      {p.interests.length > 0 && (
        <>
          <h3 className="mt-4 flex items-center gap-2 text-[17px] font-semibold text-fb-text">
            <Heart size={18} aria-hidden className="text-fb-text-2" /> Interests
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.interests.map((i) => (
              <span key={i} className="rounded-pill bg-fb-input px-3 py-1.5 text-fb-meta font-semibold text-fb-text">{i}</span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function FriendsTabView({ data, initialMutual }: { data: ProfileResponse; initialMutual: boolean }) {
  const p = data.profile;
  const self = data.relationship === 'self';
  const [mode, setMode] = useState<'all' | 'mutual'>(initialMutual && !self ? 'mutual' : 'all');
  const [q, setQ] = useState('');
  const all = useApi<{ friends: PersonCard[] }>(`/api/profile/${p.handle}/friends`);
  const mutual = useApi<{ friends: PersonCard[] }>(self ? null : `/api/friends/mutual/${p.handle}`);
  const source = mode === 'mutual' ? mutual : all;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (source.data?.friends ?? []).filter((f) => !needle || f.name.toLowerCase().includes(needle));
  }, [source.data, q]);

  return (
    <Card flushOnMobile className="p-4" data-testid="friends-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-bold text-fb-text">Friends</h2>
        <label className="flex h-9 w-full items-center gap-2 rounded-pill bg-fb-input px-3 md:w-[240px]">
          <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
          <span className="sr-only">Search {firstName(p.name)}&apos;s friends</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
          />
        </label>
      </div>
      {!self && (
        <div className="mt-2">
          <Tabs
            label="Friends filter"
            value={mode}
            onChange={(id) => setMode(id as 'all' | 'mutual')}
            items={[
              { id: 'all', label: 'All friends' },
              { id: 'mutual', label: 'Mutual friends', count: data.mutualFriendCount },
            ]}
          />
        </div>
      )}
      {source.error ? (
        <EmptyState title="Couldn't load friends" body={source.error} />
      ) : !source.data ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-busy>
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} shape="block" height={96} />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title={q ? `No results for "${q}"` : mode === 'mutual' ? 'No mutual friends' : 'No friends to show'} />
      ) : (
        <ul className="mt-4 grid gap-x-4 gap-y-2 md:grid-cols-2" aria-label={mode === 'mutual' ? 'Mutual friends' : 'Friends'}>
          {list.map((f) => (
            <li key={f.id} data-testid="profile-friend" className="flex items-center gap-4 rounded-card border border-fb-divider-soft p-3">
              <Link href={ROUTES.profile(f.handle)} className="h-20 w-20 shrink-0" tabIndex={-1} aria-hidden>
                <FriendSquare person={f} />
              </Link>
              <div className="min-w-0">
                <Link href={ROUTES.profile(f.handle)} className="block truncate text-[17px] font-semibold text-fb-text hover:underline">
                  {f.name}
                </Link>
                {f.mutualFriendCount > 0 && <p className="text-fb-meta text-fb-text-2">{mutualLabel(f.mutualFriendCount)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PhotosTab({ data }: { data: ProfileResponse }) {
  const photos = usePhotos(data.profile.handle);
  return (
    <Card flushOnMobile className="p-4" data-testid="photos-tab">
      <h2 className="mb-3 text-[20px] font-bold text-fb-text">Photos</h2>
      {!photos.data ? (
        <div className="grid grid-cols-3 gap-1" aria-busy>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} shape="block" height={120} />)}
        </div>
      ) : photos.data.photos.length === 0 ? (
        <EmptyState icon={<Camera size={40} />} title="No photos to show" />
      ) : (
        <PhotoGrid photos={photos.data.photos} />
      )}
    </Card>
  );
}

// ---------- page ----------

/** /profile/[handle]: header with cover, avatar, friend count and actions, then the tab body. */
export function ProfileView({ handle, tab, showMutual = false }: { handle: string; tab: ProfileTab; showMutual?: boolean }) {
  const { viewer } = useViewer();
  const { data, error, refetch } = useApi<ProfileResponse>(`/api/profile/${encodeURIComponent(handle)}`, [`user:${viewer.id}`]);
  const [editing, setEditing] = useState(false);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-[680px] p-4">
        <Card>
          <EmptyState title="This content isn't available right now" body={error} action={<LinkButton href={ROUTES.home}>Go to Feed</LinkButton>} />
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <CoverHeaderSkeleton label="Profile" />
        <SplitBodySkeleton />
      </div>
    );
  }

  return (
    <div data-testid="profile-view" data-relationship={data.relationship}>
      <Header data={data} tab={tab} onChanged={refetch} onEdit={() => setEditing(true)} />
      {data.relationship === 'self' && (
        <EditProfileModal key={data.profile.id} data={data} open={editing} onClose={() => setEditing(false)} onSaved={refetch} />
      )}
      <div className="mx-auto max-w-[1100px] py-4 md:px-8">
        {tab === 'posts' && (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* Out Here card first on phones; on desktop it heads the posts column. */}
            {data.relationship === 'friends' && (
              <OutHereCard
                friendId={data.profile.id}
                handle={data.profile.handle}
                firstName={firstName(data.profile.name)}
                className="lg:col-start-2 lg:row-start-1"
              />
            )}
            <div className="space-y-4 lg:sticky lg:top-[72px] lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <IntroCard data={data} onEdit={() => setEditing(true)} />
              <PhotosCard handle={data.profile.handle} />
              <FriendsCard data={data} />
            </div>
            <div className="lg:col-start-2">
              <PostsList handle={data.profile.handle} name={data.profile.name} />
            </div>
          </div>
        )}
        {tab === 'about' && <AboutTab data={data} />}
        {tab === 'friends' && <FriendsTabView data={data} initialMutual={showMutual} />}
        {tab === 'photos' && <PhotosTab data={data} />}
      </div>
    </div>
  );
}


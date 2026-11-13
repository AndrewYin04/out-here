'use client';
// A plan's own page (Partiful-style): cover, host, time and place, who can see it, live stats
// ("12 going · 3 spots left · 🔴 Live · 5 here"), join and check in, the guest list (friends
// first; strangers see the count only), the host's pop-up, and an activity feed of posts.
import { ArrowLeft, Clock, MapPin, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiFetchError, apiPost, useApi, useViewer, type QuestDetail } from '@/features/data';
import { PostCard } from '@/features/fb/feed';
import { Avatar, Button, Card, EmptyState, Skeleton, useToast } from '@/features/ui';
import { formatDemoTime, type LatLng } from '@/shared';
import type { PersonCard, PostView } from '@/shared/api';
import { priceLabel, startsLabel } from '../format';
import { Bubble, Poster, ReportButton, StatLine, VisibilityChip } from './parts';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function friendsFirst(members: PersonCard[], hostId: string, viewerId: string): PersonCard[] {
  const rank = (p: PersonCard) => (p.id === hostId ? 0 : p.id === viewerId ? 1 : p.isFriend ? 2 : 3);
  return [...members].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Browser location, only after the person taps "I'm here". Null when denied or unavailable. */
function currentPosition(): Promise<LatLng | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function PlanPage({ id }: { id: string }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const now = useNow();
  const detail = useApi<QuestDetail>(`/api/quests/${id}`, [`quest:${id}`]);
  const postsApi = useApi<{ posts: PostView[] }>(`/api/quests/${id}/posts`, [`quest:${id}`]);
  const [busy, setBusy] = useState(false);
  const [demoCheckin, setDemoCheckin] = useState(false);
  const [hidden, setHidden] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const prev = useRef<string | null>(null);

  const d = detail.data && detail.data.quest.id === id ? detail.data : null;
  const q = d?.quest ?? null;

  // Pulse the stat line when seats or check-ins change live.
  useEffect(() => {
    if (!d) return;
    const key = `${d.seatsLeft}:${d.hereCount}:${d.memberCount}`;
    if (prev.current !== null && prev.current !== key) {
      statsRef.current?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 450, iterations: 2 });
    }
    prev.current = key;
  }, [d]);

  const guests = useMemo(() => (d && q ? friendsFirst(d.members, q.hostId, viewer.id) : []), [d, q, viewer.id]);
  const posts = useMemo(() => (postsApi.data?.posts ?? []).map((p) => ({ ...p, sharedPost: null })), [postsApi.data]);

  if (hidden || (detail.error && !d)) {
    return (
      <div className="mx-auto max-w-[680px] px-4 py-8">
        <Card padded>
          <EmptyState
            title="This plan isn't available"
            body={hidden ? 'You reported it, so it is hidden for you.' : 'It may have ended, or it is only for some people.'}
            action={<Link href="/out-here" className="font-semibold text-fb-blue hover:underline">Back to the map</Link>}
          />
        </Card>
      </div>
    );
  }

  if (!d || !q) {
    return (
      <div className="mx-auto max-w-[680px] space-y-3 px-4 py-4" data-testid="plan-page-loading">
        <Skeleton className="aspect-[16/9] w-full rounded-card" />
        <Skeleton className="h-7" width="60%" />
        <Skeleton className="h-4" width="40%" />
      </div>
    );
  }

  const isHost = q.hostId === viewer.id;
  const isMember = d.viewerIsMember;
  const checkinOpen = Date.parse(q.startsAt) - 15 * 60_000 <= now.getTime() && now.getTime() < Date.parse(q.endsAt);
  const host = d.host;

  async function act(kind: 'join' | 'leave') {
    setBusy(true);
    try {
      await apiPost(`/api/quests/${id}/${kind}`, {});
      toast.show(kind === 'join' ? "You're in. See you there." : 'You left this plan.');
    } catch (e) {
      if (e instanceof ApiFetchError && e.status === 409) toast.show('Someone just took the last spot.');
      else toast.show(kind === 'join' ? "Couldn't join. Try again." : "Couldn't leave. Try again.");
    } finally {
      setBusy(false);
      await detail.refetch();
    }
  }

  async function checkIn(at: LatLng | null) {
    setBusy(true);
    try {
      const spot = at ?? (await currentPosition());
      if (!spot) { setDemoCheckin(true); toast.show('Location is off. Use the demo check-in below.'); return; }
      await apiPost(`/api/quests/${id}/checkin`, { location: spot });
      toast.show("You're checked in. Have fun!");
      await detail.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/at the spot/.test(msg)) { setDemoCheckin(true); toast.show('You need to be at the spot to check in.'); }
      else toast.show(msg || "Couldn't check in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[680px] px-0 pb-10 md:px-4 md:pt-4" data-testid="plan-page">
      <Link href={`/out-here?quest=${q.id}`} className="mb-2 hidden items-center gap-1 text-fb-meta font-semibold text-fb-text-2 hover:underline md:inline-flex">
        <ArrowLeft size={14} aria-hidden /> Back to the map
      </Link>

      <Card as="article" className="overflow-hidden" flushOnMobile>
        <Poster quest={q} fallback className="aspect-[16/9] w-full" />
        <div className="px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityChip quest={q} groupName={d.group?.name} />
            {d.group && (
              <Link href={`/groups/${d.group.slug}?tab=hangouts`} className="text-fb-meta font-semibold text-fb-blue hover:underline">
                {d.group.name}
              </Link>
            )}
          </div>
          <h1 className="mt-2 text-[28px] font-bold leading-8 text-fb-text">
            <span aria-hidden>{q.emoji} </span>{q.title}
          </h1>
          {host && (
            <p className="mt-2 flex items-center gap-2 text-fb-body text-fb-text-2">
              <Avatar src={host.avatarUrl} name={host.name} size={24} decorative />
              Hosted by <Link href={`/profile/${host.handle}`} className="font-semibold text-fb-text hover:underline">{host.id === viewer.id ? 'you' : host.name}</Link>
            </p>
          )}

          <ul className="mt-3 space-y-2 text-fb-body">
            <li className="flex items-center gap-2">
              <Clock size={18} className="text-fb-text-2" aria-hidden />
              <span data-testid="plan-starts">{startsLabel(q, now)}</span>
              <span className="text-fb-text-2">· {formatDemoTime(q.startsAt)} to {formatDemoTime(q.endsAt)}</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin size={18} className="text-fb-text-2" aria-hidden />
              <span>{q.venueName}</span>
              {!isMember && <span className="text-fb-text-2">· exact spot after you join</span>}
            </li>
            <li className="flex items-center gap-2">
              <Wallet size={18} className="text-fb-text-2" aria-hidden />
              <span>{priceLabel(q.priceMax)}</span>
            </li>
          </ul>

          <div ref={statsRef} className="mt-3 rounded-card bg-fb-input px-3 py-2">
            <StatLine memberCount={d.memberCount} seatsLeft={d.seatsLeft} isLive={d.isLive} hereCount={d.hereCount} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {isMember ? (
              isHost ? (
                <span className="self-center text-fb-body font-semibold text-fb-text-2">You&apos;re hosting</span>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => act('leave')}>Leave</Button>
              )
            ) : (
              <Button data-testid="plan-join" disabled={busy || d.seatsLeft === 0} onClick={() => act('join')}>
                {d.seatsLeft === 0 ? 'Full' : 'Join'}
              </Button>
            )}
            {isMember && checkinOpen && (
              d.viewerCheckedIn ? (
                <span data-testid="plan-checked-in" className="self-center rounded-pill bg-[#E6F4EA] px-3 py-1 text-fb-meta font-semibold text-fb-green">✓ You&apos;re here</span>
              ) : (
                <Button variant="tint" data-testid="plan-checkin" disabled={busy} onClick={() => void checkIn(null)}>📍 I&apos;m here</Button>
              )
            )}
          </div>
          {isMember && checkinOpen && !d.viewerCheckedIn && demoCheckin && (
            <button
              type="button"
              data-testid="plan-demo-checkin"
              disabled={busy}
              onClick={() => void checkIn(q.location)}
              className="mt-2 rounded-pill border border-dashed border-fb-divider px-3 py-1 text-fb-meta font-semibold text-fb-text-2 hover:bg-fb-hover"
            >
              Demo: check in at the spot
            </button>
          )}

          {(q.bubbleText || q.description) && (
            <div className="mt-4 space-y-2">
              <Bubble text={q.bubbleText} />
              {q.description && <p className="text-fb-body text-fb-text">{q.description}</p>}
            </div>
          )}
        </div>
      </Card>

      <Card as="section" padded className="mt-3" flushOnMobile aria-label="Guests">
        <h2 className="text-[17px] font-bold text-fb-text">
          Going <span className="font-normal text-fb-text-2">· {d.memberCount}</span>
        </h2>
        {d.canSeeGuests || guests.length > 0 ? (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="plan-guests">
            {guests.map((p) => (
              <li key={p.id} className="flex min-w-0 items-center gap-2">
                <Avatar src={p.avatarUrl} name={p.name} size={36} decorative />
                <span className="min-w-0">
                  <span className="block truncate text-fb-body font-semibold text-fb-text">{p.id === viewer.id ? 'You' : p.name.split(' ')[0]}</span>
                  <span className="block text-[12px] text-fb-text-2">
                    {p.id === q.hostId ? 'Host' : p.isFriend ? 'Friend' : p.mutualFriendCount ? `${p.mutualFriendCount} mutual` : 'Going'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {!d.canSeeGuests && (
          <p className="mt-1 text-fb-body text-fb-text-2" data-testid="plan-guests-hidden">
            {guests.length > 0 ? 'Only your friends are shown. ' : `${d.memberCount} ${d.memberCount === 1 ? 'person is' : 'people are'} going. `}
            Other names show to the host&apos;s friends and people who join.
          </p>
        )}
      </Card>

      <section className="mt-3" aria-label="Activity">
        <h2 className="mb-2 px-4 text-[17px] font-bold text-fb-text md:px-0">Activity</h2>
        <PlanComposer questId={id} onPosted={() => void postsApi.refetch()} />
        <div className="mt-3 space-y-3" data-testid="plan-posts">
          {postsApi.loading && !postsApi.data && <Skeleton className="h-24 w-full rounded-card" />}
          {postsApi.data && posts.length === 0 && (
            <p className="px-4 text-fb-body text-fb-text-2 md:px-0">No posts yet. Say hi, or share an update for everyone going.</p>
          )}
          {posts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      </section>

      {!isMember && (
        <div className="mt-4 flex justify-center">
          <ReportButton questId={id} onReported={() => setHidden(true)} />
        </div>
      )}
    </div>
  );
}

function PlanComposer({ questId, onPosted }: { questId: string; onPosted: () => void }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await apiPost(`/api/quests/${questId}/posts`, { text: t });
      setText('');
      onPosted();
    } catch {
      toast.show('Your post couldn’t be shared. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card as="section" padded flushOnMobile aria-label="Post an update">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Avatar src={viewer.avatarUrl} name={viewer.name} size={40} decorative />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Post an update</span>
          <input
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say hi or post an update…"
            data-testid="plan-composer"
            className="h-10 w-full rounded-pill bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 hover:bg-fb-secondary-btn"
          />
        </label>
        <Button type="submit" disabled={busy || !text.trim()} data-testid="plan-composer-post">Post</Button>
      </form>
    </Card>
  );
}

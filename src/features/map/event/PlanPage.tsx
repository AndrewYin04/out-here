'use client';
// A plan's own page (Partiful-style): cover, host, time and place, who can see it, live stats
// ("12 going · 3 spots left · 🔴 Live · 5 here"), join and check in, the guest list (friends
// first; strangers see the count only), the host's pop-up, and an activity feed of posts.
import { ArrowLeft, Footprints } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiFetchError, apiPost, useApi, useViewer, type QuestDetail } from '@/features/data';
import { PostCard } from '@/features/fb/feed';
import { useLetsGo } from '@/features/outhere';
import { Avatar, Button, Card, EmptyState, Skeleton, useToast } from '@/features/ui';
import type { LatLng } from '@/shared';
import type { PostView } from '@/shared/api';
import { PlanCard } from './PlanCard';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
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
  const letsGo = useLetsGo();
  const now = useNow();
  const detail = useApi<QuestDetail>(`/api/quests/${id}`, [`quest:${id}`]);
  const postsApi = useApi<{ posts: PostView[] }>(`/api/quests/${id}/posts`, [`quest:${id}`]);
  const [busy, setBusy] = useState(false);
  const [demoCheckin, setDemoCheckin] = useState(false);
  const [hidden, setHidden] = useState(false);

  const d = detail.data && detail.data.quest.id === id ? detail.data : null;
  const q = d?.quest ?? null;


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
  const addMoment = () => {
    document.getElementById('plan-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="plan-composer"]')?.focus(), 400);
  };

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
      <Link href={`/out-here?quest=${q.id}`} data-testid="plan-page-back" className="mb-2 inline-flex min-h-10 items-center gap-1 px-4 text-fb-meta font-semibold text-fb-text-2 hover:underline md:min-h-0 md:px-0">
        <ArrowLeft size={14} aria-hidden /> Back to the map
      </Link>

      <Card as="article" className="overflow-hidden pb-1" flushOnMobile>
        <PlanCard
          d={d}
          viewerId={viewer.id}
          now={now}
          seatsLeft={d.seatsLeft}
          variant="page"
          primary={!isMember ? (
            <Button data-testid="plan-join" disabled={busy || d.seatsLeft === 0} onClick={() => act('join')}>
              {d.seatsLeft === 0 ? 'Full' : 'Join'}
            </Button>
          ) : checkinOpen && !d.viewerCheckedIn ? (
            <Button data-testid="plan-checkin" disabled={busy} onClick={() => void checkIn(null)}>📍 I&apos;m here</Button>
          ) : d.viewerCheckedIn ? (
            <Button variant="tint" onClick={addMoment}>📸 Add a moment</Button>
          ) : (
            <Button icon={<Footprints size={20} />} onClick={() => letsGo(q.id)}>Let&rsquo;s go</Button>
          )}
          below={
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {isMember && d.viewerCheckedIn && (
                <span data-testid="plan-checked-in" className="rounded-pill bg-[#E6F4EA] px-3 py-1 text-fb-meta font-semibold text-fb-green">✓ You&apos;re here</span>
              )}
              {isMember && checkinOpen && !d.viewerCheckedIn && demoCheckin && (
                <button type="button" data-testid="plan-demo-checkin" disabled={busy} onClick={() => void checkIn(q.location)}
                  className="rounded-pill border border-dashed border-fb-divider px-3 py-1 text-fb-meta font-semibold text-fb-text-2 hover:bg-fb-hover">
                  Demo: check in at the spot
                </button>
              )}
              {isMember && (isHost ? (
                <span className="text-[13px] font-semibold text-fb-text-2">You&apos;re hosting</span>
              ) : (
                <button type="button" disabled={busy} onClick={() => act('leave')} className="text-[13px] font-semibold text-fb-text-2 hover:underline disabled:opacity-50">Leave this plan</button>
              ))}
            </div>
          }
          posts={posts}
          onAddMoment={isMember ? addMoment : undefined}
          onReported={() => setHidden(true)}
        />
      </Card>

      <section id="plan-activity" className="mt-3 scroll-mt-16" aria-label="Activity">
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

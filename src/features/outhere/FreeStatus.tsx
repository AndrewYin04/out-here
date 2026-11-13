'use client';
// "Am I free?" and who's free with you:
// - useMyStatus: the viewer's status (Free till X / Free at X / Busy) and actions to change it.
//   Free creates an availability window friends can see; Busy ends them and gives no reason.
// - StatusCard: that status at the top of the "I'm free" composer (+30 min, Busy), updated at once.
// - BothFreeNudge: who's free when you are, the suggested group, and the shared plan once
//   someone in the group started one.
import { ChevronDown, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiFetch, apiPost, useApi, useViewer } from '@/features/data';
import { Avatar, cn } from '@/features/ui';
import {
  DEMO_CENTER, formatDemoTime, freeStatus, freeStatusLabel,
  type Availability, type FreeWithMeResponse, type LatLng, type LocationShare, type FreeStatus, type TogetherResponse, type TogetherView,
} from '@/shared';
import { AVAILABILITY_CHANGED as CHANGED, availabilityChanged, openTogether, usePlanOpen, useTogetherId } from './plan-state';

export function useMyAvailability() {
  const { viewer } = useViewer();
  const api = useApi<{ items: Availability[] }>('/api/availability', [`user:${viewer.id}`]);
  const { refetch } = api;
  useEffect(() => {
    const on = () => { void refetch(); };
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [refetch]);
  return api;
}

/**
 * Re-render every 30 s so "free till" states expire on screen. Callers read the clock fresh at
 * render (a stored Date would be up to 30 s old and make a window that starts now look "later").
 */
function useNowTick(ms = 30_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return tick;
}

// ---- Optimistic status ----
// A tap on Free / Busy / +30 min changes every status UI on the page at once (the I'm free
// button, the composer's status card), then the server write catches up in the background.
// The local value wins until the server says the same thing (or 20 s pass, or the write fails).
type Local = { items: Availability[]; at: number } | null;
let local: Local = null;
const localListeners = new Set<() => void>();
function setLocal(next: Local) { local = next; for (const l of localListeners) l(); }
function useLocal(): Local {
  return useSyncExternalStore((l) => { localListeners.add(l); return () => { localListeners.delete(l); }; }, () => local, () => null);
}
const LOCAL_TTL_MS = 20_000;

function windowOf(start: Date, end: Date, text: string, where: LatLng): Availability {
  return { id: 'local', userId: 'me', text, startsAt: start.toISOString(), endsAt: end.toISOString(), location: where, intent: null, createdAt: new Date().toISOString() };
}

/** The viewer's status and the actions that change it (optimistic). */
export function useMyStatus() {
  useNowTick();
  const mine = useMyAvailability();
  const share = useApi<{ share: LocationShare | null }>('/api/locations/me');
  const override = useLocal();
  const server = mine.data?.items ?? [];
  const serverStatus = freeStatus(server, new Date());
  const localStatus = override ? freeStatus(override.items, new Date()) : null;
  const sameAsServer = !!localStatus && localStatus.kind === serverStatus.kind
    && (localStatus.kind !== 'free' || serverStatus.kind !== 'free' || Math.abs(Date.parse(localStatus.until) - Date.parse(serverStatus.until)) < 90_000);
  const useOverride = !!override && !sameAsServer && Date.now() - override.at < LOCAL_TTL_MS;
  const items = useOverride ? override!.items : server;
  const status = useOverride ? localStatus! : serverStatus;
  const note = items.find((a) => Date.parse(a.endsAt) > Date.now())?.text ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const where: LatLng = share.data?.share?.location ?? DEMO_CENTER;

  const run = useCallback(async (optimistic: Availability[], action: () => Promise<unknown>) => {
    setLocal({ items: optimistic, at: Date.now() });
    setBusy(true);
    setError(null);
    try {
      await action();
      availabilityChanged();
      await mine.refetch();
    } catch {
      setLocal(null);
      setError('Couldn’t update your status. Try again.');
    } finally {
      setBusy(false);
    }
  }, [mine]);

  /** Free from now (or from startMin) for lengthMin minutes, with a note ("hungry"). */
  const setFree = (startMin: number, lengthMin: number, text = 'free') => {
    // "Now" starts a few seconds back so client/server clock skew can't make it "later".
    const start = new Date(Date.now() + (startMin === 0 ? -5_000 : startMin * 60_000));
    const end = new Date(Date.now() + (startMin + lengthMin) * 60_000);
    const t = text.trim() || 'free';
    return run([windowOf(start, end, t, where)], () =>
      apiPost('/api/availability', { text: t, startsAt: start.toISOString(), endsAt: end.toISOString(), location: where }));
  };
  /** +30 min on the current free time, keeping the note. */
  const extend = (minutes = 30) => {
    if (status.kind === 'busy') return setFree(0, minutes, note ?? 'free');
    const start = status.kind === 'free' ? new Date(Date.now() - 5_000) : new Date(status.from);
    const end = new Date(Date.parse(status.until) + minutes * 60_000);
    const t = note ?? 'free';
    return run([windowOf(start, end, t, where)], () =>
      apiPost('/api/availability', { text: t, startsAt: start.toISOString(), endsAt: end.toISOString(), location: where }));
  };
  const setBusyStatus = () => run([], () => apiFetch('/api/availability', { method: 'DELETE' }));
  return { status, note, busy, error, setFree, extend, setBusy: setBusyStatus };
}

export function StatusDot({ s, className }: { s: FreeStatus; className?: string }) {
  return (
    <span aria-hidden className={cn(
      'size-2.5 shrink-0 rounded-full',
      s.kind === 'free' ? 'bg-fb-green' : s.kind === 'later' ? 'border-2 border-fb-green bg-white' : 'bg-fb-text-2',
      className,
    )} />
  );
}

/**
 * Top of the composer when you're free: "● Free till 5:08 PM · hungry", with +30 min and Busy.
 * Busy shows right away and the card goes, so it's clear you're busy. To change your time or
 * note, use the pickers below and "Update status".
 */
export function StatusCard() {
  const { status, note, busy, error, extend, setBusy } = useMyStatus();
  if (status.kind === 'busy') {
    return (
      <div className="px-4 pb-2" data-testid="status-row" data-status="busy">
        <p className="flex items-center gap-2 text-[13px] text-fb-text-2">
          <StatusDot s={status} />
          <span><span className="font-semibold text-fb-text">You’re busy</span> · friends don’t see you as free</span>
        </p>
        {error && <p role="alert" className="mt-1 text-[13px] text-fb-red">{error}</p>}
      </div>
    );
  }
  return (
    <div className="px-4 pb-2" data-testid="status-row" data-status={status.kind}>
      <div className="flex items-center gap-2 rounded-card bg-[#E7F3E8] px-3 py-2">
        <StatusDot key={status.kind} s={status} className={status.kind === 'free' ? 'animate-ping-once' : undefined} />
        <p className="min-w-0 flex-1 text-[14px] leading-5 text-fb-text">
          <span className="block font-semibold">{freeStatusLabel(status)}</span>
          <span className="block truncate text-[12px] text-fb-text-2">{note && note !== 'free' ? `${note} · ` : ''}friends can see it</span>
        </p>
        <button type="button" disabled={busy} onClick={() => void extend(30)}
          className="oh-press h-8 shrink-0 rounded-pill bg-fb-surface px-3 text-[13px] font-semibold text-fb-text shadow-card disabled:opacity-50">
          +30 min
        </button>
        <button type="button" disabled={busy} onClick={() => void setBusy()} data-testid="set-busy"
          className="oh-press h-8 shrink-0 rounded-pill bg-fb-surface px-3 text-[13px] font-semibold text-fb-text shadow-card disabled:opacity-50">
          Busy
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[13px] text-fb-red">{error}</p>}
    </div>
  );
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const first = (name: string) => name.split(' ')[0] ?? name;

function whenText(from: string, until: string): string {
  return Date.parse(from) <= Date.now() + 60_000 ? `free till ${formatDemoTime(until)}` : `free ${formatDemoTime(from)}–${formatDemoTime(until)}`;
}

/**
 * Who's free when you are. The card shows the suggested group ("You, Maya and Liam are all free till
 * 2:31") with Make a plan. "See all" opens the ranked list to pick anyone. The server ranks and
 * picks the group (shared interests, knowing each other, private hang-again signals); nothing
 * private is shown here, only shared interests, who knows whom, and each friend's own note.
 */
export function BothFreeNudge({ className }: { className?: string }) {
  const planOpen = usePlanOpen();
  const tick = useNowTick();
  const { viewer } = useViewer();
  const api = useApi<FreeWithMeResponse>('/api/availability/free-with-me', [`user:${viewer.id}`]);
  const { refetch } = api;
  useEffect(() => {
    const on = () => { void refetch(); };
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [refetch]);
  useEffect(() => { if (tick > 0) void refetch(); }, [tick, refetch]);

  const items = useMemo(() => (api.data?.items ?? []).filter((i) => Date.parse(i.until) > Date.now()), [api.data]);
  const groupKey = (api.data?.group ?? []).join(',');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const dismissalKey = `outhere:free-nudge-hidden:${viewer.id}`;
  const [sessionDismissed, setSessionDismissed] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSessionDismissed(window.sessionStorage.getItem(dismissalKey) ? dismissalKey : null);
    } catch { /* Dismissal still works for the mounted card. */ }
  }, [dismissalKey]);
  // A new suggestion from the server resets the selection to it.
  useEffect(() => { setPicked(new Set(groupKey ? groupKey.split(',') : [])); }, [groupKey]);

  // Shared plans: one per group, so whoever taps first starts it and everyone else opens the same one.
  const togetherOpenId = useTogetherId();
  const shared = useApi<{ plans: TogetherView[] }>('/api/together', [`user:${viewer.id}`]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const start = async (friendIds: string[]) => {
    setStarting(true);
    setStartError(null);
    try {
      const r = await apiPost<TogetherResponse>('/api/together', { friendIds });
      openTogether(r.plan.id);
      void shared.refetch();
    } catch {
      setStartError('Muse couldn’t reach everyone just now. Try again.');
    } finally {
      setStarting(false);
    }
  };

  const live = shared.data?.plans ?? [];
  const pending = live.find((p) => p.status === 'proposing');
  const done = live.find((p) => p.status === 'confirmed');

  if (planOpen || togetherOpenId) return null;
  if (pending) return <SharedBanner key={`${pending.id}:${(pending.votes[viewer.id] ?? []).length > 0}`} plan={pending} viewerId={viewer.id} className={className} />;
  if (done && hidden !== done.id) return <SharedBanner key={`${done.id}:confirmed`} plan={done} viewerId={viewer.id} className={className} onHide={() => setHidden(done.id)} />;
  if (items.length === 0 || sessionDismissed === dismissalKey) return null;
  const byId = new Map(items.map((i) => [i.friend.id, i]));
  const group = (api.data?.group ?? []).flatMap((id) => byId.get(id) ?? []);
  const lead = group.length > 0 ? group : [items[0]];
  const until = lead.map((g) => g.until).sort()[0];
  const leadNames = lead.map((g) => first(g.friend.name));
  const title = lead.length === 1
    ? `You and ${leadNames[0]} are both ${whenText(lead[0].from, until)}`
    : `You, ${names(leadNames)} are all ${whenText(lead[0].from, until)}`;
  const knowEachOther = lead.length > 1 && lead.every((g, i) => i === 0 || lead[0].knows.includes(g.friend.id));
  const sub = knowEachOther
    ? `${names(leadNames)} know each other`
    : lead[0].text && lead[0].text !== 'free' ? `“${lead[0].text}”` : `${leadNames[0]} shared they’re free`;
  const others = items.length - lead.length;
  const chosen = items.filter((i) => picked.has(i.friend.id));
  const plan = (people: typeof items) => { if (!starting) void start(people.map((p) => p.friend.id)); };
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dismiss = () => {
    setSessionDismissed(dismissalKey);
    try {
      window.sessionStorage.setItem(dismissalKey, '1');
    } catch { /* The card still hides when browser storage is unavailable. */ }
  };

  return (
    <div role="region" aria-label="Friends free when you are" data-testid="both-free"
      className={cn('rounded-card bg-fb-surface shadow-popover motion-safe:animate-drop-in', className)}>
      <div className="flex items-center gap-3 p-2.5 pr-2">
        <span className="flex shrink-0 -space-x-3">
          {lead.slice(0, 3).map((g) => (
            <span key={g.friend.id} className="rounded-full ring-[3px] ring-fb-green">
              <Avatar src={g.friend.avatarUrl} name={g.friend.name} size={36} decorative className="ring-2 ring-white" />
            </span>
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-5 text-fb-text" data-testid="both-free-title">{title}</p>
          <p className="truncate text-[12px] text-fb-text-2">{sub}</p>
        </div>
        {!expanded && (
          <button type="button" onClick={() => plan(lead)} disabled={starting} data-testid="free-see-plans"
            className="h-9 shrink-0 oh-press rounded-btn bg-fb-blue px-3 text-[14px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-70">
            {starting ? 'Asking…' : 'See plans'}
          </button>
        )}
        <button type="button" aria-label="Hide" onClick={dismiss}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover">
          <X size={18} aria-hidden />
        </button>
      </div>

      {(others > 0 || lead.length > 1) && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)} data-testid="free-see-all"
          className="flex w-full items-center justify-center gap-1 border-t border-fb-divider-soft py-1.5 text-[13px] font-semibold text-fb-blue hover:bg-fb-hover">
          {expanded ? 'Show less' : `See everyone free · ${items.length}`}
          <ChevronDown size={16} aria-hidden className={cn('transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {expanded && (
        <div className="border-t border-fb-divider-soft">
          <ul className="max-h-[38vh] overflow-y-auto py-1" data-testid="free-list">
            {items.map((i, rank) => {
              const on = picked.has(i.friend.id);
              const knows = i.knows.flatMap((id) => { const k = byId.get(id); return k ? [first(k.friend.name)] : []; });
              const why = [
                whenText(i.from, i.until),
                i.sharedInterests.length > 0 ? `likes ${i.sharedInterests.slice(0, 2).join(', ')}` : null,
                knows.length > 0 ? `knows ${names(knows.slice(0, 2))}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <li key={i.friend.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-fb-hover">
                    <input type="checkbox" checked={on} onChange={() => toggle(i.friend.id)} className="size-4 shrink-0 accent-fb-blue"
                      aria-label={`Include ${i.friend.name}`} />
                    <span className="w-4 shrink-0 text-center text-[12px] font-semibold text-fb-text-2 tabular-nums">{rank + 1}</span>
                    <span className={cn('rounded-full ring-2', i.freeNow ? 'ring-fb-green' : 'ring-fb-divider')}>
                      <Avatar src={i.friend.avatarUrl} name={i.friend.name} size={32} decorative />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-fb-text">{i.friend.name}</span>
                      <span className="block truncate text-[12px] text-fb-text-2">{why}</span>
                      {i.text && i.text !== 'free' && <span className="block truncate text-[12px] italic text-fb-text-2">“{i.text}”</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-fb-divider-soft p-2.5">
            <button type="button" disabled={chosen.length === 0 || starting} onClick={() => plan(chosen)} data-testid="free-make-plan"
              className="h-10 w-full rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
              {starting ? 'Muse is asking everyone…' : chosen.length === 0 ? 'Pick who to plan with' : `See plans with ${names(chosen.map((c) => first(c.friend.name)))}`}
            </button>
          </div>
        </div>
      )}
      {startError && <p role="alert" className="px-3 pb-2 text-[13px] text-fb-red">{startError}</p>}
    </div>
  );
}

/**
 * The group's shared plan, once someone started it: "Maya started a plan for you two · See plans",
 * "Waiting on Maya", or "It's a plan: Dumplings with Maya". Who is in for what shows only inside.
 */
function SharedBanner({ plan, viewerId, className, onHide }: { plan: TogetherView; viewerId: string; className?: string; onHide?: () => void }) {
  const others = plan.members.filter((m) => m.id !== viewerId);
  const who = names(others.map((m) => first(m.name)));
  const iVoted = (plan.votes[viewerId] ?? []).length > 0;
  const starter = plan.members.find((m) => m.id === plan.startedBy);
  const confirmed = plan.status === 'confirmed' ? plan.options.find((o) => o.questId === plan.confirmedQuestId) : null;
  const title = confirmed
    ? `It’s a plan: ${confirmed.emoji} ${confirmed.title}`
    : plan.startedBy !== viewerId && !iVoted && starter
      ? `${first(starter.name)} started a plan for you ${others.length === 1 ? 'two' : 'all'}`
      : iVoted ? `Waiting on ${who}…` : `Your plan with ${who}`;
  const sub = confirmed
    ? `With ${who} · ${confirmed.venueName} · ${formatDemoTime(confirmed.startsAt)}`
    : `Muse picked ${plan.options.length} ${plan.options.length === 1 ? 'option' : 'options'} that fit ${others.length === 1 ? 'both of you' : 'all of you'}`;
  return (
    <div role="region" aria-label="Your shared plan" data-testid="shared-banner"
      className={cn('flex animate-drop-in items-center gap-3 rounded-card bg-fb-surface p-2.5 pr-2 shadow-popover', className)}>
      <span className="flex shrink-0 -space-x-3">
        {others.slice(0, 3).map((m) => (
          <span key={m.id} className="rounded-full ring-[3px] ring-fb-green">
            <Avatar src={m.avatarUrl} name={m.name} size={36} decorative className="ring-2 ring-white" />
          </span>
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-5 text-fb-text" data-testid="shared-banner-title">{title}</p>
        <p className="truncate text-[12px] text-fb-text-2">{sub}</p>
      </div>
      <button type="button" onClick={() => openTogether(plan.id)}
        className="h-9 shrink-0 oh-press rounded-btn bg-fb-blue px-3 text-[14px] font-semibold text-white hover:bg-fb-blue-hover">
        {confirmed ? 'Open' : iVoted ? 'Open' : 'See plans'}
      </button>
      {onHide && (
        <button type="button" aria-label="Hide" onClick={onHide}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover">
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}

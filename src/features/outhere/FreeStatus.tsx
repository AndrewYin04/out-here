'use client';
// Step 1 and the start of step 2 of the loop:
// - StatusPill: the viewer's status (Free till X / Free at X / Busy) and a menu to change it.
//   Free and Free later create an availability window friends can see; Busy ends them.
// - BothFreeNudge: "You and Maya are both free till 12:10" when the viewer's window overlaps a
//   friend's, with "Make a plan" opening the composer for the two of them.
import { ChevronDown, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiPost, useApi, useViewer } from '@/features/data';
import { Avatar, cn } from '@/features/ui';
import {
  DEMO_CENTER, formatDemoTime, freeStatus, freeStatusLabel,
  type Availability, type FreeWithMeResponse, type LatLng, type LocationShare, type FreeStatus,
} from '@/shared';
import { AVAILABILITY_CHANGED as CHANGED, availabilityChanged, openPlanWith, usePlanOpen } from './plan-state';

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

const NOW_OPTIONS = [{ label: '30 min', min: 30 }, { label: '1 hr', min: 60 }, { label: '2 hr', min: 120 }] as const;
const LATER_OPTIONS = [{ label: 'in 30 min', min: 30 }, { label: 'in 1 hr', min: 60 }, { label: 'in 2 hr', min: 120 }] as const;
const LATER_LENGTH_MIN = 60;

function Dot({ s }: { s: FreeStatus }) {
  return (
    <span aria-hidden className={cn(
      'size-2.5 shrink-0 rounded-full',
      s.kind === 'free' ? 'bg-fb-green' : s.kind === 'later' ? 'border-2 border-fb-green bg-white' : 'bg-fb-text-2',
    )} />
  );
}

export function StatusPill({ className }: { className?: string }) {
  const planOpen = usePlanOpen();
  useNowTick();
  const mine = useMyAvailability();
  const share = useApi<{ share: LocationShare | null }>('/api/locations/me');
  const status = freeStatus(mine.data?.items ?? [], new Date());
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open]);

  const where: LatLng = share.data?.share?.location ?? DEMO_CENTER;

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      availabilityChanged();
      await mine.refetch();
      setOpen(false);
    } catch {
      setError('Couldn’t update your status. Try again.');
    } finally {
      setBusy(false);
    }
  }, [mine]);

  const setFree = (startMin: number, lengthMin: number) => run(() => {
    // "Now" starts a few seconds back so client/server clock skew can't make it "later".
    const start = new Date(Date.now() + (startMin === 0 ? -5_000 : startMin * 60_000));
    const end = new Date(Date.now() + (startMin + lengthMin) * 60_000);
    return apiPost('/api/availability', {
      text: note.trim() || 'free', startsAt: start.toISOString(), endsAt: end.toISOString(), location: where,
    });
  });
  const setBusyStatus = () => run(() => apiFetch('/api/availability', { method: 'DELETE' }));

  if (planOpen) return null;
  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        type="button"
        data-testid="status-pill"
        data-status={status.kind}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-pill bg-fb-surface px-3 text-[14px] font-semibold text-fb-text shadow-card hover:bg-fb-hover"
      >
        <Dot s={status} />
        {freeStatusLabel(status)}
        <ChevronDown size={16} aria-hidden className="text-fb-text-2" />
      </button>

      {open && (
        <div role="menu" aria-label="Your status" data-testid="status-menu"
          className="absolute bottom-full left-1/2 mb-2 w-[300px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-card bg-fb-surface p-3 shadow-popover">
          <p className="text-[13px] text-fb-text-2">Friends you share with see this on their map. Busy shows no reason.</p>
          <label htmlFor="status-note" className="mt-3 block text-[13px] font-semibold text-fb-text">Up for anything? (optional)</label>
          <input id="status-note" value={note} maxLength={80} placeholder="hungry, coffee, a walk…" onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[14px] outline-none focus:border-fb-blue" />

          <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold"><Dot s={{ kind: 'free', until: '' }} />Free now for</p>
          <div className="mt-1 flex gap-2">
            {NOW_OPTIONS.map((o) => (
              <button key={o.min} type="button" role="menuitem" aria-label={`Free now for ${o.label}`} disabled={busy} onClick={() => void setFree(0, o.min)}
                className="h-8 flex-1 rounded-pill bg-fb-blue-tint text-[13px] font-semibold text-fb-blue hover:brightness-95 disabled:opacity-50">
                {o.label}
              </button>
            ))}
          </div>

          <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold"><Dot s={{ kind: 'later', from: '', until: '' }} />Free later, for an hour</p>
          <div className="mt-1 flex gap-2">
            {LATER_OPTIONS.map((o) => (
              <button key={o.min} type="button" role="menuitem" aria-label={`Free ${o.label} for an hour`} disabled={busy} onClick={() => void setFree(o.min, LATER_LENGTH_MIN)}
                className="h-8 flex-1 rounded-pill bg-fb-secondary-btn text-[13px] font-semibold text-fb-text hover:brightness-95 disabled:opacity-50">
                {o.label}
              </button>
            ))}
          </div>

          <button type="button" role="menuitem" disabled={busy || status.kind === 'busy'} onClick={() => void setBusyStatus()}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-btn bg-fb-secondary-btn text-[14px] font-semibold text-fb-text hover:brightness-95 disabled:opacity-50">
            <Dot s={{ kind: 'busy' }} />{status.kind === 'busy' ? 'You’re busy' : 'Set to busy'}
          </button>
          {error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{error}</p>}
        </div>
      )}
    </div>
  );
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const first = (name: string) => name.split(' ')[0] ?? name;

function whenText(from: string, until: string): string {
  return Date.parse(from) <= Date.now() + 60_000 ? `free till ${formatDemoTime(until)}` : `free ${formatDemoTime(from)}–${formatDemoTime(until)}`;
}

/**
 * Who's free when you are. Collapsed: the suggested group ("You, Maya and Liam are all free till
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
  // A new suggestion from the server resets the selection to it.
  useEffect(() => { setPicked(new Set(groupKey ? groupKey.split(',') : [])); }, [groupKey]);

  if (planOpen || items.length === 0 || hidden === groupKey) return null;
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
  const plan = (people: typeof items) => openPlanWith(`with ${names(people.map((p) => first(p.friend.name)))}, `);
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div role="region" aria-label="Friends free when you are" data-testid="both-free" className={cn('rounded-card bg-fb-surface shadow-popover', className)}>
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
          <button type="button" onClick={() => plan(lead)}
            className="h-9 shrink-0 rounded-btn bg-fb-blue px-3 text-[14px] font-semibold text-white hover:bg-fb-blue-hover">
            Make a plan
          </button>
        )}
        <button type="button" aria-label="Hide" onClick={() => setHidden(groupKey)}
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
            <button type="button" disabled={chosen.length === 0} onClick={() => plan(chosen)} data-testid="free-make-plan"
              className="h-10 w-full rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
              {chosen.length === 0 ? 'Pick who to invite' : `Make a plan with ${names(chosen.map((c) => first(c.friend.name)))}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

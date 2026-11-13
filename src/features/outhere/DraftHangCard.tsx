'use client';
// Nothing posted fits, but a friend is free with you: Muse drafts a plan for the two of you, and
// one tap makes it (a private hangout with you in it, and the friend invited with Muse's message).

import { Check, Clock, Footprints, MapPin, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiPost, useQuest } from '@/features/data';
import { Avatar, burst, cn } from '@/features/ui';
import { formatDemoTime, type PersonCard, type Quest } from '@/shared';
import type { HangDraft } from '@/features/muse';
import { beginMuseActivity, finishMuseActivity } from '@/features/muse-companion';
import { useLetsGo } from './lets-go';
import { errorText } from './plan-api';
import { setPlanOpen } from './plan-state';
import { MuseLabel, OfflineLabel } from './SuggestionCard';

type DraftResponse = { draft: HangDraft | null; friend: PersonCard | null; others?: PersonCard[]; reason?: string; mode?: 'live' | 'mock' | 'fallback' };
type State =
  | { kind: 'loading' }
  | { kind: 'draft'; draft: HangDraft; friend: PersonCard; live: boolean; others: PersonCard[] }
  | { kind: 'none' }
  | { kind: 'made'; draft: HangDraft; friend: PersonCard; questId: string };

const first = (name: string) => name.split(' ')[0] ?? name;

const DRAFT_TIMEOUT_MS = 12_000;
class DraftTimeout extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new DraftTimeout('draft timed out')), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}

/**
 * Renders nothing when no friend is free or no place fits (the caller's empty state stays).
 * `onNone` lets the caller show its own empty card in that case.
 */
export function DraftHangCard({ ask, budgetMax, onNone }: { ask: string; budgetMax: number | null; onNone: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef<string[]>([]);
  const request=useRef<AbortController|null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const letsGo = useLetsGo();

  /** `another`: a different place with the same friend. `friendId`: redraft with that friend. */
  const load = useCallback(async (another: boolean, friendId?: string) => {
    request.current?.abort();
    const ctrl=new AbortController();request.current=ctrl;
    const activity=beginMuseActivity({owner:'draft-hang',source:'draft-hang',target:'draft-hang',pending:'Finding another idea…',signal:ctrl.signal});
    setError(null);
    if (friendId) tried.current = [];
    if (another) setBusy(true); else setState({ kind: 'loading' });
    try {
      const res = await apiFetch<DraftResponse>('/api/muse/draft-hang', {method:'POST',body:JSON.stringify({ text: ask, budgetMax, excludePlaceIds: tried.current, friendId }),signal:ctrl.signal});
      if(ctrl.signal.aborted)return;
      finishMuseActivity(activity,{outcome:res.draft&&res.friend?'success':'empty',message:res.draft?'Your draft is ready to review.':'No other spots fit right now.',live:res.mode==='live'});
      const live = res.mode === 'live';
      if (res.draft && res.friend) {
        tried.current = [...tried.current, res.draft.placeId];
        setState({ kind: 'draft', draft: res.draft, friend: res.friend, live, others: res.others ?? [] });
      } else if (another) {
        setError('That was the only spot that fits right now.');
      } else {
        setState({ kind: 'none' }); onNone();
      }
    } catch {
      if(ctrl.signal.aborted)return;
      finishMuseActivity(activity,{outcome:'error',message:'The request did not finish. Try again.'});
      if (another) setError('Muse couldn’t find another one. Try again in a moment.');
      else { setState({ kind: 'none' }); onNone(); }
    } finally {
      if(!ctrl.signal.aborted)setBusy(false);
    }
  }, [ask, budgetMax, onNone]);

  useEffect(() => { tried.current = []; void load(false);return()=>request.current?.abort(); }, [load]);

  const make = async () => {
    if (state.kind !== 'draft') return;
    const { draft: d, friend } = state;
    setBusy(true); setError(null);
    try {
      const { quest } = await apiPost<{ quest: Quest }>('/api/quests', {
        title: d.title, emoji: d.emoji, category: d.category, description: d.description,
        venueName: d.venueName, location: d.location, placeId: d.placeId,
        startsAt: d.startsAt, endsAt: d.endsAt, capacity: 4, priceMax: d.priceMax, tags: [],
        visibility: 'friends', inviteIds: [friend.id], inviteMessage: d.invite,
      });
      setState({ kind: 'made', draft: d, friend, questId: quest.id });
      requestAnimationFrame(() => burst(cardRef.current, [d.emoji, '✨', '🎉'], 10));
    } catch (e) {
      setError(errorText(e, 'Couldn’t make the plan. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'none') return null;

  if (state.kind === 'loading') {
    return (
      <div data-testid="draft-hang-loading" aria-live="polite" className="animate-rise rounded-card bg-fb-surface p-3 shadow-card">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-fb-text">
          <Sparkles size={18} className="animate-pulse text-fb-blue" aria-hidden />
          Muse is drafting a plan for you two…
        </p>
        <p className="mt-1 text-[13px] text-fb-text-2">Checking what’s open, what you both like, and the walk for each of you.</p>
        <div className="mt-3 h-16 animate-pulse rounded-[10px] bg-fb-bg" />
      </div>
    );
  }

  const { draft: d, friend } = state;
  const fname = first(friend.name);
  const made = state.kind === 'made';

  return (
    <div ref={cardRef} data-testid="draft-hang" data-state={state.kind}
      className={cn('animate-rise overflow-hidden rounded-card bg-fb-surface shadow-card ring-1', made ? 'ring-[#31A24C]/40' : 'ring-fb-blue/25')}>
      <div className="flex items-center gap-2 px-3 pt-3">
        {state.kind === 'draft' && !state.live ? <OfflineLabel /> : <MuseLabel />}
        <span className="text-[13px] text-fb-text-2">{made ? `Plan made · ${fname}’s invited` : `drafted a plan for you and ${fname}`}</span>
      </div>

      <div className="flex items-start gap-3 px-3 pt-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-fb-blue-tint text-[26px]">{d.emoji}</span>
        <div className="min-w-0 flex-1">
          <p data-testid="draft-hang-title" className="text-[17px] font-bold leading-[22px] text-fb-text">{d.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-fb-text-2">
            <Avatar src={friend.avatarUrl} name={friend.name} size={20} decorative />
            with {fname}
          </p>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 text-[13px] text-fb-text">
        <li className="flex min-w-0 items-center gap-1.5"><MapPin size={15} className="shrink-0 text-fb-text-2" aria-hidden /><span className="truncate">{d.venueName}</span></li>
        <li className="flex items-center gap-1.5"><Clock size={15} className="shrink-0 text-fb-text-2" aria-hidden />{formatDemoTime(d.startsAt)}</li>
        <li className="flex items-center gap-1.5"><Footprints size={15} className="shrink-0 text-fb-text-2" aria-hidden />{d.myWalk} min · {fname} {d.theirWalk}</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="w-[15px] text-center text-fb-text-2">$</span>{d.priceMax > 0 ? `About $${d.priceMax}` : 'Free'}</li>
      </ul>

      {d.pitch && <p data-testid="draft-hang-why" className="mx-3 mt-3 text-[14px] leading-5 text-fb-text">{d.pitch}</p>}

      {d.invite && !made && (
        <div className="mx-3 mt-2 rounded-[12px] bg-fb-bg px-3 py-2">
          <p className="text-[12px] font-semibold text-fb-text-2">{fname} gets</p>
          <p data-testid="draft-hang-invite" className="text-[14px] leading-5 text-fb-text">“{d.invite}”</p>
        </div>
      )}

      {error && <p role="alert" className="mx-3 mt-2 text-[13px] text-fb-red">{error}</p>}

      {state.kind === 'draft' && state.others.length > 0 && (
        <div className="mx-3 mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-fb-text-2">
          <span>Or plan with</span>
          {state.others.map((p) => (
            <button key={p.id} type="button" data-testid="draft-hang-with" disabled={busy}
              onClick={() => void load(true, p.id)}
              className="oh-press inline-flex h-7 items-center gap-1 rounded-full bg-fb-secondary-btn pl-0.5 pr-2.5 font-semibold text-fb-text disabled:opacity-60">
              <Avatar src={p.avatarUrl} name={p.name} size={24} decorative />{first(p.name)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 p-3">
        {!made ? (
          <>
            <button type="button" data-testid="draft-hang-make" disabled={busy} onClick={() => void make()}
              className="oh-press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-60">
              {busy ? 'Making it…' : 'Make this plan'}
            </button>
            <button type="button" data-testid="draft-hang-another" disabled={busy} onClick={() => void load(true)} aria-label="Another idea"
              className="oh-press inline-flex h-10 items-center gap-1.5 rounded-btn bg-fb-secondary-btn px-3 text-[14px] font-semibold text-fb-text disabled:opacity-60">
              <RefreshCw size={16} aria-hidden />Another
            </button>
          </>
        ) : (
          <>
            <MadeStatus questId={state.questId} friendId={state.friend.id} fname={fname} />
            <button type="button" data-testid="draft-hang-go" onClick={() => { setPlanOpen(false); letsGo(state.questId); }}
              className="oh-press inline-flex h-10 items-center gap-1.5 rounded-btn bg-fb-blue px-4 text-[15px] font-semibold text-white hover:bg-fb-blue-hover">
              <Footprints size={18} aria-hidden />Let’s go
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** "Waiting on Maya" until she accepts, then "Maya's in": the quest:<id> message refetches it live. */
function MadeStatus({ questId, friendId, fname }: { questId: string; friendId: string; fname: string }) {
  const q = useQuest(questId);
  const joined = q.data?.quest.memberIds.includes(friendId) ?? false;
  return (
    <p data-testid="draft-hang-status" data-joined={joined ? 'true' : undefined}
      className="flex flex-1 items-center gap-1.5 text-[14px] font-semibold text-[#31A24C]">
      <Check size={18} aria-hidden />{joined ? `${fname}’s in · it’s a plan` : `You’re in · waiting on ${fname}`}
    </p>
  );
}

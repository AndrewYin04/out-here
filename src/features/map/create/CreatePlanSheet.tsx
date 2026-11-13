'use client';
// "Post a plan": the host drops a pin (long-press or ＋), optionally lets Muse draft the plan
// from one line, picks who can see it, adds a pop-up (poster, text bubble) and taps Post.
// Muse fills the form; the human always posts. Non-modal so the map and the pin stay visible.
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ImagePlus, Mic, Minus, Plus, Sparkles, Sticker, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiFetchError, apiPost, currentPersona, uploadImage, useApi } from '@/features/data';
import { beginMuseActivity, finishMuseActivity } from '@/features/muse-companion';
import { MuseLabel } from '@/features/outhere';
import { Avatar, Button, CategoryIcon, Chip, IconButton, cn } from '@/features/ui';
import { DEMO_TZ, type LatLng, type Quest, type QuestCategory, type QuestVisibility } from '@/shared';
import type { GroupView, MuseCreateQuestResponse } from '@/shared/api';
import type { FriendFace } from '../types';
import { VISIBILITY_OPTIONS } from '../visibility';
import { clockValue, inMinutes, nextAtClock } from './time';

const CATEGORIES: { value: QuestCategory; label: string }[] = [
  { value: 'food', label: 'Food & drinks' }, { value: 'sports', label: 'Sports' }, { value: 'outdoors', label: 'Outdoors' },
  { value: 'music', label: 'Music' }, { value: 'art', label: 'Art' }, { value: 'games', label: 'Games' },
  { value: 'study', label: 'Study' }, { value: 'thrift', label: 'Thrifting' }, { value: 'other', label: 'Other' },
];
const DURATIONS = [30, 60, 90, 120, 180];
const BUBBLE_MAX = 80;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;

type MuseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; pitch: string; mode: 'live' | 'mock' | 'fallback' }
  | { status: 'error'; message: string };

export type CreatePlanSheetProps = {
  /** Where the draft pin is now (the host can drag it on the map). */
  at: LatLng;
  friends: FriendFace[];
  /** Muse moved the plan to a real place: move the draft pin there. */
  onMove: (at: LatLng) => void;
  /** The type changed: the draft pin shows its icon. */
  onCategory: (category: QuestCategory) => void;
  onClose: () => void;
  onPosted: (quest: Quest) => void;
};

/** "Tomorrow" when the start is not today in Menlo Park, else null. */
function dayLabel(iso: string): string | null {
  const day = (d: Date) => d.toLocaleDateString('en-US', { timeZone: DEMO_TZ });
  return day(new Date(iso)) === day(new Date()) ? null : 'Tomorrow';
}

const sameSpot = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

async function requestDraft(text: string, at: LatLng, signal: AbortSignal): Promise<MuseCreateQuestResponse & { mode: 'live' | 'mock' | 'fallback' }> {
  const res = await fetch('/api/muse/create-quest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona': currentPersona() },
    body: JSON.stringify({ text, location: at }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as MuseCreateQuestResponse & { error?: string };
  if (!res.ok) throw new ApiFetchError(res.status, data.error ?? `HTTP ${res.status}`);
  const h = res.headers.get('x-muse-mode');
  return { ...data, mode: h === 'mock' ? 'mock' : h === 'fallback' ? 'fallback' : 'live' };
}

export function CreatePlanSheet({ at, friends, onMove, onCategory, onClose, onPosted }: CreatePlanSheetProps) {
  const [line, setLine] = useState('');
  const [muse, setMuse] = useState<MuseState>({ status: 'idle' });
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📍');
  const [category, setCategory] = useState<QuestCategory>('other');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => inMinutes(new Date(), 30).toISOString());
  const [duration, setDuration] = useState(60);
  const [capacity, setCapacity] = useState(6);
  const [venueName, setVenueName] = useState('Dropped pin');
  const [place, setPlace] = useState<{ id: string; at: LatLng } | null>(null);
  const [priceMax, setPriceMax] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<QuestVisibility>('community');
  const [groupId, setGroupId] = useState<string>('');
  const [invites, setInvites] = useState<Set<string>>(new Set());
  const [poster, setPoster] = useState<{ local: string; url: string | null; error: string | null } | null>(null);
  const [bubble, setBubble] = useState('');
  const [posting, setPosting] = useState(false);
  // A double tap lands before `posting` re-renders; the ref makes the second tap a no-op.
  const postingRef = useRef(false);
  const [step, setStep] = useState(0);
  const [pipPicks, setPipPicks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  const groups = useApi<{ groups: GroupView[] }>('/api/groups?filter=mine');
  const myGroups = useMemo(() => groups.data?.groups ?? [], [groups.data]);
  useEffect(() => {
    if (visibility === 'group' && !groupId && myGroups.length > 0) setGroupId(myGroups[0].id);
  }, [visibility, groupId, myGroups]);

  useEffect(() => { lineRef.current?.focus(); }, []);
  // Escape closes the sheet while it is still empty; once you've typed or added a poster it stays,
  // so a stray key never throws a draft away (the X still closes it).
  const pristine = !line.trim() && !title.trim() && !poster && !bubble.trim() && !description.trim();
  useEffect(() => {
    if (!pristine) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pristine, onClose]);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => { onCategory(category); }, [category, onCategory]);
  // The host dragged the pin away from Muse's place: the plan is at the pin now.
  useEffect(() => {
    if (place && !sameSpot(place.at, at)) { setPlace(null); setVenueName('Dropped pin'); }
  }, [at, place]);
  useEffect(() => () => { if (poster?.local) URL.revokeObjectURL(poster.local); }, [poster?.local]);

  const draftWithMuse = async () => {
    const t = line.trim();
    if (t.length < 2 || muse.status === 'loading') return;
    inFlight.current?.abort();
    const ctrl = new AbortController();
    const owner=currentPersona();
    inFlight.current = ctrl;
    setMuse({ status: 'loading' });
    const activity=beginMuseActivity({owner:'create-plan',source:'create-quest',target:'create-plan-sheet',pending:'Drafting your plan…',signal:ctrl.signal});
    try {
      const r = await requestDraft(t, at, ctrl.signal);
      if (ctrl.signal.aborted || owner!==currentPersona()) return;
      const d = r.draft;
      setTitle(d.title); setEmoji(d.emoji); setCategory(d.category); setDescription(d.description);
      setStartsAt(d.startsAt);
      setDuration(Math.max(15, Math.round((Date.parse(d.endsAt) - Date.parse(d.startsAt)) / 60_000)));
      setCapacity(d.capacity); setPriceMax(d.priceMax); setTags(d.tags); setVenueName(d.venueName);
      if (d.bubbleText) setBubble(d.bubbleText.slice(0, BUBBLE_MAX));
      if (d.placeId) { setPlace({ id: d.placeId, at: d.location }); onMove(d.location); }
      setMuse({ status: 'done', pitch: r.pitch, mode: r.mode });
      finishMuseActivity(activity,{outcome:'success',message:'Your draft is ready to review.',live:r.mode==='live'});
    } catch (e) {
      if (ctrl.signal.aborted || owner!==currentPersona()) return;
      finishMuseActivity(activity,{outcome:'error',message:'The draft did not finish. You can fill it in below.'});
      setMuse({ status: 'error', message: e instanceof Error ? e.message : 'Muse could not draft this. Fill it in below.' });
    }
  };

  const pickPoster = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('The poster has to be an image.'); return; }
    if (file.size > MAX_POSTER_BYTES) { setError('That image is over 8 MB.'); return; }
    setError(null);
    const local = URL.createObjectURL(file);
    setPoster({ local, url: null, error: null });
    uploadImage(file)
      .then((url) => setPoster((p) => (p?.local === local ? { ...p, url } : p)))
      .catch((e: unknown) => setPoster((p) => (p?.local === local ? { ...p, error: e instanceof Error ? e.message : 'Upload failed' } : p)));
  };

  const toggleInvite = (id: string) => setInvites((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const uploading = !!poster && !poster.url && !poster.error;
  const missing = !title.trim() ? 'Add a title'
    : !venueName.trim() ? 'Add where it is'
      : visibility === 'group' && !groupId ? 'Pick a group'
        : visibility === 'friends' && invites.size === 0 ? 'Pick at least one friend'
          : uploading ? 'Poster is uploading…' : null;

  const post = async () => {
    if (missing || posting || postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    const start = new Date(startsAt);
    try {
      const { quest } = await apiPost<{ quest: Quest }>('/api/quests', {
        title: title.trim(), emoji: emoji.trim() || '📍', category, description: description.trim(),
        venueName: venueName.trim(), location: place?.at ?? at, placeId: place?.id ?? null,
        startsAt: start.toISOString(), endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
        capacity, priceMax, tags, visibility,
        groupId: visibility === 'group' ? groupId : null,
        inviteIds: visibility === 'friends' ? [...invites] : [],
        posterUrl: poster?.url ?? null, bubbleText: bubble.trim() || null,
      });
      onPosted(quest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the plan. Try again.');
      postingRef.current = false;
      setPosting(false);
    }
  };

  const now = new Date();
  const startChip = (mins: number) => {
    const target = inMinutes(now, mins).getTime();
    return Math.abs(Date.parse(startsAt) - target) < 5 * 60_000;
  };
  const clockChip = (mins: number) => {
    const d = inMinutes(now, mins);
    return d.toLocaleTimeString('en-US', { timeZone: DEMO_TZ, hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
  };
  const togglePipPicks = () => {
    const next = !pipPicks;
    setPipPicks(next);
    if (next) {
      setVisibility('friends'); setGroupId('');
      setInvites(new Set(friends.slice(0, Math.max(1, Math.min(4, capacity - 1))).map((f) => f.id)));
    }
  };
  const stepTitle = step === 0 ? (title.trim() || 'New plan') : step === 1 ? "Who's invited" : 'Add a cover';
  const canNext = step === 0 ? !!title.trim() && !!venueName.trim() : true;

  return (
    <section
      aria-label="Post a plan"
      data-testid="create-plan-sheet"
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex max-h-[82%] flex-col rounded-t-[24px] bg-fb-surface shadow-popover',
        'md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-card',
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fb-divider md:hidden" aria-hidden />
      <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2">
        {step > 0 ? (
          <button type="button" data-testid="create-back" aria-label="Back" onClick={() => setStep((v) => v - 1)}
            className="oh-press flex size-9 items-center justify-center rounded-full hover:bg-fb-hover">
            <ArrowLeft size={20} aria-hidden />
          </button>
        ) : <span className="size-9" aria-hidden />}
        <h2 className="min-w-0 flex-1 truncate text-center text-[19px] font-bold text-fb-text">{stepTitle}</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn('h-2 rounded-full transition-all', i === step ? 'w-5 bg-fb-blue' : 'w-2 bg-fb-divider')} />
            ))}
          </div>
          <IconButton label="Close" size="md" onClick={onClose}><X size={20} aria-hidden /></IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {step === 0 && (
          <>
            <form
              className="mt-1 rounded-card bg-fb-blue-tint p-2"
              onSubmit={(e) => { e.preventDefault(); void draftWithMuse(); }}
            >
              <label htmlFor="create-line" className="mb-1 block px-1 text-[13px] font-semibold text-fb-text">
                Describe it in one line
              </label>
              <div className="flex gap-2">
                <input
                  id="create-line"
                  ref={lineRef}
                  data-testid="create-muse-input"
                  value={line}
                  maxLength={200}
                  placeholder="boba after class at 4"
                  onChange={(e) => setLine(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-btn bg-fb-surface px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus:ring-2 focus:ring-fb-blue"
                />
                <Button type="submit" size="sm" data-testid="create-muse-btn" disabled={line.trim().length < 2 || muse.status === 'loading'}>
                  {muse.status === 'loading' ? 'Drafting…' : 'Draft'}
                </Button>
              </div>
              {muse.status === 'loading' && <p role="status" className="mt-2 px-1 text-[13px] text-fb-text-2">Muse is drafting your plan…</p>}
              {muse.status === 'done' && (
                <div data-testid="create-muse-pitch" className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[13px] text-fb-text">
                  {muse.mode === 'live' ? <MuseLabel /> : (
                    <span data-testid="offline-label" className="inline-flex items-center rounded-full bg-fb-secondary-btn px-2 py-0.5 text-[12px] font-semibold text-fb-text-2">
                      {muse.mode === 'mock' ? 'Muse is off (mock mode) · quick draft' : 'Muse is busy · quick draft'}
                    </span>
                  )}
                  <span>{muse.pitch}</span>
                </div>
              )}
              {muse.status === 'error' && <p role="alert" className="mt-2 px-1 text-[13px] text-fb-red">{muse.message}</p>}
            </form>

            <div className="mt-3 flex items-end gap-2">
              <CategoryIcon category={category} size={44} />
              <label className="min-w-0 flex-1">
                <span className="sr-only">Title</span>
                <input
                  data-testid="create-title"
                  value={title}
                  maxLength={120}
                  placeholder="What's the plan?"
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 text-[17px] font-semibold text-fb-text outline-none focus:border-fb-blue"
                />
              </label>
            </div>
            {muse.status === 'done' && (
              <p className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-fb-blue">
                <Sparkles size={14} aria-hidden /> Pip drafted this
              </p>
            )}

            <div className="mt-3">
              <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-fb-text-2"><Check size={14} aria-hidden className="opacity-0" />When</span>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="When">
                <Chip selected={startChip(0)} data-testid="create-when-0" onClick={() => setStartsAt(inMinutes(new Date(), 0).toISOString())} className="h-9 px-4 text-[14px]">Now</Chip>
                {[30, 60, 90].map((mins) => (
                  <Chip key={mins} selected={startChip(mins)} data-testid={`create-when-${mins}`} onClick={() => setStartsAt(inMinutes(new Date(), mins).toISOString())} className="h-9 px-4 text-[14px]">
                    {clockChip(mins)}
                  </Chip>
                ))}
                <label className="inline-flex h-9 items-center gap-1 rounded-full bg-fb-secondary-btn px-3 text-[14px] font-semibold text-fb-text">
                  ⏱
                  <select aria-label="How long" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="bg-transparent outline-none">
                    {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => (
                      <option key={d} value={d}>{d < 60 ? `${d}m` : `${d / 60}h`}</option>
                    ))}
                  </select>
                </label>
                <input
                  type="time"
                  aria-label="Start time"
                  value={clockValue(startsAt)}
                  onChange={(e) => { const d = nextAtClock(e.target.value, new Date()); if (d) setStartsAt(d.toISOString()); }}
                  className="h-9 rounded-full border border-fb-divider bg-fb-surface px-3 text-[14px] text-fb-text outline-none focus:border-fb-blue"
                />
                {dayLabel(startsAt) && <span data-testid="create-when-day" className="text-[13px] font-semibold text-fb-text-2">{dayLabel(startsAt)}</span>}
              </div>
            </div>

            <div className="mt-3">
              <span className="mb-1.5 block text-[13px] font-semibold text-fb-text-2">Where</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-9 items-center gap-1 rounded-full bg-fb-blue px-3 text-[14px] font-semibold text-white">📍
                  <input
                    data-testid="create-venue"
                    value={venueName}
                    maxLength={120}
                    onChange={(e) => setVenueName(e.target.value)}
                    className="w-32 bg-transparent font-semibold text-white outline-none placeholder:text-white/70"
                  />
                </span>
                <label className="inline-flex h-9 items-center gap-1 rounded-full bg-fb-secondary-btn px-3 text-[14px] font-semibold text-fb-text">
                  $
                  <input aria-label="Budget per person" type="number" min={0} max={200} value={priceMax || ''} placeholder="Any"
                    onChange={(e) => setPriceMax(Number(e.target.value))} className="w-14 bg-transparent outline-none" />
                </label>
                <span className="inline-flex h-9 items-center gap-1 rounded-full bg-fb-secondary-btn px-2 text-[14px] font-semibold text-fb-text">
                  Max
                  <IconButton label="Fewer spots" size="sm" onClick={() => setCapacity((c) => Math.max(2, c - 1))}><Minus size={14} aria-hidden /></IconButton>
                  <span data-testid="create-spots" className="w-5 text-center">{capacity}</span>
                  <IconButton label="More spots" size="sm" onClick={() => setCapacity((c) => Math.min(50, c + 1))}><Plus size={14} aria-hidden /></IconButton>
                </span>
                <select aria-label="Type" value={category} onChange={(e) => setCategory(e.target.value as QuestCategory)}
                  className="h-9 rounded-full border border-fb-divider bg-fb-surface px-3 text-[14px] text-fb-text outline-none focus:border-fb-blue">
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="mt-1 flex items-center justify-between rounded-card bg-fb-blue-tint px-3 py-2">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fb-text"><Sparkles size={16} aria-hidden className="text-fb-blue" /> Pip picks</span>
              <button type="button" role="switch" aria-checked={pipPicks} data-testid="create-pip-picks" onClick={togglePipPicks}
                className={cn('h-7 w-12 rounded-full p-1 transition-colors', pipPicks ? 'bg-fb-blue' : 'bg-fb-divider')}>
                <span className={cn('block size-5 rounded-full bg-white shadow transition-transform', pipPicks && 'translate-x-5')} />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Your groups">
              {myGroups.map((g) => (
                <Chip key={g.id} selected={visibility === 'group' && groupId === g.id} data-testid={`create-group-chip-${g.id}`}
                  onClick={() => { setVisibility('group'); setGroupId(g.id); }} className="h-9 px-4 text-[14px]">
                  {g.name}
                </Chip>
              ))}
              <Chip selected={visibility === 'community'} data-testid="visibility-community" onClick={() => setVisibility('community')} className="h-9 px-4 text-[14px]">Anyone nearby</Chip>
            </div>
            {visibility === 'group' && myGroups.length === 0 && (
              <p className="mt-2 text-[13px] text-fb-text-2">Join a Group first to post just for its members.</p>
            )}

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-fb-text-2">
              <span className="size-2 rounded-full bg-[#31A24C]" aria-hidden /> Free now
            </p>
            <div className="flex flex-wrap gap-3" role="group" aria-label="Invite friends">
              {friends.length === 0 && <p className="text-[13px] text-fb-text-2">No friends to invite yet.</p>}
              {friends.map((f) => {
                const on = invites.has(f.id);
                return (
                  <button key={f.id} type="button" data-testid={`create-invite-${f.id}`} aria-pressed={on}
                    onClick={() => { setVisibility('friends'); toggleInvite(f.id); }}
                    className="oh-press relative flex w-14 flex-col items-center gap-1">
                    <span className="relative">
                      <Avatar src={f.avatarUrl} name={f.name} size={48} decorative />
                      {on && (
                        <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-fb-blue text-white ring-2 ring-white">
                          <Check size={12} aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className={cn('max-w-14 truncate text-[12px] font-semibold', on ? 'text-fb-blue' : 'text-fb-text-2')}>
                      {f.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-card bg-fb-bg px-3 py-2.5">
              <span className="text-[14px] font-semibold text-fb-text">
                {visibility === 'community' ? 'Anyone nearby can join' : visibility === 'group' ? 'Group members only' : 'Friends & crews only'}
              </span>
              <span className="text-[13px] text-fb-text-2" data-testid="create-invited-count">
                {visibility === 'friends' ? `${invites.size} invited` : visibility === 'group' ? 'Group' : 'Open'}
              </span>
            </div>
            {/* Keep the radiogroup test hooks the create specs use. */}
            <div role="radiogroup" aria-label="Who can see it" className="sr-only">
              {VISIBILITY_OPTIONS.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={visibility === o.value}
                  data-testid={`visibility-${o.value}`} onClick={() => setVisibility(o.value)}>{o.label}</button>
              ))}
            </div>
            {visibility === 'group' && myGroups.length > 0 && (
              <select data-testid="create-group-select" aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="sr-only">
                {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="relative overflow-hidden rounded-[20px] bg-fb-blue-tint">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={poster.local} alt="Cover preview" className={cn('h-44 w-full object-cover', !poster.url && 'opacity-70')} />
              ) : (
                <div className="flex h-44 items-center justify-center bg-fb-blue-tint">
                  <CategoryIcon category={category} size={64} />
                </div>
              )}
              <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded-full bg-black/55 px-3 py-1 text-[17px] font-bold text-white">
                {title.trim() || 'Your plan'}
              </span>
              {poster && (
                <button type="button" aria-label="Remove poster" onClick={() => setPoster(null)}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
            {poster?.error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{poster.error}</p>}

            <div className="mt-3 grid grid-cols-4 gap-2">
              <button type="button" data-testid="create-poster-btn" onClick={() => fileRef.current?.click()}
                className="oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] bg-fb-bg text-[13px] font-semibold text-fb-text hover:bg-fb-hover">
                <Camera size={20} aria-hidden /> Photo
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] bg-fb-bg text-[13px] font-semibold text-fb-text hover:bg-fb-hover">
                <ImagePlus size={20} aria-hidden /> Selfie
              </button>
              <button type="button" aria-pressed={!!bubble} onClick={() => setBubble(bubble ? '' : '🎤 Voice note')}
                className={cn('oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] text-[13px] font-semibold hover:bg-fb-hover', bubble ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-bg text-fb-text')}>
                <Mic size={20} aria-hidden /> Voice
              </button>
              <button type="button" aria-pressed={tags.includes('sticker')} onClick={() => setTags((t) => (t.includes('sticker') ? t.filter((x) => x !== 'sticker') : [...t, 'sticker']))}
                className={cn('oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] text-[13px] font-semibold hover:bg-fb-hover', tags.includes('sticker') ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-bg text-fb-text')}>
                <Sticker size={20} aria-hidden /> Sticker
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="create-poster-input"
              onChange={(e) => { pickPoster(e.target.files?.[0]); e.target.value = ''; }}
            />

            <label className="mt-3 block">
              <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Map note (optional)</span>
              <textarea
                data-testid="create-bubble"
                value={bubble}
                rows={2}
                maxLength={BUBBLE_MAX}
                placeholder="Text bubble, like “Bring a pen”"
                onChange={(e) => setBubble(e.target.value)}
                className="w-full resize-none rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
              />
              <span className="block text-right text-[12px] text-fb-text-2">{bubble.length}/{BUBBLE_MAX}</span>
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Details (optional)</span>
              <textarea
                value={description}
                rows={2}
                maxLength={400}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
              />
            </label>
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-fb-divider px-4 py-3">
        {error && <p role="alert" data-testid="create-error" className="mb-2 text-[13px] text-fb-red">{error}</p>}
        {step === 0 && (
          <Button block size="lg" data-testid="create-next" disabled={!canNext} onClick={() => setStep(1)}>
            Who&apos;s coming? <ArrowRight size={18} aria-hidden />
          </Button>
        )}
        {step === 1 && (
          <Button block size="lg" data-testid="create-next-cover" onClick={() => setStep(2)}>
            Add a cover <ArrowRight size={18} aria-hidden />
          </Button>
        )}
        {step === 2 && (
          <Button block size="lg" data-testid="create-post" disabled={!!missing || posting} onClick={() => void post()}>
            {posting ? 'Posting…' : missing ?? 'Post'}
          </Button>
        )}
      </footer>
    </section>
  );
}

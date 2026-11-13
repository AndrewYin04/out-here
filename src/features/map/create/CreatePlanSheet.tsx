'use client';
// "Post a plan": the host drops a pin (long-press or ＋), optionally lets Muse draft the plan
// from one line, picks who can see it, adds a pop-up (poster, text bubble) and taps Post.
// Muse fills the form; the human always posts. Non-modal so the map and the pin stay visible.
import { ChevronDown, ImagePlus, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiFetchError, apiPost, currentPersona, uploadImage, useApi } from '@/features/data';
import { MuseLabel } from '@/features/outhere';
import { Avatar, Button, Chip, IconButton, cn } from '@/features/ui';
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
  /** The emoji changed: the draft pin shows it. */
  onEmoji: (emoji: string) => void;
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

export function CreatePlanSheet({ at, friends, onMove, onEmoji, onClose, onPosted }: CreatePlanSheetProps) {
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
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || !!bubble || !!description || !!poster;
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  const groups = useApi<{ groups: GroupView[] }>(visibility === 'group' ? '/api/groups?filter=mine' : null);
  const myGroups = useMemo(() => groups.data?.groups ?? [], [groups.data]);
  useEffect(() => {
    if (visibility === 'group' && !groupId && myGroups.length > 0) setGroupId(myGroups[0].id);
  }, [visibility, groupId, myGroups]);

  useEffect(() => { lineRef.current?.focus(); }, []);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => { onEmoji(emoji); }, [emoji, onEmoji]);
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
    inFlight.current = ctrl;
    setMuse({ status: 'loading' });
    try {
      const r = await requestDraft(t, at, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const d = r.draft;
      setTitle(d.title); setEmoji(d.emoji); setCategory(d.category); setDescription(d.description);
      setStartsAt(d.startsAt);
      setDuration(Math.max(15, Math.round((Date.parse(d.endsAt) - Date.parse(d.startsAt)) / 60_000)));
      setCapacity(d.capacity); setPriceMax(d.priceMax); setTags(d.tags); setVenueName(d.venueName);
      if (d.bubbleText) setBubble(d.bubbleText.slice(0, BUBBLE_MAX));
      if (d.placeId) { setPlace({ id: d.placeId, at: d.location }); onMove(d.location); }
      setMuse({ status: 'done', pitch: r.pitch, mode: r.mode });
    } catch (e) {
      if (ctrl.signal.aborted) return;
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
    if (missing || posting) return;
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
      setPosting(false);
    }
  };

  const now = new Date();
  const startChip = (mins: number) => {
    const target = inMinutes(now, mins).getTime();
    return Math.abs(Date.parse(startsAt) - target) < 5 * 60_000;
  };

  return (
    <section
      aria-label="Post a plan"
      data-testid="create-plan-sheet"
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-[16px] bg-fb-surface shadow-popover',
        'md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-card',
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fb-divider md:hidden" aria-hidden />
      <header className="flex shrink-0 items-start justify-between px-4 pb-1 pt-2">
        <div>
          <h2 className="text-[20px] font-bold text-fb-text">Post a plan</h2>
          <p className="text-[13px] text-fb-text-2">Pin dropped. Drag it on the map to move it.</p>
        </div>
        <IconButton label="Close" size="md" onClick={onClose}>
          <X size={20} aria-hidden />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {/* Muse: one line in, a draft out */}
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
          {/* One honest status line: the request is running, nothing more is claimed. */}
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

        {/* Title and emoji */}
        <div className="mt-3 flex gap-2">
          <label className="w-14 shrink-0">
            <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Emoji</span>
            <input
              value={emoji}
              maxLength={8}
              aria-label="Emoji"
              onChange={(e) => setEmoji(e.target.value)}
              className="h-10 w-full rounded-btn border border-fb-divider bg-fb-surface text-center text-[20px] outline-none focus:border-fb-blue"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Title</span>
            <input
              data-testid="create-title"
              value={title}
              maxLength={120}
              placeholder="What's the plan?"
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 text-[15px] text-fb-text outline-none focus:border-fb-blue"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Type</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as QuestCategory)}
              className="h-10 w-full rounded-btn border border-fb-divider bg-fb-surface px-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[13px] font-semibold text-fb-text-2">Where</span>
            <input
              data-testid="create-venue"
              value={venueName}
              maxLength={120}
              onChange={(e) => setVenueName(e.target.value)}
              className="h-10 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 text-[15px] text-fb-text outline-none focus:border-fb-blue"
            />
          </label>
        </div>

        {/* When */}
        <fieldset className="mt-3">
          <legend className="mb-1 text-[13px] font-semibold text-fb-text-2">When</legend>
          <div className="flex flex-wrap items-center gap-2">
            {[['Now', 0], ['In 30 min', 30], ['In 1 hr', 60]].map(([label, mins]) => (
              <Chip
                key={label as string}
                selected={startChip(mins as number)}
                data-testid={`create-when-${mins}`}
                onClick={() => setStartsAt(inMinutes(new Date(), mins as number).toISOString())}
                className="h-8 text-[13px]"
              >
                {label}
              </Chip>
            ))}
            <input
              type="time"
              aria-label="Start time"
              value={clockValue(startsAt)}
              aria-describedby="create-when-day"
              onChange={(e) => { const d = nextAtClock(e.target.value, new Date()); if (d) setStartsAt(d.toISOString()); }}
              className="h-8 rounded-btn border border-fb-divider bg-fb-surface px-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
            />
            {dayLabel(startsAt) && <span id="create-when-day" data-testid="create-when-day" className="text-[13px] font-semibold text-fb-text-2">{dayLabel(startsAt)}</span>}
            <select
              aria-label="How long"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-8 rounded-btn border border-fb-divider bg-fb-surface px-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
            >
              {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} hr`}</option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* Spots */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-fb-text-2">Spots (you included)</span>
          <div className="flex items-center gap-2">
            <IconButton label="Fewer spots" size="sm" onClick={() => setCapacity((c) => Math.max(2, c - 1))}><Minus size={16} aria-hidden /></IconButton>
            <span data-testid="create-spots" className="w-6 text-center text-[17px] font-semibold text-fb-text">{capacity}</span>
            <IconButton label="More spots" size="sm" onClick={() => setCapacity((c) => Math.min(50, c + 1))}><Plus size={16} aria-hidden /></IconButton>
          </div>
        </div>

        {/* Who can see it */}
        <fieldset className="mt-3">
          <legend className="mb-1 text-[13px] font-semibold text-fb-text-2">Who can see it</legend>
          <div role="radiogroup" aria-label="Who can see it" className="grid grid-cols-2 gap-2">
            {VISIBILITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={visibility === o.value}
                data-testid={`visibility-${o.value}`}
                onClick={() => setVisibility(o.value)}
                className={cn(
                  'rounded-card border p-2 text-left transition-colors',
                  visibility === o.value ? 'border-fb-blue bg-fb-blue-tint' : 'border-fb-divider hover:bg-fb-hover',
                )}
              >
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fb-text"><o.icon size={16} aria-hidden className="shrink-0 text-fb-text-2" />{o.label}</span>
                <span className="block text-[12px] leading-4 text-fb-text-2">{o.hint}</span>
              </button>
            ))}
          </div>
          {visibility === 'group' && (
            <div className="mt-2">
              {groups.loading && !groups.data ? (
                <p className="text-[13px] text-fb-text-2">Loading your groups…</p>
              ) : myGroups.length === 0 ? (
                <p className="text-[13px] text-fb-text-2">Join a Group first to post a plan just for its members.</p>
              ) : (
                <select
                  data-testid="create-group-select"
                  aria-label="Group"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="h-10 w-full rounded-btn border border-fb-divider bg-fb-surface px-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
                >
                  {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </div>
          )}
          {visibility === 'friends' && (
            <ul className="mt-2 max-h-44 overflow-y-auto rounded-card border border-fb-divider p-1" aria-label="Invite friends">
              {friends.length === 0 && <li className="p-2 text-[13px] text-fb-text-2">No friends to invite yet.</li>}
              {friends.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-btn px-2 py-1.5 hover:bg-fb-hover">
                    <input
                      type="checkbox"
                      data-testid={`create-invite-${f.id}`}
                      checked={invites.has(f.id)}
                      onChange={() => toggleInvite(f.id)}
                      className="size-4 accent-fb-blue"
                    />
                    <Avatar src={f.avatarUrl} name={f.name} size={28} decorative />
                    <span className="text-[15px] text-fb-text">{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {/* Optional extras stay folded until wanted (or Muse filled one in). */}
        {showMore ? (
          <>
            {/* Pop-up */}
            <fieldset className="mt-3">
              <legend className="mb-1 text-[13px] font-semibold text-fb-text-2">Pop-up on the map</legend>
              <div className="flex items-start gap-2">
                {poster ? (
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-card bg-fb-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img src={poster.local} alt="Poster preview" className={cn('size-full object-cover', !poster.url && 'opacity-60')} />
                    <button
                      type="button"
                      aria-label="Remove poster"
                      onClick={() => setPoster(null)}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X size={14} aria-hidden />
                    </button>
                    {poster.error && <span className="absolute inset-x-0 bottom-0 bg-fb-red px-1 text-[11px] text-white">Failed</span>}
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="create-poster-btn"
                    onClick={() => fileRef.current?.click()}
                    className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-fb-divider text-[12px] font-semibold text-fb-text-2 hover:bg-fb-hover"
                  >
                    <ImagePlus size={20} aria-hidden />
                    Poster
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  data-testid="create-poster-input"
                  onChange={(e) => { pickPoster(e.target.files?.[0]); e.target.value = ''; }}
                />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Text bubble</span>
                  <textarea
                    data-testid="create-bubble"
                    value={bubble}
                    rows={3}
                    maxLength={BUBBLE_MAX}
                    placeholder="Text bubble, like “Bring a pen”"
                    onChange={(e) => setBubble(e.target.value)}
                    className="w-full resize-none rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
                  />
                  <span className="block text-right text-[12px] text-fb-text-2">{bubble.length}/{BUBBLE_MAX}</span>
                </label>
              </div>
            </fieldset>

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
        ) : (
          <button
            type="button"
            data-testid="create-more"
            aria-expanded={false}
            onClick={() => setMoreOpen(true)}
            className="mt-3 flex h-9 items-center gap-1 rounded-btn px-1 text-[15px] font-semibold text-fb-blue hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue"
          >
            Add a poster, map note or details
            <ChevronDown size={16} aria-hidden />
          </button>
        )}
      </div>

      <footer className="shrink-0 border-t border-fb-divider px-4 py-3">
        {error && <p role="alert" data-testid="create-error" className="mb-2 text-[13px] text-fb-red">{error}</p>}
        <Button block size="lg" data-testid="create-post" disabled={!!missing || posting} onClick={() => void post()}>
          {posting ? 'Posting…' : missing ?? 'Post'}
        </Button>
      </footer>
    </section>
  );
}

'use client';
// Host a plan in three short steps (#36, Alan's reference): What · When · Where, then Who's
// invited, then a Cover, then Post. One question at a time, chips instead of form fields, the pin
// stays on the map, and Muse fills things in instead of writing paragraphs. The human always posts.
import { ArrowLeft, ArrowRight, Camera, ImagePlus, MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiFetchError, apiPost, currentPersona, uploadImage, useApi } from '@/features/data';
import { Avatar, IconButton, cn } from '@/features/ui';
import { formatDemoTime, type LatLng, type Quest, type QuestCategory, type QuestVisibility } from '@/shared';
import type { GroupView, MuseCreateQuestResponse } from '@/shared/api';
import { heroFor } from '../event/PlanCard';
import type { FriendFace } from '../types';
import { inMinutes } from './time';

/** Starting points from the long-press picker (and the emoji row in step 1). */
export const HOST_PRESETS = [
  { key: 'boba', emoji: '🧋', title: 'Boba run', category: 'food' },
  { key: 'coffee', emoji: '☕', title: 'Coffee chat', category: 'food' },
  { key: 'dumplings', emoji: '🥟', title: 'Dumpling run', category: 'food' },
  { key: 'climb', emoji: '🧗', title: 'Climbing session', category: 'sports' },
  { key: 'games', emoji: '🎮', title: 'Game night', category: 'games' },
  { key: 'art', emoji: '🎨', title: 'Sketch session', category: 'art' },
] as const satisfies readonly { key: string; emoji: string; title: string; category: QuestCategory }[];
export type HostPreset = (typeof HOST_PRESETS)[number];

const DURATIONS = [30, 45, 60, 90, 120];
const PRICES = [0, 10, 20, 40];
const SPOTS = [4, 6, 8, 10, 20];
const BUBBLE_MAX = 80;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const STEPS = ['What', 'Who', 'Cover'] as const;

const cycle = <T,>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length] ?? list[0];
const priceText = (p: number) => (p <= 0 ? 'Free' : p <= 10 ? '$' : p <= 20 ? '$$' : '$$$');
const durText = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}`);

/** Now, then the next three half-hours (rounded up a quarter-hour out). */
function startOptions(now: Date): { label: string; iso: string }[] {
  const first = new Date(now.getTime() + 15 * 60_000);
  first.setMinutes(first.getMinutes() < 30 ? 30 : 60, 0, 0);
  return [
    { label: 'Now', iso: now.toISOString() },
    ...[0, 1, 2].map((i) => {
      const d = new Date(first.getTime() + i * 30 * 60_000);
      return { label: formatDemoTime(d.toISOString()).replace(/\s?[AP]M$/i, ''), iso: d.toISOString() };
    }),
  ];
}

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

export type CreatePlanSheetProps = {
  /** Where the draft pin is now (the host can drag it on the map). */
  at: LatLng;
  friends: FriendFace[];
  /** Picked in the long-press picker: the plan starts from it. */
  preset?: HostPreset | null;
  /** Muse moved the plan to a real place: move the draft pin there. */
  onMove: (at: LatLng) => void;
  /** The emoji changed: the draft pin shows it. */
  onEmoji: (emoji: string) => void;
  onClose: () => void;
  onPosted: (quest: Quest, invited: number) => void;
};

const sameSpot = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

function ChipButton({ on, onClick, children, testId, label, className }: {
  on?: boolean; onClick: () => void; children: React.ReactNode; testId?: string; label?: string; className?: string;
}) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} data-testid={testId} onClick={onClick}
      className={cn(
        'oh-press inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] font-semibold transition-colors',
        on ? 'bg-fb-blue text-white shadow-[0_4px_12px_rgba(8,102,255,.3)]' : 'bg-fb-secondary-btn text-fb-text hover:brightness-95',
        className,
      )}>
      {children}
    </button>
  );
}

function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-fb-text-2"><span aria-hidden>{icon}</span>{children}</p>;
}

export function CreatePlanSheet({ at, friends, preset = null, onMove, onEmoji, onClose, onPosted }: CreatePlanSheetProps) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState<string>(preset?.title ?? '');
  const [emoji, setEmoji] = useState<string>(preset?.emoji ?? '📍');
  const [category, setCategory] = useState<QuestCategory>(preset?.category ?? 'other');
  const [description, setDescription] = useState('');
  const options = useMemo(() => startOptions(new Date()), []);
  const [startsAt, setStartsAt] = useState(() => options[1].iso);
  const [duration, setDuration] = useState(60);
  const [capacity, setCapacity] = useState(6);
  const [venueName, setVenueName] = useState('Dropped pin');
  const [editingVenue, setEditingVenue] = useState(false);
  const [place, setPlace] = useState<{ id: string; at: LatLng } | null>(null);
  const [priceMax, setPriceMax] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<QuestVisibility>('community');
  const [groupId, setGroupId] = useState<string>('');
  const [invites, setInvites] = useState<Set<string>>(new Set());
  const [musePicks, setMusePicks] = useState(false);
  const [muse, setMuse] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; note?: string; mode?: 'live' | 'mock' | 'fallback' }>({ status: 'idle' });
  const [poster, setPoster] = useState<{ local: string; url: string | null; error: string | null } | null>(null);
  const [cover, setCover] = useState<'suggested' | 'none' | 'upload'>('suggested');
  const [bubble, setBubble] = useState('');
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  const groups = useApi<{ groups: GroupView[] }>('/api/groups?filter=mine');
  const myGroups = useMemo(() => groups.data?.groups ?? [], [groups.data]);

  useEffect(() => { if (!preset) titleRef.current?.focus(); }, [preset]);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => { onEmoji(emoji); }, [emoji, onEmoji]);
  useEffect(() => {
    if (place && !sameSpot(place.at, at)) { setPlace(null); setVenueName('Dropped pin'); }
  }, [at, place]);
  useEffect(() => () => { if (poster?.local) URL.revokeObjectURL(poster.local); }, [poster?.local]);

  /** ✨ next to the title: Muse turns the title into a whole plan (place, time, spots, price). */
  const draftWithMuse = async () => {
    const t = title.trim();
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
      setMuse({ status: 'done', note: r.pitch, mode: r.mode });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setMuse({ status: 'error', note: e instanceof Error ? e.message : 'Muse could not fill this in.' });
    }
  };

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('The cover has to be a photo.'); return; }
    if (file.size > MAX_POSTER_BYTES) { setError('That photo is over 8 MB.'); return; }
    setError(null);
    const local = URL.createObjectURL(file);
    setPoster({ local, url: null, error: null });
    setCover('upload');
    uploadImage(file)
      .then((url) => setPoster((p) => (p?.local === local ? { ...p, url } : p)))
      .catch((e: unknown) => setPoster((p) => (p?.local === local ? { ...p, error: e instanceof Error ? e.message : 'Upload failed' } : p)));
  };

  // Who's invited: Anyone nearby, Friends (pick faces), or one of your Groups.
  const toggleInvite = (id: string) => {
    setMusePicks(false);
    setInvites((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const chooseFriends = () => { setVisibility('friends'); setGroupId(''); };
  const chooseGroup = (id: string) => { setVisibility('group'); setGroupId(id); };
  // ✨ Muse picks: the friends you hang out with most, up to the spots you have.
  const toggleMusePicks = () => {
    const next = !musePicks;
    setMusePicks(next);
    if (next) {
      setVisibility('friends'); setGroupId('');
      setInvites(new Set(friends.slice(0, Math.max(1, Math.min(4, capacity - 1))).map((f) => f.id)));
    }
  };

  const suggested = heroFor({ posterUrl: null, title, venueName, tags });
  const coverUrl = cover === 'upload' ? poster?.local ?? null : cover === 'suggested' ? suggested : null;
  const uploading = cover === 'upload' && !!poster && !poster.url && !poster.error;
  const invitedCount = visibility === 'friends' ? invites.size : visibility === 'group' ? (myGroups.find((g) => g.id === groupId)?.memberCount ?? 0) : 0;
  const missing = !title.trim() ? 'Add a title'
    : !venueName.trim() ? 'Add where it is'
      : visibility === 'group' && !groupId ? 'Pick a group'
        : visibility === 'friends' && invites.size === 0 ? 'Pick at least one friend'
          : uploading ? 'Cover is uploading…' : null;

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
        posterUrl: cover === 'upload' ? poster?.url ?? null : cover === 'suggested' ? suggested : null,
        bubbleText: bubble.trim() || null,
      });
      onPosted(quest, invitedCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the plan. Try again.');
      setPosting(false);
    }
  };

  const audienceLine = visibility === 'community' ? 'Anyone nearby can see and join'
    : visibility === 'friends' ? `Friends only · ${invites.size} invited`
      : `${myGroups.find((g) => g.id === groupId)?.name ?? 'Group'} members only`;

  return (
    <section
      aria-label="Host a plan"
      data-testid="create-plan-sheet"
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex max-h-[80%] animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover',
        'md:bottom-4 md:left-1/2 md:w-[460px] md:-translate-x-1/2 md:rounded-[24px]',
      )}
    >
      <div className="relative flex h-10 shrink-0 items-center px-2 pt-1">
        {step > 0 ? (
          <IconButton label="Back" size="sm" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={18} aria-hidden /></IconButton>
        ) : <span className="size-8" />}
        <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-fb-divider" aria-hidden />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
            {STEPS.map((s, i) => <span key={s} className={cn('h-2 rounded-full transition-all', i === step ? 'w-5 bg-fb-blue' : 'w-2 bg-fb-divider')} />)}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}><X size={18} aria-hidden /></IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {step === 0 && (
          <div className="animate-step-in">
            {/* Title with the plan's emoji; ✨ lets Muse fill in the rest from it. */}
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Change emoji" onClick={() => {
                const i = HOST_PRESETS.findIndex((p) => p.emoji === emoji);
                const next = HOST_PRESETS[(i + 1) % HOST_PRESETS.length];
                setEmoji(next.emoji); setCategory(next.category);
              }}
                className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-[#F3E8FF] text-[30px]">{emoji}</button>
              <div className="min-w-0 flex-1">
                <label htmlFor="create-title" className="sr-only">What&apos;s the plan?</label>
                <input
                  id="create-title"
                  ref={titleRef}
                  data-testid="create-title"
                  value={title}
                  maxLength={120}
                  placeholder="What's the plan?"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void draftWithMuse(); } }}
                  className="w-full bg-transparent text-[24px] font-extrabold leading-8 text-fb-text outline-none placeholder:text-fb-text-2/70"
                />
                {muse.status === 'done' ? (
                  <p data-testid="create-muse-pitch" className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[#EFEBFF] px-2 py-0.5 text-[12px] font-semibold text-[#6B4BFF]">
                    ✨ {muse.mode === 'live' ? 'Muse filled this in' : 'Quick draft (Muse offline)'}
                  </p>
                ) : muse.status === 'loading' ? (
                  <p className="mt-0.5 text-[12px] font-semibold text-[#6B4BFF]">✨ Muse is filling it in…</p>
                ) : muse.status === 'error' ? (
                  <p role="alert" className="mt-0.5 text-[12px] text-fb-red">{muse.note}</p>
                ) : null}
              </div>
              <button type="button" data-testid="create-muse-btn" aria-label="Let Muse fill in the rest" title="Let Muse fill in the rest"
                disabled={title.trim().length < 2 || muse.status === 'loading'} onClick={() => void draftWithMuse()}
                className="oh-press flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EFEBFF] text-[18px] disabled:opacity-40">✨</button>
            </div>

            <Label icon="🕐">When</Label>
            <div className="flex flex-wrap gap-2">
              {options.map((o, i) => (
                <ChipButton key={o.label} testId={`create-when-${i === 0 ? 0 : i}`} on={Math.abs(Date.parse(startsAt) - Date.parse(o.iso)) < 5 * 60_000}
                  onClick={() => setStartsAt(i === 0 ? inMinutes(new Date(), 0).toISOString() : o.iso)}>{o.label}</ChipButton>
              ))}
              <ChipButton label={`Lasts ${durText(duration)}`} onClick={() => setDuration((d) => cycle(DURATIONS, d))}>⏳ {durText(duration)}</ChipButton>
            </div>

            <Label icon="📍">Where</Label>
            <div className="flex flex-wrap gap-2">
              {editingVenue ? (
                <input data-testid="create-venue" autoFocus value={venueName} maxLength={120} aria-label="Where"
                  onChange={(e) => setVenueName(e.target.value)} onBlur={() => setEditingVenue(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingVenue(false); }}
                  className="h-10 min-w-[160px] flex-1 rounded-full bg-fb-secondary-btn px-4 text-[15px] font-semibold text-fb-text outline-none ring-fb-blue focus:ring-2" />
              ) : (
                <ChipButton on testId="create-venue-chip" label="Change where" onClick={() => setEditingVenue(true)}>📍 {venueName}</ChipButton>
              )}
              <ChipButton label={`Price ${priceText(priceMax)}`} onClick={() => setPriceMax((p) => cycle(PRICES, p))}>💵 {priceText(priceMax)}</ChipButton>
              <ChipButton label={`Max ${capacity} people`} onClick={() => setCapacity((c) => cycle(SPOTS, c))}>
                👥 Max <span data-testid="create-spots">{capacity}</span>
              </ChipButton>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-step-in">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-extrabold text-fb-text">Who&apos;s invited</h2>
              <button type="button" role="switch" aria-checked={musePicks} onClick={toggleMusePicks}
                className="flex items-center gap-2 text-[13px] font-semibold text-[#6B4BFF]">
                ✨ Muse picks
                <span className={cn('relative h-6 w-10 rounded-full transition-colors', musePicks ? 'bg-fb-blue' : 'bg-fb-divider')}>
                  <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', musePicks ? 'left-[18px]' : 'left-0.5')} />
                </span>
              </button>
            </div>
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <ChipButton testId="visibility-community" on={visibility === 'community'} onClick={() => { setVisibility('community'); setGroupId(''); }}>🌍 Anyone nearby</ChipButton>
              <ChipButton testId="visibility-friends" on={visibility === 'friends'} onClick={chooseFriends}>👥 Friends</ChipButton>
              {myGroups.map((g) => (
                <ChipButton key={g.id} testId={`create-group-${g.slug}`} on={visibility === 'group' && groupId === g.id} onClick={() => chooseGroup(g.id)}>
                  {g.name}
                </ChipButton>
              ))}
            </div>
            {visibility === 'friends' && (
              <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label="Invite friends">
                {friends.length === 0 && <li className="col-span-full text-[13px] text-fb-text-2">No friends to invite yet.</li>}
                {friends.map((f) => {
                  const on = invites.has(f.id);
                  return (
                    <li key={f.id}>
                      <button type="button" data-testid={`create-invite-${f.id}`} aria-pressed={on} onClick={() => toggleInvite(f.id)}
                        className="flex w-full flex-col items-center gap-1">
                        <span className="relative">
                          <Avatar src={f.avatarUrl} name={f.name} size={56} decorative className={cn('transition-all', on ? 'ring-[3px] ring-fb-blue' : 'opacity-80')} />
                          {on && <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-fb-blue text-[11px] font-bold text-white ring-2 ring-white">✓</span>}
                        </span>
                        <span className="w-full truncate text-center text-[12px] font-semibold text-fb-text">{f.name.split(' ')[0]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {visibility === 'group' && groups.data && myGroups.length === 0 && (
              <p className="mt-3 text-[13px] text-fb-text-2">Join a Group first to host just for its members.</p>
            )}
            <p className="mt-3 flex items-center justify-between rounded-[14px] bg-fb-input px-3 py-2.5 text-[14px] text-fb-text">
              <span>🔒 {audienceLine}</span>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="animate-step-in">
            {/* The cover, exactly as the plan card will show it */}
            <div className="relative h-[clamp(150px,44vw,210px)] overflow-hidden rounded-[22px] bg-gradient-to-br from-[#DDEDFE] via-[#F2F4F7] to-[#FDE7EF]">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- seed photo or local preview
                <img src={coverUrl} alt="" className={cn('absolute inset-0 size-full object-cover', uploading && 'opacity-70')} />
              ) : (
                <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[64px]">{emoji}</span>
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
              <p className="absolute inset-x-4 bottom-3 text-[22px] font-extrabold leading-7 text-white [text-shadow:0_2px_8px_rgba(0,0,0,.45)]">{title || 'Your plan'}</p>
              {bubble && <p className="absolute left-3 top-3 max-w-[70%] rounded-[14px] bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-fb-text shadow">{bubble}</p>}
            </div>
            <div className="mt-2 flex gap-2">
              {suggested && (
                <button type="button" aria-label="Use the suggested photo" aria-pressed={cover === 'suggested'} onClick={() => setCover('suggested')}
                  className={cn('size-14 overflow-hidden rounded-[12px]', cover === 'suggested' && 'ring-[3px] ring-fb-blue')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- seed photo */}
                  <img src={suggested} alt="" className="size-full object-cover" />
                </button>
              )}
              <button type="button" aria-label="Just the emoji" aria-pressed={cover === 'none'} onClick={() => setCover('none')}
                className={cn('flex size-14 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#DDEDFE] to-[#FDE7EF] text-[26px]', cover === 'none' && 'ring-[3px] ring-fb-blue')}>{emoji}</button>
              {poster && (
                <button type="button" aria-label="Use your photo" aria-pressed={cover === 'upload'} onClick={() => setCover('upload')}
                  className={cn('size-14 overflow-hidden rounded-[12px]', cover === 'upload' && 'ring-[3px] ring-fb-blue')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={poster.local} alt="" className="size-full object-cover" />
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" data-testid="create-poster-btn" onClick={() => photoRef.current?.click()}
                className="oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-fb-input text-[13px] font-semibold text-fb-text hover:bg-fb-secondary-btn">
                <ImagePlus size={20} aria-hidden />Photo
              </button>
              <button type="button" onClick={() => selfieRef.current?.click()}
                className="oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-fb-input text-[13px] font-semibold text-fb-text hover:bg-fb-secondary-btn">
                <Camera size={20} aria-hidden />Selfie
              </button>
              <button type="button" aria-expanded={bubbleOpen} onClick={() => setBubbleOpen((v) => !v)}
                className="oh-press flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-fb-input text-[13px] font-semibold text-fb-text hover:bg-fb-secondary-btn">
                <MessageCircle size={20} aria-hidden />Bubble
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" hidden data-testid="create-poster-input"
              onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={selfieRef} type="file" accept="image/*" capture="user" hidden
              onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            {(bubbleOpen || bubble) && (
              <label className="mt-2 block">
                <span className="sr-only">Text bubble on the map</span>
                <input data-testid="create-bubble" value={bubble} maxLength={BUBBLE_MAX} placeholder="Bubble on the map, like “Bring a pen 🎨”"
                  onChange={(e) => setBubble(e.target.value)}
                  className="h-11 w-full rounded-full bg-fb-secondary-btn px-4 text-[15px] text-fb-text outline-none ring-fb-blue focus:ring-2" />
              </label>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 px-4 pb-4 pt-1">
        {error && <p role="alert" data-testid="create-error" className="mb-2 text-[13px] text-fb-red">{error}</p>}
        {step < 2 ? (
          <button type="button" data-testid="create-next" disabled={step === 0 ? !title.trim() : !!(visibility === 'friends' && invites.size === 0) || !!(visibility === 'group' && !groupId)}
            onClick={() => setStep((s) => s + 1)}
            className="oh-press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-fb-blue text-[17px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
            {step === 0 ? (title.trim() ? 'Who’s coming?' : 'Add a title') : visibility === 'friends' && invites.size === 0 ? 'Pick at least one friend' : 'Add a cover'}
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <button type="button" data-testid="create-post" disabled={!!missing || posting} onClick={() => void post()}
            className="oh-press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-fb-blue text-[17px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
            <Send size={18} aria-hidden />{posting ? 'Posting…' : missing ?? 'Post'}
          </button>
        )}
      </footer>
    </section>
  );
}

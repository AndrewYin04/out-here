'use client';
// Make the memory (/out-here/plan/<id>/memory): after the hangout, the group shapes it together.
// Same card style as the plan view. Cover (the group selfie, or any photo from the hangout), a
// title (the crew's name, Muse suggests a few), the story (Muse drafts it, you edit), who was there,
// every photo, the plan's chat, and a private "How was it?". Save keeps it in the crew album.
import { ArrowLeft, Camera, Check, ImagePlus, Send, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { apiFetch, apiPost, currentPersona, useApi, useViewer, type QuestDetail } from '@/features/data';
import { Avatar, burst, cn, flash, Skeleton, useToast } from '@/features/ui';
import type { Crew, Memory } from '@/shared';
import { beginMuseActivity, finishMuseActivity, releaseMuseActivity, MuseActivityStatus } from '@/features/muse-companion';
import type { PersonCard, PostView } from '@/shared/api';
import { MEMORY_SAVED, requestRating } from './arrival';
import { SelfieCamera } from './SelfieCamera';
import { SelfieReview } from './SelfieReview';
import { crewFor, saveToAlbum } from './together-api';

const first = (n: string) => n.split(' ')[0] ?? n;
/** Photo routes read the persona from ?as= (an <img> sends no headers). */
const photoSrc = (m: Memory) => (m.photoUrl === `/api/memories/${m.id}/photo` ? `${m.photoUrl}?as=${encodeURIComponent(currentPersona())}` : m.photoUrl);
const FEELINGS = [
  { key: 'loved', emoji: '😍', label: 'Loved it' },
  { key: 'good', emoji: '🙂', label: 'Good' },
  { key: 'meh', emoji: '😐', label: 'Not for me' },
] as const;

export function MemoryPage({ id }: { id: string }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const detail = useApi<QuestDetail>(`/api/quests/${id}`, [`quest:${id}`]);
  const crews = useApi<{ crews: Crew[] }>('/api/crews', [`user:${viewer.id}`]);
  const crew = useMemo(() => crews.data?.crews.find((c) => c.originQuestId === id) ?? null, [crews.data, id]);
  const memories = useApi<{ memories: Memory[] }>(crew ? `/api/memories?crewId=${crew.id}` : null, [`user:${viewer.id}`]);
  const posts = useApi<{ posts: PostView[] }>(`/api/quests/${id}/posts`, [`quest:${id}`]);
  const q = detail.data?.quest ?? null;

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [storyEdited, setStoryEdited] = useState(false);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [shot, setShot] = useState<File | null>(null);
  const [museCaption, setMuseCaption] = useState('');
  const [captionStatus, setCaptionStatus] = useState<'pending' | 'live' | 'mock' | 'error' | null>(null);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [chat, setChat] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const addRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const made = useRef(false);

  // A crew album for this plan (members only), made on first visit if the hangout didn't make one yet.
  useEffect(() => {
    if (made.current || !detail.data?.viewerIsMember || crews.loading || crew) return;
    made.current = true;
    crewFor(id).then(() => crews.refetch()).catch(() => { /* not open yet: the page still works read-only */ });
  }, [detail.data, crews, crew, id]);
  useEffect(() => {
    const on = () => { void memories.refetch(); };
    window.addEventListener(MEMORY_SAVED, on);
    return () => window.removeEventListener(MEMORY_SAVED, on);
  }, [memories]);

  const photos = useMemo(() => memories.data?.memories ?? [], [memories.data]);
  const cover = photos.find((m) => m.id === coverId) ?? photos[0] ?? null;
  const people: PersonCard[] = useMemo(() => {
    const members = detail.data?.members ?? [];
    return crew ? members.filter((m) => crew.memberIds.includes(m.id)) : members;
  }, [detail.data, crew]);

  // Starting text: the crew's name unless it's the default, and Muse's caption as the story.
  useEffect(() => {
    if (!q || !crew) return;
    setTitle((t) => t || (crew.name.endsWith(' crew') ? '' : crew.name));
    if (cover?.caption) setStory((s) => s || cover.caption);
  }, [q, crew, cover?.caption]);
  const questTitle = q?.title;
  const questEmoji = q?.emoji;
  useEffect(() => {
    if (!questTitle || !questEmoji) return;
    const names = people.filter((p) => p.id !== viewer.id).map((p) => first(p.name)).slice(0, 2);
    const base = [`${questEmoji} ${questTitle}`, names.length ? `${names.join(' & ')} & me ${questEmoji}` : `${questEmoji} Out here`];
    setSuggestions(base);
  }, [questTitle, questEmoji, people, viewer.id]);

  // This route writes from title and venue only. Photo analysis has its own consented flow.
  const captionQuestId = q?.id === id ? q.id : undefined;
  useEffect(() => {
    if (!captionQuestId) return;
    const controller = new AbortController();
    const owner = `memory-caption:${captionQuestId}`;
    const activity = beginMuseActivity({ owner, source: 'context-caption', target: 'memory-story', pending: 'is drafting from the hangout title and venue…', priority: 'background', signal: controller.signal });
    setCaptionStatus('pending');
    apiFetch<{ caption: string; mode: 'mock' | 'live'; cached?: boolean }>('/api/muse/caption', { method: 'POST', body: JSON.stringify({ questId: captionQuestId }), signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return;
        setStory((current) => current || r.caption);
        setMuseCaption(r.caption);
        setCaptionStatus(r.mode);
        const short = r.caption.split(/[,.!—–-]/)[0]?.trim();
        if (short && short.length <= 40) setSuggestions((current) => [short, ...current.filter((item) => item !== short)].slice(0, 3));
        if (activity !== null) finishMuseActivity(activity, { outcome: 'success', live: r.mode === 'live', cached: r.cached, message: r.mode === 'mock' ? 'has an offline caption ready.' : 'has a caption ready to edit.' });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCaptionStatus('error');
        if (activity !== null) finishMuseActivity(activity, { outcome: 'error', message: 'couldn’t draft a caption. You can write your own.' });
      });
    return () => { controller.abort(); if (activity !== null) releaseMuseActivity(activity); };
  }, [captionQuestId, viewer.id]);

  const addPhoto = async (file: File | null | undefined, asCover = false, caption?: string) => {
    if (!file || !q) return;
    setBusy('photo');
    try {
      const m = await saveToAlbum(q.id, file, asCover ? (caption ?? story) : '');
      if (asCover) setCoverId(m.id);
      await memories.refetch();
      if (!crew) await crews.refetch();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Couldn’t add that photo.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!q || !crew) return;
    setBusy('save');
    try {
      const name = title.trim();
      if (name && name !== crew.name) await apiFetch(`/api/crews/${crew.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      if (cover && story.trim() !== (cover.caption ?? '')) {
        await apiFetch(`/api/memories/${cover.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: story.trim() }) });
      }
      await Promise.all([crews.refetch(), memories.refetch()]);
      setSavedAt(Date.now());
      burst(saveRef.current, [q.emoji, '📸', '✨', '💛'], 22);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Couldn’t save the memory.');
    } finally {
      setBusy(null);
    }
  };

  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    const t = chat.trim();
    if (!t) return;
    setChat('');
    try {
      await apiPost(`/api/quests/${id}/posts`, { text: t });
      await posts.refetch();
    } catch { toast.show('Couldn’t send. Try again.'); setChat(t); }
  };

  const feel = (key: string, el: HTMLElement) => {
    setFeeling(key);
    burst(el, key === 'loved' ? ['😍', '💛', '✨'] : ['✨'], key === 'loved' ? 16 : 8);
    if (crew && cover) window.setTimeout(() => requestRating({ questId: id, crewId: crew.id, photoIds: [cover.id] }), 900);
  };

  if (!q) {
    return (
      <div className="mx-auto max-w-[680px] space-y-3 px-4 py-4">
        <Skeleton className="aspect-[4/3] w-full rounded-[22px]" />
        <Skeleton className="h-8" width="60%" />
      </div>
    );
  }

  const thread = posts.data?.posts ?? [];
  return (
    <div className="mx-auto max-w-[680px] px-0 pb-28 md:px-4 md:pt-4" data-testid="memory-page">
      <div className="flex items-center justify-between px-4 py-2 md:px-0">
        <Link href={`/out-here?quest=${q.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-fb-text-2 hover:underline">
          <ArrowLeft size={14} aria-hidden /> Back to the map
        </Link>
        <span className="rounded-full bg-[#EFEBFF] px-2.5 py-0.5 text-[12px] font-semibold text-[#6B4BFF]">✨ Make the memory</span>
      </div>

      <article className="space-y-4 bg-fb-surface px-4 pb-5 pt-3 md:rounded-[24px] md:shadow-card">
        {/* Cover: the group selfie, or any photo from the hangout */}
        {shot ? (
          <SelfieReview file={shot} people={people} viewerId={viewer.id} caption={museCaption || story} emoji={q.emoji} saving={busy === 'photo'}
            onRetake={() => { setShot(null); setCamera(true); }}
            onSave={(c, reactions) => void (async () => {
              setStory(c);
              await addPhoto(shot, true, c);
              setShot(null);
              if (reactions.length) void apiPost(`/api/quests/${id}/posts`, { text: reactions.join(' ') }).then(() => posts.refetch()).catch(() => {});
            })()} />
        ) : camera ? (
          <SelfieCamera here={people} quest={q}
            onTake={(f) => { flash(); setCamera(false); setShot(f); }}
            onPickFile={() => addRef.current?.click()} />
        ) : cover ? (
          <div className="relative overflow-hidden rounded-[22px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- crew photo */}
            <img src={photoSrc(cover)} alt={story || q.title} className="aspect-[4/3] w-full animate-polaroid object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
            <p className="absolute inset-x-4 bottom-3 text-[24px] font-extrabold leading-7 text-white [text-shadow:0_2px_8px_rgba(0,0,0,.45)]">{title || q.title}</p>
            <button type="button" onClick={() => setCamera(true)}
              className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3 text-[13px] font-semibold text-white backdrop-blur hover:bg-black/60">
              <Camera size={15} aria-hidden />Group selfie
            </button>
          </div>
        ) : (
          <button type="button" data-testid="memory-take-selfie" onClick={() => setCamera(true)} disabled={busy === 'photo'}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[22px] bg-gradient-to-br from-[#DDEDFE] via-[#F2F4F7] to-[#FDE7EF] text-fb-text">
            <span className="flex size-16 items-center justify-center rounded-full bg-fb-blue text-white shadow-[0_6px_16px_rgba(8,102,255,.35)]"><Camera size={28} aria-hidden /></span>
            <span className="text-[17px] font-bold">Take the group selfie</span>
            <span className="text-[13px] text-fb-text-2">Everyone who was there goes around the shutter</span>
          </button>
        )}

        {/* Title */}
        <div>
          <label htmlFor="memory-title" className="text-[12px] font-semibold uppercase tracking-wide text-fb-text-2">Title</label>
          <input id="memory-title" data-testid="memory-title" value={title} maxLength={80} placeholder={q.title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-[26px] font-extrabold leading-8 text-fb-text outline-none placeholder:text-fb-text-2/60" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setTitle(s)}
                className={cn('rounded-full px-2.5 py-1 text-[13px] font-semibold', title === s ? 'bg-fb-blue text-white' : 'bg-[#EFEBFF] text-[#6B4BFF] hover:brightness-95')}>
                ✨ {s}
              </button>
            ))}
          </div>
        </div>

        <MuseActivityStatus owner={`memory-caption:${q.id}`} />
        {/* Story */}
        <label className="block rounded-[16px] bg-fb-input px-3 py-2.5">
          <span className="flex items-center gap-1 text-[12px] font-semibold text-[#6B4BFF]"><Sparkles size={13} aria-hidden />{storyEdited ? 'Story · Your words' : captionStatus === 'pending' ? 'Story · Drafting from the title and venue…' : captionStatus === 'live' ? 'Story · Muse draft from title and venue' : captionStatus === 'mock' ? 'Story · Offline draft from title and venue' : 'Story · Write your memory'}</span>
          <textarea data-testid="memory-story" value={story} maxLength={500} rows={3} onChange={(e) => { setStoryEdited(true); setStory(e.target.value); }}
            placeholder="What happened? The best moment?"
            className="mt-1 w-full resize-none bg-transparent text-[15px] leading-6 text-fb-text outline-none" />
        </label>

        {storyEdited && museCaption && <p className="text-[12px] text-fb-text-2">Muse’s caption suggestion uses the hangout title and venue, not the photo.</p>}
        {captionStatus === 'error' && <p role="status" className="text-[13px] text-fb-text-2">Muse couldn’t draft a caption. You can still write and save your story.</p>}
        {/* Who was there */}
        <div>
          <h2 className="text-[17px] font-bold text-fb-text">Who was there</h2>
          <ul className="mt-2 flex gap-3 overflow-x-auto pb-1">
            {people.map((p) => (
              <li key={p.id} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                <span className="relative">
                  <Avatar src={p.avatarUrl} name={p.name} size={48} decorative className="ring-[3px] ring-[#31A24C]" />
                  <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-[#31A24C] text-[11px] font-bold text-white ring-2 ring-white">✓</span>
                </span>
                <span className="w-full truncate text-center text-[11px] font-semibold text-fb-text">{p.id === viewer.id ? 'You' : first(p.name)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Photos from the hangout */}
        <div>
          <h2 className="text-[17px] font-bold text-fb-text">Photos <span className="font-normal text-fb-text-2">· {photos.length}</span></h2>
          <ul className="mt-2 grid grid-cols-3 gap-2" data-testid="memory-photos">
            {photos.map((m) => (
              <li key={m.id} className="relative">
                <button type="button" onClick={() => setCoverId(m.id)} aria-label="Use as the cover" aria-pressed={cover?.id === m.id}
                  className={cn('block aspect-square w-full overflow-hidden rounded-[14px]', cover?.id === m.id && 'ring-[3px] ring-fb-blue')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- crew photo */}
                  <img src={photoSrc(m)} alt={m.caption || 'Photo from the hangout'} className="size-full object-cover" />
                </button>
                {cover?.id === m.id && <span aria-hidden className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-fb-blue text-white"><Star size={13} aria-hidden /></span>}
              </li>
            ))}
            <li>
              <button type="button" onClick={() => addRef.current?.click()} disabled={busy === 'photo'}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[14px] bg-fb-blue-tint text-fb-blue hover:brightness-95 disabled:opacity-50">
                <ImagePlus size={24} aria-hidden /><span className="text-[12px] font-semibold">{busy === 'photo' ? 'Adding…' : 'Add photos'}</span>
              </button>
            </li>
          </ul>
          <input ref={addRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void (async () => { for (const f of files) await addPhoto(f, false); })(); }} />
        </div>

        {/* The plan's chat */}
        <div>
          <h2 className="text-[17px] font-bold text-fb-text">Chat</h2>
          <ul className="mt-2 space-y-2" data-testid="memory-chat">
            {thread.length === 0 && <li className="text-[14px] text-fb-text-2">No messages yet. Say what made it.</li>}
            {[...thread].reverse().map((p) => {
              const mine = p.author.id === viewer.id;
              return (
                <li key={p.id} className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
                  {!mine && <Avatar src={p.author.avatarUrl} name={p.author.name} size={28} decorative />}
                  <p className={cn('max-w-[78%] rounded-[18px] px-3 py-2 text-[15px] leading-5', mine ? 'bg-fb-blue text-white' : 'bg-fb-input text-fb-text')}>
                    {!mine && <span className="block text-[12px] font-semibold text-fb-text-2">{first(p.author.name)}</span>}
                    {p.text}
                  </p>
                </li>
              );
            })}
          </ul>
          <form onSubmit={(e) => void sendChat(e)} className="mt-2 flex items-center gap-2">
            <label htmlFor="memory-chat-input" className="sr-only">Message everyone who was there</label>
            <input id="memory-chat-input" value={chat} maxLength={500} onChange={(e) => setChat(e.target.value)} placeholder="Message everyone who was there"
              className="h-11 min-w-0 flex-1 rounded-full bg-fb-input px-4 text-[15px] text-fb-text outline-none ring-fb-blue focus:ring-2" />
            <button type="submit" aria-label="Send" disabled={!chat.trim()} className="flex size-11 items-center justify-center rounded-full bg-fb-blue text-white disabled:opacity-40"><Send size={18} aria-hidden /></button>
          </form>
        </div>

        {/* How was it? (private) */}
        <div className="rounded-[16px] bg-fb-input p-3 text-center">
          <p className="text-[15px] font-bold text-fb-text">How was it?</p>
          <div className="mt-2 flex justify-center gap-4">
            {FEELINGS.map((f) => (
              <button key={f.key} type="button" aria-label={f.label} aria-pressed={feeling === f.key} onClick={(e) => feel(f.key, e.currentTarget)}
                className={cn('oh-press flex size-14 items-center justify-center rounded-full bg-fb-surface text-[30px] transition-all',
                  feeling === f.key ? 'scale-110 ring-[3px] ring-fb-blue' : feeling ? 'opacity-40' : '')}>
                {f.emoji}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-fb-text-2">Only Muse sees this. It makes your next plan better.</p>
        </div>
      </article>

      {/* Save */}
      <div className="fixed inset-x-0 bottom-[60px] z-20 px-4 pb-3 md:bottom-4 md:left-1/2 md:w-[640px] md:-translate-x-1/2 md:px-0">
        {savedAt ? (
          <div className="flex items-center gap-3 rounded-[16px] bg-fb-surface p-3 shadow-popover" data-testid="memory-saved">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#E6F4EA] text-fb-green"><Check size={20} aria-hidden /></span>
            <p className="min-w-0 flex-1 text-[15px] font-bold text-fb-text">Saved to {detail.data?.group?.name ?? 'your crew'}</p>
            {crew && <Link href={`/memories#crew-${crew.id}`} className="h-10 shrink-0 rounded-[12px] bg-fb-blue px-4 text-[14px] font-semibold leading-10 text-white">Do this again</Link>}
          </div>
        ) : (
          <button ref={saveRef} type="button" data-testid="memory-save" disabled={!crew || busy !== null} onClick={() => void save()}
            className="oh-press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-fb-blue text-[17px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save memory'}
          </button>
        )}
      </div>
    </div>
  );
}


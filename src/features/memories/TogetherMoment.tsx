'use client';
// You made it (#47, revised): arriving is about the people, then one photo. Two parts:
//   1. The arrival moment (ArrivalStage): "You made it." full screen over the map, who's here (✓)
//      and who's a minute out, one Muse line, then the camera (3-2-1, flash) and the print with
//      Muse's caption. "Later" or "Done" folds it into the capsule.
//   2. A quiet "Together" capsule at the top for the rest of the hangout: how long you've been
//      together, who's here, a small 📸 for candid photos (straight to the shared album), and
//      "Make the memory", which opens the memory page when the group is ready.
import { Camera, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi, type QuestDetail } from '@/features/data';
import { Avatar, burst, cn, flash, useDemoTools, useToast } from '@/features/ui';
import type { Quest } from '@/shared';
import type { PersonCard } from '@/shared/api';
import { ArrivalStage } from './ArrivalStage';
import { saveToAlbum } from './together-api';

type Walker = { id: string; name: string; avatarUrl: string; minutesAway: number };
type Person = { id: string; name: string; avatarUrl: string; here: boolean; minutes: number | null; you: boolean; coming: boolean };
/** "Make the memory" starts to pulse this close to the end. */
const NUDGE_BEFORE_END_MS = 15 * 60_000;

export function TogetherMoment({ quest, viewer, walkers, onClose }: {
  quest: Quest | null;
  viewer: { id: string; name: string; avatarUrl?: string };
  /** People walking to this plan, with minutes left (from the walk-together share). */
  walkers: Walker[];
  onClose: () => void;
}) {
  // Rendered at the map's top level: the 3D layer sits under the map's own buttons (I'm free, the
  // control stack), which would otherwise cover this and catch its taps.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>('[data-testid="out-here-map"]') ?? document.body); }, []);
  if (!quest || !host) return null;
  return createPortal(<Moment key={quest.id} quest={quest} viewer={viewer} walkers={walkers} onClose={onClose} />, host);
}

function useClock(ms = 15_000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setT(Date.now()), ms); return () => window.clearInterval(id); }, [ms]);
  return t;
}

function Moment({ quest, viewer, walkers, onClose }: {
  quest: Quest; viewer: { id: string; name: string; avatarUrl?: string }; walkers: Walker[]; onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useClock();
  const detail = useApi<QuestDetail>(`/api/quests/${quest.id}`, [`quest:${quest.id}`]);
  const [folded, setFolded] = useState(false);
  const [togetherSince, setTogetherSince] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const candidRef = useRef<HTMLInputElement>(null);
  // One photo path on stage (Make the memory → group selfie); the candid 📸 is a ?tools=1 extra.
  const tools = useDemoTools();

  // Who's here: you, plus everyone going whose walk says they're within a minute.
  const people: Person[] = useMemo(() => {
    const members: PersonCard[] = detail.data?.members ?? [];
    const byId = new Map(walkers.map((w) => [w.id, w]));
    const list = members.map((m) => {
      const w = byId.get(m.id);
      const you = m.id === viewer.id;
      return { id: m.id, name: m.name, avatarUrl: m.avatarUrl, you, here: you || (!!w && w.minutesAway <= 1), minutes: w ? w.minutesAway : null, coming: you || !!w };
    });
    if (!list.some((p) => p.you)) list.unshift({ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl ?? '', you: true, here: true, minutes: 0, coming: true });
    return list.sort((a, b) => Number(b.here) - Number(a.here) || Number(b.you) - Number(a.you));
  }, [detail.data, walkers, viewer]);
  const here = people.filter((p) => p.here);
  // Everyone on the way: you plus each person sharing their walk here. People who never set off
  // (no walk to follow) don't hold the moment up.
  const onTheWay = people.filter((p) => p.coming && !p.here);
  const allHere = onTheWay.length === 0;

  // Folded: confetti from the capsule each time someone else gets there (the arrival moment does
  // its own while it's open).
  const lastCount = useRef(0);
  useEffect(() => {
    if (folded && lastCount.current > 0 && here.length > lastCount.current) burst(capsuleRef.current, [quest.emoji, '🎉', '✨', '🎊'], 14);
    lastCount.current = here.length;
  }, [here.length, quest.emoji, folded]);
  useEffect(() => { if (allHere && togetherSince === null) setTogetherSince(Date.now()); }, [allHere, togetherSince]);

  const candid = async (file: File | undefined) => {
    if (!file) return;
    flash();
    setUploading(true);
    try {
      await saveToAlbum(quest.id, file);
      toast.show('📸 Added to the shared album');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Couldn’t add the photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const minutesTogether = togetherSince ? Math.max(0, Math.round((now - togetherSince) / 60_000)) : 0;
  const nudge = Date.parse(quest.endsAt) - now <= NUDGE_BEFORE_END_MS;
  const goMemory = () => router.push(`/out-here/plan/${quest.id}/memory`);

  if (folded) {
    return (
      <div ref={capsuleRef} role="status" data-testid="together-capsule"
        className="pointer-events-auto absolute left-1/2 top-3 z-40 flex w-[min(calc(100%-24px),460px)] -translate-x-1/2 animate-drop-in items-center gap-2 rounded-full bg-fb-surface/95 p-1.5 shadow-popover backdrop-blur">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF1E0] text-[22px]">{quest.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold leading-4 text-fb-text">Together{minutesTogether > 0 ? ` · ${minutesTogether}m` : ''}</p>
          <span className="mt-0.5 flex -space-x-1.5">
            {here.slice(0, 5).map((p) => <Avatar key={p.id} src={p.avatarUrl} name={p.name} size={20} decorative className="ring-2 ring-white" />)}
          </span>
        </div>
        {tools && <button type="button" aria-label="Take a candid photo" title="Candid photo (goes to the shared album)" disabled={uploading}
          onClick={() => candidRef.current?.click()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fb-secondary-btn text-fb-text hover:brightness-95 disabled:opacity-50">
          <Camera size={18} aria-hidden />
        </button>}
        <button type="button" data-testid="together-make-memory" onClick={goMemory}
          className={cn('oh-press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-fb-blue px-4 text-[14px] font-semibold text-white hover:bg-fb-blue-hover', nudge && 'animate-pulse')}>
          <Sparkles size={16} aria-hidden />Make the memory
        </button>
        <input ref={candidRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { void candid(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return <ArrivalStage quest={quest} people={people} allHere={allHere} onFold={() => setFolded(true)} onClose={onClose} />;
}

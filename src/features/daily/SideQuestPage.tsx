'use client';

// /side-quest: today's Side Quest end to end: the mission, the camera flow, completion, the
// community board, progress, your Side Quest memories, quiet hours, and (when the server enables
// them) the demo controls.
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Skeleton, useToast } from '@/features/ui';
import { apiFetch } from '@/features/data';
import type { SideQuestState } from '@/shared/api';
import { CaptureFlow } from './CaptureFlow';
import { DemoControls } from './DemoControls';
import { PrefsCard } from './PrefsCard';
import { Progress } from './Progress';
import { SideQuestBoard } from './SideQuestBoard';
import { SideQuestCard } from './SideQuestCard';
import { SideQuestMemories, useSideQuestHistory } from './SideQuestMemories';
import { useSideQuest } from './useSideQuest';

export function SideQuestPage() {
  const toast = useToast();
  const live = useSideQuest();
  const { state, phase, apply, reload, error } = live;
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoOpened = useRef(false);
  // Anything that changes what history and the board show.
  const changeKey = state ? `${state.entry?.submittedAt ?? ''}|${state.entry?.audience ?? ''}|${state.boardCount}|${state.dropAt}` : '';
  const history = useSideQuestHistory(changeKey);

  // ?capture=1 (from the drop reveal) opens the camera once the quest is live.
  useEffect(() => {
    if (autoOpened.current || phase !== 'active' || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('capture') === '1') { autoOpened.current = true; setCapturing(true); }
  }, [phase]);

  const seeBoard = () => document.getElementById('sq-board')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  const unshare = async () => {
    if (!state) return;
    setBusy(true);
    try {
      apply(await apiFetch<SideQuestState>(`/api/daily/side-quest/entry?date=${state.date}`, { method: 'DELETE' }));
      toast.show('Removed from the board. It’s still in your Memories.');
    } catch { toast.show('Couldn’t remove it. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3 px-0 pb-8 md:px-4 md:pt-4">
      <div className="px-4 pt-3 md:px-0 md:pt-0">
        <h1 className="text-[24px] font-bold leading-[30px] text-fb-text">Side Quest</h1>
        <p className="mt-1 text-[15px] text-fb-text-2">A surprise challenge every day. Take a photo, then see how everyone else saw it.</p>
      </div>

      {error && !state && (
        <Card padded role="alert"><p className="text-fb-text-2">Could not load today’s Side Quest: {error}</p><Button className="mt-2" variant="secondary" onClick={() => void reload()}>Try again</Button></Card>
      )}
      {!state && !error && <Card padded aria-busy="true"><Skeleton className="h-6 w-48" /><Skeleton className="mt-3 h-28 w-full" /></Card>}

      {state && (
        <>
          <div className="px-0">
            <SideQuestCard live={live} onTakePhoto={() => setCapturing(true)} onSeeBoard={seeBoard} onUnshare={unshare} busy={busy} />
          </div>
          {state.demo && <DemoControls onState={apply} />}
          <Progress state={state} history={history} />
          <SideQuestBoard refreshKey={changeKey} onChanged={() => void reload()} />
          <SideQuestMemories variant="grid" history={history} />
          <PrefsCard prefs={state.prefs} onSaved={() => void reload()} />
          <CaptureFlow open={capturing} onClose={() => setCapturing(false)} live={live} onSeeBoard={seeBoard} />
        </>
      )}
    </div>
  );
}

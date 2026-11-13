'use client';

// The Side Quest popup, on the Out Here map. Mounted once in the Facebook shell but active only on
// /out-here: when the drop arrives (or is already live when the map opens) a one-time popup reveals
// the challenge with the live countdown. "Take photo" opens the camera, review and completion in
// the same popup flow. "Later" minimizes it to a small countdown pill on the map, so dismissing it
// never loses the quest. Finished quests live in Memories (the community board is there).
// Automated browsers (navigator.webdriver) skip the automatic popup so it never blocks tests; the
// pill still appears.
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { formatCountdown, remainingMs } from '@/shared';
import { useViewer } from '@/features/data';
import { Button } from '@/features/ui';
import { CaptureFlow } from './CaptureFlow';
import { Countdown } from './Countdown';
import { useSideQuest } from './useSideQuest';

export const BOARD_HREF = '/memories#side-quest';

const SEEN = (handle: string, dropAt: string) => `outhere.sq.seen.${handle}.${dropAt}`;
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string) => { try { window.localStorage.setItem(k, '1'); } catch { /* private mode: the popup may show again */ } };

export function SideQuestHost() {
  const pathname = usePathname() ?? '/';
  // Only the map page runs this (no polling anywhere else).
  if (pathname !== '/out-here' && !pathname.startsWith('/out-here/')) return null;
  return <MapPopup />;
}

function MapPopup() {
  const router = useRouter();
  const { handle } = useViewer();
  const live = useSideQuest();
  const { state, phase, now } = live;
  const [revealing, setRevealing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const open = !!state && phase === 'active' && !state.entry;

  // Reveal once per drop.
  useEffect(() => {
    if (!open || !state || navigator.webdriver) return;
    const key = SEEN(handle, state.dropAt);
    if (read(key)) return;
    write(key);
    setRevealing(true);
  }, [open, state, handle]);

  useEffect(() => {
    if (!revealing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRevealing(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [revealing]);
  // The popup closes by itself if the quest ends or is completed elsewhere.
  useEffect(() => { if (!open) setRevealing(false); }, [open]);

  if (!state) return null;
  const left = remainingMs(now, state.deadlineAt);
  const takePhoto = () => { setRevealing(false); setCapturing(true); };

  return (
    <>
      {open && revealing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-fb-scrim p-4" data-testid="sq-reveal">
          <div role="dialog" aria-modal="true" aria-labelledby="sq-reveal-title"
            className="w-full max-w-[420px] rounded-card bg-fb-blue px-5 pb-6 pt-5 text-center text-white shadow-popover motion-safe:animate-sq-pop">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/85">Side Quest dropped!</p>
            <p className="mt-3 text-[56px] leading-none" aria-hidden>{state.challenge.emoji}</p>
            <h2 id="sq-reveal-title" className="mt-2 text-[30px] font-extrabold leading-[32px]" data-testid="sq-title">{state.challenge.title}</h2>
            <p className="mx-auto mt-2 max-w-[32ch] text-[17px] leading-[22px] text-white/95">{state.challenge.description}</p>
            <div className="mx-auto mt-4 rounded-card bg-white/15 px-4 py-3">
              <Countdown now={now} until={state.deadlineAt} className="text-[40px]" />
              <p className="mt-1 text-[13px] text-white/85">left to take your photo</p>
            </div>
            <p className="mt-3 text-[14px] text-white/90">Solo or with friends{state.challenge.friendTip ? ` · ${state.challenge.friendTip}` : ''}</p>
            {state.challenge.safety && <p className="mt-1 text-[13px] text-white/80">{state.challenge.safety}</p>}
            <Button autoFocus size="lg" block className="mt-4 !bg-white !text-fb-blue hover:!bg-white/90" icon={<Camera size={20} aria-hidden />} onClick={takePhoto} data-testid="sq-take-photo">
              Take photo
            </Button>
            <button type="button" onClick={() => setRevealing(false)} className="mt-3 text-[15px] font-semibold text-white/90 underline-offset-2 hover:underline" data-testid="sq-later">Later</button>
          </div>
        </div>
      )}

      {open && !revealing && !capturing && (
        <button type="button" onClick={() => setRevealing(true)} data-testid="sq-pill"
          aria-label={`Side Quest: ${state.challenge.title}, ${formatCountdown(left)} left. Open`}
          className="fixed bottom-[88px] right-3 z-40 flex items-center gap-2 rounded-full bg-fb-blue px-4 py-2 text-[15px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover md:bottom-8">
          <span aria-hidden>{state.challenge.emoji}</span>
          <span>Side Quest</span>
          <span className="tabular-nums" aria-hidden>{formatCountdown(left)}</span>
        </button>
      )}

      <CaptureFlow open={capturing} onClose={() => setCapturing(false)} live={live} onSeeBoard={() => router.push(BOARD_HREF)} />
    </>
  );
}

'use client';

// Mounted once in the Facebook shell. Watches the viewer's Side Quest so the surprise reaches them
// wherever they are in Out Here: when the drop arrives (or is already live when they open the app)
// a short reveal appears once; afterwards a small pill with the live countdown stays within reach.
// Automated browsers (navigator.webdriver) skip the reveal so it never blocks tests; the pill and
// /side-quest still work.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { formatCountdown, remainingMs } from '@/shared';
import { useViewer } from '@/features/data';
import { Button } from '@/features/ui';
import { Countdown } from './Countdown';
import { useSideQuest } from './useSideQuest';

const SEEN = (handle: string, dropAt: string) => `outhere.sq.seen.${handle}.${dropAt}`;
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string) => { try { window.localStorage.setItem(k, '1'); } catch { /* private mode: reveal may show again */ } };

export function SideQuestHost() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { handle } = useViewer();
  const { state, phase, now } = useSideQuest();
  const [revealing, setRevealing] = useState(false);
  const onPage = pathname === '/side-quest' || pathname.startsWith('/side-quest/');
  const live = !!state && phase === 'active' && !state.entry;

  // Reveal once per drop (a demo re-trigger is a new drop, so it reveals again).
  useEffect(() => {
    if (!live || !state || onPage || navigator.webdriver) return;
    const key = SEEN(handle, state.dropAt);
    if (read(key)) return;
    write(key);
    setRevealing(true);
  }, [live, state, handle, onPage]);

  useEffect(() => {
    if (!revealing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRevealing(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [revealing]);
  // The reveal ends by itself if the quest ends or is completed elsewhere.
  useEffect(() => { if (!live) setRevealing(false); }, [live]);

  if (!state || !live) return null;
  const left = remainingMs(now, state.deadlineAt);

  return (
    <>
      {revealing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-fb-scrim p-4" data-testid="sq-reveal">
          <div role="dialog" aria-modal="true" aria-labelledby="sq-reveal-title"
            className="w-full max-w-[420px] rounded-card bg-fb-blue px-5 pb-6 pt-5 text-center text-white shadow-popover motion-safe:animate-sq-pop">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/85">Side Quest dropped!</p>
            <p className="mt-3 text-[56px] leading-none" aria-hidden>{state.challenge.emoji}</p>
            <h2 id="sq-reveal-title" className="mt-2 text-[30px] font-extrabold leading-[32px]">{state.challenge.title}</h2>
            <p className="mx-auto mt-2 max-w-[32ch] text-[17px] leading-[22px] text-white/95">{state.challenge.description}</p>
            <div className="mx-auto mt-4 rounded-card bg-white/15 px-4 py-3">
              <Countdown now={now} until={state.deadlineAt} className="text-[40px]" />
              <p className="mt-1 text-[13px] text-white/85">left to take your photo</p>
            </div>
            <Button autoFocus size="lg" block className="mt-4 !bg-white !text-fb-blue hover:!bg-white/90" icon={<Camera size={20} aria-hidden />}
              onClick={() => { setRevealing(false); router.push('/side-quest?capture=1'); }} data-testid="sq-reveal-go">
              Take photo
            </Button>
            <button type="button" onClick={() => setRevealing(false)} className="mt-3 text-[15px] font-semibold text-white/90 underline-offset-2 hover:underline">Later</button>
          </div>
        </div>
      )}
      {!onPage && !revealing && (
        <Link href="/side-quest" data-testid="sq-pill" aria-label={`Side Quest: ${state.challenge.title}, ${formatCountdown(left)} left`}
          className="fixed bottom-[88px] right-3 z-40 flex items-center gap-2 rounded-full bg-fb-blue px-4 py-2 text-[15px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover md:bottom-8">
          <span aria-hidden>{state.challenge.emoji}</span>
          <span>Side Quest</span>
          <span className="tabular-nums" aria-hidden>{formatCountdown(left)}</span>
        </Link>
      )}
    </>
  );
}

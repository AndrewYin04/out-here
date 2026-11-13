'use client';

// The Side Quest card on /side-quest: one component for the four moments of a day: waiting for
// the drop, the live mission (the visual high point), done, and ended. The mission card is bold
// Facebook blue with the countdown as the hero; the other states are calm Facebook cards.
import Link from 'next/link';
import { Camera, CheckCircle2, Clock, Lock, Sparkles, Users } from 'lucide-react';
import { formatMinutesOfDay } from '@/shared';
import { Button, Card, cn, LinkButton } from '@/features/ui';
import { Countdown } from './Countdown';
import { dailyPhotoSrc } from './photo';
import type { SideQuestLive } from './useSideQuest';

export type SideQuestCardProps = {
  live: SideQuestLive;
  onTakePhoto: () => void;
  onSeeBoard: () => void;
  onUnshare: () => void;
  busy?: boolean;
};

export function SideQuestCard({ live, onTakePhoto, onSeeBoard, onUnshare, busy = false }: SideQuestCardProps) {
  const { state, phase, now } = live;
  if (!state || !phase) return null;
  const { challenge, entry } = state;

  if (phase === 'active') {
    return (
      <section aria-label="Today's Side Quest" data-testid="sq-active" data-phase="active"
        className="overflow-hidden rounded-card bg-fb-blue text-white shadow-popover motion-safe:animate-sq-pop">
        <div className="px-5 pb-6 pt-5 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/85">Side Quest dropped!</p>
          <p className="mt-4 text-[56px] leading-none" aria-hidden>{challenge.emoji}</p>
          <h2 className="mt-3 text-[32px] font-extrabold leading-[34px]" data-testid="sq-title">{challenge.title}</h2>
          <p className="mx-auto mt-2 max-w-[34ch] text-[17px] leading-[22px] text-white/95" data-testid="sq-description">{challenge.description}</p>

          <div className="mx-auto mt-5 rounded-card bg-white/15 px-4 py-3">
            <Countdown now={now} until={state.deadlineAt} className="text-[44px]" />
            <p className="mt-1 text-[13px] text-white/85">left to take your photo</p>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[14px] text-white/90">
            <Users size={16} aria-hidden /> Solo or with friends
            {challenge.friendTip && <span className="hidden sm:inline"> · {challenge.friendTip}</span>}
          </p>
          {challenge.safety && <p className="mt-1 text-[13px] text-white/80">{challenge.safety}</p>}

          <Button onClick={onTakePhoto} size="lg" block className="mt-5 !bg-white !text-fb-blue hover:!bg-white/90" icon={<Camera size={20} aria-hidden />} data-testid="sq-take-photo">
            Take photo
          </Button>
          <Link href="/out-here?free=1" className="mt-3 inline-block text-[15px] font-semibold text-white underline-offset-2 hover:underline">
            Find a plan with Muse
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'completed' && entry) {
    return (
      <Card as="section" aria-label="Side Quest complete" className="overflow-hidden" data-testid="sq-completed" data-phase="completed">
        <div className="flex items-start gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dailyPhotoSrc(entry.photoUrl)} alt={`Your ${challenge.title} photo`} className="h-24 w-24 shrink-0 rounded-card object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fb-blue"><CheckCircle2 size={18} aria-hidden /> Side Quest complete!</p>
            <h2 className="mt-0.5 text-[20px] font-bold leading-6 text-fb-text">{challenge.emoji} {challenge.title}</h2>
            {entry.caption && <p className="mt-0.5 text-[15px] text-fb-text">&ldquo;{entry.caption}&rdquo;</p>}
            <p className="mt-1 text-[13px] text-fb-text-2">
              {entry.audience === 'community' ? 'Saved to Memories and shared with the community' : <span className="inline-flex items-center gap-1"><Lock size={12} aria-hidden /> Saved to Memories. Only you can see it.</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-fb-divider-soft p-3">
          <Button onClick={onSeeBoard}>See the board</Button>
          <LinkButton href="/memories" variant="secondary">View memory</LinkButton>
          {entry.audience === 'community' && <Button variant="ghost" onClick={onUnshare} disabled={busy} data-testid="sq-unshare">Remove from board</Button>}
        </div>
      </Card>
    );
  }

  if (phase === 'expired') {
    return (
      <Card as="section" aria-label="Side Quest ended" padded data-testid="sq-expired" data-phase="expired">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fb-text-2"><Clock size={16} aria-hidden /> Quest ended</p>
        <h2 className="mt-1 text-[20px] font-bold text-fb-text">{challenge.emoji} {challenge.title}</h2>
        <p className="mt-1 text-[15px] text-fb-text-2">This one’s closed. See how other people did it, and tomorrow brings a new one.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onSeeBoard}>See the board</Button>
          <LinkButton href="/memories" variant="secondary">Open Memories</LinkButton>
        </div>
      </Card>
    );
  }

  // waiting: the drop has not happened yet. The exact time stays a surprise.
  return (
    <Card as="section" aria-label="Side Quest on its way" padded className={cn('text-center')} data-testid="sq-waiting" data-phase="waiting">
      <p className="text-[40px]" aria-hidden><Sparkles className="mx-auto text-fb-blue" size={40} /></p>
      <h2 className="mt-2 text-[20px] font-bold text-fb-text">Today’s Side Quest is on its way</h2>
      <p className="mx-auto mt-1 max-w-[40ch] text-[15px] text-fb-text-2">
        It drops at a surprise time between {formatMinutesOfDay(state.prefs.startMin)} and {formatMinutesOfDay(state.prefs.endMin)}.
        Keep Out Here open, or check back later.
      </p>
    </Card>
  );
}

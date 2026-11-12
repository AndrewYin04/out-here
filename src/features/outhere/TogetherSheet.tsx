'use client';
// Plan together: one shared sheet for everyone in the group. Muse's options are the same on
// every phone; each person taps "I'm in" on the ones they like, and it locks when everyone is in
// on one. Nobody sees a "no": an unanswered plan expires quietly when the shared time ends.
import Link from 'next/link';
import { CalendarCheck, Check, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { apiPost, useApi, useViewer } from '@/features/data';
import { Avatar, Button, IconButton, Skeleton, cn } from '@/features/ui';
import { formatDemoTime, minutesUntil, type TogetherResponse, type TogetherView } from '@/shared';
import { MuseLabel } from './SuggestionCard';
import { openPlanWith, openTogether, useTogetherId } from './plan-state';

const first = (name: string) => name.split(' ')[0] ?? name;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

function startsText(iso: string): string {
  const m = minutesUntil(iso);
  if (m <= 0) return 'happening now';
  return m < 60 ? `starts in ${m} min` : `starts ${formatDemoTime(iso)}`;
}

export function TogetherSheet() {
  const id = useTogetherId();
  if (!id) return null;
  return <Sheet key={id} id={id} />;
}

function Sheet({ id }: { id: string }) {
  const { viewer } = useViewer();
  const api = useApi<TogetherResponse>(`/api/together/${id}`, [`together:${id}`, `user:${viewer.id}`]);
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plan = api.data?.plan;
  const others = plan ? plan.members.filter((m) => m.id !== viewer.id) : [];
  const otherNames = names(others.map((m) => first(m.name)));

  const vote = async (questId: string, isIn: boolean) => {
    setBusyOn(questId);
    setError(null);
    try {
      await apiPost(`/api/together/${id}/vote`, { questId, in: isIn });
      await api.refetch();
    } catch {
      setError('Couldn’t save that. Try again.');
    } finally {
      setBusyOn(null);
    }
  };

  return (
    <section
      aria-label="Plan together"
      data-testid="together-sheet"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-[16px] bg-fb-surface shadow-popover md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-card"
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fb-divider md:hidden" aria-hidden />
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-2">
        <span className="flex shrink-0 -space-x-2.5">
          {(plan?.members ?? []).slice(0, 4).map((m) => (
            <Avatar key={m.id} src={m.avatarUrl} name={m.name} size={36} decorative className="ring-2 ring-white" />
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-bold leading-6 text-fb-text">{plan ? `You and ${otherNames}` : 'Plan together'}</h2>
          {plan && plan.status === 'proposing' && (
            <p className="text-[13px] text-fb-text-2">Free together till {formatDemoTime(plan.expiresAt)}</p>
          )}
        </div>
        <IconButton label="Close" size="md" onClick={() => openTogether(null)}>
          <X size={20} aria-hidden />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-fb-bg px-3 pb-4 pt-3 md:rounded-b-card">
        {!plan && (
          <div aria-busy="true">
            <p className="mb-3 px-1 text-[15px] font-semibold text-fb-text">✨ Muse is finding something for all of you…</p>
            {[0, 1].map((i) => <Skeleton key={i} className="mb-2 h-28 w-full rounded-card" />)}
          </div>
        )}
        {plan?.status === 'confirmed' && <Confirmed plan={plan} otherNames={otherNames} />}
        {plan?.status === 'expired' && (
          <div className="rounded-card bg-fb-surface p-4 text-center shadow-card">
            <p className="text-[17px] font-semibold text-fb-text">This one passed</p>
            <p className="mt-1 text-[13px] text-fb-text-2">Your free time together ended. Maybe next time.</p>
          </div>
        )}
        {plan?.status === 'proposing' && (
          <>
            <div className="mb-3 px-1">
              <MuseLabel className="mb-1" />
              <p className="text-[15px] leading-5 text-fb-text">{plan.summary}</p>
            </div>
            {plan.options.length === 0 ? (
              <div className="rounded-card bg-fb-surface p-4 text-center shadow-card">
                <Button className="mt-1" onClick={() => openPlanWith(`with ${otherNames}, `)}>Tell Muse what you’re up for</Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {plan.options.map((o) => {
                  const inIds = plan.memberIds.filter((m) => (plan.votes[m] ?? []).includes(o.questId));
                  const mine = inIds.includes(viewer.id);
                  const othersIn = plan.members.filter((m) => m.id !== viewer.id && inIds.includes(m.id));
                  const full = o.seatsLeft === 0;
                  return (
                    <li key={o.questId} data-testid="together-option"
                      className={cn('rounded-card bg-fb-surface p-3 shadow-card transition-shadow', othersIn.length > 0 && !mine && 'ring-2 ring-fb-green')}>
                      <div className="flex items-start gap-3">
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fb-bg text-[22px]">{o.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-semibold leading-5 text-fb-text">{o.title}</h3>
                          <p className="mt-0.5 text-[13px] text-fb-text-2">{o.venueName} · {startsText(o.startsAt)}</p>
                          <p className="mt-1 text-[14px] text-fb-text">{o.reason}</p>
                        </div>
                      </div>
                      {othersIn.length > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-fb-green" data-testid="together-others-in">
                          <span className="flex -space-x-1.5">{othersIn.map((m) => <Avatar key={m.id} src={m.avatarUrl} name={m.name} size={20} decorative />)}</span>
                          {names(othersIn.map((m) => first(m.name)))} {othersIn.length === 1 ? 'is' : 'are'} in
                        </p>
                      )}
                      <Button className="mt-2" block variant={mine ? 'secondary' : 'primary'} disabled={busyOn !== null || (full && !mine)}
                        aria-pressed={mine} onClick={() => void vote(o.questId, !mine)}>
                        {full && !mine ? 'Full' : mine ? <span className="inline-flex items-center gap-1.5"><Check size={16} aria-hidden />You’re in</span> : 'I’m in'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {plan.options.length > 0 && <Waiting plan={plan} viewerId={viewer.id} />}
            {error && <p role="alert" className="mt-2 px-1 text-[13px] text-fb-red">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}

/** "Waiting on Maya…" once you're in somewhere and not everyone agrees yet. Never names a no. */
function Waiting({ plan, viewerId }: { plan: TogetherView; viewerId: string }) {
  const mineIn = (plan.votes[viewerId] ?? []).length > 0;
  if (!mineIn) return null;
  const waiting = plan.members.filter((m) => m.id !== viewerId && (plan.votes[m.id] ?? []).length === 0);
  const text = waiting.length > 0
    ? `Waiting on ${names(waiting.map((m) => first(m.name)))}… it locks when you all pick the same one.`
    : 'Pick the same one to lock it in.';
  return <p className="mt-3 px-1 text-center text-[13px] text-fb-text-2" aria-live="polite" data-testid="together-waiting">{text}</p>;
}

function Confirmed({ plan, otherNames }: { plan: TogetherView; otherNames: string }) {
  const o = plan.options.find((x) => x.questId === plan.confirmedQuestId);
  if (!o) return null;
  return (
    <div className="rounded-card bg-fb-surface p-4 text-center shadow-card" data-testid="together-confirmed">
      <p className="text-[40px] leading-none" aria-hidden>{o.emoji}</p>
      <p className="mt-2 text-[20px] font-bold text-fb-text">It’s a plan!</p>
      <p className="mt-1 text-[15px] text-fb-text">{o.title} with {otherNames}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[13px] text-fb-text-2">
        <MapPin size={14} aria-hidden />{o.venueName} · {startsText(o.startsAt)}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button"
          onClick={() => { openTogether(null); window.dispatchEvent(new CustomEvent('outhere:select-quest', { detail: o.questId })); }}
          className="inline-flex h-10 items-center justify-center rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover">
          See it on the map
        </button>
        <Link href="/events?tab=going" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-btn bg-fb-secondary-btn text-[15px] font-semibold text-fb-text">
          <CalendarCheck size={17} aria-hidden />Your plans
        </Link>
      </div>
    </div>
  );
}

'use client';

// Progress, kept honest: one primary number (the weekly in-person streak, unchanged from the
// existing hangout logic) and one secondary history (the last seven days of Side Quests, plus the
// total completed). Only real records are shown; a day with nothing is a plain grey dot, never a
// warning. No second consecutive-day streak.
import { Check } from 'lucide-react';
import type { SideQuestHistoryResponse, SideQuestState } from '@/shared/api';
import { Card, cn } from '@/features/ui';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
const WEEKDAY_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
const dayOf = (date: string) => new Date(`${date}T12:00:00Z`);

export function Progress({ state, history }: { state: SideQuestState; history: SideQuestHistoryResponse | null }) {
  const { weeks, thisWeekDone } = state.weeklyStreak;
  return (
    <Card padded data-testid="sq-progress">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-fb-text-2">Weekly streak</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[40px] font-extrabold leading-none text-fb-blue" data-testid="sq-weeks">{weeks}</span>
            <span className="text-[17px] font-semibold text-fb-text">{weeks === 1 ? 'week' : 'weeks'}</span>
          </p>
          <p className="mt-1 text-[13px] text-fb-text-2">
            Weeks in a row you hung out in person.{thisWeekDone ? ' This week is done.' : ''}
          </p>
        </div>
        {history && (
          <div className="shrink-0 text-right">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-fb-text-2">Side Quests</p>
            <p className="mt-0.5 text-[28px] font-extrabold leading-none text-fb-text" data-testid="sq-completed-count">{history.completedCount}</p>
            <p className="mt-1 text-[13px] text-fb-text-2">completed</p>
          </div>
        )}
      </div>

      {history && (
        <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Your last seven days of Side Quests" data-testid="sq-week">
          {history.week.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1" data-status={d.status}>
              <span className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-[13px]',
                d.status === 'completed' && 'bg-fb-blue text-white motion-safe:animate-sq-check',
                d.status === 'today' && 'border-2 border-fb-blue text-fb-blue',
                (d.status === 'missed' || d.status === 'none') && 'bg-fb-bg text-fb-text-2',
              )}>
                {d.status === 'completed' ? <Check size={18} strokeWidth={3} aria-label="Completed" /> : d.status === 'today' ? <span aria-hidden>{d.emoji}</span> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fb-divider" />}
              </span>
              <span className="text-[12px] text-fb-text-2" aria-label={`${WEEKDAY_LONG.format(dayOf(d.date))}: ${d.status === 'completed' ? 'completed' : d.status === 'today' ? 'today' : 'not completed'}`}>
                {WEEKDAY.format(dayOf(d.date))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

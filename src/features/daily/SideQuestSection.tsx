'use client';

// The Side Quest section of Memories: today's community board, your own Side Quest photos,
// progress and quiet hours. (The challenge itself arrives as a popup on the Out Here map; this is
// where the results live.) Deep links: /memories#side-quest opens the board,
// /memories#side-quest-mine opens your own.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, cn } from '@/features/ui';
import { PrefsCard } from './PrefsCard';
import { Progress } from './Progress';
import { SideQuestBoard } from './SideQuestBoard';
import { SideQuestMemories, useSideQuestHistory } from './SideQuestMemories';
import { useSideQuest } from './useSideQuest';

type Tab = 'board' | 'mine';
const TABS: { id: Tab; label: string }[] = [{ id: 'board', label: 'Community board' }, { id: 'mine', label: 'My Side Quests' }];

export function SideQuestSection() {
  const live = useSideQuest();
  const { state, phase, reload } = live;
  const [tab, setTab] = useState<Tab>('board');
  // Anything that changes what the board and history show.
  const changeKey = state ? `${state.entry?.submittedAt ?? ''}|${state.entry?.audience ?? ''}|${state.boardCount}|${state.dropAt}` : '';
  const history = useSideQuestHistory(changeKey);

  // Open the right tab and scroll into view for deep links.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash !== '#side-quest' && hash !== '#side-quest-mine') return;
    if (hash === '#side-quest-mine') setTab('mine');
    window.setTimeout(() => document.getElementById('side-quest')?.scrollIntoView({ block: 'start', behavior: 'auto' }), 300);
  }, [state?.date]);

  if (!state) return null;
  const hint = state.entry ? null
    : phase === 'active' ? 'Today’s Side Quest is live. Open the Out Here map to take your photo.'
    : phase === 'waiting' ? 'Today’s Side Quest drops at a surprise time. Keep Out Here open.'
    : 'Today’s Side Quest has ended.';

  return (
    <section id="side-quest" aria-labelledby="sq-section-title" className="mb-3 scroll-mt-16" data-testid="sq-section">
      <Card padded>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fb-blue text-white" aria-hidden><Sparkles size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="sq-section-title" className="text-[17px] font-semibold text-fb-text">Side Quest</h2>
            <p className="text-[15px] text-fb-text" data-testid="sq-today">{state.challenge.emoji} {state.challenge.title}: {state.challenge.description}</p>
            {hint && <p className="mt-0.5 text-[13px] text-fb-text-2">{hint} {phase === 'active' && <Link href="/out-here" className="font-semibold text-fb-blue hover:underline">Open the map</Link>}</p>}
            {state.entry && <p className="mt-0.5 text-[13px] text-fb-text-2">You completed today’s Side Quest.</p>}
          </div>
        </div>
        <div role="tablist" aria-label="Side Quest" className="mt-3 flex gap-1 rounded-pill bg-fb-bg p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`sq-tab-${t.id}`}
              className={cn('h-8 flex-1 rounded-pill px-3 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-fb-blue',
                tab === t.id ? 'bg-fb-surface text-fb-blue shadow-card' : 'text-fb-text-2 hover:bg-fb-hover')}>
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-3 flex flex-col gap-3">
        {tab === 'board' && <SideQuestBoard refreshKey={changeKey} onChanged={() => void reload()} />}
        {tab === 'mine' && (
          <>
            <Progress state={state} history={history} />
            <SideQuestMemories history={history} />
            <PrefsCard prefs={state.prefs} onSaved={() => void reload()} />
          </>
        )}
      </div>
    </section>
  );
}

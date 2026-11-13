'use client';

// Side Quest photos as personal memories. `variant="strip"` is the compact row on the Memories
// page (renders nothing until there is one); `variant="grid"` is the full list on /side-quest.
// Entries are the person's own records (private unless they shared them), straight from history.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import type { SideQuestHistoryResponse } from '@/shared/api';
import { apiFetch, useViewer } from '@/features/data';
import { Card } from '@/features/ui';
import { dailyPhotoSrc } from './photo';

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const FRESH = { headers: { 'x-outhere-fresh': '1' } };

export function useSideQuestHistory(refreshKey?: unknown): SideQuestHistoryResponse | null {
  const { handle } = useViewer();
  const [history, setHistory] = useState<SideQuestHistoryResponse | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch<SideQuestHistoryResponse>('/api/daily/side-quest/history', FRESH)
      .then((h) => { if (alive) setHistory(h); })
      .catch(() => { if (alive) setHistory(null); });
    return () => { alive = false; };
  }, [handle, refreshKey]);
  return history;
}

export function SideQuestMemories({ variant = 'strip', history: given }: { variant?: 'strip' | 'grid'; history?: SideQuestHistoryResponse | null }) {
  const own = useSideQuestHistory();
  const history = given === undefined ? own : given;
  if (!history || history.memories.length === 0) return variant === 'grid' && history ? <p className="px-4 text-[15px] text-fb-text-2 md:px-0">Your finished Side Quests land here.</p> : null;
  const shown = variant === 'strip' ? history.memories.slice(0, 6) : history.memories;

  return (
    <section id="memories" aria-labelledby="sq-mem-title" className="scroll-mt-16" data-testid="sq-memories">
      <Card padded={variant === 'strip'} className={variant === 'grid' ? 'p-4' : undefined}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="sq-mem-title" className="text-[17px] font-semibold text-fb-text">Side Quest memories</h2>
          {variant === 'strip' && <Link href="/side-quest#memories" className="text-[15px] font-semibold text-fb-blue hover:underline">Open Side Quest</Link>}
        </div>
        <ul className={variant === 'strip' ? 'mt-2 flex gap-2 overflow-x-auto' : 'mt-2 grid grid-cols-3 gap-2'}>
          {shown.map((m) => (
            <li key={m.date} className={variant === 'strip' ? 'w-[104px] shrink-0' : ''} data-testid="sq-memory">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dailyPhotoSrc(m.photoUrl)} alt={`${m.title} on ${DAY.format(new Date(`${m.date}T12:00:00Z`))}`} loading="lazy" className="aspect-square w-full rounded-[8px] object-cover" />
                <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white" title={m.audience === 'community' ? 'Shared with the community' : 'Only you'}>
                  {m.audience === 'community' ? <Globe size={11} aria-label="Shared with the community" /> : <Lock size={11} aria-label="Only you" />}
                </span>
              </div>
              <p className="mt-1 truncate text-[13px] font-semibold text-fb-text">{m.emoji} {m.title}</p>
              <p className="text-[12px] text-fb-text-2">{DAY.format(new Date(`${m.date}T12:00:00Z`))}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

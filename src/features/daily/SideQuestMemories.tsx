'use client';

// Side Quest photos as personal memories, in the Side Quest section of Memories. Entries are the
// person's own records (private unless they shared them), straight from history.
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

export function SideQuestMemories({ history }: { history: SideQuestHistoryResponse | null }) {
  if (!history) return null;
  if (history.memories.length === 0) return <Card padded><p className="text-[15px] text-fb-text-2">Your finished Side Quests land here.</p></Card>;

  return (
    <section aria-labelledby="sq-mem-title" data-testid="sq-memories">
      <Card padded>
        <h2 id="sq-mem-title" className="text-[17px] font-semibold text-fb-text">Your Side Quest memories</h2>
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {history.memories.map((m) => (
            <li key={m.date} data-testid="sq-memory">
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

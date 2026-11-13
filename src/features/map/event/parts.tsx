'use client';
// Pieces the quest panel and the plan page share: the pop-up poster (tap to expand), the
// text bubble, the visibility chip, the live stat line, and Report.
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { apiPost } from '@/features/data';
import { CATEGORY_STYLE, CategoryGlyph, Modal, cn, useToast } from '@/features/ui';
import type { Quest } from '@/shared';
import { visibilityChip, visibilityMeta } from '../visibility';

/** The plan's poster; tapping it opens the full image. Falls back to its category icon on the category's tint. */
export function Poster({ quest, className, fallback = false }: { quest: Pick<Quest, 'posterUrl' | 'emoji' | 'title' | 'category'>; className?: string; fallback?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!quest.posterUrl) {
    if (!fallback) return null;
    return (
      <div aria-hidden className={cn('flex items-center justify-center', className)} style={{ background: (CATEGORY_STYLE[quest.category] ?? CATEGORY_STYLE.other).bg }}>
        <CategoryGlyph category={quest.category} size={64} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        data-testid="quest-poster"
        onClick={() => setOpen(true)}
        aria-label={`Open the poster for ${quest.title}`}
        className={cn('block overflow-hidden bg-fb-bg', className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Storage or the memory store */}
        <img src={quest.posterUrl} alt={`Poster for ${quest.title}`} className="size-full object-cover" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={quest.title} size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload */}
        <img src={quest.posterUrl} alt={`Poster for ${quest.title}`} className="mx-auto max-h-[70vh] w-auto rounded-card" />
      </Modal>
    </>
  );
}

/** The host's pop-up line, as a speech bubble. */
export function Bubble({ text, className }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <p data-testid="quest-bubble" className={cn('relative w-fit max-w-full rounded-[16px] bg-fb-input px-3 py-2 text-fb-body text-fb-text', className)}>
      {text}
    </p>
  );
}

export function VisibilityChip({ quest, groupName, className }: { quest: Pick<Quest, 'visibility'>; groupName?: string | null; className?: string }) {
  const Icon = visibilityMeta(quest.visibility).icon;
  return (
    <span data-testid="quest-visibility" className={cn('inline-flex items-center gap-1 rounded-pill bg-fb-input px-2 py-0.5 text-fb-meta font-semibold text-fb-text-2', className)}>
      <Icon size={12} aria-hidden />
      {visibilityChip(quest.visibility, groupName)}
    </span>
  );
}

/** "12 going · 3 spots left · Live · 5 here" */
export function StatLine({ memberCount, seatsLeft, isLive, hereCount, className }: {
  /** Leave seatsLeft out where the seat count is already shown (the quest sheet's own row). */
  memberCount: number; seatsLeft?: number; isLive: boolean; hereCount: number; className?: string;
}) {
  return (
    <p data-testid="quest-stats" className={cn('flex flex-wrap items-center gap-x-1.5 text-fb-body', className)}>
      <span className="font-semibold text-fb-text">{memberCount} going</span>
      {seatsLeft !== undefined && (
        <>
          <span className="text-fb-text-2" aria-hidden>·</span>
          <span className={seatsLeft > 0 ? 'font-semibold text-fb-blue' : 'font-semibold text-fb-text-2'}>
            {seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? 'spot' : 'spots'} left` : 'Full'}
          </span>
        </>
      )}
      {isLive && (
        <>
          <span className="text-fb-text-2" aria-hidden>·</span>
          <span data-testid="quest-live" className="inline-flex items-center gap-1 font-semibold text-fb-red">
            <span className="size-2 animate-pulse rounded-full bg-fb-red" aria-hidden /> Live
          </span>
          <span className="text-fb-text-2" aria-hidden>·</span>
          <span data-testid="quest-here" className="font-semibold text-fb-text">{hereCount} here</span>
        </>
      )}
    </p>
  );
}

/** Report: stored for review, and the plan is hidden from the reporter at once. */
export function ReportButton({ questId, onReported, className }: { questId: string; onReported: () => void; className?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid="quest-report"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiPost(`/api/quests/${questId}/report`, { reason: '' });
          toast.show('Thanks. We’ll review this plan. It’s hidden for you now.');
          onReported();
        } catch {
          toast.show('Couldn’t send the report. Try again.');
          setBusy(false);
        }
      }}
      className={cn('flex items-center gap-1 text-fb-meta text-fb-text-2 hover:underline disabled:opacity-50', className)}
    >
      <Flag size={12} aria-hidden /> Report
    </button>
  );
}

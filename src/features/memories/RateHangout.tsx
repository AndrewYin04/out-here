'use client';

// The post-hangout questionnaire (docs/HANGOUT_RATINGS.md), modeled on Beli:
// 1 verdict, 2 "Which was better?" placement, 3 highlights + private note + photos,
// 4 "Hang out with them again?" per attendee, then a done screen with the score and rank.
import { Check, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, apiPost, currentPersona } from '@/features/data';
import { Avatar, Button, Chip, Modal, Skeleton, cn } from '@/features/ui';
import {
  HANGOUT_HIGHLIGHTS, type HangoutRating, type HangoutRatingState, type HangoutVerdict, type ID, type Memory, type Quest,
} from '@/shared';
import { AddPhotoTile } from './MemoryCapture';
import { museTakeaway } from './takeaway';
import {
  answerComparison, bucketMidpoint, nextComparison, placementIndex, rankOf, scoreAt, startPlacement, type Placement,
} from './placement';

type Step = 'verdict' | 'compare' | 'details' | 'again' | 'done';
type QuestDetailLite = { quest: Quest };
type MyRatings = { ratings: (HangoutRating & { quest: Quest })[] };

export const VERDICT_OPTIONS: { verdict: HangoutVerdict; label: string; emoji: string }[] = [
  { verdict: 'loved', label: 'Loved it', emoji: '😍' },
  { verdict: 'fine', label: 'It was fine', emoji: '🙂' },
  { verdict: 'meh', label: 'Not for me', emoji: '😕' },
];

const SCORE_COLOR: Record<HangoutVerdict, string> = {
  loved: 'bg-[#24832c] text-white', fine: 'bg-[#F7B928] text-fb-text', meh: 'bg-fb-red text-white',
};

const FRESH = { headers: { 'x-outhere-fresh': '1' } };

/** The questionnaire as a dialog. Mount it with a questId to open it. */
export function RateHangoutDialog({ questId, crewId = null, onClose, onSaved }: {
  questId: ID | null; crewId?: ID | null; onClose: () => void; onSaved?: (rating: HangoutRating) => void;
}) {
  return (
    <Modal open={!!questId} onClose={onClose} title="Rate your hangout" size="md">
      {questId && <RateHangout key={questId} questId={questId} crewId={crewId} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

export function RateHangout({ questId, crewId, onClose, onSaved }: {
  questId: ID; crewId: ID | null; onClose: () => void; onSaved?: (rating: HangoutRating) => void;
}) {
  const [state, setState] = useState<HangoutRatingState | null>(null);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('verdict');
  const [verdict, setVerdict] = useState<HangoutVerdict | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [photoIds, setPhotoIds] = useState<ID[]>([]);
  const [again, setAgain] = useState<Record<ID, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; rank: number; total: number; takeaway: string } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<HangoutRatingState>(`/api/quests/${questId}/rating`, FRESH),
      apiFetch<QuestDetailLite>(`/api/quests/${questId}`, FRESH),
    ]).then(([s, d]) => {
      if (!alive) return;
      setState(s);
      setQuest(d.quest);
      if (s.rating) {
        setHighlights(s.rating.highlights);
        setNote(s.rating.note);
        setPhotoIds(s.rating.photoIds);
      }
      setAgain(Object.fromEntries(s.again.map((a) => [a.subjectId, a.again])));
    }).catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Couldn’t load this hangout.'); });
    return () => { alive = false; };
  }, [questId]);

  // The viewer's other ratings in the chosen bucket, best first: what "Which was better?" compares with.
  const bucket = useMemo(
    () => (state && verdict ? state.compareWith.filter((c) => c.verdict === verdict).sort((a, b) => b.score - a.score) : []),
    [state, verdict],
  );
  const attendees = state?.attendees ?? [];
  const steps: Step[] = ['verdict', 'compare', 'details', ...(attendees.length ? ['again' as const] : [])];
  const stepNumber = steps.indexOf(step) + 1;

  if (loadError) return <p role="alert" className="text-[15px] text-fb-text-2">{loadError}</p>;
  if (!state || !quest) return (
    <div aria-busy="true" className="space-y-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
  );

  function chooseVerdict(v: HangoutVerdict) {
    setVerdict(v);
    const list = state!.compareWith.filter((c) => c.verdict === v);
    if (list.length === 0) {
      setScore(bucketMidpoint(v));
      setPlacement(null);
      setStep('details');
      return;
    }
    setScore(null);
    setPlacement(startPlacement(list.length));
    setStep('compare');
  }

  function finishPlacement(p: Placement | null) {
    if (!verdict) return;
    setScore(p ? scoreAt(verdict, bucket.map((b) => b.score), placementIndex(p)) : bucketMidpoint(verdict));
    setStep('details');
  }

  function answer(newIsBetter: boolean) {
    if (!placement) return;
    const next = answerComparison(placement, newIsBetter);
    setPlacement(next);
    if (nextComparison(next) === null) finishPlacement(next);
  }

  async function save() {
    if (!verdict || score === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { rating } = await apiPost<{ rating: HangoutRating }>(`/api/quests/${questId}/rating`, {
        verdict, score, highlights, note, photoIds,
        again: Object.entries(again).map(([subjectId, a]) => ({ subjectId, again: a })),
      }, 'PUT');
      const { ratings } = await apiFetch<MyRatings>('/api/me/ratings', FRESH).catch(() => ({ ratings: [rating] as MyRatings['ratings'] }));
      // Built from the answers just saved; names only people marked yes.
      const yes = attendees.filter((p) => again[p.id] === true).map((p) => p.name.split(' ')[0]);
      setResult({
        score: rating.score, rank: rankOf(rating.score, ratings.map((r) => r.score)), total: ratings.length,
        takeaway: museTakeaway(verdict, highlights, yes),
      });
      setStep('done');
      onSaved?.(rating);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Couldn’t save your rating.');
    } finally {
      setSaving(false);
    }
  }

  const header = step !== 'done' && (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center gap-3 bg-fb-surface px-4 pb-3 pt-3">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fb-blue-tint text-2xl">{quest.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-fb-text">{quest.title}</p>
        <p className="truncate text-[13px] text-fb-text-2">{quest.venueName}</p>
      </div>
      <p className="shrink-0 text-[13px] font-semibold text-fb-text-2" aria-live="polite">Step {stepNumber} of {steps.length}</p>
    </div>
  );

  return (
    <div data-testid="rate-hangout" data-step={step}>
      {header}

      {step === 'verdict' && (
        <section aria-labelledby="rate-verdict">
          <h3 id="rate-verdict" className="text-[20px] font-bold text-fb-text">How was it?</h3>
          {state.rating && <p className="mt-1 text-[13px] text-fb-text-2">You rated this {state.rating.score.toFixed(1)}. Pick again to update it.</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {VERDICT_OPTIONS.map((o) => (
              <button key={o.verdict} type="button" onClick={() => chooseVerdict(o.verdict)}
                aria-pressed={(verdict ?? state.rating?.verdict) === o.verdict}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-card border px-2 py-4 text-[15px] font-semibold transition-colors',
                  (verdict ?? state.rating?.verdict) === o.verdict
                    ? 'border-fb-blue bg-fb-blue-tint text-fb-blue'
                    : 'border-fb-divider bg-fb-surface text-fb-text hover:bg-fb-hover',
                )}>
                <span aria-hidden className="text-[32px] leading-none">{o.emoji}</span>
                {o.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'compare' && placement && (() => {
        const idx = nextComparison(placement);
        const other = idx === null ? null : bucket[idx];
        if (!other) return null;
        return (
          <section aria-labelledby="rate-compare">
            <h3 id="rate-compare" className="text-[20px] font-bold text-fb-text">Which was better?</h3>
            <p className="mt-1 text-[13px] text-fb-text-2">Your answers place this hangout among the others you rated “{VERDICT_OPTIONS.find((o) => o.verdict === verdict)?.label}”.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CompareButton emoji={quest.emoji} title={quest.title} sub="This hangout" onClick={() => answer(true)} />
              <CompareButton emoji={other.emoji} title={other.title} sub={`You gave it ${other.score.toFixed(1)}`} onClick={() => answer(false)} />
            </div>
            <StepFooter>
              <Button variant="ghost" onClick={() => finishPlacement(placement)}>Too close to call</Button>
              <Button variant="ghost" onClick={() => finishPlacement(null)}>Skip</Button>
            </StepFooter>
          </section>
        );
      })()}

      {step === 'details' && (
        <section aria-labelledby="rate-details" className="space-y-4">
          <div>
            <h3 id="rate-details" className="text-[20px] font-bold text-fb-text">What stood out?</h3>
            <p className="mt-1 text-[13px] text-fb-text-2">Pick any that fit.</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Highlights">
              {HANGOUT_HIGHLIGHTS.map((h) => (
                <Chip key={h} selected={highlights.includes(h)}
                  onClick={() => setHighlights((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]))}>
                  {h[0].toUpperCase() + h.slice(1)}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-[15px] font-semibold text-fb-text">Private note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2}
              placeholder="Anything to remember for next time"
              className="w-full resize-none rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[15px]" />
            <span className="flex items-center gap-1 text-[13px] text-fb-text-2"><Lock size={12} aria-hidden />Only you and Muse see this.</span>
          </label>
          <div>
            <p className="mb-2 text-[15px] font-semibold text-fb-text">Photos</p>
            {photoIds.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2" aria-label="Photos you added">
                {photoIds.map((id) => (
                  <li key={id} className="size-16 overflow-hidden rounded-btn bg-fb-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/memories/${id}/photo?as=${encodeURIComponent(currentPersona())}`} alt="Hangout photo" className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <AddPhotoTile questId={questId} crewId={crewId} onMemory={(m: Memory) => setPhotoIds((cur) => [...cur, m.id])} />
          </div>
          <StepFooter error={attendees.length === 0 ? saveError : null}>
            <Button variant="ghost" onClick={() => setStep('verdict')}>Back</Button>
            {attendees.length > 0
              ? <Button onClick={() => setStep('again')}>Next</Button>
              : <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rating'}</Button>}
          </StepFooter>
        </section>
      )}

      {step === 'again' && (
        <section aria-labelledby="rate-again">
          <h3 id="rate-again" className="text-[20px] font-bold text-fb-text">Hang out with them again?</h3>
          <p className="mt-1 flex items-start gap-1 text-[13px] text-fb-text-2">
            <Lock size={12} aria-hidden className="mt-0.5 shrink-0" />Only Muse sees this. It helps Muse suggest who to invite next time.
          </p>
          <ul className="mt-3 divide-y divide-fb-divider-soft">
            {attendees.map((p) => {
              const first = p.name.split(' ')[0];
              const value = again[p.id];
              const set = (v: boolean) => setAgain((cur) => {
                const nextAnswers = { ...cur };
                if (cur[p.id] === v) delete nextAnswers[p.id]; else nextAnswers[p.id] = v;
                return nextAnswers;
              });
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <Avatar src={p.avatarUrl} name={p.name} size={40} decorative />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fb-text">{p.name}</span>
                  <div role="group" aria-label={`Hang out with ${first} again?`} className="flex shrink-0 gap-2">
                    <button type="button" aria-pressed={value === true} onClick={() => set(true)}
                      className={cn('inline-flex h-9 items-center gap-1 rounded-btn px-3 text-[15px] font-semibold',
                        value === true ? 'bg-fb-blue text-white' : 'bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover')}>
                      <Check size={16} aria-hidden />Yes
                    </button>
                    <button type="button" aria-pressed={value === false} onClick={() => set(false)}
                      className={cn('inline-flex h-9 items-center gap-1 rounded-btn px-3 text-[15px] font-semibold',
                        value === false ? 'bg-fb-text text-white' : 'bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover')}>
                      <X size={16} aria-hidden />No
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <StepFooter error={saveError}>
            <Button variant="ghost" onClick={() => setStep('details')}>Back</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rating'}</Button>
          </StepFooter>
        </section>
      )}

      {step === 'done' && result && verdict && (
        <section aria-labelledby="rate-done" className="flex flex-col items-center py-4 text-center">
          <span className={cn('flex size-20 items-center justify-center rounded-full text-[28px] font-bold', SCORE_COLOR[verdict])}
            data-testid="rating-score">{result.score.toFixed(1)}</span>
          <h3 id="rate-done" className="mt-3 text-[20px] font-bold text-fb-text">Saved. Muse will use this next time.</h3>
          <p className="mt-1 text-[15px] text-fb-text-2" data-testid="rating-rank">
            {result.score.toFixed(1)}, your #{result.rank} hangout{result.total > 1 ? ` of ${result.total}` : ''}
          </p>
          <p className="mt-1 text-[13px] text-fb-text-2">{quest.emoji} {quest.title}</p>
          <div className="mt-4 w-full rounded-card bg-fb-bg p-3 text-left" data-testid="rating-takeaway">
            <p className="text-[12px] font-semibold text-fb-blue">✨ Muse</p>
            <p className="mt-1 text-[15px] text-fb-text">{result.takeaway}</p>
          </div>
          <Button className="mt-4" onClick={onClose}>Done</Button>
        </section>
      )}
    </div>
  );
}

/** Step actions pinned to the bottom of the dialog, as in Facebook dialogs, so they stay on screen at 390 px. */
function StepFooter({ children, error }: { children: ReactNode; error?: string | null }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 border-t border-fb-divider bg-fb-surface px-4 py-3">
      {error && <p role="alert" className="mb-2 text-[13px] text-fb-red">{error}</p>}
      <div className="flex items-center justify-between gap-2">{children}</div>
    </div>
  );
}

function CompareButton({ emoji, title, sub, onClick }: { emoji: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-3 rounded-card border border-fb-divider bg-fb-surface p-3 text-left hover:border-fb-blue hover:bg-fb-blue-tint">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fb-bg text-2xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-fb-text">{title}</span>
        <span className="block text-[13px] text-fb-text-2">{sub}</span>
      </span>
    </button>
  );
}

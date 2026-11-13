'use client';
import { Sparkles } from 'lucide-react';
// While Muse works (several seconds), say what it is doing, step by step, so the wait reads as
// work rather than lag (Doherty threshold: something visibly changes well under 400 ms).
// The steps name the real pipeline stages; the last one holds until the answer arrives.
import { useEffect, useState } from 'react';

export const TOGETHER_STEPS = [
  'Lining up when you’re all free…',
  'Finding what you all like…',
  'Checking the walk for everyone…',
  'Picking plans that fit all of you…',
] as const;

export function MuseThinking({ steps, everyMs = 1300 }: { steps: readonly string[]; everyMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1 < steps.length ? n + 1 : n)), everyMs);
    return () => window.clearInterval(t);
  }, [steps, everyMs]);
  return (
    <p className="mb-3 flex items-center gap-2 px-1 text-[15px] font-semibold text-fb-text" data-testid="muse-thinking">
      <Sparkles size={16} aria-hidden className="shrink-0 animate-shimmer text-fb-blue" />
      <span key={i} className="animate-step-in">{steps[i]}</span>
    </p>
  );
}

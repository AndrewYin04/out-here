'use client';

// Always on screen (AppShell mounts it once): when the arrival selfie's "Rate the hangout" fires
// RATE_HANGOUT, open the questionnaire for that plan with the selfie already attached, and
// preventDefault() so the selfie dialog knows the rating opened (requestRating returns true).
import { useEffect, useState } from 'react';
import { RATE_HANGOUT, type RateHangoutDetail } from './arrival';
import { RateHangoutDialog } from './RateHangout';

export function RateHangoutListener() {
  const [target, setTarget] = useState<RateHangoutDetail | null>(null);
  useEffect(() => {
    const onRate = (e: Event) => {
      const d = (e as CustomEvent<RateHangoutDetail>).detail;
      if (!d?.questId) return;
      e.preventDefault();
      setTarget({ questId: d.questId, crewId: d.crewId ?? null, photoIds: d.photoIds ?? [] });
    };
    window.addEventListener(RATE_HANGOUT, onRate);
    return () => window.removeEventListener(RATE_HANGOUT, onRate);
  }, []);
  return (
    <RateHangoutDialog
      questId={target?.questId ?? null}
      crewId={target?.crewId ?? null}
      initialPhotoIds={target?.photoIds}
      onClose={() => setTarget(null)}
    />
  );
}

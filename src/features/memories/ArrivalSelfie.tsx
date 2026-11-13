'use client';
// You walked into a plan you joined: the selfie opens (#47, docs/DEMO_FLOW.md scene 9).
// Early (more than 30 min before the start) it waits with a live countdown, because the crew
// album only exists once the hangout is about to start. Once the photo saves, Muse can look at it
// and suggest a caption (SavedPhotoReview, Muse Vision), then: rate the hangout (#18) with the
// selfie attached, or go back to the map. See arrival.ts for the events.
import Link from 'next/link';
import { Clock, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Modal } from '@/features/ui';
import { formatDemoTime, type Memory, type Quest } from '@/shared';
import { arrivalWait, requestRating } from './arrival';
import { MemoryCapture } from './MemoryCapture';
import { SavedPhotoReview } from './SavedPhotoReview';

export function ArrivalSelfie({ quest, onClose }: { quest: Quest | null; onClose: () => void }) {
  return (
    <Modal open={!!quest} onClose={onClose} title={quest ? 'You made it' : ''} size="md">
      {quest && <ArrivalBody key={quest.id} quest={quest} onClose={onClose} />}
    </Modal>
  );
}

function ArrivalBody({ quest, onClose }: { quest: Quest; onClose: () => void }) {
  const [now, setNow] = useState(Date.now);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Memory | null>(null);
  const [rateMissing, setRateMissing] = useState(false);
  const wait = arrivalWait(quest.startsAt, now);
  useEffect(() => {
    if (!wait.early) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [wait.early]);

  const rate = () => {
    if (!saved) return;
    if (requestRating({ questId: quest.id, crewId: saved.crewId, photoIds: [saved.id] })) onClose();
    else setRateMissing(true);
  };

  if (saved) {
    // MemoryCapture already announced the save (outhere:memory-saved) for the memory board.
    return (
      <div data-testid="arrival-saved" className="space-y-3">
        <SavedPhotoReview memory={saved} onChange={setSaved} />
        <div className="flex flex-wrap gap-2 border-t border-fb-divider-soft pt-3">
          <Button data-testid="arrival-rate" icon={<Star size={16} />} onClick={rate}>Rate the hangout</Button>
          <Button variant="ghost" data-testid="arrival-back" onClick={onClose}>Back to the map</Button>
        </div>
        {rateMissing && (
          <p className="text-sm text-fb-text-2">
            You can rate it from <Link href="/memories" className="font-semibold text-fb-blue hover:underline">Memories</Link> once the hangout ends.
          </p>
        )}
      </div>
    );
  }

  if (wait.early) {
    return (
      <div data-testid="arrival-early" className="space-y-3">
        <p className="text-[17px] font-semibold leading-snug text-fb-text">{quest.title}</p>
        <p className="flex items-center gap-2 text-[15px] text-fb-text">
          <Clock size={18} aria-hidden className="shrink-0 text-fb-blue" />
          <span>You’re early. It starts at {formatDemoTime(quest.startsAt)}, in <b>{wait.minutes} min</b>.</span>
        </p>
        <p className="text-sm text-fb-text-2">Stay close: the camera opens here when it starts, so you can take a photo together.</p>
        <Button variant="secondary" onClick={onClose}>Got it</Button>
      </div>
    );
  }

  return (
    <div data-testid="arrival-selfie" className="space-y-2">
      <p className="text-[17px] font-semibold leading-snug text-fb-text">{quest.title}</p>
      <p className="text-[15px] text-fb-text-2">Take a photo together. It saves to your memories.</p>
      <MemoryCapture questId={quest.id} crewId={crewId} onSaved={setCrewId} onMemory={setSaved} />
    </div>
  );
}

'use client';
// You walked into a plan you joined: the selfie opens (#47, docs/DEMO_FLOW.md scene 9).
// Early (before the start) it waits with a live countdown, because the crew album only exists
// once the hangout has started. After the photo saves: rate the hangout (#18) with the selfie
// attached, or see it on the memory board (#19). See arrival.ts for the events.
import Link from 'next/link';
import { Clock, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { currentPersona } from '@/features/data';
import { Button, LinkButton, Modal } from '@/features/ui';
import { formatDemoTime, type Memory, type Quest } from '@/shared';
import { arrivalWait, emitMemorySaved, requestRating } from './arrival';
import { MemoryCapture } from './MemoryCapture';

/** The photo route reads the persona from `?as=` when the browser fetches it (an <img> sends no headers). */
const photoSrc = (m: Memory) => m.photoUrl === `/api/memories/${m.id}/photo` ? `${m.photoUrl}?as=${encodeURIComponent(currentPersona())}` : m.photoUrl;

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

  const onMemory = (memory: Memory) => {
    setSaved(memory);
    emitMemorySaved({ questId: quest.id, crewId: memory.crewId, memoryId: memory.id });
  };
  const rate = () => {
    if (!saved) return;
    if (requestRating({ questId: quest.id, crewId: saved.crewId, photoIds: [saved.id] })) onClose();
    else setRateMissing(true);
  };

  if (saved) {
    return (
      <div data-testid="arrival-saved" className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc(saved)} alt={saved.caption || 'Your selfie from the hangout'} className="max-h-64 w-full animate-polaroid rounded-btn bg-fb-bg object-contain p-1.5 shadow-card" />
        <p role="status" className="text-[15px] text-fb-text">Saved to your memories. Only the people from this hangout can see it.</p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="arrival-rate" icon={<Star size={16} />} onClick={rate}>Rate the hangout</Button>
          <LinkButton href={`/memories#crew-${saved.crewId}`} variant="secondary" data-testid="arrival-board">See memories</LinkButton>
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
      <p className="text-[17px] font-semibold leading-snug text-fb-text"><span aria-hidden>{quest.emoji}</span> {quest.title}</p>
      <p className="text-[15px] text-fb-text-2">Take a photo together. It saves to your memories.</p>
      <MemoryCapture questId={quest.id} crewId={crewId} onSaved={setCrewId} onMemory={onMemory} />
    </div>
  );
}

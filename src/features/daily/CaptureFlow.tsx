'use client';

// The completion flow in one modal: camera -> review (retake, caption, who can see it) -> done.
// Nothing is uploaded until the person confirms. The quest is complete only when the SERVER
// accepts the photo before the deadline; a preview on screen proves nothing, so the success
// screen shows only after the response. Audience defaults to "Only me".
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Globe, Loader2, Lock, RotateCcw } from 'lucide-react';
import type { SideQuestAudience } from '@/shared';
import type { SideQuestSubmitResponse } from '@/shared/api';
import { ApiFetchError, apiFetch } from '@/features/data';
import { Button, cn, Modal } from '@/features/ui';
import { CameraCapture } from './CameraCapture';
import { Countdown } from './Countdown';
import { dailyPhotoSrc } from './photo';
import type { SideQuestLive } from './useSideQuest';

type Step = 'camera' | 'review' | 'done';

export function describeSubmitError(e: unknown): { text: string; refresh: boolean } {
  if (e instanceof ApiFetchError) {
    if (e.status === 410) return { text: 'Time ran out before the photo arrived, so this quest has ended. You can still see the board.', refresh: true };
    if (e.status === 409 && /already/.test(e.message)) return { text: 'You already completed today’s Side Quest.', refresh: true };
    if (e.status === 409) return { text: 'This quest hasn’t dropped yet.', refresh: true };
    if (e.status === 413) return { text: 'That photo is too large. Retake it or choose a smaller one.', refresh: false };
    if (e.status === 400 || e.status === 403) return { text: e.message, refresh: false };
    return { text: 'Couldn’t save the photo just now. Your photo is still here: try again.', refresh: false };
  }
  return { text: 'Couldn’t reach Out Here. Check your connection and try again. Your photo is still here.', refresh: false };
}

export function CaptureFlow({ open, onClose, live, onSeeBoard }: { open: boolean; onClose: () => void; live: SideQuestLive; onSeeBoard: () => void }) {
  const { state, phase, now, apply, reload } = live;
  const [step, setStep] = useState<Step>('camera');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<SideQuestAudience>('only_me');
  const [crewId, setCrewId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SideQuestSubmitResponse | null>(null);
  const submitting = useRef(false);

  // Fresh start every time the flow opens.
  useEffect(() => {
    if (!open) return;
    setStep('camera'); setPhoto(null); setCaption(''); setAudience('only_me'); setCrewId(''); setError(null); setResult(null); setBusy(false);
  }, [open]);

  // The preview URL lives and dies with the photo.
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (!state) return null;
  const expired = phase === 'expired';

  const submit = async () => {
    if (!photo || submitting.current || phase !== 'active') return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', photo, 'side-quest.jpg');
      form.append('audience', audience);
      if (caption.trim()) form.append('caption', caption.trim());
      if (crewId) form.append('crewId', crewId);
      const res = await apiFetch<SideQuestSubmitResponse>('/api/daily/side-quest/submit', { method: 'POST', body: form });
      apply(res.state);
      setResult(res);
      setStep('done');
    } catch (e) {
      const d = describeSubmitError(e);
      setError(d.text);
      if (d.refresh) void reload();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${state.challenge.emoji} ${state.challenge.title}`} size="md">
      {step !== 'done' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-card bg-fb-blue-tint px-3 py-2 text-fb-blue">
          <span className="text-[13px] font-semibold">{expired ? 'Quest ended' : 'Time left'}</span>
          <Countdown now={now} until={state.deadlineAt} className="text-[20px]" />
        </div>
      )}

      {expired && step !== 'done' && (
        <div className="rounded-card bg-fb-bg p-4 text-center" data-testid="capture-ended">
          <p className="text-[17px] font-semibold text-fb-text">Quest ended</p>
          <p className="mt-1 text-[15px] text-fb-text-2">Time ran out for this one. You can still browse the board, and add an ordinary memory any time.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button onClick={() => { onClose(); onSeeBoard(); }}>See the board</Button>
            <Link href="/memories#side-quest-mine" className="inline-flex items-center rounded-btn bg-fb-secondary-btn px-4 text-[15px] font-semibold text-fb-text hover:bg-fb-secondary-btn-hover">Open Memories</Link>
          </div>
        </div>
      )}

      {!expired && step === 'camera' && <CameraCapture disabled={busy} onPhoto={(b) => { setPhoto(b); setStep('review'); }} />}

      {!expired && step === 'review' && preview && (
        <div className="flex flex-col gap-3" data-testid="capture-review">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your photo, ready to submit" className="max-h-[52vh] w-full rounded-card bg-black object-contain" />
          <Button variant="secondary" size="sm" className="self-start" onClick={() => { setPhoto(null); setStep('camera'); setError(null); }} disabled={busy} icon={<RotateCcw size={14} aria-hidden />} data-testid="retake">
            Retake
          </Button>

          <div>
            <label htmlFor="sq-caption" className="text-[13px] font-semibold text-fb-text-2">Caption (optional)</label>
            <input id="sq-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="What did you find?"
              className="mt-1 w-full rounded-btn bg-fb-input px-3 py-2 text-[15px] text-fb-text outline-none focus-visible:ring-2 focus-visible:ring-fb-blue" />
          </div>

          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold text-fb-text-2">Who can see this photo?</legend>
            <div role="radiogroup" className="flex flex-col gap-2">
              {([
                { id: 'only_me', icon: Lock, label: 'Only me', hint: 'Saved to your Memories. Nobody else sees it.' },
                { id: 'community', icon: Globe, label: 'Share with community', hint: 'Also on today’s board for everyone on Out Here, with your first name.' },
              ] as const).map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={audience === o.id} onClick={() => setAudience(o.id)} data-testid={`audience-${o.id}`}
                  className={cn('flex items-start gap-3 rounded-card border p-3 text-left focus-visible:outline-2 focus-visible:outline-fb-blue',
                    audience === o.id ? 'border-fb-blue bg-fb-blue-tint' : 'border-fb-divider hover:bg-fb-hover')}>
                  <o.icon size={20} className={audience === o.id ? 'text-fb-blue' : 'text-fb-text-2'} aria-hidden />
                  <span><span className="block text-[15px] font-semibold text-fb-text">{o.label}</span><span className="block text-[13px] text-fb-text-2">{o.hint}</span></span>
                </button>
              ))}
            </div>
          </fieldset>

          {state.crews.length > 0 && (
            <div>
              <label htmlFor="sq-crew" className="text-[13px] font-semibold text-fb-text-2">Did you do it with friends? (optional)</label>
              <select id="sq-crew" value={crewId} onChange={(e) => setCrewId(e.target.value)}
                className="mt-1 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 text-[15px] text-fb-text" data-testid="crew-select">
                <option value="">Don’t add to a crew album</option>
                {state.crews.map((c) => <option key={c.id} value={c.id}>Also add to {c.name}’s album</option>)}
              </select>
            </div>
          )}

          {error && <p className="rounded-card bg-fb-bg p-3 text-[15px] text-fb-text" role="alert" data-testid="submit-error">{error}</p>}
          <Button block size="lg" onClick={submit} disabled={busy || phase !== 'active'} data-testid="submit-photo" icon={busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : undefined}>
            {busy ? 'Saving…' : 'Submit'}
          </Button>
        </div>
      )}

      {step === 'done' && result && <Celebration result={result} onClose={onClose} onSeeBoard={() => { onClose(); onSeeBoard(); }} />}
    </Modal>
  );
}

function Celebration({ result, onClose, onSeeBoard }: { result: SideQuestSubmitResponse; onClose: () => void; onSeeBoard: () => void }) {
  const { entry } = result;
  const lines = [
    { ok: true, text: 'Saved to your Memories' },
    entry.audience === 'community' ? { ok: true, text: 'Shared on today’s community board' } : { ok: false, text: 'Only you can see this photo' },
    ...(entry.crewMemoryId ? [{ ok: true, text: 'Added to your crew’s album' }] : []),
  ];
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="sq-celebration">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-fb-blue text-white motion-safe:animate-sq-check" aria-hidden><Check size={44} strokeWidth={3} /></span>
      <h3 className="text-[24px] font-extrabold text-fb-text">Side Quest complete!</h3>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dailyPhotoSrc(entry.photoUrl)} alt="Your submitted photo" className="h-36 w-36 rounded-card object-cover shadow-card motion-safe:animate-sq-rise" />
      <ul className="text-left text-[15px] text-fb-text">
        {lines.map((l) => (
          <li key={l.text} className="flex items-center gap-2 py-0.5">
            {l.ok ? <Check size={16} className="text-fb-green" aria-hidden /> : <Lock size={16} className="text-fb-text-2" aria-hidden />}{l.text}
          </li>
        ))}
      </ul>
      <div className="mt-1 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={onSeeBoard} data-testid="see-board">See the community board</Button>
        <Link href="/memories#side-quest-mine" onClick={onClose} className="inline-flex h-9 items-center justify-center rounded-btn bg-fb-secondary-btn px-4 text-[15px] font-semibold text-fb-text hover:bg-fb-secondary-btn-hover">View memory</Link>
      </div>
    </div>
  );
}

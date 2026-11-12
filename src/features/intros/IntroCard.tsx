'use client';
import { Check, ChevronDown, MessageCircle, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { IntroCardView, IntroKind } from '@/shared';
import { Avatar, Button, Card, LinkButton, cn } from '@/features/ui';

export const KIND_LABELS: Record<IntroKind, string> = { friendship: 'Friendship', networking: 'Coffee chat', dating: 'Dating' };
const KIND_STYLES: Record<IntroKind, string> = {
  friendship: 'bg-fb-blue-tint text-fb-blue',
  networking: 'bg-[#e6f4ea] text-fb-green',
  dating: 'bg-[#fde7ec] text-[#c4174f]',
};

export function MuseTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill bg-[#f1ebff] px-2 py-0.5 text-[12px] font-semibold text-[#6b3fd4]', className)}>
      <Sparkles size={12} aria-hidden /> Muse
    </span>
  );
}

export function IntroCard({ intro, onRespond }: { intro: IntroCardView; onRespond: (id: string, accept: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<null | 'accept' | 'pass'>(null);
  const [open, setOpen] = useState(false);
  const name = intro.other.firstName;
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'pass');
    try { await onRespond(intro.id, accept); } finally { setBusy(null); }
  };
  return (
    <Card padded as="article" data-testid="intro-card" data-handle={intro.other.handle} data-state={intro.state}
      className={cn('space-y-3', intro.state === 'closed' && 'opacity-75')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-semibold', KIND_STYLES[intro.kind])}>{KIND_LABELS[intro.kind]}</span>
        <MuseTag />
      </div>
      <div className="flex items-center gap-3">
        <Avatar src={intro.other.avatarUrl} name={name} size={56} decorative />
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-fb-text">Meet {name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {intro.trustPath.map((t) => (
              <span key={t} data-testid="trust-path" className="rounded-pill bg-fb-input px-2 py-0.5 text-[13px] text-fb-text">{t}</span>
            ))}
          </div>
        </div>
      </div>
      <section aria-label="Why your agents think you'd click">
        <h4 className="text-[15px] font-semibold text-fb-text">Why your agents think you&apos;d click</h4>
        <p className="mt-1 text-[15px] text-fb-text">{intro.summary}</p>
        <ul className="mt-2 space-y-1" data-testid="intro-reasons">
          {intro.reasons.map((r) => (
            <li key={r} className="flex gap-2 text-[14px] text-fb-text"><Check size={16} className="mt-0.5 shrink-0 text-fb-green" aria-hidden />{r}</li>
          ))}
        </ul>
      </section>
      <div className="rounded-btn bg-fb-input px-3 py-2">
        <p className="text-[13px] font-semibold text-fb-text-2">Suggested first step</p>
        <p className="text-[15px] text-fb-text" data-testid="first-step">{intro.firstStep.text}</p>
      </div>
      <div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex items-center gap-1 text-[14px] font-semibold text-fb-text-2 hover:underline">
          <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          How your agents decided
        </button>
        {open && (
          <div className="mt-2 space-y-2" data-testid="agent-log">
            <p className="text-[12px] text-fb-text-2">Only your agent&apos;s side is shown. {name} sees only theirs.</p>
            {intro.myAgentLog.map((t, i) => (
              <div key={i} className="rounded-[16px] bg-[#f1ebff] px-3 py-2 text-[14px] text-fb-text">
                <span className="mr-1 font-semibold text-[#6b3fd4]">Your agent:</span>{t}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-fb-divider-soft pt-3" aria-live="polite">
        {intro.state === 'new' && (
          <>
            <Button onClick={() => respond(true)} disabled={!!busy} icon={<Check size={16} aria-hidden />}>
              {busy === 'accept' ? 'Accepting…' : 'Accept'}
            </Button>
            <Button variant="secondary" onClick={() => respond(false)} disabled={!!busy} icon={<X size={16} aria-hidden />}>
              {busy === 'pass' ? 'Saving…' : 'Not now'}
            </Button>
            <span className="text-[13px] text-fb-text-2">{name} only hears about this if you both say yes.</span>
          </>
        )}
        {intro.state === 'waiting' && <p className="text-[15px] font-semibold text-fb-text-2" data-testid="intro-status">Waiting for {name}</p>}
        {intro.state === 'connected' && (
          <>
            <p className="text-[15px] font-semibold text-fb-green" data-testid="intro-status">You&apos;re connected</p>
            {intro.threadId && (
              <LinkButton href={`/messages?thread=${encodeURIComponent(intro.threadId)}`} icon={<MessageCircle size={16} aria-hidden />}>
                Open chat
              </LinkButton>
            )}
          </>
        )}
        {intro.state === 'closed' && <p className="text-[15px] text-fb-text-2" data-testid="intro-status">{intro.closedText}</p>}
      </div>
    </Card>
  );
}

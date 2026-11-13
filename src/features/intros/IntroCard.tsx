'use client';
import { CalendarClock, Check, ChevronDown, Lock, MapPin, MessageCircle, Sparkles, Ticket, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { IntroKind } from '@/shared';
import type { IntroCardData, IntroPlanAction } from './types';
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

/** "You both know Maya · You're both in Bay Area Local Shows", with a small mutual-friend avatar stack. */
function TrustLine({ intro }: { intro: IntroCardData }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {intro.mutuals.length > 0 && (
        <span className="flex shrink-0" aria-hidden>
          {intro.mutuals.map((m, i) => (
            <span key={m.id} className={cn('rounded-full ring-2 ring-white', i > 0 && '-ml-1.5')}>
              <Avatar src={m.avatarUrl} name={m.firstName} size={20} decorative />
            </span>
          ))}
        </span>
      )}
      <p className="min-w-0 text-[13px] leading-4 text-fb-text-2">
        {intro.trustPath.map((t, i) => (
          <span key={t}>
            {i > 0 && <span aria-hidden> · </span>}
            <span data-testid="trust-path">{t}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

function Actions({ intro, busy, respond }: { intro: IntroCardData; busy: null | 'accept' | 'pass'; respond: (accept: boolean) => void }) {
  const name = intro.other.firstName;
  if (intro.state === 'new') {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-2 sm:max-w-[340px]">
          <Button block onClick={() => respond(true)} disabled={!!busy} icon={<Check size={16} aria-hidden />} data-testid="intro-accept">
            {busy === 'accept' ? 'Accepting…' : intro.joinLine ? 'Yes, go together' : 'Accept'}
          </Button>
          <Button block variant="secondary" onClick={() => respond(false)} disabled={!!busy} icon={<X size={16} aria-hidden />}>
            {busy === 'pass' ? 'Saving…' : 'Not now'}
          </Button>
        </div>
        {intro.joinLine && <p className="text-[14px] font-semibold text-fb-text" data-testid="intro-join-line">{intro.joinLine}</p>}
        <p className="text-[13px] text-fb-text-2">
          {intro.otherAccepted
            ? `${name} already said yes. Nothing is shared until you do.`
            : `${name} only hears about this if you say yes.`}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
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
  );
}

function FirstStep({ intro }: { intro: IntroCardData }) {
  const s = intro.step;
  const meta = [s.when, s.seatsLeft !== null ? `${s.seatsLeft} ${s.seatsLeft === 1 ? 'seat' : 'seats'} left` : null].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-2 rounded-btn bg-fb-input px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fb-text-2" data-testid="first-step-title">{s.anchored ? 'The plan' : 'Suggested first step'}</p>
        <p className="text-[15px] text-fb-text" data-testid="first-step">{s.label}</p>
        {meta && <p className="text-[13px] text-fb-text-2" data-testid="first-step-when">{meta}</p>}
      </div>
      {s.href && (
        <LinkButton href={s.href} variant="secondary" size="sm" icon={<MapPin size={14} aria-hidden />}>
          {intro.state === 'connected' && !s.anchored ? 'Plan it together' : 'See on map'}
        </LinkButton>
      )}
    </div>
  );
}

/**
 * Muse's ask once both said yes, with its quick replies: Hold seats (both people join the first
 * step's quest) or Pick another time (switch to another plan). Muse posts each answer in the chat.
 */
function MusePlan({ intro, onPlan }: { intro: IntroCardData; onPlan: (id: string, act: IntroPlanAction) => Promise<void> }) {
  const plan = intro.plan;
  const [busy, setBusy] = useState<null | string>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!plan) return null;
  const run = async (key: string, act: IntroPlanAction) => {
    setBusy(key); setError(null);
    try { await onPlan(intro.id, act); setPicking(false); } catch (e) {
      setError(e instanceof Error ? e.message : 'Muse could not do that.');
    } finally { setBusy(null); }
  };
  return (
    <div className="rounded-btn border border-[#e4dbfb] bg-[#f8f5ff] px-3 py-2" data-testid="muse-plan" aria-live="polite">
      <p className="flex items-center gap-1 text-[12px] font-semibold text-[#6b3fd4]"><Sparkles size={12} aria-hidden /> Muse, in your chat</p>
      <p className="mt-0.5 text-[15px] text-fb-text" data-testid="muse-ask">{plan.ask.replace(/ Tap .*$/, '')}</p>
      {plan.held ? (
        <p className="mt-1 flex items-center gap-1 text-[14px] font-semibold text-fb-green" data-testid="seats-held">
          <Check size={16} aria-hidden /> Seats held for you and {intro.other.firstName}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {plan.questId && (
            <Button size="sm" onClick={() => void run('hold', { action: 'hold' })} disabled={!!busy || !plan.canHold}
              icon={<Ticket size={14} aria-hidden />} data-testid="hold-seats">
              {busy === 'hold' ? 'Holding…' : `Hold ${plan.seatsNeeded} ${plan.seatsNeeded === 1 ? 'seat' : 'seats'}`}
            </Button>
          )}
          {plan.options.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setPicking((p) => !p)} disabled={!!busy} aria-expanded={picking}
              icon={<CalendarClock size={14} aria-hidden />} data-testid="pick-time">
              {plan.questId ? 'Pick another time' : 'Pick a time'}
            </Button>
          )}
        </div>
      )}
      {picking && !plan.held && (
        <ul className="mt-2 space-y-1.5" data-testid="plan-options">
          {plan.options.map((o) => (
            <li key={o.questId}>
              <button type="button" onClick={() => void run(o.questId, { action: 'pick', questId: o.questId })} disabled={!!busy}
                className="flex w-full items-center gap-2 rounded-btn bg-fb-surface px-3 py-2 text-left hover:bg-fb-hover disabled:opacity-60"
                data-testid="plan-option">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-fb-text">{o.label}</span>
                  <span className="block text-[13px] text-fb-text-2">{o.when} · {o.seatsLeft} {o.seatsLeft === 1 ? 'seat' : 'seats'} left</span>
                </span>
                {busy === o.questId && <span className="text-[13px] text-fb-text-2">Saving…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-[13px] text-fb-red" role="alert">{error}</p>}
    </div>
  );
}

function AgentLog({ intro }: { intro: IntroCardData }) {
  const name = intro.other.firstName;
  return (
    <div className="mt-2 space-y-2" data-testid="agent-log">
      <p className="text-[12px] text-fb-text-2">
        Your agent&apos;s words are shown in full. {name}&apos;s agent&apos;s words stay private to {name}; you see only what each turn decided.
      </p>
      {intro.myAgentLog.map((t, i) => (t.mine ? (
        <div key={i} className="mr-8 rounded-[16px] bg-[#f1ebff] px-3 py-2 text-[14px] text-fb-text" data-testid="agent-turn-mine">
          <span className="mr-1 font-semibold text-[#6b3fd4]">Your agent:</span>{t.text}
        </div>
      ) : (
        <div key={i} className="ml-8 flex items-start gap-1.5 rounded-[16px] bg-fb-input px-3 py-2 text-[14px] text-fb-text-2" data-testid="agent-turn-theirs">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span><span className="font-semibold text-fb-text">{name}&apos;s agent</span> (private): {t.text}</span>
        </div>
      )))}
      <p className="text-center text-[13px] font-semibold text-[#6b3fd4]" data-testid="judge-line">✨ {intro.judgeLine}</p>
    </div>
  );
}

export function IntroCard({ intro, onRespond, onPlan }: {
  intro: IntroCardData; onRespond: (id: string, accept: boolean) => Promise<void>; onPlan: (id: string, act: IntroPlanAction) => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | 'accept' | 'pass'>(null);
  const [open, setOpen] = useState(false);
  const name = intro.other.firstName;
  const profileHref = `/profile/${encodeURIComponent(intro.other.handle)}`;
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'pass');
    try { await onRespond(intro.id, accept); } finally { setBusy(null); }
  };
  return (
    <Card padded as="article" id={intro.id} data-testid="intro-card" data-handle={intro.other.handle} data-state={intro.state}
      className={cn('scroll-mt-20 space-y-3', intro.state === 'closed' && 'opacity-75')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-semibold', KIND_STYLES[intro.kind])}>{KIND_LABELS[intro.kind]} intro</span>
        <MuseTag />
      </div>
      <div className="flex items-start gap-3">
        <Link href={profileHref} className="shrink-0 rounded-full" aria-label={`${name}'s profile`}>
          <Avatar src={intro.other.avatarUrl} name={name} size={80} decorative />
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-5 text-fb-text">
            <Link href={profileHref} className="hover:underline">{name}</Link>
          </h3>
          <TrustLine intro={intro} />
          <Actions intro={intro} busy={busy} respond={(a) => void respond(a)} />
        </div>
      </div>
      {/* For a plan, the what and when come before the reasons, so they show above the fold on a phone. */}
      {intro.step.anchored && <FirstStep intro={intro} />}
      <section aria-label="Why your agents think you'd click" className="border-t border-fb-divider-soft pt-3">
        <h4 className="flex items-center gap-2 text-[15px] font-semibold text-fb-text">Why your agents think you&apos;d click <MuseTag /></h4>
        <p className="mt-1 text-[15px] text-fb-text" data-testid="intro-summary">{intro.summary}</p>
        <ul className="mt-2 space-y-1" data-testid="intro-reasons">
          {intro.reasons.map((r) => (
            <li key={r} className="flex gap-2 text-[14px] text-fb-text"><Check size={16} className="mt-0.5 shrink-0 text-fb-green" aria-hidden />{r}</li>
          ))}
        </ul>
      </section>
      {!intro.step.anchored && <FirstStep intro={intro} />}
      {intro.state === 'connected' && <MusePlan intro={intro} onPlan={onPlan} />}
      <div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex items-center gap-1 text-[14px] font-semibold text-fb-text-2 hover:underline">
          <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          How your agents decided
        </button>
        {open && <AgentLog intro={intro} />}
      </div>
    </Card>
  );
}

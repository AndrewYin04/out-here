'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApiFetchError, apiPost, currentPersona, personaByHandle, useApi, useQuest, type InviteView } from '@/features/data';
import { DEMO_CENTER, formatDemoTime, walkingMinutes, type Message } from '@/shared';
import type { FriendAvailabilityResponse } from '@/shared/api';
import { Button, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { firstName } from './format';

/**
 * An Out Here invite sent as a message (kind "invite"). The recipient gets Accept and Decline,
 * which call POST /api/invites/:id/respond like the Out Here invite cards; accepting joins the
 * quest. Seats update live over quest:<id>.
 */
/** The title without its leading emoji when the card already shows the quest's emoji ("🥟 Dumplings" -> "Dumplings"). */
function titleWithoutEmoji(title: string, emoji: string | null | undefined): string {
  const t = title.trim();
  if (!emoji) return t;
  return t.replace(/^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]*\s*/u, '') || t;
}

export function InviteMessage({ message, invite, viewerId, mine, onAnswered }: {
  message: Message; invite: InviteView | null; viewerId: string; mine: boolean; onAnswered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const live = useQuest(invite?.quest?.id ?? null);
  const q = live.data?.quest ?? invite?.quest ?? null;
  const seats = live.data ? live.data.seatsLeft : q ? Math.max(q.capacity - q.memberIds.length, 0) : null;
  const status = invite?.status ?? 'pending';
  const canAnswer = !!invite && invite.toId === viewerId && status === 'pending' && !result;
  const from = invite?.from ? firstName(invite.from.name) : 'Your friend';

  // "5:30 PM (in 25 min) · 9 min walk · $12": walking from the demo spot, like the Out Here map.
  const nowMs = Date.now();
  const startsIn = q ? Math.round((new Date(q.startsAt).getTime() - nowMs) / 60_000) : null;
  const relative = startsIn === null ? ''
    : startsIn > 0 && startsIn < 120 ? ` (in ${startsIn} min)`
      : startsIn <= 0 && q && new Date(q.endsAt).getTime() > nowMs ? ' (now)' : '';
  const details = q
    ? [`${formatDemoTime(q.startsAt)}${relative}`, `${walkingMinutes(DEMO_CENTER, q.location)} min walk`, q.priceMax > 0 ? `$${q.priceMax}` : 'Free'].join(' · ')
    : null;

  // The sender's shared "I'm free" window, so the card says why it fits both of you. Only
  // fetched once this tab's persona is the viewer (it changes on load when ?as= is set).
  const ownPersona = personaByHandle(currentPersona())?.id === viewerId;
  const avail = useApi<FriendAvailabilityResponse>(!mine && invite && ownPersona ? `/api/friends/${viewerId}/availability` : null);
  const senderFree = avail.data?.items.find((a) => a.userId === invite?.fromId && new Date(a.endsAt).getTime() > nowMs) ?? null;

  const respond = async (s: 'accepted' | 'declined') => {
    if (!invite || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await apiPost<{ quest?: unknown; joinedAlone?: boolean }>(`/api/invites/${invite.id}/respond`, { status: s });
      setResult(s === 'declined'
        ? 'You declined.'
        : out.quest ? (out.joinedAlone ? `You're in. ${from} didn't fit, only one seat was left.` : `You're in with ${from}.`) : 'Accepted.');
      onAnswered();
    } catch (e) {
      setError(e instanceof ApiFetchError && e.status === 409 ? 'That plan is full now.' : "Couldn't answer. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const statusText = result ?? (status === 'accepted' ? (mine ? 'Accepted' : 'You accepted') : status === 'declined' ? 'Declined' : mine ? 'Waiting for a reply' : null);

  return (
    <div
      data-testid="invite-message"
      className={cn('w-[260px] max-w-full overflow-hidden rounded-[18px] border border-fb-divider-soft bg-fb-surface text-left', mine ? 'self-end' : 'self-start')}
    >
      <div className="bg-fb-blue-tint px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-fb-blue">Out Here invite</div>
      <div className="px-3 py-2">
        <p className="text-[15px] font-semibold leading-5 text-fb-text">
          {q?.emoji ? `${q.emoji} ` : ''}{titleWithoutEmoji(invite?.suggestionTitle ?? message.text, q?.emoji)}
        </p>
        {q && <p className="mt-0.5 text-[13px] text-fb-text-2">{q.venueName}</p>}
        {details && <p className="mt-0.5 text-[13px] text-fb-text" data-testid="invite-details">{details}</p>}
        {senderFree && (
          <p className="mt-0.5 text-[13px] text-fb-text-2" data-testid="invite-fit">{from}&apos;s free till {formatDemoTime(senderFree.endsAt)}</p>
        )}
        {seats !== null && (
          <p className={cn('mt-0.5 text-[13px] font-semibold', seats === 0 ? 'text-fb-text-2' : 'text-fb-green')} data-testid="invite-seats">
            {seats === 0 ? 'Full' : `${seats} ${seats === 1 ? 'seat' : 'seats'} left`}
          </p>
        )}
        {invite?.message && invite.message !== invite.suggestionTitle && (
          <p className="mt-1 text-[13px] text-fb-text-2">“{invite.message}”</p>
        )}
        {error && <p role="alert" className="mt-1 text-[13px] text-fb-red">{error}</p>}
        {canAnswer ? (
          <div className="mt-2 flex gap-2">
            <Button size="sm" block disabled={busy || seats === 0} onClick={() => void respond('accepted')}>
              {seats === 0 ? 'Full' : 'Accept'}
            </Button>
            <Button size="sm" block variant="secondary" disabled={busy} onClick={() => void respond('declined')}>Decline</Button>
          </div>
        ) : statusText ? (
          <p className="mt-1 text-[13px] font-semibold text-fb-text" data-testid="invite-status">{statusText}</p>
        ) : null}
        {q && (
          <Link href={ROUTES.outHere} className="mt-2 block text-[13px] font-semibold text-fb-link hover:underline">
            See it on the map
          </Link>
        )}
      </div>
    </div>
  );
}

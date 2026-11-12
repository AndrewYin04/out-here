'use client';

import { Footprints, Clock, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { apiPost, useQuest } from '@/features/data';
import { Avatar, Button, cn } from '@/features/ui';
import { minutesUntil, type PersonCard, type PlanSuggestion } from '@/shared';
import { errorText } from './plan-api';

export function MuseLabel({ className }: { className?: string }) {
  return (
    <span data-testid="muse-label" className={cn('inline-flex items-center gap-1 rounded-full bg-fb-blue-tint px-2 py-0.5 text-[12px] font-semibold text-fb-blue', className)}>
      ✨ Muse
    </span>
  );
}

function startsText(iso: string): string {
  const m = minutesUntil(iso);
  if (m <= 0) return 'Happening now';
  if (m < 60) return `Starts in ${m} min`;
  const h = Math.floor(m / 60);
  return `Starts in ${h} hr${m % 60 ? ` ${m % 60} min` : ''}`;
}

export function SeatsBadge({ seats }: { seats: number }) {
  return (
    <span
      key={seats}
      data-testid="seats-left"
      data-seats={seats}
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2 text-[13px] font-semibold animate-toast-in',
        seats === 0 ? 'bg-fb-secondary-btn text-fb-text-2' : seats <= 2 ? 'bg-[#FDE8EA] text-fb-red' : 'bg-fb-blue-tint text-fb-blue',
      )}
    >
      {seats === 0 ? 'Full' : `${seats} left`}
    </span>
  );
}

type Props = {
  s: PlanSuggestion;
  friends: Map<string, PersonCard>;
  showMuse: boolean;
  onJoined?: () => void;
};

export function SuggestionCard({ s, friends, showMuse, onJoined }: Props) {
  const quest = useQuest(s.questId);
  const seats = quest.data?.seatsLeft ?? s.seatsLeft;
  const price = quest.data?.quest.priceMax;
  const isMember = quest.data?.viewerIsMember ?? false;
  const people = s.friendIds.map((id) => friends.get(id)).filter((p): p is PersonCard => !!p);

  const [inviteFor, setInviteFor] = useState<PersonCard | null>(null);
  const [draft, setDraft] = useState('');
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'invite' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const openInvite = (p: PersonCard) => {
    setInviteFor(p);
    setDraft(s.inviteDraft ?? `Want to come to ${s.title}? ${startsText(s.startsAt)}.`);
    setError(null);
  };

  const sendInvite = async () => {
    if (!inviteFor || inFlight.current) return;
    inFlight.current = true;
    setBusy('invite');
    setError(null);
    try {
      await apiPost('/api/invites', { toId: inviteFor.id, questId: s.questId, suggestionTitle: s.title, message: draft.trim() });
      setSentTo((prev) => new Set(prev).add(inviteFor.id));
      setInviteFor(null);
    } catch (e) {
      setError(errorText(e, "Couldn't send the invite. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const join = async () => {
    if (!s.questId || inFlight.current) return;
    inFlight.current = true;
    setBusy('join');
    setError(null);
    try {
      await apiPost(`/api/quests/${s.questId}/join`, {});
      await quest.refetch();
      onJoined?.();
    } catch (e) {
      setError(errorText(e, "Couldn't join. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <article data-testid="suggestion" data-quest-id={s.questId ?? ''} className="rounded-card bg-fb-surface p-3 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fb-bg text-[22px]">{s.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-semibold leading-5 text-fb-text">{s.title}</h3>
            {seats !== null && <SeatsBadge seats={seats} />}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-fb-text-2">
            <span className="inline-flex items-center gap-1"><Footprints size={14} aria-hidden />{s.travelMinutes} min walk</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{startsText(s.startsAt)}</span>
            {price !== undefined && (<><span aria-hidden>·</span><span>{price === 0 ? 'Free' : `Up to $${price}`}</span></>)}
          </p>
        </div>
      </div>

      <div className="mt-2">
        {showMuse && <MuseLabel />}
        <p data-testid="suggestion-reason" className="mt-1 text-[15px] leading-5 text-fb-text">{s.reason}</p>
        {s.bridge && <p className="mt-1 text-[13px] text-fb-text-2">{s.bridge}</p>}
      </div>

      {people.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[13px] text-fb-text-2">
          <Users size={14} aria-hidden />
          <div className="flex -space-x-1.5">
            {people.map((p) => <Avatar key={p.id} src={p.avatarUrl} name={p.name} size={24} ring />)}
          </div>
          <span>{people.map((p) => p.name.split(' ')[0]).join(', ')} can make it</span>
        </div>
      )}

      {inviteFor && (
        <div className="mt-3 rounded-card bg-fb-bg p-2">
          <label htmlFor={`draft-${s.questId}`} className="text-[13px] font-semibold text-fb-text-2">
            Message to {inviteFor.name.split(' ')[0]}
          </label>
          <textarea
            id={`draft-${s.questId}`}
            data-testid="invite-draft"
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-[8px] border border-fb-divider bg-fb-surface p-2 text-[15px] text-fb-text outline-none focus:border-fb-blue"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setInviteFor(null)}>Cancel</Button>
            <Button size="sm" onClick={() => void sendInvite()} disabled={busy === 'invite' || !draft.trim()}>
              {busy === 'invite' ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{error}</p>}

      {!inviteFor && (
        <div className="mt-3 flex gap-2">
          {people.slice(0, 2).map((p) => {
            const sent = sentTo.has(p.id);
            return (
              <Button key={p.id} variant={sent ? 'secondary' : 'primary'} block disabled={sent} onClick={() => openInvite(p)}>
                {sent ? `Invite sent to ${p.name.split(' ')[0]}` : `Invite ${p.name.split(' ')[0]}`}
              </Button>
            );
          })}
          {s.questId && (
            <Button
              variant={people.length > 0 ? 'secondary' : 'primary'}
              block
              disabled={isMember || seats === 0 || busy === 'join'}
              onClick={() => void join()}
            >
              {isMember ? "You're going" : busy === 'join' ? 'Joining…' : seats === 0 ? 'Full' : 'Join'}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

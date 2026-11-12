'use client';

import { CheckCircle2, Footprints, Clock, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiPost, useChannel, useQuest, useViewer, type InviteView } from '@/features/data';
import { Avatar, Button, cn } from '@/features/ui';
import { formatDemoTime, minutesUntil, type PersonCard, type PlanSuggestion } from '@/shared';
import { errorText } from './plan-api';
import { setPlanOpen } from './plan-state';

export function MuseLabel({ className }: { className?: string }) {
  return (
    <span data-testid="muse-label" className={cn('inline-flex items-center gap-1 rounded-full bg-fb-blue-tint px-2 py-0.5 text-[12px] font-semibold text-fb-blue', className)}>
      ✨ Muse
    </span>
  );
}

/** Shown in place of the ✨ Muse label when the text came from the offline heuristic (MUSE_MOCK). */
export function OfflineLabel({ className }: { className?: string }) {
  return (
    <span data-testid="offline-label" className={cn('inline-flex items-center rounded-full bg-fb-secondary-btn px-2 py-0.5 text-[12px] font-semibold text-fb-text-2', className)}>
      Offline suggestions
    </span>
  );
}

type Outcome = { status: 'accepted' | 'declined'; together: boolean };

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

  const { viewer } = useViewer();
  const [inviteFor, setInviteFor] = useState<PersonCard | null>(null);
  const [draft, setDraft] = useState('');
  /** friend id -> invite id */
  const [sentTo, setSentTo] = useState<Map<string, string>>(new Map());
  /** friend id -> what they answered */
  const [outcomes, setOutcomes] = useState<Map<string, Outcome>>(new Map());
  const draftRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'invite' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const openInvite = (p: PersonCard) => {
    setInviteFor(p);
    setDraft(s.inviteDraft ?? `Want to come to ${s.title}? ${startsText(s.startsAt)}.`);
    setError(null);
  };
  // The draft opens at the bottom of a scrolled sheet: bring its Send button into view.
  useEffect(() => {
    if (inviteFor) draftRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [inviteFor]);

  // The inviter's payoff: when a friend answers, user:<me> fires {type:"invite"}; read the outcome.
  const checkAnswers = useCallback(async () => {
    if (sentTo.size === 0) return;
    try {
      const data = await apiFetch<{ outgoing: InviteView[] }>('/api/invites', { headers: { 'x-outhere-fresh': '1' } });
      const next = new Map<string, Outcome>();
      for (const [friendId, inviteId] of sentTo) {
        const inv = data.outgoing.find((i) => i.id === inviteId);
        if (!inv || inv.status === 'pending') continue;
        const together = inv.status === 'accepted' && !!inv.quest?.memberIds.includes(viewer.id) && inv.quest.memberIds.includes(friendId);
        next.set(friendId, { status: inv.status, together });
      }
      setOutcomes(next);
    } catch {
      // keep what is shown
    }
    void quest.refetch();
    // quest.refetch is stable per quest id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentTo, viewer.id]);
  useChannel(sentTo.size > 0 ? [`user:${viewer.id}`] : [], (_c, payload) => {
    if ((payload as { type?: string } | null)?.type === 'invite') void checkAnswers();
  });

  const sendInvite = async () => {
    if (!inviteFor || inFlight.current) return;
    inFlight.current = true;
    setBusy('invite');
    setError(null);
    try {
      const out = await apiPost<{ invite: { id: string } }>('/api/invites', { toId: inviteFor.id, questId: s.questId, suggestionTitle: s.title, message: draft.trim() });
      setSentTo((prev) => new Map(prev).set(inviteFor.id, out.invite.id));
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

  const venue = quest.data?.quest.venueName ?? null;
  const answered = people.flatMap((p) => { const o = outcomes.get(p.id); return o ? [{ p, o }] : []; });

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
        <div ref={draftRef} className="mt-3 scroll-mb-2 rounded-card bg-fb-bg p-2">
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

      {answered.length > 0 && (
        <div data-testid="invite-outcome" aria-live="polite" className="mt-3 rounded-card bg-fb-bg p-2">
          {answered.map(({ p, o }) => (
            <p key={p.id} className="flex items-start gap-2 text-[15px] leading-5 text-fb-text">
              {o.together && <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-fb-green" />}
              <span>{outcomeText(p.name.split(' ')[0] ?? p.name, o, venue, s)}</span>
            </p>
          ))}
          {answered.some(({ o }) => o.together) && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPlanOpen(false)}>Show on map</Button>
            </div>
          )}
        </div>
      )}

      {!inviteFor && (
        <div className="mt-3 flex gap-2">
          {people.slice(0, 2).filter((p) => !outcomes.has(p.id)).map((p) => {
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

/** "Maya's in. You're both going to Dumpling Den, 4:43 PM · leave by 4:34 PM for the 9 min walk." */
function outcomeText(name: string, o: Outcome, venue: string | null, s: PlanSuggestion): string {
  if (o.status === 'declined') return `${name} can't make it this time.`;
  if (!o.together) return `${name} accepted, but only one seat was left, so ${name} took it.`;
  const leaveBy = new Date(Date.parse(s.startsAt) - s.travelMinutes * 60_000).toISOString();
  const where = venue ?? s.title;
  const leave = minutesUntil(leaveBy) > 0 ? ` · leave by ${formatDemoTime(leaveBy)} for the ${s.travelMinutes} min walk` : ` · ${s.travelMinutes} min walk`;
  return `${name}'s in. You're both going to ${where}, ${formatDemoTime(s.startsAt)}${leave}.`;
}

'use client';
// A friend's Find My card: name, place, distance and walking time, the 3-part status bubble,
// and its actions: Want to hang?, View profile (/profile/<handle>) and Message
// (/messages?to=<handle>, which opens or starts the thread). The hang composer shows what the invite proposes (a quest or place picked
// from the friend's bubble, free window and walking time) before it is sent.
import { Clock, Footprints, Hand, MapPin, MessageCircle, Send, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch, apiPost } from '@/features/data';
import type { HangSuggestion } from '@/features/data/locations';
import { Avatar, Button, CategoryIcon, LinkButton, Sheet, Skeleton, categoryOf, useToast } from '@/features/ui';
import { formatDemoTime } from '@/shared/demo';
import type { FriendPin } from '@/shared/types';

import { distanceLine, firstName, floatingPanel, updatedAgo } from './useFindMy';

const NO_PLAN_DRAFT = 'Want to hang soon? Let me know when you are free.';

export type FriendCardProps = {
  pin: FriendPin | null;
  onClose: () => void;
  /** Muse filter on: why this friend was kept, shown at the top of the card. */
  museReason?: { label: string; text: string } | null;
};

export function FriendCard({ pin, onClose, museReason = null }: FriendCardProps) {
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<HangSuggestion | null | undefined>(undefined);
  const friendId = pin?.friend.id ?? null;

  useEffect(() => {
    setComposing(false);
    setError(null);
    setEdited(false);
    setSuggestion(undefined);
    setMessage('');
  }, [friendId]);

  // Fetch what the invite would propose when the composer opens.
  useEffect(() => {
    if (!composing || !friendId) return;
    let live = true;
    apiFetch<{ suggestion: HangSuggestion | null }>(`/api/locations/hang?toId=${encodeURIComponent(friendId)}`)
      .then((r) => {
        if (!live) return;
        setSuggestion(r.suggestion);
        setMessage((m) => (edited && m ? m : r.suggestion?.draft ?? NO_PLAN_DRAFT));
      })
      .catch(() => {
        if (!live) return;
        setSuggestion(null);
        setMessage((m) => m || NO_PLAN_DRAFT);
      });
    return () => { live = false; };
  }, [composing, friendId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pin) return null;
  const f = pin.friend;
  const name = firstName(f.name);
  // walking time is null past a 2-hour walk (another city): no hang, no walk time
  const far = pin.walkingMinutes === null;

  async function send() {
    if (!pin) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiPost<{ suggestion: string }>('/api/locations/hang', {
        toId: pin.friend.id,
        message,
        questId: suggestion?.questId ?? null,
        placeId: suggestion?.placeId ?? null,
      });
      toast.show(`Invite sent to ${name}: ${res.suggestion}`);
      setComposing(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the invite');
    } finally {
      setSending(false);
    }
  }

  const b = pin.bubble;
  return (
    <Sheet open onClose={onClose} title={f.name} className={floatingPanel('right')}>
      <div data-testid="friend-card" className="flex flex-col gap-4">
        {museReason && (
          <p data-testid="friend-muse-reason" className="rounded-card bg-fb-blue-tint px-3 py-2 text-[13px] text-fb-text">
            <span className="font-semibold text-fb-blue">{museReason.label}</span>
            <span className="text-fb-text-2"> · </span>
            {museReason.text}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span className="rounded-full p-[3px] ring-[3px] ring-fb-green">
            <Avatar src={f.avatarUrl} name={f.name} size={60} decorative />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[15px] text-fb-text">
              <MapPin size={16} className="shrink-0 text-fb-text-2" aria-hidden />
              <span className="truncate">{pin.placeLabel ?? 'Nearby'}</span>
            </p>
            <p className="text-[15px] font-semibold text-fb-text" data-testid="friend-distance">{distanceLine(pin)}</p>
            <p className="text-[13px] text-fb-text-2">
              {pin.precision === 'approximate' ? 'Approximate location · ' : ''}Updated {updatedAgo(pin.updatedAt)}
            </p>
          </div>
        </div>

        {(b.thought || b.doing || b.wantsTo) && (
          <div className="rounded-card bg-fb-bg px-3 py-2.5" data-testid="friend-bubble">
            {b.thought && (
              <p className="flex items-center gap-1.5 text-[17px] font-semibold leading-[22px] text-fb-text">
                {b.emoji && <span className="text-[20px] leading-none" aria-hidden>{b.emoji}</span>}{b.thought}
              </p>
            )}
            {b.doing && <p className="mt-1 text-[15px] text-fb-text"><span className="text-fb-text-2">Right now: </span>{b.doing}</p>}
            {b.wantsTo && <p className="mt-0.5 text-[15px] text-fb-text"><span className="text-fb-text-2">Wants to: </span>{b.wantsTo}</p>}
          </div>
        )}

        {pin.availability && (
          <p className="text-[15px] text-fb-green">
            Free until {formatDemoTime(pin.availability.endsAt)}: &ldquo;{pin.availability.text}&rdquo;
          </p>
        )}

        {!composing && far && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-fb-text-2" data-testid="friend-far-note">
              {name} is in {pin.placeLabel ?? 'another city'}, too far to meet up today. Send a message instead.
            </p>
            <LinkButton href={`/messages?to=${encodeURIComponent(f.handle)}`} variant="primary" icon={<MessageCircle size={16} aria-hidden />}>
              Message
            </LinkButton>
            <LinkButton href={`/profile/${encodeURIComponent(f.handle)}`} variant="secondary" icon={<UserRound size={16} aria-hidden />}>
              View profile
            </LinkButton>
          </div>
        )}

        {!composing && !far && (
          <div className="flex flex-col gap-2">
            <Button variant="primary" block icon={<Hand size={16} aria-hidden />} onClick={() => setComposing(true)} aria-expanded={composing}>
              Want to hang?
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <LinkButton href={`/profile/${encodeURIComponent(f.handle)}`} variant="secondary" icon={<UserRound size={16} aria-hidden />}>
                View profile
              </LinkButton>
              <LinkButton href={`/messages?to=${encodeURIComponent(f.handle)}`} variant="secondary" icon={<MessageCircle size={16} aria-hidden />}>
                Message
              </LinkButton>
            </div>
          </div>
        )}

        {composing && (
          <div className="flex flex-col gap-3" data-testid="hang-composer">
            <h3 className="text-[17px] font-semibold">Want to hang with {name}?</h3>
            {suggestion === undefined && (
              <div className="flex items-center gap-3 rounded-card border border-fb-divider-soft p-3" aria-label="Finding a plan">
                <Skeleton shape="circle" width={40} height={40} />
                <div className="flex-1 space-y-2"><Skeleton width="70%" /><Skeleton width="50%" className="h-2.5" /></div>
              </div>
            )}
            {suggestion && (
              <div className="flex gap-3 rounded-card border border-fb-divider-soft p-3" data-testid="hang-suggestion">
                <CategoryIcon category={categoryOf(suggestion.questId, suggestion.emoji)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-5 text-fb-text">{suggestion.title}</p>
                  {suggestion.kind === 'quest' && <p className="text-[13px] text-fb-text-2">{suggestion.venueName}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-fb-text-2">
                    {suggestion.startsAt && (
                      <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden />{formatDemoTime(suggestion.startsAt)}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><Footprints size={13} aria-hidden />{suggestion.walkMinutes} min walk</span>
                    {suggestion.seatsLeft !== null && (
                      <span className="font-semibold text-fb-blue">{suggestion.seatsLeft} {suggestion.seatsLeft === 1 ? 'seat' : 'seats'} left</span>
                    )}
                  </p>
                  <p className="mt-1 text-[13px] text-fb-text" data-testid="hang-reason">
                    {suggestion.writtenBy === 'muse' && (
                      <span className="mr-1 font-semibold text-fb-blue" data-testid="hang-muse-label">
                        ✨ Muse{suggestion.museMock ? ' [mock]' : ''}
                      </span>
                    )}
                    {suggestion.writtenBy === 'muse' ? suggestion.reason : suggestion.reason.split(' · ')[0]}
                  </p>
                </div>
              </div>
            )}
            {suggestion === null && (
              <p className="text-[13px] text-fb-text-2" data-testid="hang-no-plan">
                Nothing open within a 25-min walk of you both right now, so this is a plain invite.
              </p>
            )}
            <label htmlFor="hang-message" className="sr-only">Message to {name}</label>
            <textarea
              id="hang-message"
              value={message}
              maxLength={500}
              rows={3}
              disabled={suggestion === undefined}
              onChange={(e) => { setEdited(true); setMessage(e.target.value); }}
              className="w-full resize-none rounded-btn bg-fb-input px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-fb-blue"
            />
            {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setComposing(false)}>Cancel</Button>
              <Button variant="primary" disabled={sending || suggestion === undefined} onClick={send} icon={<Send size={16} aria-hidden />}>
                {sending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

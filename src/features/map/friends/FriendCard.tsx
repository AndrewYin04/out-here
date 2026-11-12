'use client';
// A friend's Find My card: name, place, distance and walking time, the 3-part status bubble,
// and View profile / Message / Want to hang?.
import { MapPin, MessageCircle, Send, UserRound, Hand } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiPost } from '@/features/data';
import { Avatar, Button, LinkButton, Sheet, useToast } from '@/features/ui';
import { formatDemoTime } from '@/shared/demo';
import type { FriendPin } from '@/shared/types';
import { distanceLine, firstName, updatedAgo } from './useFindMy';

export type FriendCardProps = { pin: FriendPin | null; onClose: () => void };

export function FriendCard({ pin, onClose }: FriendCardProps) {
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const friendId = pin?.friend.id ?? null;

  useEffect(() => {
    setComposing(false);
    setError(null);
    setMessage(pin ? `Want to hang? I'm nearby for a bit.` : '');
  }, [friendId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pin) return null;
  const f = pin.friend;
  const name = firstName(f.name);

  async function send() {
    if (!pin) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiPost<{ suggestion: string }>('/api/locations/hang', { toId: pin.friend.id, message });
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
    <Sheet open onClose={onClose} title={f.name}>
      <div data-testid="friend-card" className="flex flex-col gap-4">
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
              <p className="text-[17px] font-semibold leading-[22px] text-fb-text">
                {b.emoji ? `${b.emoji} ` : ''}{b.thought}
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

        <div className="flex flex-col gap-2">
          <Button variant="primary" block icon={<Hand size={16} aria-hidden />} onClick={() => setComposing(true)} aria-expanded={composing}>
            Want to hang?
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href={`/profile/${f.handle}`} variant="secondary" icon={<UserRound size={16} aria-hidden />}>
              View profile
            </LinkButton>
            <LinkButton href={`/messages?to=${f.handle}`} variant="secondary" icon={<MessageCircle size={16} aria-hidden />}>
              Message
            </LinkButton>
          </div>
        </div>

        {composing && (
          <div className="flex flex-col gap-2" data-testid="hang-composer">
            <label htmlFor="hang-message" className="text-[15px] font-semibold">Want to hang with {name}?</label>
            <textarea
              id="hang-message"
              value={message}
              maxLength={500}
              rows={2}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-none rounded-btn bg-fb-input px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-fb-blue"
            />
            <p className="text-[13px] text-fb-text-2">The invite suggests an open quest or a place near {name}.</p>
            {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
            <Button variant="primary" block disabled={sending} onClick={send} icon={<Send size={16} aria-hidden />}>
              {sending ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

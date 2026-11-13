'use client';
// Your location sharing. At the top, as in Find My, one "Share my location" switch that applies at
// once (with Undo), and the line "Sharing with Friends · until 2:58 PM · Refresh". Who can see you
// (Friends, a friend list such as Close friends, or Only me) and exact or approximate also apply at
// once. Save is only for the status bubble (emoji, thought, what you're doing, what you want to
// do). Every change refreshes the 4-hour expiry.
import { useEffect, useRef, useState } from 'react';
import { ApiFetchError, apiFetch, useApi } from '@/features/data';
import { Button, Sheet, useToast } from '@/features/ui';
import { formatDemoTime } from '@/shared/demo';
import type { Audience, FriendList, LocationPrecision, LocationShare } from '@/shared/types';
import { floatingPanel, useMyShare } from './useFindMy';

export function audienceLabel(a: Audience, lists: FriendList[] = []): string {
  if (a === 'friends') return 'Friends';
  if (a === 'only_me') return 'Only me';
  if (a.startsWith('list:')) return lists.find((l) => `list:${l.id}` === a)?.name ?? 'Friend list';
  return 'Friends';
}

const EMOJIS = ['🥟', '☕', '🍜', '🧋', '🏐', '🎸', '📚', '🧗', '🎲', '🌅', '👋', '😴'];

type SharePatch = { paused?: boolean; audience?: Audience; precision?: LocationPrecision; expiresAt?: string };

export function SharingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data, refetch } = useMyShare();
  const lists = useApi<{ lists: FriendList[] }>(open ? '/api/friend-lists' : null);
  const share = data?.share ?? null;
  const [emoji, setEmoji] = useState('');
  const [thought, setThought] = useState('');
  const [doing, setDoing] = useState('');
  const [wantsTo, setWantsTo] = useState('');
  const [audience, setAudience] = useState<Audience>('friends');
  const [precision, setPrecision] = useState<LocationPrecision>('approximate');
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once per opening (after the share has loaded), so a background refetch
  // never overwrites what the person is typing.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) { filled.current = false; return; }
    if (filled.current || !data) return;
    filled.current = true;
    setEmoji(share?.bubble.emoji ?? '');
    setThought(share?.bubble.thought ?? '');
    setDoing(share?.bubble.doing ?? '');
    setWantsTo(share?.bubble.wantsTo ?? '');
    setAudience(share?.audience === 'public' ? 'friends' : share?.audience ?? 'friends');
    setPrecision(share?.precision ?? 'approximate');
    setPaused(share?.paused ?? false);
    setError(null);
  }, [open, data, share]);

  /** Applies a sharing setting at once. Returns the saved share, or null on failure. */
  async function apply(patch: SharePatch): Promise<LocationShare | null> {
    setApplying(true);
    setError(null);
    try {
      const res = await apiFetch<{ share: LocationShare }>('/api/locations/me', { method: 'PUT', body: JSON.stringify(patch) });
      await refetch();
      return res.share;
    } catch (e) {
      setError(e instanceof ApiFetchError ? e.message : 'Could not update sharing');
      return null;
    } finally {
      setApplying(false);
    }
  }

  async function setSharing(on: boolean) {
    const before = paused;
    // Undo puts back exactly what the server had: paused or not, and the same expiry.
    const beforeExpiry = share?.expiresAt;
    setPaused(!on);
    const saved = await apply({ paused: !on });
    if (!saved) { setPaused(before); return; }
    let undone = false;
    toast.show(on ? `Sharing your location until ${formatDemoTime(saved.expiresAt)}` : 'Location sharing paused', {
      action: {
        label: 'Undo',
        onClick: () => {
          if (undone) return;
          undone = true;
          setPaused(before);
          void apply({ paused: before, ...(beforeExpiry ? { expiresAt: beforeExpiry } : {}) }).then((s) => { if (!s) setPaused(!on); });
        },
      },
    });
  }

  async function pickAudience(a: Audience) {
    const before = audience;
    setAudience(a);
    if (!(await apply({ audience: a }))) setAudience(before);
  }

  async function pickPrecision(p: LocationPrecision) {
    const before = precision;
    setPrecision(p);
    if (!(await apply({ precision: p }))) setPrecision(before);
  }

  async function refresh() {
    const saved = await apply({});
    if (saved) toast.show(`Sharing until ${formatDemoTime(saved.expiresAt)}`);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/locations/me', {
        method: 'PUT',
        body: JSON.stringify({
          bubble: { emoji: emoji || null, thought: thought || null, doing: doing || null, wantsTo: wantsTo || null },
        }),
      });
      await refetch();
      toast.show('Your status is updated');
      onClose();
    } catch (e) {
      setError(e instanceof ApiFetchError ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const listOptions = lists.data?.lists ?? [];
  const audiences: { value: Audience; label: string; hint: string }[] = [
    { value: 'friends', label: 'Friends', hint: 'Your friends on Facebook' },
    ...listOptions.map((l) => ({ value: `list:${l.id}` as Audience, label: l.name, hint: `${l.memberIds.length} ${l.memberIds.length === 1 ? 'person' : 'people'}` })),
    { value: 'only_me', label: 'Only me', hint: 'Nobody sees your location' },
  ];
  const sharing = !paused;

  const field = 'w-full rounded-btn bg-fb-input px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-fb-blue';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your status and sharing"
      side="left"
      className={floatingPanel('left')}
      footer={(
        <div className="flex flex-col gap-2">
          {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
          <Button block disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save status'}</Button>
        </div>
      )}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="sharing-form">
        <div className="rounded-card bg-fb-bg px-3 py-2.5" data-testid="sharing-toggle">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-[17px] font-semibold" id="fm-share-label">Share my location</span>
            <button
              type="button"
              role="switch"
              aria-checked={sharing}
              aria-labelledby="fm-share-label"
              disabled={applying}
              onClick={() => void setSharing(!sharing)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sharing ? 'bg-fb-green' : 'bg-fb-divider'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${sharing ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="mt-0.5 text-[13px] text-fb-text-2" data-testid="sharing-status">
            {sharing && share ? (
              <>
                Sharing with {audienceLabel(audience, listOptions)} · until {formatDemoTime(share.expiresAt)} ·{' '}
                <button type="button" className="font-semibold text-fb-blue hover:underline" disabled={applying} onClick={() => void refresh()}>
                  Refresh
                </button>
              </>
            ) : sharing ? 'Friends will see you once you share' : 'Paused. Nobody sees your location or status.'}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[17px] font-semibold">Status bubble</legend>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Emoji">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={emoji === e}
                aria-label={`Emoji ${e}`}
                onClick={() => setEmoji(emoji === e ? '' : e)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-[20px] ${emoji === e ? 'bg-fb-blue-tint ring-2 ring-fb-blue' : 'bg-fb-input hover:bg-fb-secondary-btn'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <label className="text-[13px] text-fb-text-2" htmlFor="fm-thought">What&apos;s on your mind?</label>
          <input id="fm-thought" className={field} maxLength={80} value={thought} onChange={(e) => setThought(e.target.value)} placeholder="craving dumplings" />
          <label className="text-[13px] text-fb-text-2" htmlFor="fm-doing">What are you doing?</label>
          <input id="fm-doing" className={field} maxLength={80} value={doing} onChange={(e) => setDoing(e.target.value)} placeholder="at work till 5:15" />
          <label className="text-[13px] text-fb-text-2" htmlFor="fm-wants">What do you want to do?</label>
          <input id="fm-wants" className={field} maxLength={80} value={wantsTo} onChange={(e) => setWantsTo(e.target.value)} placeholder="try the new boba place" />
        </fieldset>

        <fieldset disabled={applying}>
          <legend className="mb-1 text-[17px] font-semibold">Who can see your location?</legend>
          {audiences.map((a) => (
            <label key={a.value} className="flex cursor-pointer items-center gap-3 rounded-btn px-1 py-2 hover:bg-fb-hover">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{a.label}</span>
                <span className="block text-[13px] text-fb-text-2">{a.hint}</span>
              </span>
              <input type="radio" name="fm-audience" className="h-5 w-5 accent-[#0866FF]" checked={audience === a.value} onChange={() => void pickAudience(a.value)} />
            </label>
          ))}
        </fieldset>

        <fieldset disabled={applying}>
          <legend className="mb-1 text-[17px] font-semibold">Location precision</legend>
          {([
            ['exact', 'Exact', 'Friends see where you are'],
            ['approximate', 'Approximate', 'Friends see your area, within about 1 km'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-center gap-3 rounded-btn px-1 py-2 hover:bg-fb-hover">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="block text-[13px] text-fb-text-2">{hint}</span>
              </span>
              <input type="radio" name="fm-precision" className="h-5 w-5 accent-[#0866FF]" checked={precision === value} onChange={() => void pickPrecision(value)} />
            </label>
          ))}
        </fieldset>
        <p className="text-[13px] text-fb-text-2">Who can see you and precision apply right away. Sharing turns off after 4 hours unless you refresh it.</p>
      </form>
    </Sheet>
  );
}

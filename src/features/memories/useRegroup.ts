'use client';

// "Get this group together again" / "Do it again": ask Muse (POST /api/muse/regroup) for the
// crew's next plan, then send it to the crew chat (or as invites to friends). Moved out of the
// crew card unchanged so the library card and the journey sheet share one implementation.
import { useCallback, useState } from 'react';
import type { PersonCard } from '@/shared';
import { apiPost, ApiFetchError, currentPersona } from '@/features/data';
import { stripLeadingEmoji, type RegroupResult } from './regroup';

export type CrewMeta = { crewId: string; members: PersonCard[]; originTitle: string | null; threadId: string | null };

export type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; text: string; href: string }
  | { kind: 'error'; text: string };

export type RegroupState = {
  busy: boolean;
  result: (RegroupResult & { mock: boolean }) | null;
  failed: string | null;
  send: SendState;
  regroup: () => Promise<void>;
  sendToCrew: () => Promise<void>;
};

export function useRegroup(crewId: string, meta: CrewMeta | null, viewerId: string): RegroupState {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(RegroupResult & { mock: boolean }) | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [send, setSend] = useState<SendState>({ kind: 'idle' });

  const regroup = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    setResult(null);
    setSend({ kind: 'idle' });
    try {
      setResult(await fetchRegroup(crewId));
    } catch (e) {
      setFailed(e instanceof ApiFetchError && e.status === 404 ? 'This crew is no longer available.' : 'Muse is busy, try again.');
    } finally {
      setBusy(false);
    }
  }, [crewId]);

  const sendToCrew = useCallback(async () => {
    if (!result) return;
    setSend({ kind: 'sending' });
    try {
      if (meta?.threadId) {
        await apiPost(`/api/threads/${meta.threadId}/messages`, { text: result.message });
        setSend({ kind: 'sent', text: 'Sent to the crew chat.', href: `/messages/${meta.threadId}` });
        return;
      }
      const targets = (meta?.members ?? []).filter((m) => m.id !== viewerId);
      const friends = targets.filter((m) => m.isFriend);
      const sent: string[] = [];
      for (const m of friends) {
        try {
          await apiPost('/api/invites', {
            toId: m.id, questId: result.suggestion.questId, suggestionTitle: stripLeadingEmoji(result.suggestion.title), message: result.message,
          });
          sent.push(m.name.split(' ')[0]);
        } catch { /* reported below as not sent */ }
      }
      if (sent.length === 0) {
        setSend({ kind: 'error', text: 'Could not send invites. Try again.' });
        return;
      }
      const skipped = targets.length - sent.length;
      setSend({
        kind: 'sent',
        text: `Invite sent to ${sent.join(', ')}${skipped > 0 ? `. ${skipped} not sent (invites go to friends only)` : ''}.`,
        href: '/messages',
      });
    } catch {
      setSend({ kind: 'error', text: 'Could not send. Try again.' });
    }
  }, [meta?.threadId, meta?.members, viewerId, result]);

  return { busy, result, failed, send, regroup, sendToCrew };
}

async function fetchRegroup(crewId: string): Promise<RegroupResult & { mock: boolean }> {
  // apiFetch drops headers, so read x-muse-mode from a raw call with the same persona header.
  const res = await fetch('/api/muse/regroup', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-persona': currentPersona() }, body: JSON.stringify({ crewId }),
  });
  const data = await res.json().catch(() => null) as (RegroupResult & { error?: string }) | null;
  if (!res.ok || !data || !data.suggestion) throw new ApiFetchError(res.status, data?.error ?? `HTTP ${res.status}`);
  return { ...data, mock: res.headers.get('x-muse-mode') === 'mock' };
}

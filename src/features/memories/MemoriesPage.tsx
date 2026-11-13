'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Images, Sparkles } from 'lucide-react';
import type { Crew, Memory, PersonCard } from '@/shared';
import { apiFetch, apiPost, ApiFetchError, currentPersona, useChannel, useViewer } from '@/features/data';
import { usePersonaHandle } from '@/features/fb/shell';
import { AvatarStack, Button, Card, EmptyState, Skeleton } from '@/features/ui';
import { SideQuestSection } from '@/features/daily';
import { stripLeadingEmoji, type RegroupResult } from './regroup';

type CrewMeta = { crewId: string; members: PersonCard[]; originTitle: string | null; threadId: string | null };
type CrewRow = Crew & { meta: CrewMeta | null; memories: Memory[]; viewerId: string };

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });

export function MemoriesPage() {
  const handle = usePersonaHandle();
  return <MemoriesView key={handle ?? 'loading'} handle={handle} />;
}

function MemoriesView({ handle }: { handle: string | null }) {
  const { viewer } = useViewer();
  const [crews, setCrews] = useState<CrewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useChannel([`user:${viewer.id}`], (_channel, payload) => {
    if (payload.type === 'memory' || payload.resync) setRefresh((value) => value + 1);
  });

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    setError(null);
    (async () => {
      try {
        const options = { headers: { 'x-outhere-fresh': '1' } };
        const [{ crews: list }, { crews: metas, viewerId }] = await Promise.all([
          apiFetch<{ crews: Crew[] }>('/api/crews', options),
          apiFetch<{ viewerId: string; crews: CrewMeta[] }>('/api/muse/regroup', options),
        ]);
        const rows = await Promise.all(list.map(async (c) => {
          const { memories } = await apiFetch<{ memories: Memory[] }>(`/api/memories?crewId=${encodeURIComponent(c.id)}`, options)
            .catch(() => ({ memories: [] as Memory[] }));
          return { ...c, meta: metas.find((m) => m.crewId === c.id) ?? null, memories, viewerId };
        }));
        if (alive) setCrews(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load memories');
      }
    })();
    return () => { alive = false; };
  }, [handle, refresh]);

  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (crews && target.startsWith('crew-')) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [crews]);

  return (
    <div className="mx-auto w-full max-w-[680px] px-0 pb-6 md:px-4 md:pt-4">
      <div className="px-4 py-3 md:px-0">
        <h1 className="text-[24px] font-bold leading-[30px] text-fb-text">Memories</h1>
        <p className="mt-1 text-[15px] text-fb-text-2">Crews from your Out Here hangouts, their albums, and the next plan.</p>
      </div>
      <SideQuestSection />
      {error && <Card padded className="text-fb-text-2" role="alert">Could not load memories: {error}</Card>}
      {!error && crews === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => <Card key={i} padded><Skeleton className="h-6 w-40" /><Skeleton className="mt-3 h-40 w-full" /></Card>)}
        </div>
      )}
      {crews && crews.length === 0 && (
        <Card>
          <EmptyState
            icon={<Images size={40} />}
            title="No crews yet"
            body="Join a plan on Out Here. When it ends, the people you went with become a crew and your photos land here."
            action={<Link href="/out-here" className="font-semibold text-fb-blue hover:underline">Find a plan</Link>}
          />
        </Card>
      )}
      {handle && crews && crews.length > 0 && (
        <div className="flex flex-col gap-3">
          {crews.map((c) => <CrewCard key={c.id} crew={c} handle={handle} />)}
        </div>
      )}
    </div>
  );
}

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; text: string; href: string } | { kind: 'error'; text: string };

function CrewCard({ crew, handle }: { crew: CrewRow; handle: string }) {
  const members = useMemo(() => crew.meta?.members ?? [], [crew.meta]);
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
      const res = await fetchRegroup(crew.id);
      setResult(res);
    } catch (e) {
      setFailed(e instanceof ApiFetchError && e.status === 404 ? 'This crew is no longer available.' : 'Muse is busy, try again.');
    } finally {
      setBusy(false);
    }
  }, [crew.id]);

  const sendToCrew = useCallback(async () => {
    if (!result) return;
    setSend({ kind: 'sending' });
    try {
      if (crew.meta?.threadId) {
        await apiPost(`/api/threads/${crew.meta.threadId}/messages`, { text: result.message });
        setSend({ kind: 'sent', text: 'Sent to the crew chat.', href: `/messages/${crew.meta.threadId}` });
        return;
      }
      const targets = members.filter((m) => m.id !== crew.viewerId);
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
  }, [crew.meta?.threadId, crew.viewerId, members, result]);

  return (
    <Card as="section" id={`crew-${crew.id}`} className="scroll-mt-16 overflow-hidden" aria-label={crew.name} data-testid="crew-card">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-fb-text">{crew.name}</h2>
          <p className="text-[13px] text-fb-text-2">
            {crew.meta?.originTitle ? `${crew.meta.originTitle} · ` : ''}Last hangout {dateFmt.format(new Date(crew.lastHangoutAt))}
          </p>
          {crew.sharedPrefs.length > 0 && (
            <p className="mt-1 text-[13px] text-fb-text-2">Into: {crew.sharedPrefs.join(', ')}</p>
          )}
        </div>
        {members.length > 0 && <AvatarStack people={members.map((m) => ({ name: m.name, src: m.avatarUrl }))} size={32} max={5} />}
      </div>

      {crew.memories.length > 0 ? (
        <ul className={crew.memories.length % 3 === 0 || crew.memories.length > 4 ? "grid grid-cols-3 gap-0.5" : "grid grid-cols-2 gap-0.5"} aria-label={`${crew.name} album`}>
          {crew.memories.map((m) => (
            <li key={m.id} className="relative aspect-square bg-fb-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.photoUrl === `/api/memories/${m.id}/photo` ? `${m.photoUrl}?as=${encodeURIComponent(handle)}` : m.photoUrl}
                alt={m.caption || `${crew.name} photo`} className="h-full w-full object-cover" loading="lazy" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-3 text-[15px] text-fb-text-2">No photos in this album yet.</p>
      )}
      {crew.memories[0]?.caption && (
        <p className="px-4 pt-2 text-[15px] text-fb-text">&ldquo;{crew.memories[0].caption}&rdquo;</p>
      )}

      <div className="p-4">
        <Button variant="tint" block onClick={regroup} disabled={busy} icon={<Sparkles size={16} />}>
          {busy ? 'Muse is checking who’s free…' : result || failed ? 'Ask Muse again' : 'Get this group together again'}
        </Button>

        {failed && <p className="mt-3 text-[15px] text-fb-text-2" role="status">{failed}</p>}

        {result && (
          <div className="mt-3 rounded-card border border-fb-divider bg-fb-bg p-3" data-testid="regroup-suggestion">
            <p className="text-[12px] font-semibold text-fb-blue">
              ✨ Muse{result.mock && <span className="ml-1 font-normal text-fb-text-2">(offline)</span>}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-fb-text">{result.suggestion.title}</p>
            <p className="text-[13px] text-fb-text-2">{result.suggestion.whenText}</p>
            <p className="mt-2 text-[15px] text-fb-text">{result.suggestion.reason}</p>
            <p className="mt-2 rounded-card bg-white p-2 text-[15px] text-fb-text">{result.message}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={sendToCrew} disabled={send.kind === 'sending' || send.kind === 'sent'}>
                {send.kind === 'sending' ? 'Sending…' : send.kind === 'sent' ? 'Sent' : 'Send to crew'}
              </Button>
              {result.suggestion.questId && (
                <Link href={`/out-here?quest=${result.suggestion.questId}`} className="text-[15px] font-semibold text-fb-blue hover:underline">
                  View plan
                </Link>
              )}
            </div>
            {send.kind === 'sent' && (
              <p className="mt-2 text-[13px] text-fb-text-2" role="status">
                {send.text} <Link href={send.href} className="font-semibold text-fb-blue hover:underline">Open Messenger</Link>
              </p>
            )}
            {send.kind === 'error' && <p className="mt-2 text-[13px] text-fb-text-2" role="status">{send.text}</p>}
          </div>
        )}
      </div>
    </Card>
  );
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

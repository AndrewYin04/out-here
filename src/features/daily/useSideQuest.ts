'use client';

// Today's Side Quest for the viewer, live. The server owns the schedule; this hook only reads
// it and keeps time. The countdown is computed from the persisted timestamps and a clock offset
// measured against the server's own clock at fetch time, so it stays right after a refresh, after
// switching tabs, and when the device clock is wrong. At the drop time it refetches (so a quest
// that drops while Out Here is open appears by itself); it also refreshes every minute and when
// the tab becomes visible again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { phaseOf, type SideQuestPhase } from '@/shared';
import type { SideQuestState } from '@/shared/api';
import { apiFetch, useViewer } from '@/features/data';

const FRESH = { headers: { 'x-outhere-fresh': '1' } };
const POLL_MS = 60_000;

export type SideQuestLive = {
  state: SideQuestState | null;
  /** Phase computed against the corrected clock (so waiting -> active -> expired needs no refetch). */
  phase: SideQuestPhase | null;
  /** The corrected current time. */
  now: Date;
  error: string | null;
  reload: () => Promise<void>;
  /** Replace the state with a fresher one from a mutation response. */
  apply: (next: SideQuestState) => void;
};

export function useSideQuest(): SideQuestLive {
  const { handle } = useViewer();
  const [state, setState] = useState<SideQuestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skew = useRef(0); // server time minus device time, in ms
  const [tick, setTick] = useState(0);

  const apply = useCallback((next: SideQuestState) => {
    skew.current = Date.parse(next.serverNow) - Date.now();
    setState(next);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await apiFetch<SideQuestState>('/api/daily/side-quest', FRESH));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the Side Quest');
    }
  }, [apply]);

  // Load, and start over when the persona changes (never show one persona's quest to another).
  useEffect(() => {
    setState(null);
    setError(null);
    void reload();
  }, [handle, reload]);

  // One tick per second drives the countdown; a visible tab also refreshes the state.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    const poll = window.setInterval(() => { if (!document.hidden) void reload(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) { setTick((t) => t + 1); void reload(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); window.clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);

  // Refetch the instant the drop arrives, so the reveal appears on its own.
  const dropAt = state?.dropAt;
  const phaseNow = state ? state.phase : null;
  useEffect(() => {
    if (!dropAt || phaseNow !== 'waiting') return;
    const ms = Date.parse(dropAt) - (Date.now() + skew.current);
    if (ms > 2 ** 31 - 1) return;
    const id = window.setTimeout(() => void reload(), Math.max(0, ms) + 400);
    return () => window.clearTimeout(id);
  }, [dropAt, phaseNow, reload]);

  void tick; // re-render each second so `now` advances
  const now = new Date(Date.now() + skew.current);
  const phase = state ? phaseOf(now, state, !!state.entry) : null;
  return { state, phase, now, error, reload, apply };
}

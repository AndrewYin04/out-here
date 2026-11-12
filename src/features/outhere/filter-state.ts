'use client';
// The Muse filter: when on, Muse picks which plans (Explore) or friends (Friends) the map shows,
// from POST /api/muse/filter. "On" is per tab, kept in sessionStorage "outhere.museFilter".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiPost, useViewer } from '@/features/data';

export const MUSE_FILTER_KEY = 'outhere.museFilter';
const DEBOUNCE_MS = 600;

export type MuseFilterMode = 'explore' | 'friends';
type FilterResponse = {
  keep: { id: string; kind: 'quest' | 'friend'; reason: string }[];
  summary: string;
  source: 'muse' | 'fallback';
  total: number;
  mode: 'live' | 'mock';
  cached: boolean;
};

export type MuseFilter = {
  on: boolean;
  setOn: (next: boolean) => void;
  /** Ids Muse kept; null while off or before the first answer. */
  keep: Set<string> | null;
  reasons: Map<string, string>;
  summary: string;
  source: 'muse' | 'fallback' | null;
  /** True when the answer came from the real model (not MUSE_MOCK). */
  live: boolean;
  loading: boolean;
  /** How many candidates Muse chose from. */
  total: number;
  error: boolean;
};

function readOn(): boolean {
  try { return window.sessionStorage.getItem(MUSE_FILTER_KEY) === '1'; } catch { return false; }
}
function writeOn(v: boolean) {
  try { window.sessionStorage.setItem(MUSE_FILTER_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

export function useMuseFilter(mode: MuseFilterMode, text: string | null): MuseFilter {
  const { viewer } = useViewer();
  const [on, setOnState] = useState(false);
  const [result, setResult] = useState<{ key: string; data: FilterResponse } | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  // sessionStorage is read after mount so the server render and the first client render match.
  useEffect(() => { setOnState(readOn()); }, []);

  const setOn = useCallback((next: boolean) => { writeOn(next); setOnState(next); }, []);

  const ask = text?.trim() ?? '';
  const key = `${viewer.id}|${mode}|${ask.toLowerCase()}`;

  useEffect(() => {
    if (!on) return;
    const mine = ++seq.current;
    setError(false);
    const t = window.setTimeout(() => {
      apiPost<FilterResponse>('/api/muse/filter', ask ? { mode, text: ask } : { mode })
        .then((data) => { if (mine === seq.current) setResult({ key, data }); })
        .catch(() => { if (mine === seq.current) setError(true); });
    }, result ? DEBOUNCE_MS : 0);
    return () => window.clearTimeout(t);
    // result is read only to skip the debounce on the first fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);

  const current = on && result && result.key === key ? result.data : null;
  const keep = useMemo(() => (current ? new Set(current.keep.map((k) => k.id)) : null), [current]);
  const reasons = useMemo(() => new Map((current?.keep ?? []).map((k) => [k.id, k.reason])), [current]);
  return {
    on,
    setOn,
    keep,
    reasons,
    summary: current?.summary.replace(/^\[mock\]\s*/, '') ?? '',
    source: current?.source ?? null,
    live: current?.mode === 'live',
    loading: on && !current && !error,
    total: current?.total ?? 0,
    error: on && error && !current,
  };
}

'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultSwitchPersona } from './persona';
import { useResolvedPersona } from './useResolvedPersona';
import type { ShellContextValue, ShellStaticData, ShellViewerData } from './types';

const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * Shown while the tab's persona is unknown: in server HTML and in the hydration render.
 * Components draw skeletons for it instead of another persona's name and avatar.
 */
export const UNRESOLVED_VIEWER_DATA: ShellViewerData = {
  viewer: { handle: '', name: '', avatarUrl: null },
  contacts: [],
  shortcuts: [],
  groupChats: [],
  birthdays: [],
  notificationCount: 0,
  messageCount: 0,
};

export type ShellDataProviderProps = {
  /** Static fallback for all personas (from getDemoShellData() on the server). */
  data: ShellStaticData;
  /** Force the active persona (the integration can pass the resolved x-persona handle). */
  activeHandle?: string;
  /** Live values from the data layer; any field given here replaces the static one. */
  overrides?: Partial<ShellViewerData>;
  /** Called by the avatar menu. Default: save to sessionStorage and reload with ?as=. */
  onSwitchPersona?: (handle: string) => void;
  children: ReactNode;
};

export function ShellDataProvider({ data, activeHandle, overrides, onSwitchPersona, children }: ShellDataProviderProps) {
  const valid = useMemo(() => Object.keys(data.viewers), [data]);
  // null on the server and during hydration; see useResolvedPersona
  const handle = useResolvedPersona(valid, data.defaultHandle, activeHandle);
  const value = useMemo<ShellContextValue>(() => {
    const base = handle ? (data.viewers[handle] ?? data.viewers[data.defaultHandle]) : UNRESOLVED_VIEWER_DATA;
    return {
      ...base,
      ...(handle ? overrides : null),
      personas: data.personas,
      activeHandle: handle,
      ready: handle !== null,
      switchPersona: onSwitchPersona ?? defaultSwitchPersona,
    };
  }, [data, handle, overrides, onSwitchPersona]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Shell data for the active persona. Must be used under ShellDataProvider. */
export function useShellData(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShellData must be used inside <ShellDataProvider>');
  return ctx;
}

/**
 * The tab's persona handle, or null until it is known. Per-persona requests (the x-persona
 * header) must take the handle only from here and must not start while it is null, e.g.
 * `useEffect(() => { if (handle) load(handle); }, [handle])`.
 */
export function usePersonaHandle(): string | null {
  return useShellData().activeHandle;
}

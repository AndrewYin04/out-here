'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultSwitchPersona, resolvePersonaHandle } from './persona';
import type { ShellContextValue, ShellStaticData, ShellViewerData } from './types';

const ShellContext = createContext<ShellContextValue | null>(null);

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
  // First render uses the default persona on both server and client (no hydration mismatch),
  // then the effect switches to the tab's saved persona.
  const [resolved, setResolved] = useState(data.defaultHandle);
  useEffect(() => {
    setResolved(resolvePersonaHandle(Object.keys(data.viewers), data.defaultHandle));
  }, [data]);

  const handle = activeHandle && data.viewers[activeHandle] ? activeHandle : resolved;
  const value = useMemo<ShellContextValue>(() => {
    const base = data.viewers[handle] ?? data.viewers[data.defaultHandle];
    return {
      ...base,
      ...overrides,
      personas: data.personas,
      activeHandle: handle,
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

'use client';

import { useSyncExternalStore } from 'react';
import { resolvePersonaHandle } from './persona';

// The persona comes from ?as= and sessionStorage, which exist only in the browser. Reading it
// through useSyncExternalStore gives null on the server and during hydration, so the HTML never
// names a persona and hydration cannot mismatch. Every client render after that, including the
// first render of a client-side navigation, gets the real handle.
const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};
const getServerSnapshot = () => null;

/**
 * The tab's persona: `forced` when it is a valid handle, otherwise ?as= / sessionStorage /
 * `fallback` in the browser, and null while that browser state cannot be read yet.
 */
export function useResolvedPersona(valid: readonly string[], fallback: string, forced?: string): string | null {
  const fromBrowser = useSyncExternalStore<string | null>(
    subscribe,
    () => resolvePersonaHandle(valid, fallback),
    getServerSnapshot,
  );
  return forced && valid.includes(forced) ? forced : fromBrowser;
}

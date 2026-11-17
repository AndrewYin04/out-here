'use client';
// "Let's go": the one next step after a plan is set (docs/UX_PLAN.md). Every confirmation (Maya's
// accepted invite, "Maya's in", joining alone, a joined plan's panel, the shared-plan card) calls
// this. On the Out Here map it walks you there in 3D; anywhere else it opens Out Here with ?go=.
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export const LETS_GO = 'outhere:lets-go';

/** How many Out Here maps on this page are listening for LETS_GO (0 or 1 in practice). */
let listeners = 0;

/** The map calls this while it is mounted, so a Let's go on the same page doesn't navigate. */
export function listenLetsGo(onGo: (questId: string) => void): () => void {
  const handler = (e: Event) => onGo((e as CustomEvent<string>).detail);
  listeners += 1;
  window.addEventListener(LETS_GO, handler);
  return () => {
    listeners -= 1;
    window.removeEventListener(LETS_GO, handler);
  };
}

export function useLetsGo(): (questId: string) => void {
  const router = useRouter();
  return useCallback((questId: string) => {
    if (listeners > 0) window.dispatchEvent(new CustomEvent<string>(LETS_GO, { detail: questId }));
    // The persona lives in this tab's sessionStorage, so the map opens as the same person.
    else router.push(`/out-here?go=${encodeURIComponent(questId)}`);
  }, [router]);
}

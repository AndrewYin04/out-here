// Open/closed state shared by ImFreeButton and PlanSheet, which the map page renders as
// siblings without props. A tiny external store, so neither needs a provider.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setPlanOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function usePlanOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

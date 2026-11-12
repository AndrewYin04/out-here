// Open/closed state shared by ImFreeButton and PlanSheet, which the map page renders as
// siblings without props. A tiny external store, so neither needs a provider.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setPlanOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (!next) { setPlanSuggestions(null); setPlanAsk(null); }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function usePlanOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

// The suggestions of the plan on screen, so the map can highlight their pins. PlanSheet sets
// them when a plan returns; closing the sheet clears them.
export type PlanPicks = { questIds: string[]; topFriendIds: string[] };
let picks: PlanPicks | null = null;
const pickListeners = new Set<() => void>();

export function setPlanSuggestions(next: { questId: string | null; friendIds: string[] }[] | null): void {
  const value = next && next.length > 0
    ? { questIds: next.flatMap((s) => (s.questId ? [s.questId] : [])), topFriendIds: [...next[0].friendIds] }
    : null;
  if (JSON.stringify(value) === JSON.stringify(picks)) return;
  picks = value;
  for (const l of pickListeners) l();
}

function subscribePicks(l: () => void) {
  pickListeners.add(l);
  return () => { pickListeners.delete(l); };
}

export function usePlanSuggestions(): PlanPicks | null {
  return useSyncExternalStore(subscribePicks, () => picks, () => null);
}

// The ask the plan sheet last submitted ("hungry, 15 min"), so the Muse filter can use it.
// Closing the sheet clears it.
let ask: string | null = null;
const askListeners = new Set<() => void>();

export function setPlanAsk(next: string | null): void {
  const v = next && next.trim() ? next.trim() : null;
  if (v === ask) return;
  ask = v;
  for (const l of askListeners) l();
}

function subscribeAsk(l: () => void) {
  askListeners.add(l);
  return () => { askListeners.delete(l); };
}

export function usePlanAsk(): string | null {
  return useSyncExternalStore(subscribeAsk, () => ask, () => null);
}

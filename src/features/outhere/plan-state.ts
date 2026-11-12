// Open/closed state shared by ImFreeButton and PlanSheet, which the map page renders as
// siblings without props. A tiny external store, so neither needs a provider.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setPlanOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (next) togetherId = null;
  if (!next) setPlanSuggestions(null);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function usePlanOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

// The shared "plan together" sheet on screen (one at a time, never with the composer).
let togetherId: string | null = null;

export function openTogether(id: string | null): void {
  togetherId = id;
  if (id) { open = false; setPlanSuggestions(null); }
  for (const l of listeners) l();
}

export function useTogetherId(): string | null {
  return useSyncExternalStore(subscribe, () => togetherId, () => null);
}

/** Window event: the viewer's own availability changed (status pill, "I'm free" plan). */
export const AVAILABILITY_CHANGED = 'outhere:availability-changed';
export function availabilityChanged(): void {
  window.dispatchEvent(new Event(AVAILABILITY_CHANGED));
}

// Text to start the composer with (the "both free" nudge's "Make a plan"). Each call bumps the
// id so the same text twice still refills the composer.
let prefill: { id: number; text: string } | null = null;

export function openPlanWith(text: string): void {
  prefill = { id: (prefill?.id ?? 0) + 1, text };
  open = true;
  togetherId = null;
  for (const l of listeners) l();
}

export function usePlanPrefill(): { id: number; text: string } | null {
  return useSyncExternalStore(subscribe, () => prefill, () => null);
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

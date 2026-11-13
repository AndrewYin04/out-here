// Open/closed state shared by ImFreeButton and PlanSheet, which the map page renders as
// siblings without props. A tiny external store, so neither needs a provider.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setPlanOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (next) togetherId = null;
  if (!next) { setPlanSuggestions(null); setPlanAsk(null); setPlanStatus(null); }
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
/** byMuse: the live model ranked these; otherwise code did, and the map says "Top pick" without ✨. */
export type PlanPicks = { questIds: string[]; topFriendIds: string[]; byMuse: boolean };
let picks: PlanPicks | null = null;
const pickListeners = new Set<() => void>();

export function setPlanSuggestions(next: { questId: string | null; friendIds: string[] }[] | null, byMuse = false): void {
  const value = next && next.length > 0
    ? { questIds: next.flatMap((s) => (s.questId ? [s.questId] : [])), topFriendIds: [...next[0].friendIds], byMuse }
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

// What the plan sheet is doing, so the 3D view's Muse pet can say it: thinking while a plan is
// in flight, then the summary and the top suggestion's reason. Closing the sheet resets it.
export type PlanStatus = {
  state: 'idle' | 'loading' | 'done' | 'error';
  summary: string | null;
  topTitle: string | null;
  topReason: string | null;
  error: string | null;
  /** True when the text came from the live Muse model (not mock or fallback). */
  live: boolean;
};
const IDLE_STATUS: PlanStatus = { state: 'idle', summary: null, topTitle: null, topReason: null, error: null, live: false };
let status: PlanStatus = IDLE_STATUS;
const statusListeners = new Set<() => void>();

export function setPlanStatus(next: PlanStatus | null): void {
  const v = next ?? IDLE_STATUS;
  if (JSON.stringify(v) === JSON.stringify(status)) return;
  status = v;
  for (const l of statusListeners) l();
}

function subscribeStatus(l: () => void) {
  statusListeners.add(l);
  return () => { statusListeners.delete(l); };
}

export function usePlanStatus(): PlanStatus {
  return useSyncExternalStore(subscribeStatus, () => status, () => IDLE_STATUS);
}

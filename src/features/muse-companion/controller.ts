'use client';
// One Muse companion for the whole Out Here tab: a single state machine (state.ts), one shared
// conversation, and the real planner behind it. A tiny external store, like the plan state next to
// it, so the 3D world, the chat panel and the launcher read the same truth with no provider and no
// remount when the viewer moves between Out Here, Memories and the rest.
import { useSyncExternalStore } from 'react';
import { currentPersona } from '@/features/data';
import { requestPlan, setPlanOpen, setPlanStatus, setPlanSuggestions, errorText, type PlanResponse } from '@/features/outhere';
import { composeAsk } from './ask';
import { INITIAL, reduce, type MuseEvent, type MuseSnapshot } from './state';

export type ChatSource = 'muse' | 'fallback' | 'mock';
export type ChatMessage =
  | { id: string; role: 'user'; text: string; failed?: boolean }
  | { id: string; role: 'muse'; text: string; source: ChatSource; plan: PlanResponse | null; /** the text that was sent to the planner */ ask: string };

type Store = { snap: MuseSnapshot; messages: ChatMessage[]; error: string | null; owner: string };

const KEY = 'outhere.museChat';
const MAX_MESSAGES = 40;
let store: Store = { snap: INITIAL, messages: [], error: null, owner: '' };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const APPROACH_MS = 700;
const RETURN_MS = 900;
const SETTLE_MS = 3500;

// ---- the conversation survives a reload of the tab (per persona, per tab) ----
function load(owner: string): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(`${KEY}.${owner}`);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : [];
  } catch { return []; }
}
function save() {
  try { window.sessionStorage.setItem(`${KEY}.${store.owner}`, JSON.stringify(store.messages.slice(-MAX_MESSAGES))); } catch { /* private mode: kept in memory only */ }
}
/** The tab's persona can change (demo switcher): each persona has its own conversation. */
function ensureOwner() {
  if (typeof window === 'undefined') return;
  const owner = currentPersona();
  if (owner === store.owner) return;
  cancelInFlight();
  store = { snap: { ...INITIAL, selectionSeq: store.snap.selectionSeq }, messages: load(owner), error: null, owner };
}

// ---- timers: one pending timer for the state that ends by itself ----
let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
function arm(event: MuseEvent, ms: number) {
  clearTimer();
  timer = setTimeout(() => { timer = null; museDispatch(event); }, reduced() ? Math.min(ms, 120) : ms);
}

export function museDispatch(event: MuseEvent): void {
  ensureOwner();
  const before = store.snap;
  const after = reduce(before, event);
  if (after === before) return;
  store = { ...store, snap: after };
  if (after.state !== before.state) {
    if (after.state === 'approaching') arm({ type: 'APPROACH_DONE' }, APPROACH_MS);
    else if (after.state === 'returning') arm({ type: 'RETURN_DONE' }, RETURN_MS);
    else if (after.state === 'responding') arm({ type: 'RESPONSE_SETTLED' }, SETTLE_MS);
    else clearTimer();
  }
  emit();
}

// ---- requests: one at a time; a newer send, a close or a persona change drops the old answer ----
let inFlight: { id: number; controller: AbortController } | null = null;
let runId = 0;
function cancelInFlight() {
  inFlight?.controller.abort();
  inFlight = null;
}

export function openChat(): void {
  // One surface at a time: the "I'm free" composer and the chat never stack.
  setPlanOpen(false);
  museDispatch({ type: 'CHAT_OPENED' });
}

export function closeChat(): void {
  const wasThinking = store.snap.state === 'thinking';
  museDispatch({ type: 'CHAT_CLOSED' });
  // The conversation stays. A request still running keeps its answer (it lands in the history),
  // but the companion does not stay in the thinking pose after the chat is gone.
  if (wasThinking) setPlanStatus(null);
}

export function sendMessage(raw: string): boolean {
  ensureOwner();
  const text = raw.trim();
  if (!text || inFlight) return false; // empty, or a request is already running (double tap)
  const lastMuse = [...store.messages].reverse().find((m): m is Extract<ChatMessage, { role: 'muse' }> => m.role === 'muse');
  const ask = composeAsk(lastMuse?.plan ? lastMuse.ask : null, text);
  const user: ChatMessage = { id: nextId(), role: 'user', text };
  store = { ...store, messages: [...store.messages, user].slice(-MAX_MESSAGES), error: null };
  save();
  museDispatch({ type: 'MUSE_REQUEST_STARTED' });
  setPlanStatus({ state: 'loading', summary: null, topTitle: null, topReason: null, error: null, live: false });
  emit();

  const controller = new AbortController();
  const id = ++runId;
  inFlight = { id, controller };
  requestPlan(ask, controller.signal).then(
    ({ plan, museSource }) => {
      if (inFlight?.id !== id) return;
      inFlight = null;
      const museMsg: ChatMessage = { id: nextId(), role: 'muse', text: plan.summary, source: museSource, plan, ask };
      store = { ...store, messages: [...store.messages, museMsg].slice(-MAX_MESSAGES) };
      save();
      setPlanSuggestions(plan.suggestions);
      setPlanStatus(null);
      museDispatch({ type: 'MUSE_RESPONSE_RECEIVED' });
      emit();
    },
    (err: unknown) => {
      if (inFlight?.id !== id) return; // aborted or superseded: nothing to show
      inFlight = null;
      const message = errorText(err, 'Muse couldn’t answer just now.');
      store = {
        ...store, error: message,
        messages: store.messages.map((m) => (m.id === user.id ? { ...m, failed: true } as ChatMessage : m)),
      };
      save();
      setPlanStatus(null);
      museDispatch({ type: 'MUSE_REQUEST_FAILED' });
      emit();
    },
  );
  return true;
}

/** Retry the last message that failed (the text is kept, never lost). */
export function retryLast(): boolean {
  const failed = [...store.messages].reverse().find((m) => m.role === 'user' && m.failed);
  if (!failed) return false;
  store = { ...store, messages: store.messages.filter((m) => m.id !== failed.id), error: null };
  return sendMessage(failed.text);
}

export function selectPlan(questId: string): void {
  museDispatch({ type: 'PLAN_SELECTED', questId });
  // The map (if it is on screen) opens that quest; otherwise ?quest= does it when the map loads.
  window.dispatchEvent(new CustomEvent('muse:select-quest', { detail: questId }));
}

export function clearChat(): void {
  cancelInFlight();
  store = { ...store, messages: [], error: null };
  save();
  emit();
}

export function useMuseSnapshot(): MuseSnapshot {
  return useSyncExternalStore(subscribe, () => { ensureOwner(); return store.snap; }, () => INITIAL);
}
const EMPTY: ChatMessage[] = [];
export function useChatMessages(): ChatMessage[] {
  return useSyncExternalStore(subscribe, () => { ensureOwner(); return store.messages; }, () => EMPTY);
}
export function useChatError(): string | null {
  return useSyncExternalStore(subscribe, () => store.error, () => null);
}

/** For tests. */
export function resetCompanionForTests(): void {
  clearTimer(); cancelInFlight();
  store = { snap: INITIAL, messages: [], error: null, owner: '' };
}

'use client';
// One Muse companion for the whole Out Here tab: a single state machine (state.ts), one shared
// conversation, and the real planner behind it. A tiny external store, like the plan state next to
// it, so the 3D world, the chat panel and the launcher read the same truth with no provider and no
// remount when the viewer moves between Out Here, Memories and the rest.
import { useSyncExternalStore } from 'react';
import { currentPersona } from '@/features/data';
import { backendTransport } from '@/features/muse-encounters';
import { requestPlan, setPlanOpen, setPlanStatus, setPlanSuggestions, errorText, type PlanResponse } from '@/features/outhere';
import type { AgentEncounter, AgentRecipient, AgentTransport } from './encounter';
import { composeAsk } from './ask';
import { INITIAL, reduce, type MuseEvent, type MuseSnapshot } from './state';

export type ChatSource = 'muse' | 'fallback' | 'mock';
export type ChatMessage =
  | { id: string; role: 'user'; text: string; failed?: boolean; agentRecipient?: AgentRecipient }
  | { id: string; role: 'muse'; text: string; source: ChatSource; plan: PlanResponse | null; /** the text that was sent to the planner */ ask: string };

type Store = { encounter: AgentEncounter | null; snap: MuseSnapshot; messages: ChatMessage[]; error: string | null; owner: string };
export type MuseViewport = {level:'collapsed'|'partial'|'expanded';occlusion:{left:number;top:number;width:number;height:number}|null};
const EMPTY_VIEWPORT:MuseViewport={level:'collapsed',occlusion:null};
let viewport=EMPTY_VIEWPORT;
let photoTarget:{requestId:number;rect:{left:number;top:number;width:number;height:number}}|null=null;
let worldOwners=0;

const KEY = 'outhere.museChat';
const MAX_MESSAGES = 40;
let store: Store = { encounter: null, snap: INITIAL, messages: [], error: null, owner: '' };
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
  clearTimer();setPlanStatus(null);setPlanSuggestions(null);photoTarget=null;
  store = { encounter: null, snap: { ...INITIAL, selectionSeq: store.snap.selectionSeq }, messages: load(owner), error: null, owner };
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

// ---- requests: one at a time; close, clear and persona changes abort and invalidate the answer ----
let inFlight: { id: number; controller: AbortController } | null = null;
let photoAction: { id:number; controller:AbortController } | null = null;
let runId = 0;
function cancelInFlight() {
  if (photoAction) { photoAction.controller.abort(); photoAction=null; photoTarget=null; store={...store,snap:{...store.snap,state:'idle',energy:'fade'}}; }
  inFlight?.controller.abort();
  inFlight = null;
  if (store.encounter) store = { ...store, encounter: worldOwners ? { ...store.encounter, outcome: 'cancelled' } : null };
}

export function openChat(): void {
  const photoCancelled=!!photoAction;
  if (photoAction) { photoAction.controller.abort(); photoAction=null; photoTarget=null; store={...store,snap:{...store.snap,state:'idle',energy:'fade'}}; }
  // One surface at a time: the "I'm free" composer and the chat never stack.
  setPlanOpen(false);
  const before=store.snap;museDispatch({ type: 'CHAT_OPENED' });if(photoCancelled&&before===store.snap)emit();
}

export function closeChat(): void {
  const hadPhoto=!!photoAction;
  cancelInFlight();
  photoTarget=null;
  const before=store.snap;
  museDispatch({ type: 'CHAT_CLOSED' });
  if(hadPhoto&&before===store.snap)emit();
  setPlanStatus(null);
}

export function sendMessage(raw: string): boolean {
  ensureOwner();
  const text = raw.trim();
  if (!text || inFlight || photoAction || (store.encounter&&!store.encounter.outcome) || !store.snap.open) return false;
  if(store.encounter?.outcome)store={...store,encounter:null};
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
      ensureOwner();
      if (inFlight?.id !== id) return;
      inFlight = null;
      const museMsg: ChatMessage = { id: nextId(), role: 'muse', text: plan.summary, source: museSource, plan, ask };
      store = { ...store, messages: [...store.messages, museMsg].slice(-MAX_MESSAGES) };
      save();
      setPlanSuggestions(plan.suggestions);
      setPlanStatus(null);
      museDispatch({ type: 'MUSE_RESPONSE_RECEIVED', live: museSource === 'muse' });
      emit();
    },
    (err: unknown) => {
      ensureOwner();
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
  if (inFlight || !store.snap.open) return false;
  const failed = [...store.messages].reverse().find((m) => m.role === 'user' && m.failed);
  if (!failed || failed.role !== 'user') return false;
  if (store.encounter?.outcome) store = { ...store, encounter:null };
  store = { ...store, messages: store.messages.filter((m) => m.id !== failed.id), error: null };
  return failed.agentRecipient ? sendAgentMessage(failed.text, failed.agentRecipient, backendTransport) : sendMessage(failed.text);
}

export function selectPlan(questId: string): void {
  museDispatch({ type: 'PLAN_SELECTED', questId });
  // The map (if it is on screen) opens that quest; otherwise ?quest= does it when the map loads.
  window.dispatchEvent(new CustomEvent('muse:select-quest', { detail: questId }));
}

export function clearChat(): void {
  cancelInFlight();
  museDispatch({ type: 'MUSE_REQUEST_CANCELLED' });
  setPlanStatus(null);
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
  store = { encounter: null, snap: INITIAL, messages: [], error: null, owner: '' };
  worldOwners=0;viewport=EMPTY_VIEWPORT;photoTarget=null;
}

export const getCompanionForTests = () => store;

/** Real server coordination and the explicitly gated development simulation share this adapter. */
export function sendAgentMessage(raw: string, recipient: AgentRecipient, transport: AgentTransport): boolean {
  ensureOwner();
  const text = raw.trim();
  if (!text || !store.snap.open || inFlight || photoAction || (store.encounter&&!store.encounter.outcome) || !recipient.id) return false;
  if(store.encounter?.outcome)store={...store,encounter:null};
  if (transport.source === 'simulation' && (process.env.NODE_ENV !== 'development' || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('encounterDemo') !== '1')) return false;
  const id = ++runId, controller = new AbortController();
  inFlight = { id, controller };
  const userId = nextId();
  store = { ...store, error: null, messages: [...store.messages, { id: userId, role: 'user' as const, text, agentRecipient: recipient }].slice(-MAX_MESSAGES) };
  museDispatch({ type: 'ACTION_STARTED', state:'sending' }); save(); emit();
  const seen = new Set<string>();
  let mode: 'live' | 'mock' | undefined;
  const onEvent = (event: import('./encounter').AgentEvent) => {
    ensureOwner();
    if (inFlight?.id !== id || event.recipientId !== recipient.id || seen.has(event.id) || seen.size >= 128) return;
    if (event.type === 'accepted') {
      mode = event.mode;
      if (store.encounter) return;
      store = { ...store, encounter: { id, recipient, source: event.mode === 'mock' ? 'simulation' : transport.source, sent:0, received:0, messages:[], outcome:null } };
    } else {
      if (!store.encounter || store.encounter.id !== id) return;
      store = { ...store, encounter: { ...store.encounter,
        sent: store.encounter.sent + (event.type === 'sent' ? 1 : 0),
        received: store.encounter.received + (event.type === 'received' ? 1 : 0), messages: [...store.encounter.messages, event.type] } };
    }
    seen.add(event.id); emit();
  };
  const timeout = setTimeout(() => {
    if (inFlight?.id !== id) return;
    controller.abort(); settle(null, 'The agent request timed out. Try again later.');
  }, 25000);
  controller.signal.addEventListener('abort', () => clearTimeout(timeout), {once:true});
  function settle(result: { text: string; outcome: 'success' | 'unavailable' | 'no_response'; mode?: 'live' | 'mock'; suggestions?: import('@/shared').PlanSuggestion[] } | null, error?: string) {
    clearTimeout(timeout); ensureOwner();
    if (inFlight?.id !== id) return;
    inFlight = null;
    const source: ChatSource = transport.source === 'simulation' || (result?.mode ?? mode) === 'mock' ? 'mock' : 'muse';
    const plan: PlanResponse | null = result?.suggestions?.length ? {
      summary: result.text, suggestions: result.suggestions,
      intent: { activities: [], budgetMax:null, windowStart:result.suggestions[0].startsAt, windowEnd:result.suggestions[0].startsAt,
        maxWalkMinutes:null, wantsFriends:true, openToNewPeople:false, vibe:null },
      meta: { mode: source === 'mock' ? 'mock' : 'live', source, contextSource:'store', dropped:[], coordination:true },
    } : null;
    store = { ...store,
      encounter: worldOwners&&store.encounter ? { ...store.encounter, outcome: result?.outcome ?? 'error' } : null,
      error: error ?? null,
      snap: { ...store.snap, energy:'fade', state: error ? 'error' : 'responding' },
      messages: result ? [...store.messages, { id:nextId(), role:'muse' as const, text:result.text, source, plan, ask:text }].slice(-MAX_MESSAGES)
        : store.messages.map(m => m.id === userId && m.role === 'user' ? { ...m, failed:true } : m),
    };
    save(); emit();
    if (!error) arm({ type:'RESPONSE_SETTLED' }, SETTLE_MS);
  }
  Promise.resolve().then(() => {
    if (controller.signal.aborted) throw new DOMException('Cancelled','AbortError');
    return transport.run(text, recipient.id, controller.signal, onEvent);
  }).then(result => settle(result), () => settle(null, 'The agent request could not complete.'));
  return true;
}

export function finishAgentEncounter(id: number): void {
  if (store.encounter?.id !== id) return;
  // Skipping a visual encounter must not throw away its pending backend result.
  // Closing/navigating uses closeChat(), which still cancels the request explicitly.
  store = { ...store, encounter:null }; emit();
}
export function useAgentEncounter(): AgentEncounter | null {
  return useSyncExternalStore(subscribe, () => { ensureOwner(); return store.encounter; }, () => null);
}

export function reportAgentRecipientError(): void { store={...store,error:"Name exactly one friend from your friend list."}; emit(); }

/** Photo request lease in the existing controller; no second character state machine. */
export function beginPhotoAnalysis(controller:AbortController):number|null {
  ensureOwner();
  if(photoAction?.controller.signal.aborted)endPhotoAnalysis(photoAction.id,'cancelled');
  if(controller.signal.aborted)return null;
  if (inFlight || photoAction || store.encounter || ['sending','receiving','thinking','evaluating'].includes(store.snap.state)) return null;
  clearTimer();
  const id=++runId; photoAction={id,controller};
  store={...store,snap:{...store.snap,state:'evaluating',energy:'pending'}}; emit(); return id;
}
export function endPhotoAnalysis(id:number, outcome:'live'|'mock'|'error'|'cancelled'):void {
  ensureOwner();
  if(photoAction?.id!==id)return;
  photoAction=null;
  photoTarget=null;
  store={...store,snap:{...store.snap,state:outcome==='live'?'celebrating':'idle',energy:outcome==='live'?'success':'fade'}};
  emit();
  if(outcome==='live')arm({type:'ACTION_ENDED'},600);
}

/** Presentation ownership never owns or cancels an API request. */
export function attachMuseWorld():()=>void {
  worldOwners++;let attached=true;
  return()=>{if(!attached)return;attached=false;worldOwners=Math.max(0,worldOwners-1);if(!worldOwners&&store.encounter){store={...store,encounter:null};emit();}};
}
/** Dashboard collapse hides the conversation while preserving pending backend work. */
export function minimizeChat():void {store={...store,snap:{...store.snap,open:false}};emit();}
export function setMuseViewport(next:MuseViewport):void {if(JSON.stringify(viewport)===JSON.stringify(next))return;viewport=next;emit();}
export function useMuseViewport():MuseViewport {return useSyncExternalStore(subscribe,()=>viewport,()=>EMPTY_VIEWPORT);}
export function setPhotoAnalysisTarget(id:number,rect:{left:number;top:number;width:number;height:number}|null):void {
  if(photoAction?.id!==id)return;
  photoTarget=rect?{requestId:id,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}:null;
}
export function photoTargetForRender(){return photoTarget;}

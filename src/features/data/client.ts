'use client';
// Browser identity: the persona is per tab. `?as=<handle>` on load is stored in sessionStorage
// ("outhere.persona"); apiFetch sends it as the x-persona header. No cookies.
import { DEFAULT_PERSONA, isPersonaHandle } from './personas';

export const PERSONA_STORAGE_KEY = 'outhere.persona';
export const PERSONA_EVENT = 'outhere:persona';

function safeGet(): string | null {
  try { return window.sessionStorage.getItem(PERSONA_STORAGE_KEY); } catch { return null; }
}
function safeSet(handle: string) {
  try { window.sessionStorage.setItem(PERSONA_STORAGE_KEY, handle); } catch { /* private mode */ }
}

let memoryPersona: string | null = null;

/** Reads ?as= once per page load and stores it for this tab. */
export function initPersonaFromUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_PERSONA;
  const as = new URLSearchParams(window.location.search).get('as')?.toLowerCase();
  if (isPersonaHandle(as)) { safeSet(as); memoryPersona = as; }
  return currentPersona();
}

/** The active persona handle for this tab (default "alex"). */
export function currentPersona(): string {
  if (typeof window === 'undefined') return DEFAULT_PERSONA;
  const stored = safeGet() ?? memoryPersona;
  return stored && isPersonaHandle(stored) ? stored : DEFAULT_PERSONA;
}

/** Switches this tab to another persona, keeps ?as= in the URL in sync, and tells hooks. */
export function setPersona(handle: string): void {
  if (!isPersonaHandle(handle) || typeof window === 'undefined') return;
  safeSet(handle);
  memoryPersona = handle;
  const url = new URL(window.location.href);
  url.searchParams.set('as', handle);
  window.history.replaceState(window.history.state, '', url.toString());
  window.dispatchEvent(new CustomEvent(PERSONA_EVENT, { detail: handle }));
}

let initialized = false;

/** fetch() for /api routes with the persona header. Throws ApiFetchError on non-2xx with the JSON `error`. */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  if (!initialized) { initPersonaFromUrl(); initialized = true; }
  const headers = new Headers(init.headers);
  headers.set('x-persona', currentPersona());
  if (init.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') ? data.error : `HTTP ${res.status}`;
    throw new ApiFetchError(res.status, msg);
  }
  return data as T;
}

export class ApiFetchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

/** JSON body helper: apiPost('/api/x', { a: 1 }). */
export function apiPost<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  return apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

'use client';
import { currentPersona } from '@/features/data';
import { EventZ, type EncounterResult } from './protocol';
import type { AgentTransport } from '@/features/muse-companion';

/** Fetch streaming keeps persona headers and request cancellation; no EventSource query identity.
 * Stable message IDs are deduplicated by the Phase 4 controller, including GET replay. */
export const backendTransport: AgentTransport = {
  source: 'backend',
  async run(text, recipientId, signal, emit) {
    const headers = { 'content-type': 'application/json', 'x-persona': currentPersona() };
    let sessionId: string | null = null;
    const cancel = () => {
      if (sessionId) void fetch(`/api/muse/encounters/${sessionId}`, { method: 'DELETE', headers, keepalive: true }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    let result: EncounterResult | null = null;
    const receive = (event: string, data: unknown) => {
      if (!data || typeof data !== 'object') throw new Error('Invalid encounter event');
      const value = data as Record<string, unknown>;
      if (event === 'session' && typeof value.id === 'string') { sessionId = value.id; if (signal.aborted) cancel(); }
      if (event === 'message') emit(EventZ.parse(data));
      if (event === 'result') {
        if (value.status !== 'completed' || !value.result) throw new Error('The coordination request could not complete.');
        result = value.result as EncounterResult;
      }
    };
    try {
      const response = await fetch('/api/muse/encounters', { method: 'POST', headers, signal,
        body: JSON.stringify({ requestKey: crypto.randomUUID(), recipientId, text }) });
      if (!response.ok || !response.body) throw new Error('Could not start coordination.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const lines = chunk.split('\n');
            const event = lines.find(l => l.startsWith('event: '))?.slice(7);
            const data = lines.filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
            if (event && data) receive(event, JSON.parse(data));
          }
          if (done) break;
        }
        if (!result) throw new Error('Incomplete encounter stream.');
      } catch (err) {
        if (signal.aborted || !sessionId) throw err;
        // Bounded reconnect to the ledger; never re-run a model call.
        const deadline = Date.now() + 24000;
        for (;;) {
          signal.throwIfAborted();
          const replay = await fetch(`/api/muse/encounters/${sessionId}`, { headers, signal });
          if (!replay.ok) throw err;
          const state = await replay.json();
          for (const e of state.events ?? []) receive('message', e);
          if (state.status !== 'pending') { receive('result', state); break; }
          if (Date.now() >= deadline) throw err;
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
            const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 500);
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          });
        }
      } finally { reader.releaseLock(); }
      signal.throwIfAborted();
      if (!result) throw new Error('Incomplete encounter stream.');
      return result;
    } finally { signal.removeEventListener('abort', cancel); }
  },
};

/** Conservative routing: ordinary planning stays on the planner. Identity resolution is
 * constrained to the current friend list; the server independently checks friendship. */
export function isCoordinationAsk(text: string) {
  return /\b(free|available|availability|coordinate|check with|wants? to|can .*join)\b/i.test(text);
}

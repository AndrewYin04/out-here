/** Transport facts only. Rendering cannot manufacture a message or a recipient reply. */
export type AgentRecipient = { id: string; name: string };
export type AgentEvent = { id: string; type: 'accepted' | 'sent' | 'received'; recipientId: string; mode?: 'live' | 'mock' };
export type AgentOutcome = 'success' | 'unavailable' | 'no_response' | 'error' | 'cancelled';
export type AgentEncounter = {
  id: number; recipient: AgentRecipient; source: 'backend' | 'simulation';
  sent: number; received: number; messages: ('sent' | 'received')[]; outcome: AgentOutcome | null;
};
export type AgentTransport = {
  source: 'backend' | 'simulation';
  /** Server must authorize the recipient before emitting accepted. Emit only actual messages.
   * The result is user-visible safe text, never hidden reasoning or private calendar data. */
  run(text: string, recipientId: string, signal: AbortSignal, emit: (event: AgentEvent) => void): Promise<{ text: string; outcome: Exclude<AgentOutcome, 'error' | 'cancelled'>; mode?: 'live' | 'mock'; suggestions?: import('@/shared').PlanSuggestion[] }>;
};

/** Explicit development simulation. No model call, message, invite, or availability check. */
export const simulationTransport: AgentTransport = {
  source: 'simulation',
  async run(_text, recipientId, signal, emit) {
    const pause = (ms: number) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
      const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once:true });
    });
    emit({ id:'accepted', type:'accepted', recipientId });
    await pause(1800); emit({ id:'message-1', type:'sent', recipientId });
    await pause(800); emit({ id:'message-2', type:'received', recipientId });
    await pause(700);
    return { text:'Demo exchange complete. No message was sent and availability was not checked. Use the existing plan and invitation controls to arrange a hangout.', outcome:'success' };
  },
};

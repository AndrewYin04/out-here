import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/features/data', () => ({ currentPersona: () => 'alex' }));
vi.mock('@/features/outhere', () => ({ requestPlan: request, setPlanOpen: vi.fn(), setPlanStatus: vi.fn(), setPlanSuggestions: vi.fn(), errorText: () => 'Could not answer' }));
import { openChat, closeChat, clearChat, sendMessage, getCompanionForTests, resetCompanionForTests } from './controller';
const reply = { plan: { summary: 'A plan', suggestions: [] }, museSource: 'muse' };
function deferred() {
  let resolve!: (v: typeof reply) => void, reject!: (e: Error) => void;
  const promise = new Promise<typeof reply>((a,b) => { resolve=a; reject=b; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.useFakeTimers(); resetCompanionForTests(); request.mockReset(); });
afterEach(() => { resetCompanionForTests(); vi.useRealTimers(); });
describe('request-bound processing energy', () => {
  it('navigation/open/input alone never starts energy, and long requests have no fake timeout', async () => {
    expect(sendMessage('closed')).toBe(false);
    openChat(); expect(getCompanionForTests().snap.energy).toBe('off');
    const d=deferred(); request.mockReturnValue(d.promise); sendMessage('dumplings');
    vi.advanceTimersByTime(60000); expect(getCompanionForTests().snap.energy).toBe('pending');
    expect(sendMessage('double tap')).toBe(false);
    d.resolve(reply); await Promise.resolve(); expect(getCompanionForTests().snap.energy).toBe('success');
  });
  it('close aborts and stale responses cannot celebrate or interrupt a newer request', async () => {
    openChat(); const old=deferred(); request.mockReturnValueOnce(old.promise); sendMessage('old');
    const signal=request.mock.calls[0][1] as AbortSignal;
    closeChat(); expect(signal.aborted).toBe(true); expect(getCompanionForTests().snap.energy).toBe('fade');
    openChat(); const next=deferred(); request.mockReturnValueOnce(next.promise); sendMessage('new');
    old.resolve(reply); await Promise.resolve(); expect(getCompanionForTests().snap.energy).toBe('pending');
    expect(getCompanionForTests().messages.filter(m=>m.role==='muse')).toHaveLength(0);
    next.reject(new Error('network')); await Promise.resolve();
    expect(getCompanionForTests().snap).toMatchObject({ state:'error',energy:'fade' });
  });
  it('clearing cancels and restores idle; mock or fallback results do not celebrate', async () => {
    openChat(); request.mockReturnValueOnce(deferred().promise); sendMessage('one'); clearChat();
    expect(getCompanionForTests().snap).toMatchObject({ state:'idle', energy:'fade' });
    request.mockResolvedValueOnce({ ...reply, museSource:'mock' }); sendMessage('two'); await Promise.resolve();
    expect(getCompanionForTests().snap.energy).toBe('fade');
  });
});

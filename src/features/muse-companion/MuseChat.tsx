'use client';
// The Muse chat: a compact panel anchored to the companion (bottom right on desktop, a sheet on
// mobile), plus the small "Ask Muse" launcher. It is not Messenger: one conversation with Muse,
// grounded in the real planner, with the real plan cards in it. Mounted once in the shell so the
// conversation, the open state and Jolly's pose survive moving between Out Here sections.
import { Send, X, RotateCcw, MapPin } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApi, useViewer } from '@/features/data';
import { MuseLabel, OfflineLabel, SuggestionCard, setPlanOpen, usePlanOpen } from '@/features/outhere';
import { cn } from '@/features/ui';
import type { PersonCard } from '@/shared';
import {
  closeChat, museDispatch, openChat, retryLast, selectPlan, sendMessage,
  reportAgentRecipientError, sendAgentMessage, useAgentEncounter, useChatError, useChatMessages, useMuseSnapshot, type ChatMessage,
} from './controller';
import { simulationTransport } from './encounter';
import { backendTransport, isCoordinationAsk } from '@/features/muse-encounters';
import { MuseOrb, MuseStyles } from './MuseOrb';

const firstName = (n: string) => n.split(' ')[0] ?? n;

/** Out Here and Memories are where the companion lives. */
const SHOWN_ON = /^\/(out-here|memories)(\/|$)/;

const STATE_LABEL: Record<string, string> = {
  approaching: 'Muse is coming over', listening: 'Muse is listening', thinking: 'Muse is thinking',
  responding: 'Muse replied', returning: 'Muse is heading back', error: 'Muse hit a problem',
  sending: 'Checking with your friend', receiving: 'Reading the reply',
};

/** Keep the panel above the on-screen keyboard (mobile): the visual viewport shrinks, the layout one does not. */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) { setInset(0); return; }
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); setInset(0); };
  }, [active]);
  return inset;
}

function Bubble({ m, friends, onView, reveal }: { reveal: boolean; m: ChatMessage; friends: Map<string, PersonCard>; onView: (questId: string) => void }) {
  if (m.role === 'user') {
    return (
      <div className="muse-msg flex justify-end">
        <p
          data-testid="muse-msg-user"
          className={cn('max-w-[85%] rounded-[18px] rounded-br-md bg-fb-blue px-3 py-2 text-[15px] leading-[20px] text-white', m.failed && 'opacity-70')}
        >
          {m.text}
        </p>
      </div>
    );
  }
  const suggestions = m.plan?.suggestions ?? [];
  return (
    <div className={cn("flex flex-col items-start gap-2", reveal && "muse-result-reveal")} data-testid="muse-msg-muse" data-source={m.source} data-muse-response={m.id}>
      <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-fb-secondary-btn px-3 py-2 text-[15px] leading-[20px] text-fb-text">
        {m.source === 'muse' && <MuseLabel className="mb-1" />}
        {m.source === 'mock' && <OfflineLabel className="mb-1" />}
        {m.source === 'fallback' && <span className="mb-1 block text-[12px] font-semibold text-fb-text-2">Quick match (Muse was busy)</span>}
        <p>{m.text || (suggestions.length ? 'Here’s what fits.' : 'Nothing fits that right now. Try a wider window or a higher budget.')}</p>
      </div>
      {suggestions.slice(0, 3).map((s, i) => (
        <div key={`${m.id}:${s.questId ?? s.title}:${i}`} className="w-full overflow-hidden rounded-card border border-fb-divider bg-fb-surface" data-testid="muse-chat-plan">
          <SuggestionCard s={s} friends={friends} showMuse={false} approvalRequired={m.plan?.meta.coordination} />
          {s.questId && (
            <button
              type="button"
              data-testid="muse-view-on-map"
              onClick={() => onView(s.questId!)}
              className="oh-press flex h-10 w-full items-center justify-center gap-1.5 border-t border-fb-divider text-[14px] font-semibold text-fb-blue hover:bg-fb-hover"
            >
              <MapPin className="size-4" aria-hidden /> View on map
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function MuseChat() {
  const snap = useMuseSnapshot();
  const messages = useChatMessages();
  const error = useChatError();
  const { viewer } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const planOpen = usePlanOpen();
  const friendsApi = useApi<{ friends: PersonCard[] }>(snap.open ? '/api/friends' : null);
  const friends = useMemo(() => new Map((friendsApi.data?.friends ?? []).map((f) => [f.id, f])), [friendsApi.data]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const kb = useKeyboardInset(snap.open);
  const encounter = useAgentEncounter();
  const demo = process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('encounterDemo') === '1';
  const thinking = (!!encounter && !encounter.outcome) || snap.state === 'thinking' || snap.state === 'sending' || snap.state === 'receiving' || snap.state==='evaluating';
  const busy = thinking;

  // The panel is for these pages only; leaving them puts Jolly back (the conversation stays).
  const here = SHOWN_ON.test(pathname ?? '');
  // Any navigation or unmount cancels the request, including moves between supported pages.
  useEffect(() => () => closeChat(), [pathname]);
  useEffect(() => { if (!here && snap.open) closeChat(); }, [here, snap.open]);

  // The "I'm free" composer and the chat never show together: if the composer opens, Muse steps back.
  useEffect(() => { if (planOpen && snap.open) closeChat(); }, [planOpen, snap.open]);

  // Escape minimises.
  useEffect(() => {
    if (!snap.open) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChat(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [snap.open]);

  // Focus the input once the chat is open (after the approach), and keep the newest message in view.
  useEffect(() => { if (snap.open && snap.state !== 'approaching') inputRef.current?.focus({ preventScroll: true }); }, [snap.open, snap.state === 'approaching']); // eslint-disable-line react-hooks/exhaustive-deps
  // A new reply scrolls to its first line (the summary), not past it to the last card.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const all = el.querySelectorAll<HTMLElement>('[data-msg]');
    const last = all[all.length - 1];
    if (last && messages.at(-1)?.role === 'muse' && !thinking) el.scrollTop = Math.max(0, last.offsetTop - 8);
    else el.scrollTop = el.scrollHeight;
  }, [messages, thinking, snap.open]);
  // Hand focus back to the launcher after closing, so keyboard users are not dropped.
  const wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !snap.open) launcherRef.current?.focus({ preventScroll: true }); wasOpen.current = snap.open; }, [snap.open]);

  const submit = useCallback((text: string) => {
    const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
    const matches = [...friends.values()].filter(f => words.has(firstName(f.name).toLowerCase()));
    if (demo || (isCoordinationAsk(text) && matches.length > 0)) {
      if (matches.length !== 1) { reportAgentRecipientError(); return; }
      if (sendAgentMessage(text, {id:matches[0].id, name:matches[0].name}, demo ? simulationTransport : backendTransport)) setDraft('');
    } else if (sendMessage(text)) setDraft('');
  }, [demo, friends]);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(draft); };

  const onView = useCallback((questId: string) => {
    selectPlan(questId);
    if (!pathname?.startsWith('/out-here')) router.push(`/out-here?quest=${encodeURIComponent(questId)}`);
    closeChat();
  }, [pathname, router]);

  if (!here) return <MuseStyles />;

  const hasMessages = messages.length > 0;
  const chips = [
    { label: 'I’m free', run: () => { closeChat(); setPlanOpen(true); } },
    { label: 'Find something nearby', run: () => submit('Something fun nearby right now') },
    { label: 'What should I do?', run: () => submit('What should I do? I’m free for an hour') },
    { label: 'Invite a friend', run: () => submit('Something to do with a friend') },
  ];

  return (
    <>
      <MuseStyles />
      {!snap.open && !planOpen && (
        <button
          ref={launcherRef}
          type="button"
          data-testid="muse-launcher"
          aria-label="Ask Muse"
          onClick={openChat}
          className="oh-press fixed right-3 z-30 flex h-11 items-center gap-2 rounded-pill bg-fb-surface py-1 pl-1.5 pr-4 text-[15px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover bottom-[136px] max-md:bottom-auto max-md:top-[208px] max-md:size-12 max-md:justify-center max-md:p-0"
        >
          <MuseOrb state={snap.state} size={32} />
          {/* Phones: just the orb, up by the map chips, so it never covers a sheet's buttons. */}
          <span className="max-md:sr-only">Ask Muse</span>
        </button>
      )}

      {snap.open && (
        <section
          role="dialog"
          aria-label="Muse chat"
          data-testid="muse-chat"
          data-state={snap.state}
          style={kb > 0 ? { bottom: kb } : undefined}
          className={cn(
            'muse-panel fixed z-40 flex flex-col overflow-hidden bg-fb-surface shadow-popover',
            // desktop: a compact card anchored bottom right, the map stays the focus
            'md:bottom-4 md:right-4 md:w-[380px] md:max-h-[min(580px,calc(100dvh-96px))] md:rounded-card',
            // mobile: a bottom sheet that stops short of the top bar
            'max-md:inset-x-0 max-md:bottom-14 max-md:max-h-[min(52dvh,calc(100dvh-176px))] max-md:rounded-t-[16px]',
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-fb-divider px-3 py-2">
            <MuseOrb state={snap.state} size={36} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold leading-5 text-fb-text">Muse <span aria-hidden>✨</span></h2>
              <p className="truncate text-[12px] leading-4 text-fb-text-2" data-testid="muse-state-label">{demo ? 'Simulation only · illustrative positions · no messages sent' : encounter?.source === 'simulation' ? 'Simulated coordination · offline' : STATE_LABEL[snap.state] ?? 'Ready when you are'}</p>
            </div>
            <button
              type="button"
              aria-label="Close Muse chat"
              data-testid="muse-close"
              onClick={closeChat}
              className="grid size-9 place-items-center rounded-full text-fb-text-2 hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation with Muse" className="relative min-h-[120px] flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
            {!hasMessages && (
              <div className="flex" data-testid="muse-greeting">
                <p className="max-w-[92%] rounded-[18px] rounded-bl-md bg-fb-secondary-btn px-3 py-2 text-[15px] leading-[20px] text-fb-text">
                  Hey {firstName(viewer.name)}! Need help finding something to do?
                </p>
              </div>
            )}
            {messages.map((m) => <div key={m.id} data-msg>{<Bubble m={m} friends={friends} onView={onView} reveal={snap.state === 'responding' && m === messages.at(-1) && m.role === 'muse' && m.source === 'muse'} />}</div>)}
            {thinking && (
              <div className="muse-msg flex items-center gap-2 text-[14px] text-fb-text-2" data-testid="muse-thinking" role="status">
                <span>{demo ? "Simulated exchange; no friend was contacted." : "Checking who’s free and what fits…"}</span>
              </div>
            )}
            {error && !thinking && (
              <div role="alert" data-testid="muse-error" className="flex items-center gap-2 rounded-card bg-[#FDE8EA] px-3 py-2 text-[14px] text-fb-red">
                <span className="flex-1">{error}</span>
                {messages.some(m => m.role === 'user' && m.failed) && <button type="button" onClick={retryLast} className="inline-flex items-center gap-1 rounded-btn px-2 py-1 font-semibold hover:bg-white/60">
                  <RotateCcw className="size-4" aria-hidden /> Retry
                </button>}
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label="Suggestions">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={c.run}
                className="oh-press h-8 shrink-0 whitespace-nowrap rounded-pill bg-fb-blue-tint px-3 text-[13px] font-semibold text-fb-blue hover:brightness-95 disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 border-t border-fb-divider px-3 py-2">
            <input
              ref={inputRef}
              value={draft}
              data-testid="muse-input"
              aria-label="Message Muse"
              maxLength={280}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={demo ? "Demo: ask about one named friend" : "Ask Muse anything…"}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => museDispatch({ type: 'USER_INPUT_STARTED' })}
              onBlur={() => museDispatch({ type: 'USER_INPUT_ENDED' })}
              className="h-10 min-w-0 flex-1 rounded-pill bg-fb-secondary-btn px-4 text-[16px] text-fb-text outline-none placeholder:text-fb-text-2 focus:ring-2 focus:ring-fb-blue"
            />
            <button
              type="submit"
              aria-label="Send"
              data-testid="muse-send"
              disabled={!draft.trim() || busy}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-fb-blue text-white transition-opacity hover:bg-fb-blue-hover disabled:opacity-40"
            >
              <Send className="size-5" aria-hidden />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

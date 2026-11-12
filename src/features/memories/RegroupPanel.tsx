'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { RotateCw, Sparkles } from 'lucide-react';
import { Button } from '@/features/ui';
import type { RegroupState } from './useRegroup';

export type RegroupPanelProps = {
  state: RegroupState;
  /** The idle button label ("Get this group together again" on the library, "Do it again" in a memory). */
  label: string;
  /** Second line under the idle label, e.g. "Plan another hangout with Alex and Maya". */
  sublabel?: string;
  /**
   * Reserved spot for the Muse companion (Jolly) beside Muse's reply. Empty until an approved
   * asset is wired in; nothing is drawn in its place.
   */
  companion?: ReactNode;
};

/** The Muse regroup action and its result (suggestion, reason, drafted message, Send to crew). */
export function RegroupPanel({ state, label, sublabel, companion }: RegroupPanelProps) {
  const { busy, result, failed, send, regroup, sendToCrew } = state;
  return (
    <div>
      <Button
        block
        onClick={regroup}
        disabled={busy}
        aria-busy={busy}
        icon={result || failed ? <RotateCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
      >
        {busy ? 'Muse is checking who’s free…' : result || failed ? 'Ask Muse again' : label}
      </Button>
      {sublabel && !busy && !result && !failed && (
        <p className="mt-1 text-center text-[13px] text-fb-text-2">{sublabel}</p>
      )}

      {failed && <p className="mt-3 text-[15px] text-fb-text-2" role="status">{failed}</p>}

      {result && (
        <div className="mt-3 flex items-start gap-2" data-testid="regroup-suggestion">
          {companion && <div className="shrink-0" data-slot="muse-companion">{companion}</div>}
          <div className="min-w-0 flex-1 rounded-card border border-fb-divider bg-fb-bg p-3">
            <p className="text-[12px] font-semibold text-fb-blue">
              ✨ Muse{result.mock && <span className="ml-1 font-normal text-fb-text-2">(offline)</span>}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-fb-text">{result.suggestion.title}</p>
            <p className="text-[13px] text-fb-text-2">{result.suggestion.whenText}</p>
            <p className="mt-2 text-[15px] text-fb-text">{result.suggestion.reason}</p>
            <p className="mt-2 rounded-card bg-white p-2 text-[15px] text-fb-text">{result.message}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={sendToCrew} disabled={send.kind === 'sending' || send.kind === 'sent'}>
                {send.kind === 'sending' ? 'Sending…' : send.kind === 'sent' ? 'Sent' : 'Send to crew'}
              </Button>
              {result.suggestion.questId && (
                <Link href={`/out-here?quest=${result.suggestion.questId}`} className="text-[15px] font-semibold text-fb-blue hover:underline">
                  View plan
                </Link>
              )}
            </div>
            {send.kind === 'sent' && (
              <p className="mt-2 text-[13px] text-fb-text-2" role="status">
                {send.text} <Link href={send.href} className="font-semibold text-fb-blue hover:underline">Open Messenger</Link>
              </p>
            )}
            {send.kind === 'error' && <p className="mt-2 text-[13px] text-fb-text-2" role="status">{send.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

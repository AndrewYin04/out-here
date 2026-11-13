'use client';

// Presenter controls for the hackathon demo. Shown only when the SERVER says demo controls are
// enabled for this viewer (state.demo); every action is checked again on the server, so hiding the
// panel is not the protection. Touches only today's Side Quest records.
import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { SideQuestDemoBody, SideQuestState } from '@/shared/api';
import { DEMO_DEADLINES_SEC } from '@/shared';
import { apiPost } from '@/features/data';
import { Button, Card, useToast } from '@/features/ui';

const label = (s: number) => (s < 120 ? '1 minute' : `${s / 60} minutes`);

export function DemoControls({ onState }: { onState: (s: SideQuestState) => void }) {
  const toast = useToast();
  const [seconds, setSeconds] = useState<number>(120);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, body: SideQuestDemoBody, done: string) => {
    setBusy(name);
    try {
      onState(await apiPost<SideQuestState>('/api/daily/side-quest/demo', body));
      toast.show(done);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Demo action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card padded data-testid="sq-demo" aria-label="Demo controls">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-fb-text-2"><FlaskConical size={14} aria-hidden /> Demo controls</p>
      <p className="mt-1 text-[13px] text-fb-text-2">For the presentation only. Switch persona from the avatar menu, or open this page with ?as=maya.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[13px] text-fb-text-2">
          Deadline
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="rounded-btn border border-fb-divider bg-fb-surface px-2 py-1.5 text-[15px] text-fb-text" data-testid="sq-demo-seconds">
            {DEMO_DEADLINES_SEC.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <Button onClick={() => run('trigger', { action: 'trigger', deadlineSeconds: seconds }, 'Side Quest dropped')} disabled={!!busy} data-testid="sq-demo-trigger">Trigger Side Quest drop</Button>
        <Button variant="secondary" onClick={() => run('deadline', { action: 'deadline', deadlineSeconds: seconds }, 'Deadline set')} disabled={!!busy} data-testid="sq-demo-deadline">Set deadline</Button>
        <Button variant="secondary" onClick={() => run('seed', { action: 'seed' }, 'Community entries added')} disabled={!!busy} data-testid="sq-demo-seed">Seed community entries</Button>
        <Button variant="ghost" onClick={() => run('reset', { action: 'reset' }, 'Side Quest reset')} disabled={!!busy} data-testid="sq-demo-reset">Reset</Button>
      </div>
    </Card>
  );
}

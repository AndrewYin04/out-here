'use client';

// Quiet hours: the window the daily drop may land in (default 10 AM to 8 PM). Outside it nothing
// is scheduled. Changes apply from the next day that has no drop yet; today's persisted drop never moves.
import { useEffect, useState } from 'react';
import { formatMinutesOfDay, MIN_WINDOW_MIN } from '@/shared';
import type { SideQuestPrefs } from '@/shared/api';
import { apiPost } from '@/features/data';
import { Button, Card, useToast } from '@/features/ui';

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60);

export function PrefsCard({ prefs, onSaved }: { prefs: SideQuestPrefs; onSaved: () => void }) {
  const toast = useToast();
  const [start, setStart] = useState(prefs.startMin);
  const [end, setEnd] = useState(prefs.endMin);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStart(prefs.startMin); setEnd(prefs.endMin); }, [prefs.startMin, prefs.endMin]);

  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || prefs.tz : prefs.tz;
  const valid = end - start >= MIN_WINDOW_MIN;
  const dirty = start !== prefs.startMin || end !== prefs.endMin;

  const save = async () => {
    setBusy(true);
    try {
      await apiPost('/api/daily/side-quest/prefs', { startMin: start, endMin: end, tz: prefs.tz }, 'PUT');
      toast.show('Saved. This applies from the next Side Quest that hasn’t dropped yet.');
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Couldn’t save');
    } finally { setBusy(false); }
  };

  return (
    <Card padded data-testid="sq-prefs">
      <h2 className="text-[17px] font-semibold text-fb-text">Quiet hours</h2>
      <p className="mt-0.5 text-[13px] text-fb-text-2">Your Side Quest only drops between these times ({prefs.tz === tz ? prefs.tz : `${prefs.tz}`}).</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-fb-text-2">From
          <select value={start} onChange={(e) => setStart(Number(e.target.value))} className="mt-1 block rounded-btn border border-fb-divider bg-fb-surface px-2 py-1.5 text-[15px] text-fb-text" data-testid="sq-prefs-start">
            {HOURS.slice(0, 24).map((m) => <option key={m} value={m}>{formatMinutesOfDay(m)}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-fb-text-2">To
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))} className="mt-1 block rounded-btn border border-fb-divider bg-fb-surface px-2 py-1.5 text-[15px] text-fb-text" data-testid="sq-prefs-end">
            {HOURS.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? '12 AM (midnight)' : formatMinutesOfDay(m)}</option>)}
          </select>
        </label>
        <Button variant="secondary" onClick={save} disabled={busy || !valid || !dirty} data-testid="sq-prefs-save">Save</Button>
      </div>
      {!valid && <p className="mt-2 text-[13px] text-fb-red" role="alert">Choose a window of at least 2 hours.</p>}
    </Card>
  );
}

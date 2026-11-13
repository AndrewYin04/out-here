'use client';
// /intros: "Intros from Muse" inbox, "Ask Muse for an intro", and Intro settings.
// Muse Intros are Boardy-style warm intros vetted by two agents ("Click"); see
// src/features/intros/server for the rules. Everything here reads and writes through /api/intros.
import { MapPin, RotateCcw, Settings, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDemoTime, INTRO_KINDS, type IntroKind, type IntroProfile } from '@/shared';
import type { IntroCardData, IntroChoice, IntroPlanAction } from './types';
import { apiPost, useApi, useViewer, type QuestDetail } from '@/features/data';
import { Avatar, Button, Card, IconButton, Sheet, Skeleton, cn } from '@/features/ui';
import { IntroCard, KIND_LABELS, MuseTag } from './IntroCard';

type RoundResult = {
  intro: IntroCardData | null; choices?: IntroChoice[];
  considered: number; belowBar: number; capped: boolean; paused: boolean; message: string; none?: true;
};

const PLACEHOLDERS: Record<IntroKind, string> = {
  friendship: 'e.g. a climbing partner, people to go to shows with',
  networking: 'e.g. PM coffee chats, design feedback',
  dating: 'e.g. someone to try new restaurants with',
};

function KindPicker({ value, onChange, name }: { value: IntroKind; onChange: (k: IntroKind) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {INTRO_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cn('h-9 rounded-pill px-3 text-[15px] font-semibold',
            value === k ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover')}>
          {KIND_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

/** The plan an intro request is for, from /intros?quest=<id> ("Find someone to go with" on a plan). */
type PlanFor = { id: string; label: string; when: string };

/**
 * Scene 5: Muse found 2 or 3 people for the plan. Each row is the person, the trust path and the
 * one-line why; picking one is your yes, so only that person is asked.
 */
function Choices({ choices, onPicked }: { choices: IntroChoice[]; onPicked: (pickedId: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (c: IntroChoice) => {
    setBusy(c.introId); setError(null);
    try {
      await apiPost(`/api/intros/${encodeURIComponent(c.introId)}/pick`, { drop: choices.filter((x) => x.introId !== c.introId).map((x) => x.introId) });
      onPicked(c.introId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Muse could not ask them.');
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2" data-testid="intro-choices">
      <ul className="space-y-1.5">
        {choices.map((c) => (
          <li key={c.introId} className="flex items-center gap-3 rounded-btn bg-fb-input px-3 py-2" data-testid="intro-choice" data-handle={c.other.handle}>
            <Avatar src={c.other.avatarUrl} name={c.other.firstName} size={40} decorative />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-fb-text">{c.other.firstName}</p>
              {c.trustPath && <p className="text-[13px] text-fb-text-2">{c.trustPath}</p>}
              <p className="text-[14px] text-fb-text">{c.why}</p>
            </div>
            <Button size="sm" onClick={() => void pick(c)} disabled={!!busy} data-testid="pick-choice">
              {busy === c.introId ? 'Asking…' : 'Go with them'}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-fb-text-2">Only the person you pick is asked. The others never hear about it.</p>
      {error && <p className="text-[13px] text-fb-red" role="alert">{error}</p>}
    </div>
  );
}

function AskMuse({ onResult, plan, onClearPlan }: { onResult: (r: RoundResult | null) => void; plan: PlanFor | null; onClearPlan: () => void }) {
  const [kind, setKind] = useState<IntroKind>('friendship');
  const [lookingFor, setLookingFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choices, setChoices] = useState<IntroChoice[] | null>(null);
  const ask = async () => {
    setBusy(true); setAnswer(null); setChoices(null);
    try {
      // For a plan, Muse tries every kind you have on and keeps the best match.
      const r = await apiPost<RoundResult>('/api/intros/request', plan ? { lookingFor, questId: plan.id } : { kind, lookingFor });
      setAnswer(r.intro ? `Muse found someone: meet ${r.intro.other.firstName}. Their card is below.` : r.message);
      setChoices(r.choices?.length ? r.choices : null);
      onResult(r);
    } catch (e) {
      setAnswer(e instanceof Error ? `Muse couldn't look right now: ${e.message}` : "Muse couldn't look right now.");
    } finally { setBusy(false); }
  };
  return (
    <Card padded as="section" aria-labelledby="ask-muse-title" className="space-y-3" data-testid="ask-muse">
      <div className="flex items-center justify-between">
        <h2 id="ask-muse-title" className="text-[17px] font-semibold text-fb-text">{plan ? 'Find someone to go with' : 'Ask Muse for an intro'}</h2>
        <MuseTag />
      </div>
      {plan && (
        <div className="flex items-center gap-2 rounded-btn bg-fb-blue-tint px-3 py-2" data-testid="ask-plan">
          <MapPin size={16} className="shrink-0 text-fb-blue" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-fb-text">
            <span className="font-semibold">{plan.label}</span>
            <span className="text-fb-text-2"> · {plan.when}</span>
            <span className="block text-[13px] text-fb-text-2">Muse only asks people who are free then and within a 25 min walk. If you both say yes, you both join.</span>
          </p>
          <button type="button" onClick={onClearPlan} aria-label="Not for this plan" className="shrink-0 rounded-full p-1 text-fb-text-2 hover:bg-fb-hover">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      {!plan && <KindPicker value={kind} onChange={setKind} name="Intro kind" />}
      {!plan && kind === 'dating' && <p className="text-[13px] text-fb-text-2">Dating intros only happen between two people who both opted into Dating and fit each other&apos;s preferences.</p>}
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label className="sr-only" htmlFor="ask-looking">What are you looking for?</label>
        <input id="ask-looking" value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} maxLength={140}
          placeholder={plan ? 'e.g. someone who likes comics' : PLACEHOLDERS[kind]}
          className="h-10 w-full min-w-0 shrink-0 rounded-pill bg-fb-input sm:w-auto sm:flex-1 px-4 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus:ring-2 focus:ring-fb-blue" />
        <Button type="submit" disabled={busy} icon={<Sparkles size={16} aria-hidden />}>{busy ? 'Muse is looking…' : 'Ask Muse'}</Button>
      </form>
      {answer && <p className="text-[15px] text-fb-text" data-testid="ask-answer" aria-live="polite">{answer}</p>}
      {choices && (
        <Choices choices={choices} onPicked={(id) => {
          const c = choices.find((x) => x.introId === id);
          setChoices(null);
          setAnswer(c ? `Muse is asking ${c.other.firstName}. Their card is below.` : null);
          onResult(null);
        }} />
      )}
    </Card>
  );
}

const KM_PER_MI = 1.609344;
const MILE_OPTIONS = [2, 5, 10, 15, 25, 50];
const nearestMiles = (km: number) =>
  MILE_OPTIONS.reduce((best, m) => (Math.abs(m - km / KM_PER_MI) < Math.abs(best - km / KM_PER_MI) ? m : best), MILE_OPTIONS[0]);

/** Facebook-style 36x20 switch. */
function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-fb-blue' : 'bg-fb-divider')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

function IntroSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, refetch } = useApi<{ profile: IntroProfile }>('/api/intros/profile');
  const [draft, setDraft] = useState<IntroProfile | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = draft ?? data?.profile ?? null;
  const edit = (next: IntroProfile) => { setDraft(next); setSaved(null); };
  const save = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await apiPost('/api/intros/profile', {
        kinds: p.kinds, paused: p.paused, maxKm: p.maxKm,
        datingPrefs: p.kinds.dating.on ? (p.datingPrefs ?? { ageMin: 21, ageMax: 30, genders: ['man', 'woman', 'nonbinary'] }) : p.datingPrefs,
      }, 'PUT');
      setDraft(null); setSaved('Saved'); await refetch();
    } catch (e) {
      setSaved(e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save");
    } finally { setBusy(false); }
  };
  const close = () => { setDraft(null); setSaved(null); onClose(); };
  return (
    <Sheet open={open} onClose={close} title="Intro settings"
      footer={(
        <div className="flex items-center gap-3">
          <Button className="flex-1" onClick={() => void save()} disabled={busy || !draft} data-testid="save-intro-settings">
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span className="text-[14px] text-fb-text-2" aria-live="polite">{saved}</span>}
        </div>
      )}>
      {!p ? <Skeleton className="h-24 w-full" /> : (
        <div className="space-y-4" data-testid="intro-settings">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-fb-text">Pause intros</p>
              <p className="text-[13px] text-fb-text-2">Muse won&apos;t look for anyone while this is on.</p>
            </div>
            <Switch on={p.paused} label="Pause intros" onChange={(v) => edit({ ...p, paused: v })} />
          </div>
          <hr className="border-fb-divider-soft" />
          {INTRO_KINDS.map((k) => (
            <div key={k} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold text-fb-text">{KIND_LABELS[k]}</p>
                <Switch on={p.kinds[k].on} label={KIND_LABELS[k]}
                  onChange={(v) => edit({ ...p, kinds: { ...p.kinds, [k]: { ...p.kinds[k], on: v } } })} />
              </div>
              {p.kinds[k].on && (
                <input aria-label={`${KIND_LABELS[k]}: looking for`} value={p.kinds[k].lookingFor} maxLength={140} placeholder={PLACEHOLDERS[k]}
                  onChange={(e) => edit({ ...p, kinds: { ...p.kinds, [k]: { ...p.kinds[k], lookingFor: e.target.value } } })}
                  className="h-10 w-full rounded-btn bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus:ring-2 focus:ring-fb-blue" />
              )}
            </div>
          ))}
          <hr className="border-fb-divider-soft" />
          <label className="flex items-center justify-between gap-3 text-[15px] font-semibold text-fb-text">
            How far away
            <select value={nearestMiles(p.maxKm)} aria-label="Max distance in miles"
              onChange={(e) => edit({ ...p, maxKm: Math.round(Number(e.target.value) * KM_PER_MI) })}
              className="h-9 rounded-btn bg-fb-input px-2 text-[15px] font-normal text-fb-text">
              {MILE_OPTIONS.map((m) => <option key={m} value={m}>Within {m} mi</option>)}
            </select>
          </label>
          <p className="text-[13px] text-fb-text-2">Muse only uses what you write here and what&apos;s public on your profile. Hookups are not something Muse does.</p>
        </div>
      )}
    </Sheet>
  );
}

export function IntrosPage() {
  const { viewer } = useViewer();
  const { data, loading, refetch } = useApi<{ intros: IntroCardData[] }>('/api/intros', [`user:${viewer.id}`]);
  const [round, setRound] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'run' | 'reset'>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Proposed intros that are still choices in the ask panel stay out of the inbox until one is picked.
  const [choiceIds, setChoiceIds] = useState<string[]>([]);
  const intros = (data?.intros ?? []).filter((i) => !choiceIds.includes(i.id));
  const onAsk = (r: RoundResult | null) => { setChoiceIds(r?.choices?.map((c) => c.introId) ?? []); void refetch(); };
  // "Find someone to go with ✨" on a plan links here with ?quest=<id>; the ask is pre-filled with it.
  const [planId, setPlanId] = useState<string | null>(null);
  useEffect(() => { setPlanId(new URLSearchParams(window.location.search).get('quest')); }, []);
  const planData = useApi<QuestDetail>(planId ? `/api/quests/${encodeURIComponent(planId)}` : null).data;
  const pq = planData && planData.quest.id === planId ? planData.quest : null;
  const planFor: PlanFor | null = pq ? { id: pq.id, label: `${pq.emoji} ${pq.title} at ${pq.venueName}`, when: formatDemoTime(pq.startsAt) } : null;
  const clearPlan = () => { setPlanId(null); window.history.replaceState(null, '', '/intros'); };

  const runRound = async () => {
    setBusy('run'); setRound(null);
    try {
      // The demo round is a friendship round: the comic open house story introduces a new friend.
      const r = await apiPost<RoundResult>('/api/intros/run', { kind: 'friendship' });
      setRound(r.message);
      await refetch();
    } catch (e) {
      setRound(e instanceof Error ? `Muse couldn't run a round: ${e.message}` : "Muse couldn't run a round.");
    } finally { setBusy(null); }
  };
  const reset = async () => {
    setBusy('reset');
    try { await apiPost('/api/intros/reset'); setRound('Your intros were cleared.'); await refetch(); } finally { setBusy(null); }
  };
  const respond = async (id: string, accept: boolean) => {
    await apiPost(`/api/intros/${id}/respond`, { accept });
    await refetch();
  };
  const plan = async (id: string, act: IntroPlanAction) => {
    await apiPost(`/api/intros/${id}/plan`, act);
    await refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 px-0 pb-8 pt-4 sm:px-4 md:pb-4">
      <Card padded as="section" aria-label="About Muse Intros" className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[24px] font-bold text-fb-text">Intros from Muse</h1>
          <MuseTag />
          <IconButton label="Intro settings" size="md" className="ml-auto" onClick={() => setSettingsOpen(true)} data-testid="open-intro-settings">
            <Settings size={20} aria-hidden />
          </IconButton>
        </div>
        <p className="text-[15px] text-fb-text-2">
          Your Muse agent talks with the other person&apos;s agent first. Muse only introduces when it&apos;s confident, and
          nothing is shared until you both say yes. Muse takes its time to find someone great: at most one new intro a week.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="tint" size="sm" onClick={() => void runRound()} disabled={!!busy} icon={<Sparkles size={14} aria-hidden />}
            data-testid="run-round">
            {busy === 'run' ? 'Agents are talking…' : 'Run a friendship intro round (demo)'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void reset()} disabled={!!busy} icon={<RotateCcw size={14} aria-hidden />}>
            Reset my intros (demo)
          </Button>
        </div>
        {round && <p className="text-[14px] text-fb-text" data-testid="round-result" aria-live="polite">{round}</p>}
      </Card>

      {/* Asked from a plan: the pre-filled ask comes first, above the inbox. */}
      {planFor && <AskMuse key={planFor.id} onResult={onAsk} plan={planFor} onClearPlan={clearPlan} />}

      <section aria-label="Your intros" className="space-y-3">
        {loading && !data && <Card padded><Skeleton className="h-40 w-full" /></Card>}
        {data && intros.length === 0 && (
          <Card padded className="text-center">
            <p className="text-[15px] font-semibold text-fb-text">No intros yet</p>
            <p className="text-[14px] text-fb-text-2">When Muse is confident about someone, their card shows up here.</p>
          </Card>
        )}
        {intros.map((i) => <IntroCard key={i.id} intro={i} onRespond={respond} onPlan={plan} />)}
      </section>

      {!planFor && <AskMuse onResult={onAsk} plan={null} onClearPlan={clearPlan} />}
      <IntroSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

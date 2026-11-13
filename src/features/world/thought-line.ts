import type { AgentEncounter, ChatMessage, MuseState } from '@/features/muse-companion';
import { museSteps } from '@/features/outhere';

/** One grounded thought, never a simulated pipeline or a recap from before the latest ask. */
export function companionThought(state:MuseState, encounter:AgentEncounter|null, last:ChatMessage|undefined, freshReply:boolean):string|null {
  if(encounter){
    const who=encounter.recipient.name.split(' ')[0];
    if(encounter.outcome==='cancelled')return null;
    if(encounter.outcome==='error')return 'The request did not finish. You can try again.';
    if(encounter.outcome==='unavailable'||encounter.outcome==='no_response')return 'No plan was confirmed.';
    if(encounter.received>0)return `${who}’s Muse replied`;
    if(encounter.sent>0)return 'Message sent';
    if(!encounter.outcome)return `Asking ${who}’s Muse`;
    return null;
  }
  if(state==='thinking'||state==='sending'||state==='receiving')return 'Working on your request';
  if(state==='evaluating')return 'Looking at your photo';
  if(state==='error'||!freshReply||last?.role!=='muse'||!last.plan?.intent||!last.plan.meta)return null;
  const steps=museSteps(last.plan,last.source);
  return (steps.find(s=>s.key==='rank')??steps[0])?.text??null;
}

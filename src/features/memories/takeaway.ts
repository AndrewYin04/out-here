// The "✨ Muse" line on the rating questionnaire's done screen. Built by code from the viewer's own
// answers, so it shows what Muse will do with them. It names only people the viewer said yes to,
// never one they said no to or left unanswered.
import { NEGATIVE_HIGHLIGHTS, type HangoutVerdict } from '@/shared';

/** "Maya", "Maya and Jordan", "Maya, Jordan and Sam". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}


export function museTakeaway(verdict: HangoutVerdict, highlights: string[], yesFirstNames: string[]): string {
  const good = highlights.filter((h) => !NEGATIVE_HIGHLIGHTS.has(h)).slice(0, 2);
  const bad = highlights.filter((h) => NEGATIVE_HIGHLIGHTS.has(h)).slice(0, 2);
  const people = yesFirstNames.length ? joinNames(yesFirstNames.slice(0, 3)) : null;
  if (verdict === 'meh') {
    const avoid = bad.length ? `I'll steer you away from plans like this one (${bad.join(', ')}).` : 'I\'ll suggest something different next time.';
    return people ? `Got it. ${avoid} I'll still look for a time with ${people}.` : `Got it. ${avoid}`;
  }
  const what = good.length ? joinNames(good) : 'plans';
  const lead = verdict === 'loved' ? 'Next time' : 'Noted. Next time';
  return `${lead} I'll look for ${what} like this${people ? `, with ${people}` : ''}.`;
}

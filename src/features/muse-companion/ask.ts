// Turns a chat turn into the single text the planner takes. The planner (POST /api/muse/plan)
// answers one ask at a time, so a short follow-up ("something quieter") is joined to the user's own
// previous ask instead of being sent bare. Only the user's own words are carried over: nothing is
// invented, and a fresh topic starts fresh.
const MAX = 280;
const FOLLOW_UP_WORDS = 7;

/** A follow-up is short and leans on what came before ("quieter", "under $10", "with Maya"). */
export function isFollowUp(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const t = text.trim();
  // A message with its own time window ("tonight", "30 min") is a new ask, not a tweak of the last one.
  const ownTime = /\b\d+\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\b|\b(tonight|today|tomorrow|now|till|until|before|after)\b/i.test(t);
  return words > 0 && words <= FOLLOW_UP_WORDS && !ownTime && !/^(i'?m|im|hungry|free|find|looking|any|what|where|who)\b/i.test(t);
}

export function composeAsk(previousAsk: string | null, text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!previousAsk || !isFollowUp(t)) return t.slice(0, MAX);
  const joined = `${previousAsk.replace(/[,\s.]+$/, '')}, ${t}`;
  // Keep the newest words when the join is too long: drop the oldest context first.
  return (joined.length > MAX ? joined.slice(joined.length - MAX).replace(/^[^,]*,\s*/, '') : joined).slice(0, MAX);
}

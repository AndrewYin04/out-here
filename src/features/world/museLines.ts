// What Muse says in the 3D view while you walk and when it's time to go (#45, DEMO_FLOW
// scenes 7-8). Pure functions (no DOM), so Vitest covers them. The pet bubble in World3D
// picks one line; the top walk capsule keeps the numbers, Muse keeps the company.
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const first = (name: string) => name.split(' ')[0] ?? name;

/** "7 min to 🥟 Dumpling Den · with Maya" / "Almost there — 🥟 Dumpling Den". */
export function walkLine(minutes: number, emoji: string, title: string, walkerNames: string[]): string {
  const where = `${emoji} ${clip(title, 26)}`;
  const withWho = walkerNames.length === 0 ? ''
    : walkerNames.length === 1 ? ` · with ${first(walkerNames[0])}`
      : ` · with ${first(walkerNames[0])} and ${first(walkerNames[1])}`;
  return minutes <= 1 ? `Almost there — ${where}${withWho}` : `${minutes} min to ${where}${withWho}`;
}

/** Leave-by heads-up before the "It's happening" moment (matches UpNext's 2-minute cushion). */
export const HEAD_THERE_HEADS_UP_MIN = 2;

/**
 * "It's happening — 🎭 Comics open house. Head there now." once it's time to leave
 * (start minus walk time, plus the heads-up), and while the plan is on. Null before that.
 */
export function headThereLine(emoji: string, title: string, startsAtMs: number, walkMinutes: number, nowMs: number): string | null {
  const leaveBy = startsAtMs - walkMinutes * 60_000 - HEAD_THERE_HEADS_UP_MIN * 60_000;
  if (nowMs < leaveBy) return null;
  return `It’s happening — ${emoji} ${clip(title, 26)}. Head there now.`;
}

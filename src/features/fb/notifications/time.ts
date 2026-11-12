// Facebook-style short relative times: "Just now", "5m", "3h", "2d", "1w".
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 52) return `${w}w`;
  return `${Math.floor(d / 365)}y`;
}

/** "Starts in 25 min", "Starts in 1 hr 10 min", "Happening now", "Ended". */
export function startsLabel(startsAt: string, endsAt: string, now: number = Date.now()): string {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= end) return 'Ended';
  if (now >= start) return 'Happening now';
  const min = Math.max(1, Math.round((start - now) / 60000));
  if (min < 60) return `Starts in ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `Starts in ${h} hr ${rest} min` : `Starts in ${h} hr`;
}

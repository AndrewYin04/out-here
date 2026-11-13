// Client refetch coalescing (issue #36). A burst of realtime messages used to start one fresh
// GET per message per hook, and each fresh GET is a database read on the server. Here every
// fetch of one key (persona + path + fresh) in this tab goes through one Coalescer:
// - the first trigger fetches at once (no added latency for a lone message);
// - triggers while that fetch is in flight, or within `windowMs` of its start, merge into
//   exactly one trailing fetch, which starts when the window has passed and nothing is in flight.
// - a trigger that says when its message arrived (`since`, a mark from markArrival()) joins the
//   fetch in flight if that fetch started after the message, so the hooks that one message wakes
//   make one GET, not one GET plus a trailing one.
// - a `join` trigger (a plain mount load, which may show cached data anyway) joins any fetch in
//   flight for its key instead of waiting for a trailing one.
// Any other trigger during a fetch gets the trailing result, never the in-flight one, so it
// always sees data read after it was triggered.

export const COALESCE_MS = 250;

/**
 * Tab-wide logical clock: every fetch start and every message arrival takes the next value, so
 * "this fetch started after that message" is exact, with no same-millisecond ties.
 */
let tick = 0;
/** A mark for a realtime message arriving now; pass it to coalescedFetch as `since`. */
export function markArrival(): number { return ++tick; }

type Timer = ReturnType<typeof setTimeout>;

export class Coalescer<T> {
  private inFlight: Promise<T> | null = null;
  private lastStart = -Infinity;
  /** markArrival() value taken when the fetch in flight started. */
  private inFlightMark = -Infinity;
  private trailing: { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } | null = null;
  private timer: Timer | null = null;

  constructor(private readonly fetcher: () => Promise<T>, private readonly windowMs = COALESCE_MS, private readonly clock: () => number = () => Date.now()) {}

  /** Number of fetches started (for tests and debugging). */
  started = 0;

  /**
   * `since`: the markArrival() of the message behind this trigger; omitted = now.
   * `join`: accept the fetch already in flight, whenever it started (plain mount loads).
   */
  trigger(since?: number, join = false): Promise<T> {
    if (join && this.inFlight) return this.inFlight;
    if (this.trailing) return this.trailing.promise;
    if (this.inFlight && since !== undefined && this.inFlightMark > since) return this.inFlight;
    const elapsed = this.clock() - this.lastStart;
    if (!this.inFlight && elapsed >= this.windowMs) return this.start();
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    this.trailing = { promise, resolve, reject };
    this.schedule();
    return promise;
  }

  private start(): Promise<T> {
    this.started++;
    this.lastStart = this.clock();
    this.inFlightMark = ++tick;
    const p = this.fetcher();
    this.inFlight = p;
    const done = () => {
      if (this.inFlight === p) this.inFlight = null;
      this.schedule();
    };
    p.then(done, done);
    return p;
  }

  /** Starts the trailing fetch once nothing is in flight and the window since the last start has passed. */
  private schedule(): void {
    if (!this.trailing || this.inFlight || this.timer) return;
    const wait = Math.max(0, this.windowMs - (this.clock() - this.lastStart));
    this.timer = setTimeout(() => {
      this.timer = null;
      const t = this.trailing;
      if (!t || this.inFlight) { this.schedule(); return; }
      this.trailing = null;
      this.start().then(t.resolve, t.reject);
    }, wait);
  }
}

const registry = new Map<string, Coalescer<unknown>>();

/**
 * Fetches through the tab-wide coalescer for `key`. `fetcher` is used when a fetch starts; every
 * caller with the same key must fetch the same thing (same persona, path and freshness).
 */
export function coalescedFetch<T>(key: string, fetcher: () => Promise<T>, opts: { since?: number; join?: boolean; windowMs?: number } = {}): Promise<T> {
  let c = registry.get(key) as Coalescer<T> | undefined;
  if (!c) { c = new Coalescer<T>(fetcher, opts.windowMs ?? COALESCE_MS); registry.set(key, c as Coalescer<unknown>); }
  return c.trigger(opts.since, opts.join);
}

/** Test helper: forget every coalescer. */
export function resetCoalescers(): void { registry.clear(); }

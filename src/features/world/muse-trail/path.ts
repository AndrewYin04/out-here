// The wake's path in world space: a bounded history of where Muse's tail has been, and a smooth
// Catmull-Rom curve through it. Old points stay where they were, so a turn bends the wake behind
// Muse and never snaps it. Pure typed-array code: no allocation per frame, unit-tested.

/** Ring buffer of timestamped points. Index 0 is the newest. */
export class TrailHistory {
  readonly cap: number;
  private xs: Float32Array;
  private ys: Float32Array;
  private zs: Float32Array;
  private ts: Float64Array;
  private head = 0; // slot of the newest point
  private n = 0;

  constructor(cap: number) {
    this.cap = Math.max(2, cap | 0);
    this.xs = new Float32Array(this.cap);
    this.ys = new Float32Array(this.cap);
    this.zs = new Float32Array(this.cap);
    this.ts = new Float64Array(this.cap);
  }

  get length(): number { return this.n; }

  clear(): void { this.n = 0; this.head = 0; }

  /** Add a point. When full, the oldest is dropped. */
  push(x: number, y: number, z: number, t: number): void {
    this.head = (this.head + 1) % this.cap;
    this.xs[this.head] = x; this.ys[this.head] = y; this.zs[this.head] = z; this.ts[this.head] = t;
    if (this.n < this.cap) this.n++;
  }

  private slot(i: number): number { return (this.head - i + this.cap) % this.cap; }
  x(i: number): number { return this.xs[this.slot(i)]; }
  y(i: number): number { return this.ys[this.slot(i)]; }
  z(i: number): number { return this.zs[this.slot(i)]; }
  t(i: number): number { return this.ts[this.slot(i)]; }

  /** Drop points older than `lifetime` seconds (oldest first). Returns how many were dropped. */
  prune(now: number, lifetime: number): number {
    let dropped = 0;
    while (this.n > 0 && now - this.ts[this.slot(this.n - 1)] > lifetime) { this.n--; dropped++; }
    return dropped;
  }
}

/** Reused output of sampleWake(): `count` samples of position, age (seconds) and path fraction. */
export class WakeSamples {
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly age: Float32Array;
  /** 0 at Muse, 1 at the oldest end. */
  readonly u: Float32Array;
  count = 0;
  constructor(readonly capacity: number) {
    this.px = new Float32Array(capacity); this.py = new Float32Array(capacity); this.pz = new Float32Array(capacity);
    this.age = new Float32Array(capacity); this.u = new Float32Array(capacity);
  }
}

/** Uniform Catmull-Rom through p0..p3 at t in [0, 1] between p1 and p2. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Sample a smooth curve from Muse's live anchor back through the history. The anchor is control
 * point 0 (age 0); history point i is control point i + 1. Fills `out` with `m` samples evenly
 * spaced in control-point index (which tracks distance travelled, since points are emitted at a
 * fixed spacing). Returns the number of samples (0 when there is nothing to draw).
 */
export function sampleWake(
  h: TrailHistory, ax: number, ay: number, az: number, now: number, m: number, out: WakeSamples,
): number {
  const n = h.length + 1; // control points including the anchor
  if (h.length < 1 || m < 2) { out.count = 0; return 0; }
  const m2 = Math.min(m, out.capacity);
  const cx = (i: number) => (i <= 0 ? ax : h.x(Math.min(i, n - 1) - 1));
  const cy = (i: number) => (i <= 0 ? ay : h.y(Math.min(i, n - 1) - 1));
  const cz = (i: number) => (i <= 0 ? az : h.z(Math.min(i, n - 1) - 1));
  const ct = (i: number) => (i <= 0 ? now : h.t(Math.min(i, n - 1) - 1));
  const last = n - 1;
  for (let j = 0; j < m2; j++) {
    const f = (j / (m2 - 1)) * last;
    const i = Math.min(Math.floor(f), last - 1);
    const t = f - i;
    const i0 = Math.max(i - 1, 0), i1 = i, i2 = i + 1, i3 = Math.min(i + 2, last);
    out.px[j] = catmullRom(cx(i0), cx(i1), cx(i2), cx(i3), t);
    out.py[j] = catmullRom(cy(i0), cy(i1), cy(i2), cy(i3), t);
    out.pz[j] = catmullRom(cz(i0), cz(i1), cz(i2), cz(i3), t);
    out.age[j] = now - (ct(i1) + (ct(i2) - ct(i1)) * t);
    out.u[j] = j / (m2 - 1);
  }
  out.count = m2;
  return m2;
}

// Small motion kit for Out Here's moments (join, live seats, "It's a plan!").
// Web Animations API only, no dependency. Every helper is a no-op under prefers-reduced-motion,
// and none of them changes layout, opacity of whole sheets, or anything a test reads.

/** Timing curves. spring overshoots a little (squash and stretch, follow-through). */
export const EASE = {
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.55, 0, 1, 0.45)',
} as const;

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === 'function' && !reducedMotion();
}

/** Squash then stretch then settle: something just landed on or changed in `el`. */
export function squash(el: Element | null | undefined, base = '') {
  if (!canAnimate(el)) return;
  el.animate(
    [
      { transform: `${base} scale(1, 1)` },
      { transform: `${base} scale(1.3, 0.75)`, offset: 0.2 },
      { transform: `${base} scale(0.88, 1.18)`, offset: 0.45 },
      { transform: `${base} scale(1.06, 0.96)`, offset: 0.7 },
      { transform: `${base} scale(1, 1)` },
    ],
    { duration: 560, easing: 'ease-out' },
  );
}

/** A count changed live: grow past the target, then settle back. */
export function bump(el: Element | null | undefined, base = '') {
  if (!canAnimate(el)) return;
  el.animate(
    [
      { transform: `${base} scale(1)` },
      { transform: `${base} scale(1.55)`, offset: 0.3 },
      { transform: `${base} scale(0.92)`, offset: 0.6 },
      { transform: `${base} scale(1)` },
    ],
    { duration: 650, easing: 'ease-out' },
  );
}

function layer(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.append(el);
  return el;
}

/**
 * An avatar flies from one element to another along an arc, then the target squashes.
 * The arc: the outer box moves X linearly while the inner box moves Y with ease-out going up and
 * ease-in coming down, so the path curves the way a thrown object does.
 */
export function flyAvatar(from: Element | null, to: Element | null, src: string, onLand?: () => void): boolean {
  if (!from || !to || !canAnimate(document.body)) return false;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (b.width === 0 || b.bottom < 0 || b.top > window.innerHeight || b.right < 0 || b.left > window.innerWidth) return false;
  const size = 40;
  const x0 = a.left + a.width / 2 - size / 2;
  const y0 = a.top + a.height / 2 - size / 2;
  const x1 = b.left + b.width / 2 - size / 2;
  const y1 = b.top + b.height / 2 - size / 2;
  const lift = Math.max(70, Math.abs(y1 - y0) * 0.35);
  const peak = Math.min(y0, y1) - lift;
  const duration = 720;

  const root = layer();
  const outer = document.createElement('div');
  outer.style.cssText = `position:absolute;left:0;top:0;transform:translateX(${x0}px);`;
  const inner = document.createElement('img');
  inner.src = src;
  inner.alt = '';
  inner.style.cssText = `display:block;width:${size}px;height:${size}px;border-radius:9999px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3);object-fit:cover;background:#E2E5E9;transform:translateY(${y0}px);`;
  outer.append(inner);
  root.append(outer);

  outer.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration, easing: 'linear', fill: 'forwards' });
  const flight = inner.animate(
    [
      // Anticipation: a small dip and squash before take-off.
      { transform: `translateY(${y0}px) scale(1)`, easing: 'ease-in' },
      { transform: `translateY(${y0 + 6}px) scale(1.1, 0.9)`, offset: 0.08, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      { transform: `translateY(${peak}px) scale(1.05)`, offset: 0.5, easing: 'cubic-bezier(0.6, 0, 0.8, 0.3)' },
      { transform: `translateY(${y1}px) scale(0.7)` },
    ],
    { duration, fill: 'forwards' },
  );
  flight.onfinish = () => { root.remove(); onLand?.(); };
  flight.oncancel = () => root.remove();
  return true;
}

/** A few emoji pop out of `el` in arcs and fall away (secondary action for a celebration). */
export function burst(el: Element | null | undefined, emojis: string[], count = 10) {
  if (!el || !canAnimate(document.body) || emojis.length === 0) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const root = layer();
  window.setTimeout(() => root.remove(), 1600);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.textContent = emojis[i % emojis.length];
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;font-size:${18 + (i % 3) * 4}px;line-height:1;`;
    root.append(p);
    const angle = (-Math.PI / 2) + ((i / (count - 1)) - 0.5) * Math.PI * 1.1;
    const dist = 70 + (i * 37) % 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const spin = ((i * 53) % 60) - 30;
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy + 90}px)) scale(0.8) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 900 + (i % 4) * 80, easing: EASE.out, delay: (i % 5) * 18, fill: 'forwards' },
    );
  }
}

/** A map pin falls into place and lands with a squash. `delay` staggers a group of pins. */
export function dropIn(el: Element | null | undefined, delay = 0) {
  if (!canAnimate(el)) return;
  el.animate(
    [
      { transform: 'translateY(-26px) scale(0.85, 1.12)', opacity: 0, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
      { transform: 'translateY(0) scale(1.22, 0.8)', opacity: 1, offset: 0.55 },
      { transform: 'translateY(-3px) scale(0.94, 1.06)', offset: 0.78 },
      { transform: 'translateY(0) scale(1, 1)', opacity: 1 },
    ],
    { duration: 520, delay, easing: 'ease-out', fill: 'backwards' },
  );
}

/** A camera-shutter flash over the whole screen. */
export function flash() {
  if (!canAnimate(document.body)) return;
  const root = layer();
  root.style.background = '#fff';
  const a = root.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
  a.onfinish = () => root.remove();
  a.oncancel = () => root.remove();
}

/** The quest's pin on the Out Here map, if it is on screen (MapCanvas builds it). */
export function questPin(questId: string | null | undefined): HTMLElement | null {
  if (!questId || typeof document === 'undefined') return null;
  const button = document.querySelector<HTMLElement>(`[data-quest-id="${CSS.escape(questId)}"] > [data-map-marker="quest"]`);
  return (button?.firstElementChild as HTMLElement | null) ?? null;
}

/**
 * You joined: your avatar arcs from the button you tapped onto the quest's pin, the pin squashes
 * as it lands and the quest's emoji bursts out. With no pin on screen, the burst comes from the button.
 */
export function celebrateJoin(from: Element | null, questId: string | null | undefined, avatarSrc: string, emoji: string) {
  const pin = questPin(questId);
  const emojis = [emoji, '✨', emoji, '🎉'];
  const flew = flyAvatar(from, pin, avatarSrc, () => { squash(pin); burst(pin, emojis, 8); });
  if (!flew) burst(from, emojis, 8);
}

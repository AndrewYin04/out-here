'use client';
// The companion's presence in the chat UI: a small energy orb in the Phase 1 palette
// (#0866FF / #168AFF / #23D9F5 / #B8F7FF). It is not a second Jolly: Jolly lives in the 3D world.
// Listening ripples, thinking orbits, responding settles. Pure CSS, bounded loops, and a plain
// still orb under prefers-reduced-motion.
import type { MuseState } from './state';
import { cn } from '@/features/ui';

export function MuseOrb({ state, size = 36, className }: { state: MuseState; size?: number; className?: string }) {
  return (
    <span
      data-muse-orb
      data-state={state}
      aria-hidden
      className={cn('muse-orb relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <span className="muse-orb-ripple" />
      <span className="muse-orb-ring" />
      <span className="muse-orb-core" />
      <span className="muse-orb-dot muse-orb-dot-a" />
      <span className="muse-orb-dot muse-orb-dot-b" />
      <span className="muse-orb-dot muse-orb-dot-c" />
    </span>
  );
}

/** Keyframes and orb styles, rendered once with the chat. */
export function MuseStyles() {
  return (
    <style>{`
.muse-orb-core{position:absolute;inset:18%;border-radius:9999px;background:radial-gradient(circle at 35% 30%,#B8F7FF 0%,#23D9F5 38%,#0866FF 100%);box-shadow:0 0 10px 2px rgba(35,217,245,.55);transition:transform .35s ease}
.muse-orb-ring,.muse-orb-ripple{position:absolute;inset:0;border-radius:9999px;opacity:0}
.muse-orb-ring{border:2px solid transparent;border-top-color:#23D9F5;border-right-color:#168AFF}
.muse-orb-ripple{border:1.5px solid #23D9F5}
.muse-orb-dot{position:absolute;width:12%;height:12%;border-radius:9999px;background:#B8F7FF;left:44%;top:44%;opacity:0;box-shadow:0 0 6px #23D9F5}
.muse-orb[data-state=thinking] .muse-orb-ring,.muse-orb[data-state=evaluating] .muse-orb-ring{opacity:1;animation:muse-spin 1.1s linear infinite}
.muse-orb[data-state=thinking] .muse-orb-core{transform:scale(.88);animation:muse-pulse 1.3s ease-in-out infinite}
.muse-orb[data-state=thinking] .muse-orb-dot{opacity:1;animation:muse-orbit 1.6s linear infinite}
.muse-orb-dot-b{animation-delay:-.53s!important}.muse-orb-dot-c{animation-delay:-1.06s!important}
.muse-orb[data-state=listening] .muse-orb-ripple{animation:muse-ripple 1.4s ease-out infinite}
.muse-orb[data-state=responding] .muse-orb-ring{animation:muse-settle .9s ease-out 1}
.muse-orb[data-state=responding] .muse-orb-core{animation:muse-pop .5s ease-out 1}
.muse-orb[data-state=error] .muse-orb-core{background:radial-gradient(circle at 35% 30%,#d6dbe3,#8a93a3);box-shadow:none}
@keyframes muse-spin{to{transform:rotate(360deg)}}
@keyframes muse-pulse{50%{transform:scale(1)}}
@keyframes muse-orbit{from{transform:rotate(0) translateX(170%) rotate(0)}to{transform:rotate(360deg) translateX(170%) rotate(-360deg)}}
@keyframes muse-ripple{0%{transform:scale(.55);opacity:.8}100%{transform:scale(1.35);opacity:0}}
@keyframes muse-settle{0%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.5) rotate(120deg)}}
@keyframes muse-pop{0%{transform:scale(.8)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes muse-unfold{from{opacity:0;transform:translateY(12px) scale(.92)}to{opacity:1;transform:none}}
@keyframes muse-fade{from{opacity:0}to{opacity:1}}
@keyframes muse-msg{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.muse-panel{transform-origin:100% 100%;animation:muse-unfold .38s cubic-bezier(.22,1,.36,1) .28s both}
.muse-msg{animation:muse-msg .28s ease-out both}
@media (prefers-reduced-motion:reduce){
  .muse-orb *{animation:none!important;transition:none!important}
  .muse-orb[data-state=thinking] .muse-orb-ring{opacity:1}
  .muse-orb[data-state=thinking] .muse-orb-dot{opacity:0}
  .muse-panel{animation:muse-fade .15s linear both!important}
  .muse-msg{animation:none}
}`}</style>
  );
}

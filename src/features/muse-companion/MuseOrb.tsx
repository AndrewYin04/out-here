'use client';
// The companion's presence in the chat UI: Jolly's profile picture, acting out the Muse state.
// Listening leans in with a ripple, thinking tilts back and forth inside a spinning ring,
// responding talks (a small bounce), celebrating hops, and an error droops. Pure CSS, bounded
// loops, and a still picture under prefers-reduced-motion. (The name is kept from the old energy
// orb so every place that shows Muse updates at once.)
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
      <span className="muse-pfp">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static render of Jolly */}
        <img src="/muse/jolly-pfp.webp" alt="" width={96} height={96} draggable={false} />
      </span>
    </span>
  );
}

/** Keyframes and orb styles, rendered once with the chat. */
export function MuseStyles() {
  return (
    <style>{`
.muse-orb-ring,.muse-orb-ripple{position:absolute;inset:-3px;border-radius:9999px;opacity:0}
.muse-orb-ring{border:2px solid transparent;border-top-color:#23D9F5;border-right-color:#0866FF}
.muse-orb-ripple{border:1.5px solid #168AFF;inset:0}
.muse-pfp{position:absolute;inset:0;overflow:hidden;border-radius:9999px;background:#E8F1FF;box-shadow:inset 0 0 0 1px rgba(8,102,255,.18);transform-origin:50% 90%;animation:muse-breathe 3.2s ease-in-out infinite}
.muse-pfp img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.muse-orb[data-state=approaching] .muse-pfp,.muse-orb[data-state=returning] .muse-pfp{animation:muse-hop .6s ease-in-out infinite}
.muse-orb[data-state=listening] .muse-pfp{animation:muse-lean 1.8s ease-in-out infinite}
.muse-orb[data-state=listening] .muse-orb-ripple{animation:muse-ripple 1.4s ease-out infinite}
.muse-orb[data-state=thinking] .muse-pfp,.muse-orb[data-state=evaluating] .muse-pfp{animation:muse-think 1.8s ease-in-out infinite}
.muse-orb[data-state=thinking] .muse-orb-ring,.muse-orb[data-state=evaluating] .muse-orb-ring{opacity:1;animation:muse-spin 1.1s linear infinite}
.muse-orb[data-state=responding] .muse-pfp,.muse-orb[data-state=sending] .muse-pfp,.muse-orb[data-state=delivering] .muse-pfp,.muse-orb[data-state=receiving] .muse-pfp{animation:muse-talk .55s ease-in-out infinite}
.muse-orb[data-state=responding] .muse-orb-ring{animation:muse-settle .9s ease-out 1}
.muse-orb[data-state=celebrating] .muse-pfp{animation:muse-cheer .7s ease-in-out infinite}
.muse-orb[data-state=error] .muse-pfp{animation:none;filter:grayscale(.85);transform:rotate(6deg) translateY(4%)}
@keyframes muse-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3%) scale(1.03)}}
@keyframes muse-hop{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-9%) scale(1.06)}}
@keyframes muse-lean{0%,100%{transform:rotate(-5deg) translateX(-2%)}50%{transform:rotate(-8deg) translateX(-3%) scale(1.04)}}
@keyframes muse-think{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
@keyframes muse-talk{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-5%) scale(1.05)}}
@keyframes muse-cheer{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-14%) rotate(6deg) scale(1.08)}}
@keyframes muse-spin{to{transform:rotate(360deg)}}
@keyframes muse-ripple{0%{transform:scale(.55);opacity:.8}100%{transform:scale(1.35);opacity:0}}
@keyframes muse-settle{0%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.5) rotate(120deg)}}
@keyframes muse-unfold{from{opacity:0;transform:translateY(12px) scale(.92)}to{opacity:1;transform:none}}
@keyframes muse-fade{from{opacity:0}to{opacity:1}}
@keyframes muse-msg{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.muse-panel{transform-origin:100% 100%;animation:muse-unfold .6s cubic-bezier(.22,1,.36,1) 1.1s both}
.muse-msg{animation:muse-msg .28s ease-out both}
.muse-result-reveal{animation:muse-result .35s ease-out both}
@keyframes muse-result{from{opacity:.55;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .muse-orb *{animation:none!important;transition:none!important}
  .muse-orb[data-state=thinking] .muse-orb-ring{opacity:1}
  .muse-panel{animation:muse-fade .15s linear both!important}
  .muse-msg,.muse-result-reveal{animation:none}
}`}</style>
  );
}

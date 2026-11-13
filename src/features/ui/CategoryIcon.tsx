// Plan categories as Facebook-style icons: a line icon in a tinted circle, instead of each plan's
// emoji. React screens use <CategoryIcon>; the map's DOM pins use categorySvg(). Both draw from
// the same shapes, copied from Lucide (ISC license, lucide.dev).
import type { CSSProperties } from 'react';
import { DEMO_QUESTS, seedId, type QuestCategory } from '@/shared';
import { cn } from './cn';

type Node = [string, Record<string, string | number>];

const SHAPES: Record<QuestCategory, Node[]> = {
  food: [["path", {"d": "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"}], ["path", {"d": "M7 2v20"}], ["path", {"d": "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"}]],
  music: [["path", {"d": "M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19"}], ["circle", {"cx": "18", "cy": "16", "r": "3"}], ["circle", {"cx": "6", "cy": "19", "r": "3"}]],
  sports: [["path", {"d": "M11 7a16 16 20 0 1 10.98 4.362"}], ["path", {"d": "M12 12a13 13 0 0 1-8.66 5"}], ["path", {"d": "M16.83 13.634a16 16 0 0 1-9.267 7.328"}], ["path", {"d": "M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10"}], ["path", {"d": "M8.17 15.366a16 16 0 0 1-1.713-11.69"}], ["circle", {"cx": "12", "cy": "12", "r": "10"}]],
  study: [["path", {"d": "M12 5v16"}], ["path", {"d": "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"}]],
  thrift: [["path", {"d": "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"}]],
  art: [["path", {"d": "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"}], ["circle", {"cx": "13.5", "cy": "6.5", "r": ".5", "fill": "currentColor"}], ["circle", {"cx": "17.5", "cy": "10.5", "r": ".5", "fill": "currentColor"}], ["circle", {"cx": "6.5", "cy": "12.5", "r": ".5", "fill": "currentColor"}], ["circle", {"cx": "8.5", "cy": "7.5", "r": ".5", "fill": "currentColor"}]],
  outdoors: [["path", {"d": "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"}], ["path", {"d": "M7 16v6"}], ["path", {"d": "M13 19v3"}], ["path", {"d": "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"}]],
  games: [["line", {"x1": "6", "x2": "10", "y1": "11", "y2": "11"}], ["line", {"x1": "8", "x2": "8", "y1": "9", "y2": "13"}], ["line", {"x1": "15", "x2": "15.01", "y1": "12", "y2": "12"}], ["line", {"x1": "18", "x2": "18.01", "y1": "10", "y2": "10"}], ["path", {"d": "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"}]],
  other: [["path", {"d": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}], ["circle", {"cx": "12", "cy": "10", "r": "3"}]],
};

/** A few more line icons for DOM markers (pins): who can see a plan, and Muse's pick tag. */
const MARKS = {
  users: [["path", {"d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}], ["path", {"d": "M16 3.128a4 4 0 0 1 0 7.744"}], ["path", {"d": "M22 21v-2a4 4 0 0 0-3-3.87"}], ["circle", {"cx": "9", "cy": "7", "r": "4"}]],
  handshake: [["path", {"d": "m11 17 2 2a1 1 0 1 0 3-3"}], ["path", {"d": "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"}], ["path", {"d": "m21 3 1 11h-2"}], ["path", {"d": "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"}], ["path", {"d": "M3 4h8"}]],
  lock: [["rect", {"width": "18", "height": "11", "x": "3", "y": "11", "rx": "2", "ry": "2"}], ["path", {"d": "M7 11V7a5 5 0 0 1 10 0v4"}]],
  sparkles: [["path", {"d": "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}], ["path", {"d": "M20 2v4"}], ["path", {"d": "M22 4h-4"}], ["circle", {"cx": "4", "cy": "20", "r": "2"}]],
} satisfies Record<string, Node[]>;

/** One of MARKS as an SVG string. */
export function markSvg(name: keyof typeof MARKS, size = 12, color = 'currentColor'): string {
  return toSvg(MARKS[name], size, color);
}

/** Icon colour and the tint behind it, per category (Facebook's palette). */
export const CATEGORY_STYLE: Record<QuestCategory, { fg: string; bg: string; label: string }> = {
  food: { fg: '#E8710A', bg: '#FFF1E0', label: 'Food' },
  music: { fg: '#9360F7', bg: '#F0E8FE', label: 'Music' },
  sports: { fg: '#0A8F8F', bg: '#DFF4F4', label: 'Sports' },
  study: { fg: '#0866FF', bg: '#EBF5FF', label: 'Study' },
  thrift: { fg: '#E4405F', bg: '#FDE8EC', label: 'Thrift' },
  art: { fg: '#B07F00', bg: '#FEF4D6', label: 'Art' },
  outdoors: { fg: '#31A24C', bg: '#E7F3E8', label: 'Outdoors' },
  games: { fg: '#5B5FC7', bg: '#ECEDFA', label: 'Games' },
  other: { fg: '#65676B', bg: '#E4E6EB', label: 'Plan' },
};

const known = (c: string | null | undefined): QuestCategory => (c && c in SHAPES ? (c as QuestCategory) : 'other');

/** The category's line icon on its own (no circle). */
export function CategoryGlyph({ category, size = 20, color, strokeWidth = 2, className }: {
  category: QuestCategory | string | null | undefined; size?: number; color?: string; strokeWidth?: number; className?: string;
}) {
  const c = known(category);
  return (
    <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? CATEGORY_STYLE[c].fg} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {SHAPES[c].map(([tag, attrs], i) => {
        const Tag = tag as 'path';
        return <Tag key={i} {...(attrs as Record<string, string>)} />;
      })}
    </svg>
  );
}

/** The category icon in a tinted circle: where a plan used to show its emoji. */
export function CategoryIcon({ category, size = 40, className, style }: {
  category: QuestCategory | string | null | undefined; size?: number; className?: string; style?: CSSProperties;
}) {
  const c = known(category);
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: CATEGORY_STYLE[c].bg, ...style }}>
      <CategoryGlyph category={c} size={Math.round(size * 0.5)} />
    </span>
  );
}

const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** The same icon as an SVG string, for DOM markers outside React (the map pins). */
export function categorySvg(category: QuestCategory | string | null | undefined, size = 22, color?: string): string {
  const c = known(category);
  return toSvg(SHAPES[c], size, color ?? CATEGORY_STYLE[c].fg);
}

function toSvg(nodes: Node[], size: number, color: string): string {
  const body = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
  return `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${body}</svg>`;
}

// Some views only know a plan's id and emoji (Muse suggestions, the plan-together card). The map
// remembers each plan's category as it loads; seeded emoji are the fallback, then the generic icon.
const byId = new Map<string, QuestCategory>(DEMO_QUESTS.map((q) => [seedId('quest', q.key), q.category]));
const byEmoji = new Map<string, QuestCategory>(DEMO_QUESTS.map((q) => [q.emoji, q.category]));
export function rememberCategories(quests: { id: string; category: QuestCategory }[]) {
  for (const q of quests) byId.set(q.id, q.category);
}
export function categoryOf(questId: string | null | undefined, emoji?: string | null): QuestCategory {
  return (questId && byId.get(questId)) || (emoji && byEmoji.get(emoji)) || 'other';
}

'use client';
// Floating labels over the quest stadiums (#23): emoji, title, spots left and the walk from your
// avatar, counting down live as you walk. Tapping one opens the plan, as a 2D pin does.
// While these show, the flat 2D pins for the same plans are hidden so nothing is drawn twice.
import { CategoryIcon, categoryOf, cn } from '@/features/ui';
import { Footprints, Sparkles } from 'lucide-react';
import { seatText, walkText, type StadiumLabel } from './stadiums';
import type { WorldLayer } from './WorldLayer';
import type { LatLng } from '@/shared';

/** Height of the label above the arena floor, in meters. */
const LABEL_ALT = 16;

export function StadiumLabels({ labels, where, layer, onSelect }: {
  labels: StadiumLabel[];
  where: Map<string, LatLng>;
  layer: WorldLayer | null;
  onSelect: (questId: string) => void;
}) {
  if (!layer || labels.length === 0) return null;
  const hide = labels.map((l) => `[data-view3d] [data-quest-id=${JSON.stringify(l.id)}]`).join(',');
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`${hide}{display:none!important}`}</style>
      {labels.map((l) => {
        const pos = where.get(l.id);
        if (!pos) return null;
        return (
          <div key={l.id} ref={(el) => layer.bindAnchor(`st:${l.id}`, pos, LABEL_ALT, el)} style={{ visibility: 'hidden' }} className="absolute left-0 top-0 pb-1">
            <button
              type="button"
              data-testid="stadium-label"
              data-quest-label={l.id}
              aria-label={`${l.title}: ${seatText(l.seatsLeft)}, ${walkText(l.minutes, l.meters)} walk`}
              onClick={() => onSelect(l.id)}
              className={cn(
                'pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-fb-surface py-1 pl-1 pr-2.5 text-left shadow-popover hover:bg-fb-hover',
                l.selected && 'ring-2 ring-fb-blue',
                l.pick && !l.selected && 'ring-2 ring-[#F5B800]',
              )}
            >
              <CategoryIcon category={categoryOf(l.id, l.emoji)} size={28} />
              <span className="flex flex-col leading-[15px]">
                <span className="max-w-[150px] truncate text-[13px] font-semibold text-fb-text">
                  {l.pick && <Sparkles size={12} aria-hidden className="mr-0.5 inline align-[-1px] text-[#B07F00]" />}{l.title}
                </span>
                <span className="text-[12px] text-fb-text-2">
                  <span className={cn('font-semibold', l.seatsLeft <= 1 ? 'text-fb-red' : 'text-fb-blue')}>{seatText(l.seatsLeft)}</span>
                  {' · '}<Footprints size={11} aria-hidden className="mr-0.5 inline align-[-1px]" />{walkText(l.minutes, l.meters)}
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

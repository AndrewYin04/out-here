import { cn } from '@/features/ui';

/** Required OpenFreeMap / OpenMapTiles / OpenStreetMap credit, always visible over the map. */
export function MapAttribution({ className }: { className?: string }) {
  const link = 'text-fb-text-2 hover:underline';
  return (
    <p
      data-testid="map-attribution"
      className={cn('z-10 whitespace-nowrap rounded-tl-[6px] bg-white/85 px-1.5 py-0.5 text-[11px] leading-4 text-fb-text-2', className)}
    >
      <a className={link} href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{' '}
      <a className={link} href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>{' '}
      Data from <a className={link} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
    </p>
  );
}

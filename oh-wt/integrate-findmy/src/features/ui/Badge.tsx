import { cn } from './cn';

export type BadgeProps = {
  count: number;
  /** Counts above max render as "max+". */
  max?: number;
  /** Absolute position on the top-right of a round button. */
  floating?: boolean;
  /** Accessible text; defaults to "<count> new". */
  label?: string;
  className?: string;
};

/** Red count badge. Renders nothing for 0. */
export function Badge({ count, max = 99, floating = false, label, className }: BadgeProps) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      data-testid="count-badge"
      className={cn(
        'inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-fb-red px-1 text-[12px] font-bold leading-none text-white',
        floating && 'absolute -right-1 -top-1 ring-2 ring-white',
        className,
      )}
    >
      <span aria-hidden>{text}</span>
      <span className="sr-only">{label ?? `${count} new`}</span>
    </span>
  );
}

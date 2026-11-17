import { cn } from './cn';

export function Divider({ className, soft = false }: { className?: string; soft?: boolean }) {
  return <hr className={cn('h-px w-full border-0', soft ? 'bg-fb-divider-soft' : 'bg-fb-divider', className)} />;
}

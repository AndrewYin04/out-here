import type { ReactNode } from 'react';
import { cn } from './cn';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 text-fb-text-2" aria-hidden>{icon}</div>}
      <p className="text-[17px] font-semibold text-fb-text">{title}</p>
      {body && <div className="max-w-sm text-fb-text-2">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

import clsx, { type ClassValue } from 'clsx';

/** Join class names; falsy values are dropped. */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

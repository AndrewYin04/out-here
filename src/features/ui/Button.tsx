import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tint';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-fb-blue text-white hover:bg-fb-blue-hover active:brightness-95',
  secondary: 'bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover',
  ghost: 'bg-transparent text-fb-text-2 hover:bg-fb-hover active:bg-fb-pressed',
  tint: 'bg-fb-blue-tint text-fb-blue hover:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3 text-[15px] gap-2',
  lg: 'h-11 px-4 text-[17px] gap-2',
};

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
};

export function buttonClass({ variant = 'primary', size = 'md', block = false }: Omit<Common, 'icon'> = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center rounded-btn font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
  );
}

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, size, icon, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClass({ variant, size, block }), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export type LinkButtonProps = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** A link styled as a Button, for actions that navigate. */
export function LinkButton({ variant, size, icon, block, className, children, href, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={cn(buttonClass({ variant, size, block }), className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

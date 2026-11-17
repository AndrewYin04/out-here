'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BRAND } from '@/config/brand';
import { Modal, cn } from '@/features/ui';
import { ROUTES } from './nav';

/** Round blue wordmark (neutral, not Facebook's logo). The text comes from BRAND.wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href={ROUTES.home}
      aria-label={`${BRAND.wordmark} home`}
      data-testid="wordmark"
      className={cn(
        'inline-flex h-10 shrink-0 items-center rounded-full bg-fb-blue px-3.5 text-[17px] font-bold tracking-tight text-white hover:bg-fb-blue-hover',
        className,
      )}
    >
      {BRAND.wordmark}
    </Link>
  );
}

/** Footer line plus an "About this demo" dialog. Shown in the left nav and on the mobile menu page. */
export function BrandFooter({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <footer className={cn('px-2 text-fb-meta text-fb-text-2', className)} data-testid="brand-footer">
      <p>{BRAND.footer}</p>
      <p className="mt-1">
        <button type="button" className="hover:underline" onClick={() => setOpen(true)}>
          About this demo
        </button>
        <span aria-hidden> · </span>
        <span>{BRAND.appName} 2026</span>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="About this demo" size="sm">
        <div className="space-y-3 text-[15px]">
          <p>
            {BRAND.appName} is a hackathon prototype of a Facebook-style tab: a live map of nearby plans
            you can join right now, planned with the Muse model.
          </p>
          <p>Everyone here is fictional. Use the avatar menu to switch between the 8 demo personas.</p>
          <p className="text-fb-text-2">{BRAND.footer}</p>
        </div>
      </Modal>
    </footer>
  );
}

'use client';
import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { SharingSheet } from './SharingSheet';

/** Map overlay button that opens your status and sharing settings. */
export function SharingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-fb-text shadow-popover hover:bg-[#F2F4F7]"
      >
        <MapPin size={18} aria-hidden />
        Your status
      </button>
      <SharingSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

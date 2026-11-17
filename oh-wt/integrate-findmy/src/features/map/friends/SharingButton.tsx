'use client';
import { MapPin, MapPinOff } from 'lucide-react';
import { useState } from 'react';
import { SharingSheet } from './SharingSheet';
import { useMyShare } from './useFindMy';

/** Map overlay button that opens your status and sharing settings; it reads "Sharing paused" while paused. */
export function SharingButton() {
  const [open, setOpen] = useState(false);
  const { data } = useMyShare();
  const paused = data?.share?.paused ?? false;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="sharing-button"
        data-paused={paused ? 'true' : undefined}
        className={`flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold shadow-popover hover:bg-[#F2F4F7] ${paused ? 'text-fb-text-2' : 'text-fb-text'}`}
      >
        {paused ? <MapPinOff size={18} aria-hidden /> : <MapPin size={18} aria-hidden />}
        {paused ? 'Sharing paused' : 'Your status'}
      </button>
      <SharingSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

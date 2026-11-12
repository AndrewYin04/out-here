'use client';
// Live GPS for the 3D view. The position stays in this browser: it moves the viewer's avatar and
// updates walking times, and nothing here sends it to the server. Sharing a location with
// friends stays the job of Find My (its own audience, precision, pause and expiry).
import { useCallback, useEffect, useRef, useState } from 'react';
import { acceptFix, fixHeading, normalizeDeg, type GpsFix } from './math';

export type GpsStatus = 'off' | 'asking' | 'on' | 'weak' | 'denied' | 'unavailable';

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type GpsReading = { fix: GpsFix | null; heading: number | null };

/**
 * `enabled` turns the watch on. The latest accepted fix and heading go into `reading.current`
 * (a ref, read every frame), and `status` changes re-render.
 */
export function useGps(enabled: boolean) {
  const [status, setStatus] = useState<GpsStatus>('off');
  const reading = useRef<GpsReading>({ fix: null, heading: null });

  useEffect(() => {
    if (!enabled) { setStatus('off'); reading.current = { fix: null, heading: null }; return; }
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setStatus('unavailable'); return; }
    setStatus('asking');
    let last: GpsFix | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix: GpsFix = {
          lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy,
          heading: p.coords.heading, speed: p.coords.speed, at: p.timestamp || Date.now(),
        };
        if (!acceptFix(last, fix)) { if (!last) setStatus('weak'); return; }
        last = fix;
        const course = fixHeading(fix);
        reading.current = { fix, heading: course ?? reading.current.heading };
        setStatus('on');
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );

    // Compass: used for the heading while standing still (the GPS course needs movement).
    const onOrient = (e: Event) => {
      const o = e as OrientationEventWithCompass;
      let h: number | null = null;
      if (typeof o.webkitCompassHeading === 'number') h = o.webkitCompassHeading;
      else if (o.absolute && typeof o.alpha === 'number') h = 360 - o.alpha;
      if (h == null) return;
      const moving = reading.current.fix && reading.current.fix.speed != null && reading.current.fix.speed >= 0.6;
      if (!moving) reading.current = { ...reading.current, heading: normalizeDeg(h) };
    };
    const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evt, onOrient);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.removeEventListener(evt, onOrient);
    };
  }, [enabled]);

  /** iPhone Safari asks for compass access only from a tap; call this from the button's click. */
  const requestCompass = useCallback(async () => {
    const D = (typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined) as unknown as OrientationPermission | undefined;
    if (D?.requestPermission) {
      try { await D.requestPermission(); } catch { /* no compass: the GPS course still turns the avatar */ }
    }
  }, []);

  return { status, reading, requestCompass };
}

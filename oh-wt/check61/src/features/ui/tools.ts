'use client';
// Developer and rehearsal controls (Muse filter, Tour Meta HQ, Demo walk / Live GPS) stay off the
// stage (docs/UX_PLAN.md). Open them with ?tools=1 (remembered for this tab); tests always see them.
import { useEffect, useState } from 'react';

const KEY = 'outhere.tools';

export function demoToolsOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search).get('tools');
    if (p === '1') window.sessionStorage.setItem(KEY, '1');
    if (p === '0') window.sessionStorage.removeItem(KEY);
    return navigator.webdriver === true || window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return navigator.webdriver === true;
  }
}

export function useDemoTools(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(demoToolsOn()), []);
  return on;
}

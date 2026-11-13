'use client';

import { Check, RotateCcw, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BRAND } from '@/config/brand';
import { apiFetch, useChannel } from '@/features/data';
import { Avatar, MenuItem, MenuLabel, MenuLink, MenuSeparator, Popover, Skeleton } from '@/features/ui';
import { ROUTES } from './nav';
import { useShellData } from './ShellDataProvider';

const DEMO_KEY = 'outhere-demo-key';

/**
 * Demo control: put the story back to "now" (plans, seats, free times, invites, shared plans).
 * Two taps, so it can't happen by accident. On the deployed demo it needs the demo key, which
 * the presenter loads once by opening the app with ?demoKey=…
 */
function ResetDemoItem() {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  const run = async () => {
    if (busy) return;
    if (!armed) { setArmed(true); setError(null); return; }
    setBusy(true);
    try {
      let key: string | null = null;
      try { key = window.sessionStorage.getItem(DEMO_KEY); } catch { /* storage blocked */ }
      await apiFetch('/api/demo/reset', { method: 'POST', headers: key ? { 'x-demo-key': key } : {} });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error && /demo key/.test(e.message) ? 'Needs the demo key: open the app once with ?demoKey=…' : 'Couldn’t reset. Try again.');
      setBusy(false);
      setArmed(false);
    }
  };
  return (
    <>
      <MenuItem
        icon={<RotateCcw size={20} aria-hidden />}
        description={armed ? 'Tap again: plans, seats and free times go back to now' : 'Plans, seats and free times back to now'}
        onSelect={() => void run()}
        className={armed ? 'bg-[#FDE8EA]' : undefined}
      >
        <span data-testid="reset-demo" className={armed ? 'font-semibold text-fb-red' : undefined}>
          {busy ? 'Resetting…' : armed ? 'Tap again to reset' : 'Reset demo'}
        </span>
      </MenuItem>
      {error && <p role="alert" className="px-2 pb-1 text-[13px] text-fb-red">{error}</p>}
    </>
  );
}

/** The avatar button at the top right. Its menu hosts the demo persona switcher. */
export function AccountMenu() {
  const { viewer, personas, activeHandle, ready, switchPersona } = useShellData();
  // ?demoKey=… is remembered for this tab (the deployed demo's reset needs it).
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('demoKey');
    if (k) { try { window.sessionStorage.setItem(DEMO_KEY, k); } catch { /* storage blocked */ } }
  }, []);
  // Someone reset the demo: every open tab reloads into the fresh story.
  useChannel(['demo:reset'], () => window.location.reload());
  return (
    <Popover
      label="Account"
      width={360}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={ready ? `Account: ${viewer.name}` : 'Account'}
          data-testid="account-button"
          data-ready={ready}
          className="relative flex h-10 w-10 items-center justify-center rounded-full hover:brightness-95"
        >
          {ready ? (
            <Avatar src={viewer.avatarUrl} name={viewer.name} size={40} decorative />
          ) : (
            <Skeleton shape="circle" width={40} height={40} />
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          {ready && (
            <>
              <MenuLink
                href={ROUTES.profile(viewer.handle)}
                onNavigate={close}
                icon={<Avatar src={viewer.avatarUrl} name={viewer.name} size={36} decorative />}
                description="See your profile"
                className="shadow-card"
              >
                <span className="font-semibold">{viewer.name}</span>
              </MenuLink>
              <MenuSeparator />
            </>
          )}
          <MenuLabel>
            <span className="flex items-center gap-2">
              <UserRound size={18} aria-hidden /> Demo: switch persona
            </span>
          </MenuLabel>
          <p className="px-2 pb-2 text-fb-meta text-fb-text-2">
            Demo control, not a login. Each browser tab keeps its own persona.
          </p>
          <div role="group" aria-label="Demo personas" data-testid="persona-list">
            {personas.map((p) => {
              const current = p.handle === activeHandle;
              return (
                <MenuItem
                  key={p.handle}
                  selected={current}
                  icon={<Avatar src={p.avatarUrl} name={p.name} size={36} decorative />}
                  description={current ? 'Using now' : `@${p.handle}`}
                  onSelect={() => {
                    close();
                    if (!current) switchPersona(p.handle);
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    {p.name}
                    {current && <Check size={18} className="text-fb-blue" aria-hidden />}
                  </span>
                </MenuItem>
              );
            })}
          </div>
          <MenuSeparator />
          <ResetDemoItem />
          <MenuSeparator />
          <p className="px-2 pb-1 text-[12px] text-fb-text-2">{BRAND.footer}</p>
        </>
      )}
    </Popover>
  );
}

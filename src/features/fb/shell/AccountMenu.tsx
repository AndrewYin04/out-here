'use client';

import { Check, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { BRAND } from '@/config/brand';
import { apiFetch, useChannel } from '@/features/data';
import { Avatar, MenuItem, MenuLabel, MenuLink, MenuSeparator, Popover, Skeleton } from '@/features/ui';
import { ROUTES } from './nav';
import { useShellData } from './ShellDataProvider';

/** Presenter control for returning the shared story to the initial demo state. */
function ResetDemoItem() {
  const [armed, setArmed] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/demo/reset', { method: 'POST', headers: { 'x-demo-key': key.trim() } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error && /reset key/i.test(e.message)
        ? 'A valid presenter key is required.'
        : 'Couldn’t reset. Try again.');
      setBusy(false);
    } finally {
      setKey('');
    }
  };
  if (!armed) {
    return (
      <MenuItem
        icon={<RotateCcw size={20} aria-hidden />}
        description="Restore the shared demo story"
        onSelect={() => setArmed(true)}
      >
        <span data-testid="reset-demo">Reset demo</span>
      </MenuItem>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="space-y-2 px-2 py-1">
      <label className="block text-[13px] font-semibold">
        Presenter key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-btn border border-fb-divider px-2 py-1.5"
        />
      </label>
      <button type="submit" disabled={busy || !key.trim()} className="rounded-btn bg-fb-blue px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
        {busy ? 'Resetting…' : 'Reset shared demo'}
      </button>
      {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
    </form>
  );
}

/** The avatar button at the top right. Its menu hosts the demo persona switcher. */
export function AccountMenu() {
  const { viewer, personas, activeHandle, ready, switchPersona } = useShellData();
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

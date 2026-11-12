'use client';

import { Check, UserRound } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { Avatar, MenuItem, MenuLabel, MenuLink, MenuSeparator, Popover } from '@/features/ui';
import { ROUTES } from './nav';
import { useShellData } from './ShellDataProvider';

/** The avatar button at the top right. Its menu hosts the demo persona switcher. */
export function AccountMenu() {
  const { viewer, personas, activeHandle, switchPersona } = useShellData();
  return (
    <Popover
      label="Account"
      width={360}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Account: ${viewer.name}`}
          data-testid="account-button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full hover:brightness-95"
        >
          <Avatar src={viewer.avatarUrl} name={viewer.name} size={40} decorative />
        </button>
      )}
    >
      {(close) => (
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
          <p className="px-2 pb-1 text-[12px] text-fb-text-2">{BRAND.footer}</p>
        </>
      )}
    </Popover>
  );
}

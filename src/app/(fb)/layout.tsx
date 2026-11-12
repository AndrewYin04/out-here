import type { ReactNode } from 'react';
import { AppShell, ShellDataProvider } from '@/features/fb/shell';
import { getDemoShellData } from '@/features/fb/shell/server';

// Static demo data for the shell; the integration replaces it with live data-layer values
// passed through ShellDataProvider's `overrides` and `onSwitchPersona` props.
export default function FbLayout({ children }: { children: ReactNode }) {
  return (
    <ShellDataProvider data={getDemoShellData()}>
      <AppShell>{children}</AppShell>
    </ShellDataProvider>
  );
}

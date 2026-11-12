'use client';

import { Globe, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { apiPost } from '@/features/data';
import { Button, Card, LinkButton } from '@/features/ui';
import type { GroupView } from '@/shared/api';

export const membersLabel = (n: number) => `${n.toLocaleString('en-US')} member${n === 1 ? '' : 's'}`;

/** Cover image, or a tinted block with the group's initial when there is none. */
export function GroupCover({ group, className }: { group: Pick<GroupView, 'coverUrl' | 'name'>; className?: string }) {
  if (group.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={group.coverUrl} alt="" className={`object-cover ${className ?? ''}`} />;
  }
  return (
    <div aria-hidden className={`flex items-center justify-center bg-gradient-to-br from-[#5B8DEF] to-[#9B6BEF] text-4xl font-bold text-white ${className ?? ''}`}>
      {group.name.charAt(0)}
    </div>
  );
}

export function PrivacyLine({ group }: { group: Pick<GroupView, 'privacy' | 'memberCount'> }) {
  const Icon = group.privacy === 'public' ? Globe : Lock;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon size={14} aria-hidden />
      {group.privacy === 'public' ? 'Public group' : 'Private group'} · <strong className="font-semibold">{membersLabel(group.memberCount)}</strong>
    </span>
  );
}

/** Grid card for Discover and Your groups. Join works in place, then becomes "Visit group". */
export function GroupCard({ group: initial }: { group: GroupView }) {
  const [group, setGroup] = useState(initial);
  const [busy, setBusy] = useState(false);
  const href = `/groups/${group.slug}`;
  const join = async () => {
    setBusy(true);
    try {
      const r = await apiPost<{ group: GroupView }>(`/api/groups/${group.slug}/join`);
      setGroup(r.group);
    } catch { /* stays joinable */ } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col overflow-hidden" data-testid="group-card">
      <Link href={href} tabIndex={-1} aria-hidden>
        <GroupCover group={group} className="h-[140px] w-full" />
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link href={href} className="line-clamp-2 text-[17px] font-semibold leading-[22px] text-fb-text hover:underline">{group.name}</Link>
        <p className="text-fb-meta text-fb-text-2">
          {membersLabel(group.memberCount)}
          {group.friendMemberCount > 0 && ` · ${group.friendMemberCount} friend${group.friendMemberCount === 1 ? '' : 's'}`}
        </p>
        <div className="mt-auto pt-2">
          {group.viewerRole ? (
            <LinkButton href={href} variant="secondary" block>Visit group</LinkButton>
          ) : (
            <Button variant="tint" block onClick={join} disabled={busy} aria-label={`Join ${group.name}`}>Join group</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

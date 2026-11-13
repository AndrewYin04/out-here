'use client';

import { Gift, MoreHorizontal, Search, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useApi, useViewer } from '@/features/data';
import { CardGridSkeleton, ListSkeleton, PageHeader, ROUTES, useShellData } from '@/features/fb/shell';
import { Avatar, Card, EmptyState, MenuItem, MenuLink, Popover, useToast } from '@/features/ui';
import type { FriendRequestView, FriendsResponse, PersonCard } from '@/shared/api';
import { errorText, GONE_NOTE, isGone, MESSENGER_TO_READY, removeFriend, respondRequest, sendRequest } from './api';
import { ListsManager } from './ListsManager';
import { mutualLabel, PersonTile, TileGrid } from './PersonTile';

export type FriendsTab = 'home' | 'requests' | 'suggestions' | 'all' | 'birthdays' | 'lists';

type RequestsResponse = { incoming: FriendRequestView[]; outgoing: FriendRequestView[] };

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between bg-fb-surface px-4 pb-1 pt-4 first:mt-0 md:mt-0 md:bg-transparent md:px-0 md:pb-3">
      <h2 className="text-[20px] font-bold leading-6 text-fb-text">{title}</h2>
      {action}
    </div>
  );
}

const seeAll = (href: string) => (
  <Link href={href} className="rounded-btn px-2 py-1 text-[15px] text-fb-link hover:bg-fb-hover">
    See all
  </Link>
);

/** Keeps people the viewer just acted on visible with a note, the way Facebook does. */
function useActed() {
  const [acted, setActed] = useState<Record<string, { person: PersonCard; note: string }>>({});
  const mark = (person: PersonCard, note: string) => setActed((a) => ({ ...a, [person.id]: { person, note } }));
  const merge = (people: PersonCard[]) => {
    const ids = new Set(people.map((p) => p.id));
    return [...people, ...Object.values(acted).filter((a) => !ids.has(a.person.id)).map((a) => a.person)];
  };
  return { acted, mark, merge };
}

function RequestsGrid({ limit, title, showSent }: { limit?: number; title: string; showSent?: boolean }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const { data, error, refetch } = useApi<RequestsResponse>('/api/friends/requests', [`user:${viewer.id}`]);
  const inc = useActed();
  const out = useActed();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (p: PersonCard, action: 'confirm' | 'delete') => {
    setBusy(p.id);
    try {
      await respondRequest(p.id, action);
      inc.mark(p, action === 'confirm' ? 'Request accepted' : 'Request removed');
      refetch();
    } catch (e) {
      if (isGone(e)) {
        inc.mark(p, GONE_NOTE);
        refetch();
      } else {
        toast.show(errorText(e));
      }
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (p: PersonCard) => {
    setBusy(p.id);
    try {
      await removeFriend(p.id);
      out.mark(p, 'Request canceled');
      refetch();
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <EmptyState title="Couldn't load friend requests" body={error} />;
  if (!data) return <CardGridSkeleton label="friend requests" count={4} className="md:grid-cols-3 xl:grid-cols-4" />;

  const incoming = inc.merge(data.incoming.map((r) => r.person));
  const shown = limit ? incoming.slice(0, limit) : incoming;
  const outgoing = out.merge(data.outgoing.map((r) => r.person));

  return (
    <section aria-label={title}>
      <SectionTitle
        title={title}
        action={limit && incoming.length > limit ? seeAll(`${ROUTES.friends}?tab=requests`) : undefined}
      />
      {shown.length === 0 ? (
        <Card flushOnMobile>
          <EmptyState icon={<UserPlus size={40} />} title="No new requests" body="When you have friend requests, you'll see them here." />
        </Card>
      ) : (
        <TileGrid label="Friend requests">
          {shown.map((p) => (
            <PersonTile
              key={p.id}
              person={p}
              note={inc.acted[p.id]?.note}
              primary={{ label: 'Confirm', onClick: () => act(p, 'confirm'), disabled: busy === p.id }}
              secondary={{ label: 'Delete', onClick: () => act(p, 'delete'), disabled: busy === p.id }}
            />
          ))}
        </TileGrid>
      )}
      {showSent && outgoing.length > 0 && (
        <>
          <SectionTitle title="Sent requests" />
          <TileGrid label="Sent requests">
            {outgoing.map((p) => (
              <PersonTile
                key={p.id}
                person={p}
                note={out.acted[p.id]?.note}
                secondary={{ label: 'Cancel request', onClick: () => cancel(p), disabled: busy === p.id }}
              />
            ))}
          </TileGrid>
        </>
      )}
    </section>
  );
}

function SuggestionsGrid({ limit, title }: { limit?: number; title: string }) {
  const toast = useToast();
  const { data, error } = useApi<{ people: PersonCard[] }>('/api/friends/suggestions');
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (p: PersonCard) => {
    setBusy(p.id);
    try {
      await sendRequest(p.id);
      setSent((s) => ({ ...s, [p.id]: true }));
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (p: PersonCard) => {
    setBusy(p.id);
    try {
      await removeFriend(p.id);
      setSent((s) => ({ ...s, [p.id]: false }));
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <EmptyState title="Couldn't load suggestions" body={error} />;
  if (!data) return <CardGridSkeleton label="friend suggestions" count={8} className="md:grid-cols-3 xl:grid-cols-4" />;
  const people = data.people.filter((p) => !hidden[p.id]);
  const shown = limit ? people.slice(0, limit) : people;

  return (
    <section aria-label={title}>
      <SectionTitle title={title} action={limit && people.length > limit ? seeAll(`${ROUTES.friends}?tab=suggestions`) : undefined} />
      {shown.length === 0 ? (
        <Card flushOnMobile>
          <EmptyState icon={<Users size={40} />} title="No suggestions right now" body="When you have friend suggestions, you'll see them here." />
        </Card>
      ) : (
        <TileGrid label="People you may know">
          {shown.map((p) =>
            sent[p.id] ? (
              <PersonTile
                key={p.id}
                person={p}
                primary={{ label: 'Request sent', onClick: () => undefined, variant: 'tint', disabled: true }}
                secondary={{ label: 'Cancel', onClick: () => cancel(p), disabled: busy === p.id }}
              />
            ) : (
              <PersonTile
                key={p.id}
                person={p}
                primary={{ label: 'Add friend', onClick: () => add(p), disabled: busy === p.id }}
                secondary={{ label: 'Remove', onClick: () => setHidden((h) => ({ ...h, [p.id]: true })) }}
              />
            ),
          )}
        </TileGrid>
      )}
    </section>
  );
}

function AllFriends() {
  const { viewer } = useViewer();
  const toast = useToast();
  const { data, error, refetch } = useApi<FriendsResponse>('/api/friends', [`user:${viewer.id}`]);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.friends ?? []).filter((f) => !needle || f.name.toLowerCase().includes(needle));
  }, [data, q]);

  const unfriend = async (p: PersonCard) => {
    try {
      await removeFriend(p.id);
      toast.show(`You unfriended ${p.name}`);
      refetch();
    } catch (e) {
      toast.show(errorText(e));
    }
  };

  return (
    <section aria-label="All friends">
      <PageHeader title="All friends" subtitle={data ? `${data.friends.length} friends` : undefined} />
      <Card flushOnMobile className="p-2">
        <label className="mb-1 flex h-9 items-center gap-2 rounded-pill bg-fb-input px-3">
          <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
          <span className="sr-only">Search friends</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search friends"
            className="w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
          />
        </label>
        {error ? (
          <EmptyState title="Couldn't load your friends" body={error} />
        ) : !data ? (
          <ListSkeleton label="friends" rows={8} avatar={60} />
        ) : filtered.length === 0 ? (
          <EmptyState title={q ? `No results for "${q}"` : 'No friends yet'} />
        ) : (
          <ul aria-label="Friends list">
            {filtered.map((f) => (
              <li key={f.id} data-testid="friend-row" className="flex items-center gap-3 rounded-card px-2 py-2 hover:bg-fb-hover">
                <Link href={ROUTES.profile(f.handle)} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={f.avatarUrl} name={f.name} size={60} online={f.online} decorative />
                  <span className="min-w-0">
                    <span className="block truncate text-[17px] font-semibold leading-[22px] text-fb-text">{f.name}</span>
                    {f.mutualFriendCount > 0 && (
                      <span className="block text-fb-meta text-fb-text-2">{mutualLabel(f.mutualFriendCount)}</span>
                    )}
                  </span>
                </Link>
                <Popover
                  label={`Options for ${f.name}`}
                  align="right"
                  width={260}
                  trigger={(props) => (
                    <button
                      {...props}
                      type="button"
                      aria-label={`More options for ${f.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover"
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {MESSENGER_TO_READY && (
                        <MenuLink href={ROUTES.chatWith(f.handle)} onNavigate={close}>
                          Message {f.name.split(' ')[0]}
                        </MenuLink>
                      )}
                      <MenuItem
                        onSelect={() => {
                          close();
                          void unfriend(f);
                        }}
                      >
                        Unfriend
                      </MenuItem>
                    </>
                  )}
                </Popover>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function Birthdays() {
  const { birthdays, ready } = useShellData();
  return (
    <section aria-label="Birthdays">
      <PageHeader title="Birthdays" />
      <Card flushOnMobile className="p-2">
        <h2 className="px-2 pb-2 pt-1 text-[17px] font-semibold text-fb-text">Today&apos;s birthdays</h2>
        {!ready ? (
          <ListSkeleton label="birthdays" rows={1} avatar={60} />
        ) : birthdays.length === 0 ? (
          <EmptyState icon={<Gift size={40} />} title="No birthdays today" />
        ) : (
          <ul>
            {birthdays.map((b) => (
              <li key={b.handle}>
                <Link href={ROUTES.profile(b.handle)} className="flex items-center gap-3 rounded-card px-2 py-2 hover:bg-fb-hover">
                  <Avatar src={b.avatarUrl} name={b.name} size={60} decorative />
                  <span>
                    <span className="block text-[17px] font-semibold text-fb-text">{b.name}</span>
                    <span className="block text-fb-meta text-fb-text-2">Wish {b.name.split(' ')[0]} a happy birthday</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

/** Content column of /friends for the selected section row. */
export function FriendsView({ tab }: { tab: FriendsTab }) {
  return (
    <div className="pb-6" data-testid={`friends-${tab}`}>
      {tab === 'home' && (
        <>
          <RequestsGrid title="Friend requests" limit={8} />
          <SuggestionsGrid title="People you may know" limit={12} />
        </>
      )}
      {tab === 'requests' && <RequestsGrid title="Friend requests" showSent />}
      {tab === 'suggestions' && <SuggestionsGrid title="People you may know" />}
      {tab === 'all' && <AllFriends />}
      {tab === 'birthdays' && <Birthdays />}
      {tab === 'lists' && <ListsManager />}
    </div>
  );
}

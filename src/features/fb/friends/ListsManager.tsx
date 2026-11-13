'use client';

import { ChevronDown, ChevronRight, ListPlus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useApi } from '@/features/data';
import { ListSkeleton, PageHeader } from '@/features/fb/shell';
import { Avatar, AvatarStack, Button, Card, EmptyState, useToast } from '@/features/ui';
import type { FriendListsResponse, FriendsResponse, PersonCard } from '@/shared/api';
import type { FriendList } from '@/shared/types';
import { addToList, createList, errorText, removeFromList } from './api';

const memberLabel = (n: number) => (n === 1 ? '1 member' : `${n} members`);

function ListEditor({ list, friends, onChange }: { list: FriendList; friends: PersonCard[]; onChange: (l: FriendList) => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const members = friends.filter((f) => list.memberIds.includes(f.id));
  const needle = q.trim().toLowerCase();
  const others = friends.filter((f) => !list.memberIds.includes(f.id) && (!needle || f.name.toLowerCase().includes(needle)));

  const run = async (userId: string, op: 'add' | 'remove') => {
    setBusy(userId);
    try {
      const { list: next } = op === 'add' ? await addToList(list.id, userId) : await removeFromList(list.id, userId);
      onChange(next);
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const row = (f: PersonCard, action: 'add' | 'remove') => (
    <li key={f.id} className="flex items-center gap-3 rounded-card px-2 py-1.5">
      <Avatar src={f.avatarUrl} name={f.name} size={40} decorative />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fb-text">{f.name}</span>
      <Button
        size="sm"
        variant={action === 'add' ? 'tint' : 'secondary'}
        disabled={busy === f.id}
        onClick={() => run(f.id, action)}
        aria-label={`${action === 'add' ? 'Add' : 'Remove'} ${f.name} ${action === 'add' ? 'to' : 'from'} ${list.name}`}
      >
        {action === 'add' ? 'Add' : 'Remove'}
      </Button>
    </li>
  );

  return (
    <div className="border-t border-fb-divider-soft px-2 pb-3 pt-2" data-testid="list-editor">
      <h3 className="px-2 pb-1 text-[15px] font-semibold text-fb-text-2">In this list</h3>
      {members.length === 0 ? (
        <p className="px-2 pb-2 text-fb-meta text-fb-text-2">No one yet. Add friends below.</p>
      ) : (
        <ul aria-label={`Members of ${list.name}`}>{members.map((f) => row(f, 'remove'))}</ul>
      )}
      <h3 className="px-2 pb-1 pt-3 text-[15px] font-semibold text-fb-text-2">Add friends</h3>
      <label className="mx-2 mb-1 flex h-9 items-center gap-2 rounded-pill bg-fb-input px-3 focus-within:ring-2 focus-within:ring-fb-blue">
        <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
        <span className="sr-only">Search friends to add</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search friends"
          className="w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
        />
      </label>
      {others.length === 0 ? (
        <p className="px-2 py-2 text-fb-meta text-fb-text-2">{needle ? 'No matching friends' : 'All your friends are in this list'}</p>
      ) : (
        <ul aria-label={`Friends not in ${list.name}`} className="max-h-[320px] overflow-y-auto">
          {others.map((f) => row(f, 'add'))}
        </ul>
      )}
    </div>
  );
}

/** Custom lists: Close friends (seeded) plus lists the viewer creates; members are friends only. */
export function ListsManager() {
  const toast = useToast();
  const lists = useApi<FriendListsResponse>('/api/friend-lists');
  const friends = useApi<FriendsResponse>('/api/friends');
  const [local, setLocal] = useState<Record<string, FriendList>>({});
  const [created, setCreated] = useState<FriendList[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const all = useMemo(() => {
    const base = lists.data?.lists ?? [];
    const ids = new Set(base.map((l) => l.id));
    return [...base, ...created.filter((l) => !ids.has(l.id))].map((l) => local[l.id] ?? l);
  }, [lists.data, created, local]);
  const byId = useMemo(() => new Map((friends.data?.friends ?? []).map((f) => [f.id, f])), [friends.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      const { list } = await createList(n);
      setCreated((c) => [...c, list]);
      setName('');
      setOpen(list.id);
    } catch (err) {
      toast.show(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Custom lists">
      <PageHeader title="Custom lists" subtitle="Choose who sees your posts and your location on Out Here." />
      <Card flushOnMobile className="mb-3 p-3">
        <form onSubmit={submit} className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-btn bg-fb-input px-3 focus-within:ring-2 focus-within:ring-fb-blue">
            <ListPlus size={18} className="shrink-0 text-fb-text-2" aria-hidden />
            <span className="sr-only">List name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="New list name"
              className="w-full bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
            />
          </label>
          <Button type="submit" disabled={saving || !name.trim()}>
            Create list
          </Button>
        </form>
      </Card>
      <Card flushOnMobile className="overflow-hidden">
        {lists.error ? (
          <EmptyState title="Couldn't load your lists" body={lists.error} />
        ) : !lists.data || !friends.data ? (
          <ListSkeleton label="friend lists" rows={2} avatar={40} />
        ) : all.length === 0 ? (
          <EmptyState title="No lists yet" body="Create a list to share with just a few friends." />
        ) : (
          <ul aria-label="Your lists">
            {all.map((l) => {
              const people = l.memberIds.map((id) => byId.get(id)).filter((p): p is PersonCard => Boolean(p));
              const expanded = open === l.id;
              return (
                <li key={l.id} data-testid="friend-list" data-name={l.name} className="border-b border-fb-divider-soft last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : l.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fb-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-semibold text-fb-text">{l.name}</span>
                      <span className="block text-fb-meta text-fb-text-2" data-testid="list-count">{memberLabel(l.memberIds.length)}</span>
                    </span>
                    {people.length > 0 && <AvatarStack people={people.map((p) => ({ name: p.name, src: p.avatarUrl }))} size={28} max={5} />}
                    {expanded ? <ChevronDown size={20} className="text-fb-text-2" aria-hidden /> : <ChevronRight size={20} className="text-fb-text-2" aria-hidden />}
                  </button>
                  {expanded && (
                    <ListEditor list={l} friends={friends.data?.friends ?? []} onChange={(next) => setLocal((m) => ({ ...m, [next.id]: next }))} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

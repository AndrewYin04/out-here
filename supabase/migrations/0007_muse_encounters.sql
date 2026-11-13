-- Server-owned encounter ledger; never readable/writable by browser keys.
create table if not exists public.muse_encounters (
  id uuid primary key,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  request_key uuid not null,
  status text not null check (status in ('pending','completed','error','cancelled','timeout')),
  version integer not null default 0,
  expires_at timestamptz not null,
  session jsonb not null,
  unique (initiator_id, request_key)
);
create unique index if not exists muse_encounters_one_pending on public.muse_encounters(initiator_id) where status = 'pending';
alter table public.muse_encounters enable row level security;

create or replace function public.expire_muse_encounters(owner_id uuid) returns void
language sql security invoker set search_path = public as $$
  update public.muse_encounters set status = 'timeout', version = version + 1,
    session = session || jsonb_build_object('status','timeout','failure','stale_session',
      'version',version + 1,'updatedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    where initiator_id = owner_id and status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_muse_encounters(uuid) from public, anon, authenticated;
grant execute on function public.expire_muse_encounters(uuid) to service_role;

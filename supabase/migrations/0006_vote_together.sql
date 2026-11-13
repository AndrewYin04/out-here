-- Plan together, part 2: voting and confirming are one transaction.
-- vote_together(plan, user, quest, in):
--   1. locks the plan row, so two members tapping "I'm in" at once are applied one after the
--      other and neither vote is lost;
--   2. records this member's vote;
--   3. if every member is now in on one option, locks that quest row, checks there are seats
--      for every member not already in, and either joins them all and confirms the plan, or
--      joins nobody and marks that option full (the plan stays open). Never a split group.
-- Returns one row: out_status ('proposing' | 'confirmed' | 'expired'), out_quest (the confirmed
-- quest or the one that was full), out_seats (seats left on it after this call, or null).

create or replace function public.vote_together(p_plan uuid, p_user uuid, p_quest uuid, p_in boolean)
returns table (out_status text, out_quest uuid, out_seats integer)
language plpgsql
set search_path = public
as $$
declare
  p        public.together_plans%rowtype;
  q        public.quests%rowtype;
  v_mine   jsonb;
  v_votes  jsonb;
  v_agreed uuid;
  v_taken  integer;
  v_needed integer;
  v_quest_found boolean;
begin
  select * into p from public.together_plans where id = p_plan for update;
  if not found or not (p_user = any (p.member_ids)) then
    raise exception 'plan_not_found' using errcode = 'P0002', detail = p_plan::text;
  end if;
  if p.status <> 'proposing' or p.expires_at <= now() then
    return query select case when p.status = 'proposing' then 'expired' else p.status end, p.confirmed_quest_id, null::integer;
    return;
  end if;
  if not exists (select 1 from jsonb_array_elements(p.options) o where o ->> 'questId' = p_quest::text) then
    raise exception 'not_an_option' using errcode = 'P0001', detail = p_quest::text;
  end if;

  -- this member's votes, without p_quest, then with it if they are in
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_mine
    from jsonb_array_elements_text(coalesce(p.votes -> p_user::text, '[]'::jsonb)) as x
   where x <> p_quest::text;
  if p_in then
    v_mine := v_mine || to_jsonb(p_quest::text);
  end if;
  v_votes := jsonb_set(coalesce(p.votes, '{}'::jsonb), array[p_user::text], v_mine, true);
  update public.together_plans set votes = v_votes where id = p_plan;

  -- the first option (in Muse's order) every member is in on, skipping ones already full
  select (t.o ->> 'questId')::uuid into v_agreed
    from jsonb_array_elements(p.options) with ordinality as t(o, i)
   where coalesce((t.o ->> 'seatsLeft')::integer, 1) > 0
     and not exists (
       select 1 from unnest(p.member_ids) as m(id)
        where not (coalesce(v_votes -> m.id::text, '[]'::jsonb) ? (t.o ->> 'questId')))
   order by t.i
   limit 1;
  if v_agreed is null then
    return query select 'proposing'::text, null::uuid, null::integer;
    return;
  end if;

  select * into q from public.quests where id = v_agreed for update;
  v_quest_found := found;
  select count(*) into v_taken from public.quest_members where quest_id = v_agreed;
  select count(*) into v_needed from unnest(p.member_ids) as m(id)
   where not exists (select 1 from public.quest_members qm where qm.quest_id = v_agreed and qm.user_id = m.id);

  if not v_quest_found or q.status = 'done' or v_taken + v_needed > q.capacity then
    -- not enough seats for everyone: nobody joins; the option shows as full and the plan stays open
    update public.together_plans
       set options = (select jsonb_agg(case when t.o ->> 'questId' = v_agreed::text
                                            then jsonb_set(t.o, '{seatsLeft}', '0'::jsonb) else t.o end
                                       order by t.i)
                        from jsonb_array_elements(p.options) with ordinality as t(o, i))
     where id = p_plan;
    return query select 'proposing'::text, v_agreed, greatest(coalesce(q.capacity, 0) - v_taken, 0);
    return;
  end if;

  insert into public.quest_members (quest_id, user_id, via_friend_id)
  select v_agreed, m.id, null from unnest(p.member_ids) as m(id)
  on conflict do nothing;
  v_taken := v_taken + v_needed;
  if v_taken >= q.capacity and q.status = 'open' then
    update public.quests set status = 'full' where id = v_agreed;
  end if;
  update public.together_plans set status = 'confirmed', confirmed_quest_id = v_agreed where id = p_plan;
  return query select 'confirmed'::text, v_agreed, q.capacity - v_taken;
end;
$$;

revoke all on function public.vote_together(uuid, uuid, uuid, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.vote_together(uuid, uuid, uuid, boolean) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.vote_together(uuid, uuid, uuid, boolean) to service_role';
  end if;
end;
$$;

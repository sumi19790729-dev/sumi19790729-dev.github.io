-- 첫 페이지 방문 집계. Supabase SQL Editor에서 postgres 역할로 한 번 실행한다.
-- 이름, 이메일, IP, 브라우저 지문은 저장하지 않는다.
-- 과거 날짜의 방문 수는 넣지 않는다.

create table if not exists public.visit_days (
  day date primary key,
  visits integer not null default 0 check (visits >= 0)
);

create table if not exists public.visit_seen (
  visitor_key text not null,
  day date not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (visitor_key, day),
  check (visitor_key ~ '^[0-9a-f]{32}$')
);

alter table public.visit_days enable row level security;
alter table public.visit_seen enable row level security;

revoke all on table public.visit_days from public, anon, authenticated;
revoke all on table public.visit_seen from public, anon, authenticated;

create or replace function public.record_home_visit(p_visitor_key text)
returns table (
  today_visits integer,
  total_visits bigint,
  started_on date,
  visit_day date,
  counted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.timezone('Asia/Seoul', pg_catalog.now()))::date;
  v_inserted integer := 0;
  v_recent integer := 0;
begin
  if p_visitor_key is null or p_visitor_key !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid visitor key' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.visit_seen
    where visitor_key = p_visitor_key
      and day = v_day
  ) then
    select count(*) into v_recent
    from public.visit_seen
    where created_at > pg_catalog.now() - interval '1 minute';

    if v_recent >= 60 then
      raise exception 'visit rate limit' using errcode = '54000';
    end if;

    insert into public.visit_seen (visitor_key, day)
    values (p_visitor_key, v_day)
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
  end if;

  if v_inserted = 1 then
    insert into public.visit_days (day, visits)
    values (v_day, 1)
    on conflict (day) do update
      set visits = public.visit_days.visits + 1;
  end if;

  delete from public.visit_seen
  where day < v_day;

  return query
  select
    coalesce((select d.visits from public.visit_days as d where d.day = v_day), 0),
    coalesce((select sum(d.visits)::bigint from public.visit_days as d), 0),
    (select min(d.day) from public.visit_days as d),
    v_day,
    (v_inserted = 1);
end;
$$;

revoke all on function public.record_home_visit(text) from public;
grant execute on function public.record_home_visit(text) to anon, authenticated;

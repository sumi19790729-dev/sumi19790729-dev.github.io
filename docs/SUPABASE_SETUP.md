# Supabase 무료 프로젝트 설정 (회원 인증 + Q&A)

이 문서는 홈페이지에 키를 넣기 **전** 절차다.  
검증이 끝나기 전에는 Q&A를 활성화 완료로 표시하지 않는다.

유료 플랜은 신청하지 않는다. KPI 원본·백업·`workshop_deploy`·기존 Private 저장소는 변경하지 않는다.  
`service_role` 키는 GitHub Pages나 채팅에 넣지 않는다.

나중에 채팅에 붙여 넣을 값:

- Project URL (`https://xxxx.supabase.co`)
- `anon` `public` API key
- 관리자로 지정할 이메일 주소

## 1. 계정과 Free 프로젝트

1. https://supabase.com → GitHub(`sumi19790729-dev`)로 가입/로그인
2. 요금제 **Free** 유지
3. **New project** 이름 예: `ai-research-lab`
4. Database password는 안전한 곳에만 보관
5. Region 예: Northeast Asia
6. 상태가 `Healthy`가 될 때까지 대기

## 2. 이메일 인증

1. **Authentication → Sign In / Providers → Email** Enabled
2. Confirm email: **On**
3. 소셜 로그인은 이 단계에서 끄고 둔다
4. **Authentication → URL Configuration**
   - Site URL: `https://sumi19790729-dev.github.io`
   - Redirect URLs:
     - `https://sumi19790729-dev.github.io/**`
     - `https://sumi19790729-dev.github.io/login.html`
     - `http://localhost:5500/**`
     - `http://127.0.0.1:5500/**`
     - `http://localhost:8501/**`

## 3. 최종 SQL (SQL Editor에 한 번에 붙여 넣기)

최종 검증에서 고친 점:

- 트리거는 `SECURITY INVOKER`를 유지한다. `current_user`로 회원 세션과 `postgres` 관리 작업을 구분한다
- 트리거 함수 `EXECUTE`를 모두 회수하면 프로필·질문 INSERT가 실패한다. 그래서 함수는 API에 안 열리는 `private` 스키마에 두고, `authenticated`에만 실행을 허용한다
- `author_id`는 INSERT 컬럼 GRANT에 넣지 않는다. `DEFAULT auth.uid()`와 BEFORE 트리거가 채운 뒤 RLS WITH CHECK가 같은 값을 확인한다
- PostgREST 단일 INSERT는 JSON에 없는 컬럼을 DEFAULT로 넣는다. `author_id`에 DEFAULT가 없으면 NULL이 들어가 트리거에만 의존하게 되므로 DEFAULT를 둔다
- 클라이언트가 `author_id`를 보내면 컬럼 GRANT에서 거절된다. 질문 INSERT는 `title, body, related_ai`만 보낸다
- `rls_auto_enable()` 제한은 함수가 있을 때만 시도하고, 권한이 없으면 나머지를 중단하지 않는다

```sql
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant usage on schema public to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  organization text not null,
  work_field text not null,
  privacy_agreed_at timestamptz not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  related_ai text not null,
  status text not null default 'pending' check (status in ('pending', 'answered')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists answers_one_per_question
  on public.answers (question_id);

alter table public.questions
  alter column author_id set default auth.uid();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.is_admin
      from public.profiles as p
      where p.id = auth.uid()
    ),
    false
  );
$$;

alter function public.is_admin() owner to postgres;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

drop trigger if exists trg_protect_profile_admin_flag on public.profiles;
drop trigger if exists trg_protect_question_privileged_columns on public.questions;
drop function if exists public.protect_profile_admin_flag();
drop function if exists public.protect_question_privileged_columns();
drop function if exists private.protect_profile_admin_flag();
drop function if exists private.protect_question_privileged_columns();

create or replace function private.protect_profile_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.is_admin := false;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin
       and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'is_admin can only be changed by a database administrator'
        using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  return new;
end;
$$;

create or replace function private.protect_question_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.author_id := auth.uid();
      new.is_public := false;
      new.status := 'pending';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      new.author_id := old.author_id;
      new.is_public := old.is_public;
      new.status := old.status;
    end if;
    new.updated_at := now();
    return new;
  end if;
  return new;
end;
$$;

alter function private.protect_profile_admin_flag() owner to postgres;
alter function private.protect_question_privileged_columns() owner to postgres;
revoke all on function private.protect_profile_admin_flag() from public, anon, authenticated;
revoke all on function private.protect_question_privileged_columns() from public, anon, authenticated;
grant execute on function private.protect_profile_admin_flag() to authenticated;
grant execute on function private.protect_question_privileged_columns() to authenticated;

create trigger trg_protect_profile_admin_flag
  before insert or update on public.profiles
  for each row
  execute function private.protect_profile_admin_flag();

create trigger trg_protect_question_privileged_columns
  before insert or update on public.questions
  for each row
  execute function private.protect_question_privileged_columns();

create or replace function public.admin_set_question_public(
  p_question_id uuid,
  p_is_public boolean
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.questions;
begin
  if not public.is_admin() then
    raise exception 'admin only'
      using errcode = '42501';
  end if;

  update public.questions as q
  set
    is_public = p_is_public,
    updated_at = now()
  where q.id = p_question_id
  returning * into result;

  if result.id is null then
    raise exception 'question not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.admin_set_question_status(
  p_question_id uuid,
  p_status text
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.questions;
begin
  if not public.is_admin() then
    raise exception 'admin only'
      using errcode = '42501';
  end if;

  if p_status not in ('pending', 'answered') then
    raise exception 'invalid status'
      using errcode = '22023';
  end if;

  update public.questions as q
  set
    status = p_status,
    updated_at = now()
  where q.id = p_question_id
  returning * into result;

  if result.id is null then
    raise exception 'question not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.admin_reply_to_question(
  p_question_id uuid,
  p_body text
)
returns public.answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.answers;
begin
  if not public.is_admin() then
    raise exception 'admin only'
      using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'answer body is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.questions as q
    where q.id = p_question_id
  ) then
    raise exception 'question not found'
      using errcode = 'P0002';
  end if;

  insert into public.answers (question_id, admin_id, body)
  values (p_question_id, auth.uid(), trim(p_body))
  on conflict (question_id) do update
    set
      body = excluded.body,
      admin_id = excluded.admin_id,
      updated_at = now()
  returning * into result;

  update public.questions as q
  set
    status = 'answered',
    updated_at = now()
  where q.id = p_question_id;

  return result;
end;
$$;

alter function public.admin_set_question_public(uuid, boolean) owner to postgres;
alter function public.admin_set_question_status(uuid, text) owner to postgres;
alter function public.admin_reply_to_question(uuid, text) owner to postgres;
revoke all on function public.admin_set_question_public(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_question_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reply_to_question(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_question_public(uuid, boolean) to authenticated;
grant execute on function public.admin_set_question_status(uuid, text) to authenticated;
grant execute on function public.admin_reply_to_question(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.answers from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (
  id, email, full_name, organization, work_field, privacy_agreed_at
) on table public.profiles to authenticated;
grant update (
  email, full_name, organization, work_field, privacy_agreed_at
) on table public.profiles to authenticated;

grant select on table public.questions to anon, authenticated;
grant insert (title, body, related_ai) on table public.questions to authenticated;
grant update (title, body, related_ai) on table public.questions to authenticated;

grant select on table public.answers to anon, authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_nonadmin" on public.profiles;
drop policy if exists "questions_select_public_or_own_or_admin" on public.questions;
drop policy if exists "questions_select_public_anon" on public.questions;
drop policy if exists "questions_select_authenticated" on public.questions;
drop policy if exists "questions_insert_own" on public.questions;
drop policy if exists "questions_update_own_content" on public.questions;
drop policy if exists "questions_update_admin" on public.questions;
drop policy if exists "answers_select_visible" on public.answers;
drop policy if exists "answers_select_public_anon" on public.answers;
drop policy if exists "answers_select_authenticated" on public.answers;
drop policy if exists "answers_insert_admin" on public.answers;
drop policy if exists "answers_update_admin" on public.answers;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and is_admin = false
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "questions_select_public_anon"
  on public.questions
  for select
  to anon
  using (is_public = true);

create policy "questions_select_authenticated"
  on public.questions
  for select
  to authenticated
  using (
    is_public = true
    or author_id = auth.uid()
    or public.is_admin()
  );

create policy "questions_insert_own"
  on public.questions
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and is_public = false
    and status = 'pending'
  );

create policy "questions_update_own_content"
  on public.questions
  for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "answers_select_public_anon"
  on public.answers
  for select
  to anon
  using (
    exists (
      select 1
      from public.questions as q
      where q.id = answers.question_id
        and q.is_public = true
    )
  );

create policy "answers_select_authenticated"
  on public.answers
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.questions as q
      where q.id = answers.question_id
        and (q.is_public = true or q.author_id = auth.uid())
    )
  );

create policy "answers_insert_admin"
  on public.answers
  for insert
  to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

create policy "answers_update_admin"
  on public.answers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and admin_id = auth.uid());

do $$
declare
  fn record;
  found_fn boolean := false;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where p.proname = 'rls_auto_enable'
  loop
    found_fn := true;
    begin
      execute format(
        'revoke all on function %I.%I(%s) from public, anon, authenticated',
        fn.schema_name,
        fn.function_name,
        fn.args
      );
      execute format(
        'alter function %I.%I(%s) set search_path = pg_catalog',
        fn.schema_name,
        fn.function_name,
        fn.args
      );
      raise notice 'rls_auto_enable hardened: %.%(%)', fn.schema_name, fn.function_name, fn.args;
    exception
      when others then
        raise notice 'rls_auto_enable skipped: %', sqlerrm;
    end;
  end loop;

  if not found_fn then
    raise notice 'rls_auto_enable not found; no extra warning to fix';
  end if;
end;
$$;

select
  check_name,
  result,
  detail
from (
  select
    'rls_enabled' as check_name,
    case
      when bool_and(c.relrowsecurity) then 'PASS'
      else 'FAIL'
    end as result,
    string_agg(c.relname, ', ' order by c.relname) as detail
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('profiles', 'questions', 'answers')

  union all
  select
    'member_cannot_write_is_admin',
    case
      when not exists (
        select 1
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'is_admin'
          and grantee in ('anon', 'authenticated', 'PUBLIC')
          and privilege_type in ('INSERT', 'UPDATE')
      )
      then 'PASS'
      else 'FAIL'
    end,
    'is_admin insert/update revoked from client roles'

  union all
  select
    'member_cannot_write_question_flags',
    case
      when not exists (
        select 1
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'questions'
          and column_name in ('is_public', 'status', 'author_id')
          and grantee in ('anon', 'authenticated', 'PUBLIC')
          and privilege_type in ('INSERT', 'UPDATE')
      )
      then 'PASS'
      else 'FAIL'
    end,
    'is_public/status/author_id insert/update revoked'

  union all
  select
    'anon_select_only_qa',
    case
      when exists (
        select 1 from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'questions'
          and grantee = 'anon' and privilege_type = 'SELECT'
      )
      and exists (
        select 1 from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'answers'
          and grantee = 'anon' and privilege_type = 'SELECT'
      )
      and not exists (
        select 1 from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('profiles', 'questions', 'answers')
          and grantee = 'anon'
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      )
      then 'PASS'
      else 'FAIL'
    end,
    'anon can select questions/answers only'

  union all
  select
    'definer_functions_owned_by_postgres',
    case
      when bool_and(pg_get_userbyid(p.proowner) = 'postgres') then 'PASS'
      else 'FAIL'
    end,
    string_agg(p.proname, ', ' order by p.proname)
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'is_admin',
      'admin_set_question_public',
      'admin_set_question_status',
      'admin_reply_to_question'
    )

  union all
  select
    'is_admin_execute',
    case
      when bool_and(
        case p.proname
          when 'is_admin' then
            not has_function_privilege('anon', p.oid, 'EXECUTE')
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        end
      )
      then 'PASS'
      else 'FAIL'
    end,
    'authenticated only'
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'is_admin'

  union all
  select
    'admin_rpc_execute',
    case
      when bool_and(
        not has_function_privilege('anon', p.oid, 'EXECUTE')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
      then 'PASS'
      else 'FAIL'
    end,
    'authenticated can call; function checks is_admin()'
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'admin_set_question_public',
      'admin_set_question_status',
      'admin_reply_to_question'
    )

  union all
  select
    'trigger_execute_authenticated_only',
    case
      when bool_and(
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
      )
      then 'PASS'
      else 'FAIL'
    end,
    'needed for member insert; hidden from PostgREST public API'
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in (
      'protect_profile_admin_flag',
      'protect_question_privileged_columns'
    )

  union all
  select
    'rls_auto_enable',
    case
      when not exists (
        select 1
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where p.proname = 'rls_auto_enable'
      )
      then 'ABSENT'
      when exists (
        select 1
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where p.proname = 'rls_auto_enable'
          and coalesce(p.proconfig, array[]::text[]) && array['search_path=pg_catalog']
          and not has_function_privilege('anon', p.oid, 'EXECUTE')
          and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
      then 'PASS'
      else 'REVIEW'
    end,
    'ABSENT=no function, PASS=hardened, REVIEW=internal owner or leftover grant'
) as report
order by check_name;
```

`pending` = 답변 대기, `answered` = 답변 완료.  
회원 등급 컬럼은 두지 않는다. `is_admin`은 운영자 여부만 표시한다.  
화면에서 버튼을 숨기는 것만으로 권한을 주지 않는다.  
클라이언트는 프로필 생성 시 `is_admin`을 보내지 않고, 질문 등록 시 `author_id`/`is_public`/`status`를 보내지 않는다.  
질문 `author_id`는 `DEFAULT auth.uid()`와 BEFORE 트리거가 채운다. 단일 행 INSERT 뒤 `RETURNING`/`select()`는 본인 행 SELECT 정책과 맞는다.  
쓰기 헬퍼: `assets/js/member-writes.js`. Q&A 화면에는 아직 연결하지 않는다.

## 4. 관리자 지정 (프로젝트 생성 후)

1. 홈페이지 회원가입이 연결되기 전이면, Supabase **Authentication**에서 관리자용 사용자를 하나 만든다
2. 해당 이메일로 한 번 로그인(또는 메일 확인)한 뒤 프로필이 생기면, SQL Editor(`postgres`)에서만 관리자를 지정한다

```sql
update public.profiles
set is_admin = true
where email = '관리자이메일@example.com';
```

일반 회원·`anon`·`authenticated` 역할의 INSERT/UPDATE는 `is_admin` 컬럼 권한이 없고, 트리거가 변경을 막는다.

## 5. 키 확인

1. **Project Settings → API Keys**
2. 홈페이지 `assets/js/supabase-config.js`에 넣을 값: Project URL, `anon`/`publishable` public key
3. `service_role`과 secret key는 로컬 관리용으로만 보관한다. GitHub Pages 코드에 넣지 않는다

회원가입·로그인 화면은 연결됨. Q&A와 Streamlit 실행은 아직 연결하지 않는다.

## 6. 최종 검증 결과

| 항목 | 결과 | 이유 |
| --- | --- | --- |
| 1. 일반 회원 프로필 생성 | 통과 | `authenticated`가 허용 컬럼만 INSERT. 기본값과 트리거가 `is_admin=false`. RLS는 본인 `id`와 `is_admin=false`만 허용 |
| 2. 질문 등록 author_id / GRANT / RLS | 통과(보완) | INSERT GRANT는 `title, body, related_ai`만. `author_id`는 `DEFAULT auth.uid()`와 트리거가 채운다. RLS는 그 값을 확인. 클라이언트가 `author_id`를 보내면 GRANT 오류이므로 보내지 않는다. INSERT RETURNING은 본인 행 SELECT와 맞음 |
| 3. 회원의 is_admin / is_public / status 변경 | 차단 | 해당 컬럼 INSERT/UPDATE GRANT 없음. 트리거가 회원 세션에서 값을 고정하거나 예외 |
| 4. 관리자 공개·답변 | 통과 | `admin_set_question_public`, `admin_reply_to_question`이 `is_admin()` 확인 후 `postgres` DEFINER로 갱신. 회원 컬럼 제한과 충돌하지 않음 |
| 5. DEFINER/트리거 권한 | 통과 | DEFINER 함수 소유자 `postgres`, `search_path=''`. 트리거는 INVOKER + `private` 스키마. `authenticated`만 트리거 실행 가능. `anon` 실행 불가 |
| 6. 비로그인 조회 | 통과 | `anon`은 질문/답변 SELECT만. 정책이 `is_public=true`인 행과 그 답변만 허용 |
| 7. rls_auto_enable 경고 2건 | 조건부 | 함수가 있고 소유자가 허용하면 `search_path` 고정 + `PUBLIC/anon/authenticated` EXECUTE 회수로 해결. 없거나 `supabase_admin` 소유면 내부 경고로 남음. 새로 만들지 않음 |

이전 초안 오류: 트리거 함수 `EXECUTE`를 `authenticated`에서도 회수하면 회원 가입·질문 등록이 실패한다. 이번 최종본에서 고쳤다.

## 7. 기존 `rls_auto_enable()` 보안 경고 2건

이 함수는 Q&A SQL이 만들지 않는다. 경고 원인:

1. `SECURITY DEFINER`인데 `search_path`가 고정되지 않음
2. `PUBLIC`/`anon`/`authenticated`에 `EXECUTE`가 열려 있음

3번 최종 SQL 끝의 `DO` 블록이 함수가 있을 때만 수정을 시도한다.  
이벤트 트리거는 슈퍼유저만 실행하면 되므로 API 역할의 실행 권한은 필요 없다.  
함수가 없거나 내부 소유자라 거절되면 스크립트는 중단되지 않고, 마지막 결과표의 `rls_auto_enable`이 `ABSENT` 또는 `REVIEW`로 표시된다.

## 8. 추가 동작 테스트 (선택, 3번 실행 후)

역할 전환 테스트는 `docs`에 남기지 않고, 실제 회원/관리자 계정으로 홈페이지 연결 뒤에 한다.  
3번 SQL 마지막 결과표가 PASS인지 먼저 확인한다.

## 9. 그다음 구현 (키와 관리자 이메일을 받은 뒤)

- 회원가입·로그인·로그아웃·탈퇴·개인정보 동의
- Q&A 목록(공개분만), 질문 작성(로그인 필수), 내 질문, 관리자 답변·공개
- GitHub Pages 배포 후 회원/관리자 계정으로 검증
- 검증 전에는 Q&A를 활성화 완료로 표시하지 않음
- Streamlit 인증 가드는 별도 배포 사본에서 진행 (기존 Private 저장소 보존)

## 무료 플랜 참고

인증 메일 발송 수와 DB 용량에 한도가 있다. 소규모 연구 플랫폼이면 보통 충분하다.

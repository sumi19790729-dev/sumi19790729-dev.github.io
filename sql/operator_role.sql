-- 운영자 권한은 Supabase SQL Editor에서 postgres 역할로만 바꾼다.
-- 브라우저, anon, authenticated는 is_admin을 바꾸지 못한다.
-- 사용자, 프로필, 질문, 답변은 삭제하지 않는다.
-- 질문 author_id와 답변 admin_id도 이 파일에서 옮기지 않는다.

-- 1. 이전 대상을 확인한다. ID를 바꾸지 않고 건수만 본다.
-- 새 Google 계정과 기존 인제대 계정의 사용자 ID를 각각 넣은 뒤 실행한다.
/*
select
  'profiles' as item,
  id,
  is_admin
from public.profiles
where id in ('NEW_GOOGLE_USER_ID'::uuid, 'OLD_INJE_USER_ID'::uuid)
union all
select 'questions', author_id, null
from public.questions
where author_id in ('NEW_GOOGLE_USER_ID'::uuid, 'OLD_INJE_USER_ID'::uuid)
union all
select 'answers', admin_id, null
from public.answers
where admin_id in ('NEW_GOOGLE_USER_ID'::uuid, 'OLD_INJE_USER_ID'::uuid);
*/

-- 2. 새 Google 계정이 회원정보를 저장한 뒤, 계정 화면에 표시된 사용자 ID로 운영자를 지정한다.
do $$
declare
  new_id uuid := null;
begin
  if new_id is null then
    raise exception '새 Google 계정의 사용자 ID를 new_id에 넣은 뒤에 실행한다';
  end if;

  update public.profiles
  set is_admin = true
  where id = new_id
    and is_admin = false;

  if not found then
    raise exception '해당 사용자 ID의 일반 회원 프로필이 없다. 회원정보 저장 여부를 확인한다';
  end if;
end;
$$;

-- 3. 새 계정으로 질문 공개와 답변이 되는 것을 확인한 뒤에만 아래를 실행한다.
-- 기존 인제대 계정의 사용자 ID를 old_id에 넣는다. 계정과 게시물은 남긴다.
/*
do $$
declare
  old_id uuid := null;
begin
  if old_id is null then
    raise exception '기존 인제대 계정의 사용자 ID를 old_id에 넣은 뒤에 실행한다';
  end if;

  update public.profiles
  set is_admin = false
  where id = old_id
    and is_admin = true;

  if not found then
    raise exception '해제할 운영자 프로필이 없다';
  end if;
end;
$$;
*/

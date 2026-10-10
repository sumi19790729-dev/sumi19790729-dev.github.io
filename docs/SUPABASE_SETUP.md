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
     - `http://localhost:8501/**`

## 3. 회원·관리자·Q&A 테이블 (한 번에 실행)

**SQL Editor**에서 아래를 실행한다.  
`is_admin`은 회원이 스스로 바꿀 수 없다. 관리자 지정은 4번 SQL로만 한다.

```sql
create extension if not exists pgcrypto;

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
  author_id uuid not null references public.profiles (id) on delete cascade,
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

-- 프로필: 본인만 읽기/가입 시 삽입. is_admin은 클라이언트가 수정 못 함.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and is_admin = false
  );

create policy "profiles_update_own_nonadmin"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
  );

-- 질문: 공개 승인분은 누구나 열람. 본인 질문은 본인 조회. 관리자는 전체 조회.
create policy "questions_select_public_or_own_or_admin"
  on public.questions for select
  using (is_public = true or author_id = auth.uid() or public.is_admin());

create policy "questions_insert_own"
  on public.questions for insert
  with check (
    auth.uid() = author_id
    and is_public = false
    and status = 'pending'
  );

create policy "questions_update_own_content"
  on public.questions for update
  using (author_id = auth.uid() and not public.is_admin())
  with check (
    author_id = auth.uid()
    and is_public = (select q.is_public from public.questions q where q.id = questions.id)
    and status = (select q.status from public.questions q where q.id = questions.id)
  );

create policy "questions_update_admin"
  on public.questions for update
  using (public.is_admin())
  with check (public.is_admin());

-- 답변: 공개 질문의 답변은 누구나. 본인 질문의 답변은 본인. 작성은 관리자만.
create policy "answers_select_visible"
  on public.answers for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.questions q
      where q.id = answers.question_id
        and (q.is_public = true or q.author_id = auth.uid())
    )
  );

create policy "answers_insert_admin"
  on public.answers for insert
  with check (public.is_admin() and admin_id = auth.uid());

create policy "answers_update_admin"
  on public.answers for update
  using (public.is_admin())
  with check (public.is_admin());
```

`pending` = 답변 대기, `answered` = 답변 완료.  
`is_public`은 관리자만 true로 바꿀 수 있다. 화면에서 버튼을 숨기는 것만으로 권한을 주지 않는다.

회원 등급 컬럼은 두지 않는다. `is_admin`은 운영자 여부만 표시한다.

## 4. 관리자 지정 (프로젝트 생성 후)

1. 홈페이지 회원가입이 연결되기 전이면, Supabase **Authentication**에서 관리자용 사용자를 하나 만든다
2. 해당 이메일로 한 번 로그인(또는 메일 확인)한 뒤 프로필이 생기는 구조가 연결되면, SQL로만 관리자를 지정한다

```sql
update public.profiles
set is_admin = true
where email = '관리자이메일@example.com';
```

이 이메일을 채팅에 알려 주면, 연결 단계에서 위 SQL을 확정해 드린다.  
일반 회원이 `is_admin`을 올리는 UPDATE는 RLS가 막는다.

## 5. 키 확인

1. **Project Settings → API Keys**
2. 채팅에 보낼 값: Project URL, `anon` `public` key
3. `service_role`은 로컬 관리용으로만 보관한다

## 6. 그다음 구현 (키와 관리자 이메일을 받은 뒤)

- 회원가입·로그인·로그아웃·탈퇴·개인정보 동의
- Q&A 목록(공개분만), 질문 작성(로그인 필수), 내 질문, 관리자 답변·공개
- GitHub Pages 배포 후 회원/관리자 계정으로 검증
- 검증 전에는 Q&A를 활성화 완료로 표시하지 않음
- Streamlit 인증 가드는 별도 배포 사본에서 진행 (기존 Private 저장소 보존)

## 무료 플랜 참고

인증 메일 발송 수와 DB 용량에 한도가 있다. 소규모 연구 플랫폼이면 보통 충분하다.

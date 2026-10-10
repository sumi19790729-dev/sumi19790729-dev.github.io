# Supabase 무료 프로젝트 설정 (C안)

이 문서는 회원 인증을 연결하기 **전**에 필요한 계정·프로젝트 생성 절차다.  
API 키를 홈페이지나 Streamlit에 넣는 단계는 이 문서를 완료한 뒤 별도 승인으로 진행한다.

유료 플랜은 신청하지 않는다. KPI 원본·백업·`workshop_deploy`·기존 Private 저장소는 변경하지 않는다.

## 만들 것

1. Supabase 무료 프로젝트 1개
2. 이메일 회원가입/로그인 (비밀번호는 Supabase가 보관)
3. 회원 프로필 테이블: 이메일, 이름, 소속기관, 업무 분야, 개인정보 동의 시각
4. 나중에 홈페이지와 Streamlit이 **같은 프로젝트**를 쓰도록 할 주소·키

나중에 받을 값(채팅에 붙여 넣을 것):

- Project URL (`https://xxxx.supabase.co`)
- `anon` `public` API key

`service_role` 키는 절대 홈페이지·GitHub·채팅에 올리지 않는다.

## 1. 계정 만들기

1. https://supabase.com 접속
2. **Start your project** → GitHub 계정(`sumi19790729-dev`)으로 가입/로그인해도 된다
3. 조직(Organization)이 없으면 개인 조직을 만든다
4. 요금제는 **Free**를 유지한다

## 2. 프로젝트 만들기

1. **New project**
2. 이름 예: `ai-research-lab`
3. Database password를 생성해 **별도 안전한 곳에만** 저장한다. 홈페이지에 넣지 않는다
4. Region은 가까운 곳(예: Northeast Asia)을 고른다
5. **Create new project** 후 상태가 `Healthy`가 될 때까지 기다린다

## 3. 이메일 인증 켜기

1. 왼쪽 **Authentication** → **Sign In / Providers**
2. **Email**을 Enabled로 둔다
3. 권장 설정
   - Confirm email: **On** (이메일 인증 후 로그인)
   - Secure password change: On
4. Google/GitHub 등 소셜 로그인은 이 단계에서는 켜지 않는다
5. **Authentication** → **URL Configuration**
   - Site URL: `https://sumi19790729-dev.github.io`
   - Redirect URLs에 아래를 추가한다
     - `https://sumi19790729-dev.github.io/**`
     - `http://localhost:8501/**` (로컬 Streamlit 시험용)
     - Streamlit 공개 주소는 아직 없으므로 배포 승인 후 추가한다

## 4. 프로필 테이블

**SQL Editor**에서 아래를 실행한다.

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  organization text not null,
  work_field text not null,
  privacy_agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "own profile insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "own profile update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

회원 등급 컬럼은 만들지 않는다. 가입된 사용자는 모두 동일하게 AI를 쓰게 할 예정이다.

Q&A 테이블은 인증이 동작한 뒤 다음 단계에서 추가한다.

## 5. 키 확인

1. **Project Settings** → **API Keys**
2. 기록할 값
   - Project URL
   - `anon` `public` key
3. `service_role`은 서버 전용이다. GitHub Pages, Streamlit secrets 초안, 채팅에 넣지 않는다

## 6. 이메일 한도 (Free)

무료 플랜은 인증 메일 발송 수에 한도가 있다. 워크숍·소규모 연구 공개에는 보통 충분하다.  
한도를 넘기면 유료 전환 없이, 인증 메일 제공자만 나중에 검토하면 된다.

## 다음 승인 후에 할 일 (지금은 하지 않음)

- 홈페이지에 회원가입·로그인·로그아웃·탈퇴 화면 연결
- 인증 전용 배포 사본과 새 Private 저장소에 Streamlit 인증 가드만 추가
- Streamlit Community Cloud 연결 (Public URL이어도 앱 안에서 로그인 검사)
- 실행 URL을 홈페이지에 등록

위 단계에는 Project URL과 `anon` 키가 필요하다.

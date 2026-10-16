-- Run this script in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.transcripts (
  video_id text not null,
  language text not null,
  lines_json jsonb not null,
  verified boolean not null default false,
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, language)
);
alter table public.transcripts add column if not exists verified boolean not null default false;
alter table public.transcripts add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create table if not exists public.line_explanations (
  id uuid primary key default gen_random_uuid(),
  line_text text not null,
  source_language text not null,
  target_language text not null,
  context text not null default '',
  explanation_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (line_text, source_language, target_language, context)
);

create table if not exists public.vocabulary (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  original_text text not null,
  translation text not null,
  grammar text not null,
  slang text not null default '',
  song_title text,
  source_language text not null,
  target_language text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists vocabulary_user_phrase_language_idx
  on public.vocabulary (user_id, lower(original_text), target_language);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ui_language text not null default 'ru',
  source_language text not null default 'en',
  target_language text not null default 'ru',
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings alter column ui_language set default 'ru';
alter table public.user_settings alter column target_language set default 'ru';

-- Shared read/write caches contain no user data.
alter table public.transcripts enable row level security;
alter table public.line_explanations enable row level security;
drop policy if exists "Public transcript cache access" on public.transcripts;
drop policy if exists "Read verified transcript cache" on public.transcripts;
drop policy if exists "Signed users submit verified transcript" on public.transcripts;
drop policy if exists "Signed users update confirmed transcript" on public.transcripts;
drop policy if exists "Require verified transcript reads" on public.transcripts;
drop policy if exists "Require confirmed transcript inserts" on public.transcripts;
drop policy if exists "Require owner transcript updates" on public.transcripts;
create policy "Read verified transcript cache" on public.transcripts
  for select to anon, authenticated using (verified = true);
create policy "Require verified transcript reads" on public.transcripts
  as restrictive for select to anon, authenticated using (verified = true);
drop policy if exists "Public explanation cache access" on public.line_explanations;
drop policy if exists "Read shared explanation cache" on public.line_explanations;
drop policy if exists "Signed users write explanation cache" on public.line_explanations;
drop policy if exists "Signed users update explanation cache" on public.line_explanations;
drop policy if exists "Require signed explanation inserts" on public.line_explanations;
drop policy if exists "Require signed explanation updates" on public.line_explanations;
create policy "Read shared explanation cache" on public.line_explanations
  for select to anon, authenticated using (true);
create policy "Signed users write explanation cache" on public.line_explanations
  for insert to authenticated with check (
    ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
create policy "Signed users update explanation cache" on public.line_explanations
  for update to authenticated
  using (((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check (((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
create policy "Require signed explanation inserts" on public.line_explanations
  as restrictive for insert to authenticated
  with check (((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
create policy "Require signed explanation updates" on public.line_explanations
  as restrictive for update to authenticated
  using (((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check (((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

-- Personal records belong to a non-anonymous authenticated account only.
alter table public.vocabulary enable row level security;
alter table public.user_settings enable row level security;
drop policy if exists "Users manage their own vocabulary" on public.vocabulary;
drop policy if exists "Require vocabulary owner" on public.vocabulary;
create policy "Users manage their own vocabulary" on public.vocabulary
  for all to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  ) with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
create policy "Require vocabulary owner" on public.vocabulary
  as restrictive for all to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  ) with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
drop policy if exists "Users manage their own settings" on public.user_settings;
drop policy if exists "Require settings owner" on public.user_settings;
create policy "Users manage their own settings" on public.user_settings
  for all to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  ) with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
create policy "Require settings owner" on public.user_settings
  as restrictive for all to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  ) with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );

-- Remove legacy/default privileges before granting the exact operations used by the app.
revoke all privileges on public.transcripts, public.line_explanations, public.vocabulary, public.user_settings
  from public, anon, authenticated;
grant select on public.transcripts, public.line_explanations to anon, authenticated;
grant insert, update on public.line_explanations to authenticated;
grant select, insert, update, delete on public.vocabulary, public.user_settings to authenticated;

notify pgrst, 'reload schema';

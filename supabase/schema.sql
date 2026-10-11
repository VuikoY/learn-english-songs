-- Run this script in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.transcripts (
  video_id text not null,
  language text not null,
  lines_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, language)
);

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
create policy "Public transcript cache access" on public.transcripts
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "Public explanation cache access" on public.line_explanations;
create policy "Public explanation cache access" on public.line_explanations
  for all to anon, authenticated using (true) with check (true);

-- Personal records are only accessible by their authenticated (including anonymous) owner.
alter table public.vocabulary enable row level security;
alter table public.user_settings enable row level security;
drop policy if exists "Users manage their own vocabulary" on public.vocabulary;
create policy "Users manage their own vocabulary" on public.vocabulary
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own settings" on public.user_settings;
create policy "Users manage their own settings" on public.user_settings
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.transcripts, public.line_explanations to anon, authenticated;
grant select, insert, update, delete on public.vocabulary, public.user_settings to authenticated;

-- Create the application tables that are absent from public.
-- This migration intentionally does not modify public.transcripts.
begin;

create table public.line_explanations (
  id uuid primary key default gen_random_uuid(),
  line_text text not null,
  source_language text not null,
  target_language text not null,
  context text not null default '',
  explanation_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint line_explanations_cache_key
    unique (line_text, source_language, target_language, context)
);

create table public.vocabulary (
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

-- Match the app's duplicate key: trim, lowercase, and explanation language.
create unique index vocabulary_user_phrase_language_idx
  on public.vocabulary (user_id, lower(btrim(original_text)), target_language);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ui_language text not null default 'ru',
  source_language text not null default 'en',
  target_language text not null default 'ru',
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.line_explanations enable row level security;
alter table public.vocabulary enable row level security;
alter table public.user_settings enable row level security;

-- Explanations are a shared cache: public reads, writes only by signed-in users.
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

-- Vocabulary and settings are private to a non-anonymous account's own user_id.
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

-- Grant only the Data API operations used by the application.
revoke all privileges on public.line_explanations, public.vocabulary, public.user_settings
  from public, anon, authenticated;
grant select on public.line_explanations to anon, authenticated;
grant insert, update on public.line_explanations to authenticated;
grant select, insert, update, delete on public.vocabulary, public.user_settings to authenticated;

notify pgrst, 'reload schema';
commit;

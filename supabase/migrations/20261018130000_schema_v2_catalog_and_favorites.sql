-- Apply in the Supabase SQL editor. Keeps legacy transcript/explanation caches usable.
create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null unique,
  title text not null,
  thumbnail_url text,
  language text not null default 'en',
  created_by uuid references auth.users(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null unique references public.songs(id) on delete cascade,
  video_id text,
  language text,
  lines_json jsonb not null,
  is_verified boolean not null default false,
  verified boolean not null default false,
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Upgrade the earlier video_id/language transcript cache without dropping its rows.
alter table public.transcripts add column if not exists id uuid default gen_random_uuid();
alter table public.transcripts add column if not exists song_id uuid references public.songs(id) on delete cascade;
alter table public.transcripts add column if not exists video_id text;
alter table public.transcripts add column if not exists language text;
alter table public.transcripts add column if not exists is_verified boolean not null default false;
-- Earlier schema used video_id/language as a composite primary key. Make those
-- columns nullable for song-owned rows while preserving uniqueness for legacy rows.
do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint where conrelid = 'public.transcripts'::regclass and contype = 'p';
  if constraint_name is not null then execute format('alter table public.transcripts drop constraint %I', constraint_name); end if;
end $$;
alter table public.transcripts alter column video_id drop not null;
alter table public.transcripts alter column language drop not null;
update public.transcripts set id = gen_random_uuid() where id is null;
alter table public.transcripts alter column id set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transcripts'::regclass and contype = 'p'
  ) then
    alter table public.transcripts add constraint transcripts_pkey primary key (id);
  end if;
end $$;
create unique index if not exists transcripts_video_language_unique on public.transcripts(video_id, language) where video_id is not null and language is not null;
create unique index if not exists transcripts_song_id_unique on public.transcripts(song_id);
update public.transcripts t set song_id = s.id
  from public.songs s
  where t.song_id is null and t.video_id = s.youtube_id and t.language = s.language;
drop policy if exists "Require verified transcript reads" on public.transcripts;
drop policy if exists "Require confirmed transcript inserts" on public.transcripts;
drop policy if exists "Require owner transcript updates" on public.transcripts;
drop policy if exists "Read verified transcript cache" on public.transcripts;
drop policy if exists "Signed users submit verified transcript" on public.transcripts;
drop policy if exists "Signed users update confirmed transcript" on public.transcripts;

-- `song_id` is nullable for old text-keyed cache entries; song explanations use song_id + line_index.
create table if not exists public.line_explanations (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  line_index integer,
  line_text text not null default '',
  source_language text not null default 'en',
  target_language text not null default 'ru',
  context text not null default '',
  explanation_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.line_explanations add column if not exists song_id uuid references public.songs(id) on delete cascade;
alter table public.line_explanations add column if not exists line_index integer;
create unique index if not exists line_explanations_song_line_language_unique
  on public.line_explanations(song_id, line_index, source_language, target_language);

create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- Keep the requested vocabulary names alongside the richer legacy columns used by the app.
alter table public.vocabulary
  add column if not exists word text generated always as (original_text) stored;
alter table public.vocabulary
  add column if not exists context_sentence text not null default '';

alter table public.songs enable row level security;
alter table public.transcripts enable row level security;
alter table public.line_explanations enable row level security;
alter table public.user_favorites enable row level security;

drop policy if exists "Public can read public songs" on public.songs;
create policy "Public can read public songs" on public.songs for select to anon, authenticated using (is_public or (select auth.uid()) = created_by);
drop policy if exists "Users create songs" on public.songs;
create policy "Users create songs" on public.songs for insert to authenticated with check ((select auth.uid()) = created_by and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
drop policy if exists "Owners update songs" on public.songs;
create policy "Owners update songs" on public.songs for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
drop policy if exists "Authenticated users replace songs by YouTube ID" on public.songs;
create policy "Authenticated users replace songs by YouTube ID" on public.songs for update to authenticated using (((select auth.jwt()) ->> 'is_anonymous')::boolean is false) with check ((select auth.uid()) = created_by and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
drop policy if exists "Owners delete songs" on public.songs;
create policy "Owners delete songs" on public.songs for delete to authenticated using ((select auth.uid()) = created_by);

drop policy if exists "Public read verified song transcripts" on public.transcripts;
create policy "Public read verified song transcripts" on public.transcripts for select to anon, authenticated using (is_verified or exists (select 1 from public.songs s where s.id = song_id and (s.is_public or s.created_by = (select auth.uid()))));
drop policy if exists "Owners manage song transcripts" on public.transcripts;
create policy "Owners manage song transcripts" on public.transcripts for all to authenticated using (exists (select 1 from public.songs s where s.id = song_id and s.created_by = (select auth.uid()))) with check (exists (select 1 from public.songs s where s.id = song_id and s.created_by = (select auth.uid())));

drop policy if exists "Read explanation cache" on public.line_explanations;
create policy "Read explanation cache" on public.line_explanations for select to anon, authenticated using (true);
drop policy if exists "Signed users write explanation cache" on public.line_explanations;
create policy "Signed users write explanation cache" on public.line_explanations for all to authenticated using (((select auth.jwt()) ->> 'is_anonymous')::boolean is false) with check (((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

drop policy if exists "Users manage own favorites" on public.user_favorites;
create policy "Users manage own favorites" on public.user_favorites for all to authenticated using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false) with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

grant select on public.songs, public.transcripts, public.line_explanations to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;
grant insert, update, delete on public.transcripts, public.line_explanations, public.user_favorites to authenticated;
grant select, delete on public.user_favorites to authenticated;
grant insert, update on public.line_explanations to authenticated;
do $$ begin
  if to_regclass('public.user_settings') is not null then
    alter table public.user_settings alter column ui_language set default 'ru';
    alter table public.user_settings alter column target_language set default 'ru';
    update public.user_settings set ui_language = 'ru' where ui_language = 'uk';
    update public.user_settings set target_language = 'ru' where target_language = 'uk';
  end if;
end $$;
notify pgrst, 'reload schema';

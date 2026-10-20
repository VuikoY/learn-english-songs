alter table public.songs
  add column if not exists content_type text not null default 'music_video'
  check (content_type in ('music_video','movie_clip','interview','podcast','shorts','other'));

create table if not exists public.favorite_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  line_index integer not null check (line_index >= 0),
  line_text text not null,
  start_time numeric not null check (start_time >= 0),
  end_time numeric not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  unique (user_id, song_id, line_index)
);

alter table public.favorite_lines enable row level security;
drop policy if exists "Users read own favorite lines" on public.favorite_lines;
drop policy if exists "Users insert own favorite lines" on public.favorite_lines;
drop policy if exists "Users delete own favorite lines" on public.favorite_lines;
create policy "Users read own favorite lines" on public.favorite_lines for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own favorite lines" on public.favorite_lines for insert to authenticated with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
create policy "Users delete own favorite lines" on public.favorite_lines for delete to authenticated using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
grant select, insert, delete on public.favorite_lines to authenticated;
notify pgrst, 'reload schema';

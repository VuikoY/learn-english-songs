alter table public.songs
  add column if not exists artist text;

create table if not exists public.word_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.word_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  line_text text not null check (char_length(btrim(line_text)) between 1 and 2000),
  start_time numeric not null check (start_time >= 0),
  end_time numeric not null check (end_time > start_time),
  created_at timestamptz not null default now()
);

create index if not exists word_collections_user_created_idx
  on public.word_collections(user_id, created_at desc);
create index if not exists collection_items_collection_created_idx
  on public.collection_items(collection_id, created_at);

alter table public.word_collections enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists "Users read own word collections" on public.word_collections;
create policy "Users read own word collections" on public.word_collections
  for select to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
drop policy if exists "Users create own word collections" on public.word_collections;
create policy "Users create own word collections" on public.word_collections
  for insert to authenticated
  with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
drop policy if exists "Users update own word collections" on public.word_collections;
create policy "Users update own word collections" on public.word_collections
  for update to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
drop policy if exists "Users delete own word collections" on public.word_collections;
create policy "Users delete own word collections" on public.word_collections
  for delete to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

drop policy if exists "Users read own collection items" on public.collection_items;
create policy "Users read own collection items" on public.collection_items
  for select to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
drop policy if exists "Users insert own collection items" on public.collection_items;
create policy "Users insert own collection items" on public.collection_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
    and exists (
      select 1 from public.word_collections c
      where c.id = collection_id and c.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users delete own collection items" on public.collection_items;
create policy "Users delete own collection items" on public.collection_items
  for delete to authenticated using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );
drop policy if exists "Users update own collection items" on public.collection_items;
create policy "Users update own collection items" on public.collection_items
  for update to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
    and exists (
      select 1 from public.word_collections c
      where c.id = collection_id and c.user_id = (select auth.uid())
    )
  );

revoke all on public.word_collections, public.collection_items from public, anon, authenticated;
grant select, insert, update, delete on public.word_collections, public.collection_items to authenticated;

create or replace function public.search_song_content(
  search_query text,
  source_language text,
  result_limit integer default 6
)
returns table (
  result_kind text,
  song_id uuid,
  youtube_id text,
  title text,
  artist text,
  thumbnail_url text,
  line_text text,
  context text,
  line_index integer,
  start_time numeric,
  end_time numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      '%' || replace(replace(replace(search_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as pattern,
      greatest(1, least(coalesce(result_limit, 6), 10)) as row_limit
  ),
  matching_songs as (
    select s.id, s.youtube_id, s.title, s.artist, s.thumbnail_url
    from public.songs s
    cross join params p
    where s.language = source_language
      and (s.title ilike p.pattern escape E'\\' or coalesce(s.artist, '') ilike p.pattern escape E'\\')
    order by s.title
    limit (select row_limit from params)
  ),
  song_lines as (
    select
      s.id as song_id,
      s.youtube_id,
      s.title,
      s.artist,
      s.thumbnail_url,
      line.value ->> 'text' as line_text,
      (line.ordinality - 1)::integer as line_index,
      case
        when (line.value ->> 'start') ~ '^[0-9]+([.][0-9]+)?$'
          then (line.value ->> 'start')::numeric
        else 0::numeric
      end as start_time,
      case
        when (line.value ->> 'start') ~ '^[0-9]+([.][0-9]+)?$'
          and (line.value ->> 'duration') ~ '^[0-9]+([.][0-9]+)?$'
          then (line.value ->> 'start')::numeric + greatest((line.value ->> 'duration')::numeric, 0.2)
        when (line.value ->> 'start') ~ '^[0-9]+([.][0-9]+)?$'
          then (line.value ->> 'start')::numeric + 3
        else 3::numeric
      end as end_time
    from public.songs s
    join public.transcripts t on t.song_id = s.id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(t.lines_json) = 'array' then t.lines_json else '[]'::jsonb end
    ) with ordinality as line(value, ordinality)
    where s.language = source_language
      and jsonb_typeof(line.value) = 'object'
      and coalesce(line.value ->> 'text', '') <> ''
  ),
  matching_lines as (
    select l.*
    from song_lines l
    cross join params p
    where l.line_text ilike p.pattern escape E'\\'
    order by l.title, l.line_index
    limit (select row_limit from params)
  ),
  line_results as (
    select
      'line'::text as result_kind,
      l.song_id,
      l.youtube_id,
      l.title,
      l.artist,
      l.thumbnail_url,
      l.line_text,
      coalesce((
        select string_agg(nearby.line_text, ' ' order by nearby.line_index)
        from song_lines nearby
        where nearby.song_id = l.song_id
          and nearby.line_index between greatest(0, l.line_index - 1) and l.line_index + 1
      ), l.line_text) as context,
      l.line_index,
      l.start_time,
      l.end_time
    from matching_lines l
  ),
  song_results as (
    select
      'song'::text as result_kind,
      s.id as song_id,
      s.youtube_id,
      s.title,
      s.artist,
      s.thumbnail_url,
      null::text as line_text,
      null::text as context,
      null::integer as line_index,
      null::numeric as start_time,
      null::numeric as end_time
    from matching_songs s
  )
  select * from song_results
  union all
  select * from line_results
$$;

revoke all on function public.search_song_content(text, text, integer) from public;
grant execute on function public.search_song_content(text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

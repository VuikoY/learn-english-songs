alter table public.word_collections
  add column if not exists source_language text;

alter table public.collection_items
  alter column song_id drop not null,
  add column if not exists video_id text,
  add column if not exists video_title text,
  add column if not exists source_language text;

update public.collection_items as item
set video_id = song.youtube_id,
    video_title = song.title,
    source_language = song.language
from public.songs as song
where item.song_id = song.id
  and (item.video_id is null or item.video_title is null or item.source_language is null);

update public.word_collections as collection
set source_language = coalesce((
  select item.source_language
  from public.collection_items as item
  where item.collection_id = collection.id
  order by item.created_at
  limit 1
), 'en')
where collection.source_language is null;

alter table public.word_collections
  alter column source_language set default 'en',
  alter column source_language set not null;

alter table public.collection_items
  alter column source_language set default 'en',
  alter column source_language set not null;

alter table public.collection_items
  add constraint collection_items_video_snapshot_check
  check (song_id is not null or (video_id is not null and video_title is not null));

create table if not exists public.user_favorite_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.word_collections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);

create index if not exists user_favorite_collections_collection_idx
  on public.user_favorite_collections(collection_id);

alter table public.user_favorite_collections enable row level security;

drop policy if exists "Users read own collection favorites" on public.user_favorite_collections;
create policy "Users read own collection favorites" on public.user_favorite_collections
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users manage own public collection favorites" on public.user_favorite_collections;
create policy "Users manage own public collection favorites" on public.user_favorite_collections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
    and exists (
      select 1 from public.word_collections collection
      where collection.id = collection_id and collection.is_public = true
    )
  );

grant select, insert, delete on public.user_favorite_collections to authenticated;

create or replace function public.enforce_public_collection_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public and (
    select count(*) from public.collection_items item where item.collection_id = new.id
  ) < 5 then
    raise exception 'PUBLIC_COLLECTION_REQUIRES_FIVE_ITEMS' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists word_collections_public_minimum on public.word_collections;
create trigger word_collections_public_minimum
  before update of is_public on public.word_collections
  for each row execute function public.enforce_public_collection_minimum();

create or replace function public.enforce_public_collection_item_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1
  from public.word_collections collection
  where collection.id = old.collection_id and collection.is_public = true
  for update;

  if found and (
    select count(*) from public.collection_items item where item.collection_id = old.collection_id
  ) <= 5 then
    raise exception 'PUBLIC_COLLECTION_REQUIRES_FIVE_ITEMS' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists collection_items_public_minimum on public.collection_items;
create trigger collection_items_public_minimum
  before delete on public.collection_items
  for each row execute function public.enforce_public_collection_item_minimum();

create or replace function public.get_public_word_collections(
  p_language text default null,
  p_search text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  title text,
  is_public boolean,
  source_language text,
  item_count bigint,
  favorite_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with public_collections as (
    select
      collection.id,
      collection.title,
      collection.is_public,
      collection.source_language,
      (select count(*) from public.collection_items item where item.collection_id = collection.id) as item_count,
      (select count(*) from public.user_favorite_collections favorite where favorite.collection_id = collection.id) as favorite_count,
      collection.created_at
    from public.word_collections collection
    where collection.is_public = true
      and (p_language is null or collection.source_language = p_language)
      and (
        p_search is null
        or collection.title ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or exists (
          select 1
          from public.collection_items item
          where item.collection_id = collection.id
            and item.source_language = collection.source_language
            and item.line_text ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        )
      )
  )
  select
    public_collections.id,
    public_collections.title,
    public_collections.is_public,
    public_collections.source_language,
    public_collections.item_count,
    public_collections.favorite_count,
    public_collections.created_at
  from public_collections
  order by public_collections.favorite_count desc, public_collections.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000))
$$;

revoke all on function public.get_public_word_collections(text, text, integer) from public;
grant execute on function public.get_public_word_collections(text, text, integer) to anon, authenticated;

drop function if exists public.get_random_phrase_mix_line(text, boolean, text);

create function public.get_random_phrase_mix_line(
  p_language text,
  p_only_favorites boolean,
  p_excluded_video_id text default null
)
returns table (
  song_id uuid,
  collection_item_id uuid,
  youtube_id text,
  title text,
  artist text,
  line_index integer,
  line_text text,
  start_time numeric,
  duration numeric
)
language sql
volatile
security invoker
set search_path = public
as $$
  with media_lines as (
    select
      song.id as song_id,
      null::uuid as collection_item_id,
      song.youtube_id,
      song.title,
      song.artist,
      (subtitle.ordinality - 1)::integer as line_index,
      btrim(subtitle.value ->> 'text') as line_text,
      case when (subtitle.value ->> 'start') ~ '^[0-9]+([.][0-9]+)?$'
        then (subtitle.value ->> 'start')::numeric else 0::numeric end as start_time,
      case when (subtitle.value ->> 'duration') ~ '^[0-9]+([.][0-9]+)?$'
        then (subtitle.value ->> 'duration')::numeric else 0::numeric end as duration
    from public.songs song
    join public.transcripts transcript on transcript.song_id = song.id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(transcript.lines_json) = 'array' then transcript.lines_json else '[]'::jsonb end
    ) with ordinality as subtitle(value, ordinality)
    where song.language = p_language
      and (p_excluded_video_id is null or song.youtube_id <> p_excluded_video_id)
      and (
        not p_only_favorites
        or exists (
          select 1 from public.user_favorites favorite
          where favorite.song_id = song.id and favorite.user_id = (select auth.uid())
        )
      )
      and jsonb_typeof(subtitle.value -> 'text') = 'string'
      and (
        select count(*)
        from regexp_split_to_table(btrim(subtitle.value ->> 'text'), '\s+') as parts(word)
        where regexp_replace(parts.word, '^[^[:alpha:]]+', '') <> ''
      ) >= 3
  ),
  collection_lines as (
    select
      item.song_id,
      item.id as collection_item_id,
      item.video_id as youtube_id,
      item.video_title as title,
      null::text as artist,
      null::integer as line_index,
      btrim(item.line_text) as line_text,
      item.start_time,
      item.end_time - item.start_time as duration
    from public.collection_items item
    join public.word_collections collection on collection.id = item.collection_id
    where p_only_favorites
      and collection.source_language = p_language
      and item.source_language = p_language
      and (p_excluded_video_id is null or coalesce(item.video_id, (select youtube_id from public.songs where id = item.song_id)) <> p_excluded_video_id)
      and (
        collection.user_id = (select auth.uid())
        or exists (
          select 1 from public.user_favorite_collections favorite
          where favorite.collection_id = collection.id and favorite.user_id = (select auth.uid())
        )
      )
      and (
        select count(*)
        from regexp_split_to_table(btrim(item.line_text), '\s+') as parts(word)
        where regexp_replace(parts.word, '^[^[:alpha:]]+', '') <> ''
      ) >= 3
  ),
  eligible as (
    select * from media_lines
    union all
    select * from collection_lines
  ),
  deduplicated as (
    select *, row_number() over (partition by lower(line_text) order by random()) as duplicate_rank
    from eligible
  )
  select
    selected.song_id,
    selected.collection_item_id,
    selected.youtube_id,
    selected.title,
    selected.artist,
    selected.line_index,
    selected.line_text,
    selected.start_time,
    selected.duration
  from deduplicated selected
  where selected.duplicate_rank = 1
  order by random()
  limit 1
$$;

revoke all on function public.get_random_phrase_mix_line(text, boolean, text) from public;
grant execute on function public.get_random_phrase_mix_line(text, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';

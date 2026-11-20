drop function if exists public.get_random_phrase_mix_line(text, boolean, boolean, text);

create function public.get_random_phrase_mix_line(
  p_language text,
  p_favorite_media boolean,
  p_favorite_collections boolean,
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
  duration numeric,
  source_type text,
  source_title text,
  source_slug text,
  is_public boolean
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
      'media'::text as source_type,
      (coalesce(song.artist || ' - ', '') || song.title) as source_title,
      song.youtube_id as source_slug,
      song.is_public,
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
        (not p_favorite_media and not p_favorite_collections)
        or (
          p_favorite_media
          and exists (
            select 1 from public.user_favorites favorite
            where favorite.song_id = song.id and favorite.user_id = (select auth.uid())
          )
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
      'collection'::text as source_type,
      collection.title as source_title,
      collection.id::text as source_slug,
      collection.is_public,
      null::integer as line_index,
      btrim(item.line_text) as line_text,
      item.start_time,
      item.end_time - item.start_time as duration
    from public.collection_items item
    join public.word_collections collection on collection.id = item.collection_id
    where p_favorite_collections
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
    selected.duration,
    selected.source_type,
    selected.source_title,
    selected.source_slug,
    selected.is_public
  from deduplicated selected
  where selected.duplicate_rank = 1
  order by random()
  limit 1
$$;


revoke all on function public.get_random_phrase_mix_line(text, boolean, boolean, text) from public;
grant execute on function public.get_random_phrase_mix_line(text, boolean, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';

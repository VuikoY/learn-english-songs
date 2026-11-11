create table if not exists public.user_phrase_mix_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_date date not null default current_date,
  daily_best integer not null default 0 check (daily_best >= 0),
  all_time_best integer not null default 0 check (all_time_best >= daily_best),
  updated_at timestamptz not null default now()
);

alter table public.user_phrase_mix_records enable row level security;
create policy "Users manage own phrase mix records" on public.user_phrase_mix_records
  for all to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
grant select, insert, update on public.user_phrase_mix_records to authenticated;

create or replace function public.get_random_phrase_mix_line(
  p_language text,
  p_only_favorites boolean,
  p_excluded_video_id text default null
)
returns table (
  song_id uuid,
  youtube_id text,
  title text,
  artist text,
  line_index integer,
  line_text text
)
language sql
volatile
as $$
  select
    s.id,
    s.youtube_id,
    s.title,
    s.artist,
    (subtitle.ordinality - 1)::integer,
    btrim(subtitle.value ->> 'text')
  from public.songs as s
  join public.transcripts as t on t.song_id = s.id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.lines_json) = 'array' then t.lines_json else '[]'::jsonb end
  ) with ordinality as subtitle(value, ordinality)
  where s.language = p_language
    and (p_excluded_video_id is null or s.youtube_id <> p_excluded_video_id)
    and (
      not p_only_favorites
      or exists (
        select 1 from public.user_favorites as favorite
        where favorite.song_id = s.id and favorite.user_id = (select auth.uid())
      )
    )
    and jsonb_typeof(subtitle.value -> 'text') = 'string'
    and (
      select count(*)
      from regexp_split_to_table(btrim(subtitle.value ->> 'text'), '\s+') as parts(word)
      where regexp_replace(parts.word, '^[^[:alpha:]]+', '') <> ''
    ) >= 3
  order by random()
  limit 1
$$;

revoke all on function public.get_random_phrase_mix_line(text, boolean, text) from public;
grant execute on function public.get_random_phrase_mix_line(text, boolean, text) to anon, authenticated;

create or replace function public.save_phrase_mix_record(p_streak integer)
returns table (daily_best integer, all_time_best integer, daily_date date)
language plpgsql
volatile
as $$
begin
  if auth.uid() is null or p_streak < 1 then
    raise exception 'A signed-in user and positive streak are required';
  end if;

  return query
  insert into public.user_phrase_mix_records as current_record (user_id, daily_date, daily_best, all_time_best)
  values ((select auth.uid()), (now() at time zone 'utc')::date, p_streak, p_streak)
  on conflict (user_id) do update set
    daily_date = (now() at time zone 'utc')::date,
    daily_best = case
      when current_record.daily_date = (now() at time zone 'utc')::date
        then greatest(current_record.daily_best, excluded.daily_best)
      else excluded.daily_best
    end,
    all_time_best = greatest(current_record.all_time_best, excluded.all_time_best),
    updated_at = now()
  returning current_record.daily_best, current_record.all_time_best, current_record.daily_date;
end;
$$;

revoke all on function public.save_phrase_mix_record(integer) from public;
grant execute on function public.save_phrase_mix_record(integer) to authenticated;
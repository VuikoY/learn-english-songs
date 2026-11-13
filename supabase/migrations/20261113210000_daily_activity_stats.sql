begin;

create table public.user_daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  words_count integer not null default 0 check (words_count >= 0),
  primary key (user_id, date)
);

alter table public.user_daily_stats enable row level security;
revoke all privileges on public.user_daily_stats from public, anon, authenticated;

insert into public.user_daily_stats (user_id, date, words_count)
select
  activity.user_id,
  (activity.occurred_at at time zone 'UTC')::date,
  sum(activity.words_covered)::integer
from public.user_learning_activity as activity
where activity.occurred_at is not null
  and activity.words_covered > 0
group by activity.user_id, (activity.occurred_at at time zone 'UTC')::date;

create or replace function public.save_learning_activity(
  p_session_id uuid,
  p_source text,
  p_words_covered integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous_words integer := 0;
  v_delta_words integer := 0;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or p_session_id is null
    or p_source is null
    or p_source not in ('media', 'collection', 'phrase-mix')
    or p_words_covered is null
    or p_words_covered < 0
    or p_words_covered > 100000
  then
    raise exception 'A signed-in user and valid learning activity are required';
  end if;

  perform 1
  from auth.users as users
  where users.id = v_user_id
  for update;

  select activity.words_covered
  into v_previous_words
  from public.user_learning_activity as activity
  where activity.user_id = v_user_id
    and activity.session_id = p_session_id;

  v_delta_words := greatest(p_words_covered - coalesce(v_previous_words, 0), 0);

  insert into public.user_learning_activity as activity (
    user_id,
    session_id,
    source,
    words_covered,
    occurred_at
  )
  values (v_user_id, p_session_id, p_source, p_words_covered, now())
  on conflict (user_id, session_id) do update
  set words_covered = greatest(activity.words_covered, excluded.words_covered);

  if v_delta_words > 0 then
    insert into public.user_daily_stats as daily_stats (user_id, date, words_count)
    values (v_user_id, (now() at time zone 'UTC')::date, v_delta_words)
    on conflict (user_id, date) do update
    set words_count = daily_stats.words_count + excluded.words_count;
  end if;
end;
$$;

create or replace function public.get_learning_word_totals()
returns table (words_covered bigint, words_today bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(activity.words_covered)
      from public.user_learning_activity as activity
      where activity.user_id = (select auth.uid())
    ), 0)::bigint,
    coalesce((
      select daily_stats.words_count
      from public.user_daily_stats as daily_stats
      where daily_stats.user_id = (select auth.uid())
        and daily_stats.date = (now() at time zone 'UTC')::date
    ), 0)::bigint
  where (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
$$;

create or replace function public.get_learning_daily_stats(p_period text)
returns table (activity_date date, words_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (now() at time zone 'UTC')::date;
  v_first_date date;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or p_period is null
    or p_period not in ('7d', '30d', 'all')
  then
    raise exception 'A signed-in user and valid activity period are required';
  end if;

  if p_period = '7d' then
    return query
    select days.activity_date::date, coalesce(daily_stats.words_count, 0)::bigint
    from generate_series(v_today - 6, v_today, interval '1 day') as days(activity_date)
    left join public.user_daily_stats as daily_stats
      on daily_stats.user_id = v_user_id
      and daily_stats.date = days.activity_date::date
    order by days.activity_date;
  elsif p_period = '30d' then
    return query
    select days.activity_date::date, coalesce(daily_stats.words_count, 0)::bigint
    from generate_series(v_today - 29, v_today, interval '1 day') as days(activity_date)
    left join public.user_daily_stats as daily_stats
      on daily_stats.user_id = v_user_id
      and daily_stats.date = days.activity_date::date
    order by days.activity_date;
  else
    select min(daily_stats.date)
    into v_first_date
    from public.user_daily_stats as daily_stats
    where daily_stats.user_id = v_user_id;

    if v_first_date is null then
      return;
    end if;

    return query
    select months.activity_date::date, coalesce(sum(daily_stats.words_count), 0)::bigint
    from generate_series(
      date_trunc('month', v_first_date)::date,
      date_trunc('month', v_today)::date,
      interval '1 month'
    ) as months(activity_date)
    left join public.user_daily_stats as daily_stats
      on daily_stats.user_id = v_user_id
      and daily_stats.date >= months.activity_date::date
      and daily_stats.date < (months.activity_date + interval '1 month')::date
    group by months.activity_date
    order by months.activity_date;
  end if;
end;
$$;

revoke all on function public.save_learning_activity(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.save_learning_activity(uuid, text, integer) to authenticated;

revoke all on function public.get_learning_word_totals() from public, anon, authenticated;
grant execute on function public.get_learning_word_totals() to authenticated;

revoke all on function public.get_learning_daily_stats(text) from public, anon, authenticated;
grant execute on function public.get_learning_daily_stats(text) to authenticated;

notify pgrst, 'reload schema';
commit;

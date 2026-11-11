begin;

create table public.user_learning_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  source text not null check (source in ('media', 'collection', 'phrase-mix')),
  words_covered integer not null check (words_covered >= 0),
  occurred_at timestamptz,
  primary key (user_id, session_id)
);

alter table public.user_learning_activity enable row level security;
revoke all privileges on public.user_learning_activity from public, anon, authenticated;

insert into public.user_learning_activity (user_id, session_id, source, words_covered, occurred_at)
select progress.user_id, gen_random_uuid(), 'media', progress.words_completed, progress.completed_at
from public.user_media_progress as progress
where progress.words_completed > 0;

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
begin
  if (select auth.uid()) is null
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

  insert into public.user_learning_activity as activity (
    user_id,
    session_id,
    source,
    words_covered,
    occurred_at
  )
  values ((select auth.uid()), p_session_id, p_source, p_words_covered, now())
  on conflict (user_id, session_id) do update
  set words_covered = greatest(activity.words_covered, excluded.words_covered);
end;
$$;

revoke all on function public.save_learning_activity(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.save_learning_activity(uuid, text, integer) to authenticated;

create or replace function public.get_learning_word_totals()
returns table (words_covered bigint, words_today bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(activity.words_covered), 0)::bigint,
    coalesce(sum(activity.words_covered) filter (
      where activity.occurred_at >= (
        date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      )
    ), 0)::bigint
  from public.user_learning_activity as activity
  where activity.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
$$;

revoke all on function public.get_learning_word_totals() from public, anon, authenticated;
grant execute on function public.get_learning_word_totals() to authenticated;

notify pgrst, 'reload schema';
commit;

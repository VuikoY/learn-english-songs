begin;

create or replace function public.get_learning_leaderboard()
returns table (
  pseudonym text,
  hard_completed bigint,
  completed_media bigint,
  average_accuracy numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.substr(pg_catalog.md5(progress.user_id::text), 1, 10) as pseudonym,
    pg_catalog.count(distinct progress.media_id)
      filter (where progress.is_completed and progress.difficulty = 'Hard') as hard_completed,
    pg_catalog.count(distinct progress.media_id)
      filter (where progress.is_completed) as completed_media,
    pg_catalog.round(pg_catalog.avg(progress.accuracy)) as average_accuracy
  from public.user_media_progress as progress
  where (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  group by progress.user_id
  order by hard_completed desc, completed_media desc, average_accuracy desc, pseudonym asc
$$;

revoke all on function public.get_learning_leaderboard() from public, anon, authenticated;
grant execute on function public.get_learning_leaderboard() to authenticated;

notify pgrst, 'reload schema';
commit;

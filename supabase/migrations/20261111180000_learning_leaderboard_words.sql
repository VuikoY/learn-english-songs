begin;

drop function if exists public.get_learning_leaderboard();

create function public.get_learning_leaderboard()
returns table (
  pseudonym text,
  words_covered bigint,
  average_accuracy numeric,
  completed_media bigint,
  hard_completed bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with media_stats as (
    select
      progress.user_id,
      pg_catalog.count(distinct progress.media_id)
        filter (where progress.is_completed and progress.difficulty = 'Hard') as hard_completed,
      pg_catalog.count(distinct progress.media_id)
        filter (where progress.is_completed) as completed_media,
      pg_catalog.round(pg_catalog.avg(progress.accuracy)) as average_accuracy
    from public.user_media_progress as progress
    group by progress.user_id
  ),
  word_stats as (
    select activity.user_id, pg_catalog.sum(activity.words_covered) as words_covered
    from public.user_learning_activity as activity
    group by activity.user_id
  ),
  learners as (
    select media_stats.user_id from media_stats
    union
    select word_stats.user_id from word_stats
  )
  select
    pg_catalog.substr(pg_catalog.md5(learners.user_id::text), 1, 10) as pseudonym,
    coalesce(word_stats.words_covered, 0)::bigint as words_covered,
    coalesce(media_stats.average_accuracy, 0)::numeric as average_accuracy,
    coalesce(media_stats.completed_media, 0)::bigint as completed_media,
    coalesce(media_stats.hard_completed, 0)::bigint as hard_completed
  from learners
  left join word_stats on word_stats.user_id = learners.user_id
  left join media_stats on media_stats.user_id = learners.user_id
  where (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  order by words_covered desc, average_accuracy desc, completed_media desc, hard_completed desc, pseudonym asc
$$;

revoke all on function public.get_learning_leaderboard() from public, anon, authenticated;
grant execute on function public.get_learning_leaderboard() to authenticated;

notify pgrst, 'reload schema';
commit;

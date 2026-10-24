begin;

create table public.user_media_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.songs(id) on delete cascade,
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  accuracy numeric not null check (accuracy >= 0 and accuracy <= 100),
  words_completed integer not null check (words_completed >= 0),
  total_words integer not null check (total_words >= 0),
  mistakes_count integer not null check (mistakes_count >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  constraint user_media_progress_user_media_difficulty_key
    unique (user_id, media_id, difficulty),
  constraint user_media_progress_completion_accuracy_check
    check (not is_completed or accuracy >= 80),
  constraint user_media_progress_words_count_check
    check (words_completed <= total_words)
);

alter table public.user_media_progress enable row level security;

create policy "Users read their own media progress"
  on public.user_media_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own media progress"
  on public.user_media_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own media progress"
  on public.user_media_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all privileges on public.user_media_progress from public, anon, authenticated;
grant select, insert, update on public.user_media_progress to authenticated;

notify pgrst, 'reload schema';
commit;
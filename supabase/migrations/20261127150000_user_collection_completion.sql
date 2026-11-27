begin;

create table public.user_collection_completion (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.word_collections(id) on delete cascade,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);

alter table public.user_collection_completion enable row level security;

create policy "Users read their own collection completion"
  on public.user_collection_completion for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own collection completion"
  on public.user_collection_completion for insert to authenticated
  with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
create policy "Users update their own collection completion"
  on public.user_collection_completion for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
create policy "Users delete their own collection completion"
  on public.user_collection_completion for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on public.user_collection_completion from public, anon, authenticated;
grant select, insert, update, delete on public.user_collection_completion to authenticated;

notify pgrst, 'reload schema';
commit;

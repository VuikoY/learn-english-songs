alter table public.word_collections
  add column if not exists is_public boolean not null default false;

create index if not exists word_collections_public_created_idx
  on public.word_collections(created_at desc)
  where is_public = true;

drop policy if exists "Users read own word collections" on public.word_collections;
drop policy if exists "Anyone read public word collections" on public.word_collections;
drop policy if exists "Users read own and public word collections" on public.word_collections;

create policy "Anyone read public word collections" on public.word_collections
  for select to anon
  using (is_public = true);

create policy "Users read own and public word collections" on public.word_collections
  for select to authenticated
  using (
    is_public = true
    or (
      (select auth.uid()) = user_id
      and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
    )
  );

drop policy if exists "Users read own collection items" on public.collection_items;
drop policy if exists "Anyone read public collection items" on public.collection_items;
drop policy if exists "Users read own and public collection items" on public.collection_items;

create policy "Anyone read public collection items" on public.collection_items
  for select to anon
  using (
    exists (
      select 1 from public.word_collections c
      where c.id = collection_id and c.is_public = true
    )
  );

create policy "Users read own and public collection items" on public.collection_items
  for select to authenticated
  using (
    exists (
      select 1 from public.word_collections c
      where c.id = collection_id and c.is_public = true
    )
    or (
      (select auth.uid()) = user_id
      and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
    )
  );

grant select on public.word_collections, public.collection_items to anon;

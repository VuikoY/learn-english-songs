-- This migration can run before the catalog migration on a fresh local database.
-- The catalog migration installs the policy after public.songs exists.
do $$
begin
  if to_regclass('public.songs') is not null then
    drop policy if exists "Authenticated users replace songs by YouTube ID" on public.songs;
    create policy "Authenticated users replace songs by YouTube ID"
      on public.songs
      for update
      to authenticated
      using (((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
      with check (
        (select auth.uid()) = created_by
        and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
      );
  end if;
end
$$;

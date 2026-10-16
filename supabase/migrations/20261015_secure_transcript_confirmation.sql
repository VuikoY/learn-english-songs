-- Manual migration for databases created with the previous schema.sql.
-- This migration does not delete or rewrite transcript rows.
begin;

-- The app can encounter databases where the previous setup script was never
-- applied. Create the shared cache if absent, then safely upgrade old tables.
create table if not exists public.transcripts (
  video_id text not null,
  language text not null,
  lines_json jsonb not null,
  verified boolean not null default false,
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, language)
);

alter table public.transcripts
  add column if not exists verified boolean not null default false;
alter table public.transcripts
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.transcripts enable row level security;

-- Drop prior policies that permitted client inserts/updates based only on
-- client-supplied verified=true. Direct writes are now server-only.
drop policy if exists "Public transcript cache access" on public.transcripts;
drop policy if exists "Signed users submit verified transcript" on public.transcripts;
drop policy if exists "Signed users update confirmed transcript" on public.transcripts;
drop policy if exists "Require confirmed transcript inserts" on public.transcripts;
drop policy if exists "Require owner transcript updates" on public.transcripts;
drop policy if exists "Read verified transcript cache" on public.transcripts;
drop policy if exists "Require verified transcript reads" on public.transcripts;

create policy "Read verified transcript cache" on public.transcripts
  for select to anon, authenticated using (verified = true);
create policy "Require verified transcript reads" on public.transcripts
  as restrictive for select to anon, authenticated using (verified = true);

revoke all privileges on public.transcripts from public, anon, authenticated;
grant select on public.transcripts to anon, authenticated;

-- Make the new/updated table immediately visible to PostgREST after commit.
notify pgrst, 'reload schema';

commit;

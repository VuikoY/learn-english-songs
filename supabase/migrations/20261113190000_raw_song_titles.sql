alter table public.songs add column if not exists raw_title text;

update public.songs
set raw_title = title
where raw_title is null;

notify pgrst, 'reload schema';

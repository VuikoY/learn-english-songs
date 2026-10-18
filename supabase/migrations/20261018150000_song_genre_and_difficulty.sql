alter table public.songs
  add column if not exists genre text not null default 'other',
  add column if not exists difficulty text not null default 'intermediate';

alter table public.songs
  drop constraint if exists songs_genre_check,
  add constraint songs_genre_check check (genre in (
    'pop', 'rock', 'hip-hop', 'r-and-b', 'electronic', 'jazz', 'blues',
    'country-folk', 'metal-punk', 'indie-alternative', 'reggae-ska', 'latin',
    'classical', 'soundtrack', 'gospel', 'world', 'other'
  )),
  drop constraint if exists songs_difficulty_check,
  add constraint songs_difficulty_check check (difficulty in ('beginner', 'intermediate', 'advanced'));

create index if not exists songs_public_language_genre_difficulty_idx
  on public.songs (language, genre, difficulty)
  where is_public;

notify pgrst, 'reload schema';

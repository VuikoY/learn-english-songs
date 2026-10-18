"use client";

import { useState } from "react";
import SongCard from "@/components/SongCard";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { SONG_DIFFICULTIES, SONG_GENRES, songMetadataLabels, type SongDifficulty, type SongGenre } from "@/lib/songMetadata";

export type CatalogSong = { id: string; youtube_id: string; title: string; artist: string | null; thumbnail_url: string | null; language: string; genre: SongGenre; difficulty: SongDifficulty };

export default function SongCatalog({ songs }: { songs: CatalogSong[] }) {
  const { sourceLanguage, uiLanguage } = useLanguage();
  const [genre, setGenre] = useState<SongGenre | "all">("all");
  const [difficulty, setDifficulty] = useState<SongDifficulty | "all">("all");
  const text = PAGE_TEXT[uiLanguage];
  const labels = songMetadataLabels(uiLanguage);
  const filteredSongs = songs.filter((song) => song.language === sourceLanguage && (genre === "all" || song.genre === genre) && (difficulty === "all" || song.difficulty === difficulty));
  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <div className="mb-6"><h1 className="text-3xl font-bold">{text.catalogTitle}</h1><p className="mt-2 text-muted-foreground">{text.catalogSubtitle}</p></div>
    <div className="mb-6 flex flex-wrap gap-3">
      <label className="grid gap-1 text-sm"><span>{labels.genre}</span><select value={genre} onChange={(event) => setGenre(event.target.value as SongGenre | "all")} className="h-10 min-w-48 rounded-md border bg-background px-3"><option value="all">{labels.all} · {labels.genre.toLowerCase()}</option>{SONG_GENRES.map((item) => <option key={item} value={item}>{labels.genres[item]}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>{labels.difficulty}</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as SongDifficulty | "all")} className="h-10 min-w-48 rounded-md border bg-background px-3"><option value="all">{labels.all} · {labels.difficulty.toLowerCase()}</option>{SONG_DIFFICULTIES.map((item) => <option key={item} value={item}>{labels.difficulties[item]}</option>)}</select></label>
    </div>
    {filteredSongs.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredSongs.map(song => <SongCard key={song.id} song={song} labels={labels} fallbackArtist={text.youtube} />)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text.emptyCatalog}</div>}
  </main>;
}

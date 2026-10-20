"use client";

import { useEffect, useState } from "react";
import SongCard from "@/components/SongCard";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { SONG_DIFFICULTIES, SONG_GENRES, songMetadataLabels, type SongDifficulty, type SongGenre } from "@/lib/songMetadata";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ContentType = "music_video" | "movie_clip" | "interview" | "podcast" | "shorts" | "other";
export const CONTENT_TYPES: ContentType[] = ["music_video", "movie_clip", "interview", "podcast", "shorts", "other"];
export type CatalogSong = { id: string; youtube_id: string; title: string; thumbnail_url: string | null; language: string; genre: SongGenre; difficulty: SongDifficulty; content_type: ContentType };

export default function SongCatalog({ songs }: { songs: CatalogSong[] }) {
  const { sourceLanguage, uiLanguage, t } = useLanguage();
  const [genre, setGenre] = useState<SongGenre | "all">("all");
  const [difficulty, setDifficulty] = useState<SongDifficulty | "all">("all");
  const [contentType, setContentType] = useState<ContentType | "all">("all");
  const [categorySongs, setCategorySongs] = useState(songs);
  const text = PAGE_TEXT[uiLanguage];
  const labels = songMetadataLabels(uiLanguage);
  useEffect(() => {
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let query = db.from("songs").select("id,youtube_id,title,thumbnail_url,language,genre,difficulty,content_type").eq("is_public", true);
    if (contentType !== "all") query = query.eq("content_type", contentType);
    void query.order("created_at", { ascending: false }).then(({ data, error }) => {
      if (!error && data) setCategorySongs(data as unknown as CatalogSong[]);
      else setCategorySongs(songs.filter(song => contentType === "all" || song.content_type === contentType));
    });
  }, [contentType, songs]);
  const translatedContentLabels: Record<ContentType | "all", string> = { all: t("favorites.all"), music_video: t("favorites.music"), movie_clip: t("favorites.movieClips"), interview: t("favorites.interviews"), podcast: t("favorites.podcasts"), shorts: t("favorites.shorts"), other: t("favorites.other") };
  const filteredSongs = categorySongs.filter((song) => song.language === sourceLanguage && (genre === "all" || song.genre === genre) && (difficulty === "all" || song.difficulty === difficulty));
  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <div className="mb-6"><h1 className="text-3xl font-bold">{text.catalogTitle}</h1><p className="mt-2 text-muted-foreground">{text.catalogSubtitle}</p></div>
    <div className="mb-6 flex flex-wrap gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("favorites.category")}>{(["all", ...CONTENT_TYPES] as const).map(item=><button key={item} type="button" aria-pressed={contentType===item} onClick={()=>setContentType(item)} className="rounded-full border px-3 py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">{translatedContentLabels[item]}</button>)}</div>
      {(contentType === "all" || contentType === "music_video") && <label className="grid gap-1 text-sm"><span>{labels.genre}</span><select value={genre} onChange={(event) => setGenre(event.target.value as SongGenre | "all")} className="h-10 min-w-48 rounded-md border bg-background px-3"><option value="all">{labels.all} · {labels.genre.toLowerCase()}</option>{SONG_GENRES.map((item) => <option key={item} value={item}>{labels.genres[item]}</option>)}</select></label>}
      <label className="grid gap-1 text-sm"><span>{labels.difficulty}</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as SongDifficulty | "all")} className="h-10 min-w-48 rounded-md border bg-background px-3"><option value="all">{labels.all} · {labels.difficulty.toLowerCase()}</option>{SONG_DIFFICULTIES.map((item) => <option key={item} value={item}>{labels.difficulties[item]}</option>)}</select></label>
    </div>
    {filteredSongs.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredSongs.map(song => <SongCard key={song.id} song={song} labels={labels} />)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text.emptyCatalog}</div>}
  </main>;
}

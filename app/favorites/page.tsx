"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import SongCard from "@/components/SongCard";
import FavoriteLineCard from "@/components/FavoriteLineCard";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatalogSong } from "@/components/SongCatalog";
import { songMetadataLabels } from "@/lib/songMetadata";
import { fetchMediaCompletion } from "@/lib/mediaProgress";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";
type FavoriteLine = { id: string; line_index: number; line_text: string; start_time: number; end_time: number; songs: { youtube_id: string; title: string; thumbnail_url: string | null } | null };

export default function FavoritesPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, t } = useLanguage();
  const labels = songMetadataLabels(uiLanguage);
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [favoriteLines, setFavoriteLines] = useState<FavoriteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"media" | "lines">("media");

  const refresh = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const db = getSupabaseBrowserClient();
      if (!db) { setSongs([]); setFavoriteLines([]); return; }
      let ids: string[];
      if (userId) {
        const [favorites, lines] = await Promise.all([
          db.from("user_favorites").select("song_id").eq("user_id", userId),
          db.from("favorite_lines").select("id,line_index,line_text,start_time,end_time,songs(youtube_id,title,thumbnail_url)").eq("user_id", userId).order("created_at", { ascending: false }),
        ]);
        if (favorites.error) throw favorites.error;
        if (lines.error) throw lines.error;
        ids = (favorites.data ?? []).map(row => row.song_id);
        setFavoriteLines((lines.data ?? []) as unknown as FavoriteLine[]);
      } else {
        setFavoriteLines([]);
        const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY) ?? "[]");
        ids = Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
      }
      if (!ids.length) { setSongs([]); return; }
      const { data, error } = await db.from("songs").select("id,youtube_id,title,thumbnail_url,language,genre,difficulty,content_type").in("id", ids);
      if (error) throw error;
      const byId = new Map(((data ?? []) as unknown as CatalogSong[]).map(song => [song.id, song]));
      const favoriteSongs = ids.map(id => byId.get(id)).filter((song): song is CatalogSong => Boolean(song));
      try {
        const completion = await fetchMediaCompletion(db, userId, favoriteSongs.map((song) => song.id));
        setSongs(favoriteSongs.map((song) => ({
          ...song,
          isCompleted: completion[song.id]?.isCompleted ?? false,
          completedDifficulty: completion[song.id]?.completedDifficulty ?? null,
        })));
      } catch (progressError) {
        console.error("[favorites] Could not load completion badges.", progressError);
        setSongs(favoriteSongs);
      }
    } catch {
      setSongs([]);
      setFavoriteLines([]);
    } finally { setLoading(false); }
  }, [authLoading, userId]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    window.addEventListener(FAVORITES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(FAVORITES_CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, [refresh]);

  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <h1 className="mb-6 text-3xl font-bold">{t("favorites.title")}</h1>
    <div className="mb-6 flex flex-wrap gap-2">
      <button type="button" aria-pressed={tab === "media"} onClick={() => setTab("media")} className="rounded border px-4 py-2 aria-pressed:bg-primary aria-pressed:text-primary-foreground">{t("favorites.savedMedia", { count: songs.length })}</button>
      <button type="button" aria-pressed={tab === "lines"} onClick={() => setTab("lines")} className="rounded border px-4 py-2 aria-pressed:bg-primary aria-pressed:text-primary-foreground">{t("favorites.lines", { count: favoriteLines.length })}</button>
    </div>
    {loading ? <p className="text-muted-foreground">{t("favorites.loading")}</p> : tab === "media" && songs.length ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{songs.map(song => <SongCard key={song.id} song={song} labels={labels} />)}</div>
    ) : tab === "lines" && favoriteLines.length ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{favoriteLines.map(line => line.songs && <FavoriteLineCard key={line.id} line={{ ...line, songs: line.songs }} />)}</div>
    ) : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground"><Heart className="size-8" aria-hidden="true" /><p>{tab === "media" ? t("favorites.empty") : t("favorites.linesEmpty")}</p><Link href="/" className="text-primary underline">{t("favorites.browse")}</Link></div>}
  </main>;
}

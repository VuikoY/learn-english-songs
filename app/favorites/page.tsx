"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import SongCard from "@/components/SongCard";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatalogSong } from "@/components/SongCatalog";
import { songMetadataLabels } from "@/lib/songMetadata";
import { fetchMediaCompletion } from "@/lib/mediaProgress";
import { fetchSongTranscriptStats } from "@/lib/songTranscriptStats";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

export default function FavoritesPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, t } = useLanguage();
  const labels = songMetadataLabels(uiLanguage);
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const db = getSupabaseBrowserClient();
      if (!db) { setSongs([]); return; }
      let ids: string[];
      if (userId) {
        const { data: favorites, error } = await db.from("user_favorites").select("song_id").eq("user_id", userId);
        if (error) throw error;
        ids = (favorites ?? []).map(row => row.song_id);
      } else {
        const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY) ?? "[]");
        ids = Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
      }
      if (!ids.length) { setSongs([]); return; }
      const { data, error } = await db.from("songs").select("id,youtube_id,title,thumbnail_url,language,genre,difficulty,content_type").in("id", ids);
      if (error) throw error;
      const byId = new Map(((data ?? []) as unknown as CatalogSong[]).map(song => [song.id, song]));
      const favoriteSongs = ids.map(id => byId.get(id)).filter((song): song is CatalogSong => Boolean(song));
      let songsWithStats = favoriteSongs;
      try {
        const transcriptStats = await fetchSongTranscriptStats(db, favoriteSongs.map((song) => song.id));
        songsWithStats = favoriteSongs.map((song) => ({ ...song, ...transcriptStats[song.id] }));
      } catch (statsError) {
        console.error("[favorites] Could not load transcript counts.", statsError);
      }
      try {
        const completion = await fetchMediaCompletion(db, userId, favoriteSongs.map((song) => song.id));
        setSongs(songsWithStats.map((song) => ({
          ...song,
          isCompleted: completion[song.id]?.isCompleted ?? false,
          completedDifficulty: completion[song.id]?.completedDifficulty ?? null,
          averageAccuracy: completion[song.id]?.averageAccuracy ?? null,
        })));
      } catch (progressError) {
        console.error("[favorites] Could not load completion badges.", progressError);
        setSongs(songsWithStats);
      }
    } catch {
      setSongs([]);
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
    {loading ? <p className="text-muted-foreground">{t("favorites.loading")}</p> : songs.length ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{songs.map(song => <SongCard key={song.id} song={song} labels={labels} />)}</div>
    ) : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground"><Heart className="size-8" aria-hidden="true" /><p>{t("favorites.empty")}</p><Link href="/" className="text-primary underline">{t("favorites.browse")}</Link></div>}
  </main>;
}

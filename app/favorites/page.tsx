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
        const { data, error } = await db.from("user_favorites").select("song_id").eq("user_id", userId);
        if (error) throw error;
        ids = (data ?? []).map((row) => row.song_id);
      } else {
        const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY) ?? "[]");
        ids = Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
      }

      if (!ids.length) { setSongs([]); return; }
      let { data, error } = await db.from("songs").select("id,youtube_id,title,artist,thumbnail_url,language,genre,difficulty").in("id", ids).eq("is_public", true);
      let songsWithMetadata: CatalogSong[];
      if (error) {
        const legacy = await db.from("songs").select("id,youtube_id,title,artist,thumbnail_url,language").in("id", ids).eq("is_public", true);
        if (legacy.error) throw legacy.error;
        songsWithMetadata = (legacy.data ?? []).map((song) => ({ ...song, genre: "other" as const, difficulty: "intermediate" as const }));
      } else {
        if (error) throw error;
        songsWithMetadata = (data ?? []) as unknown as CatalogSong[];
      }
      const byId = new Map(songsWithMetadata.map((song) => [song.id, song]));
      setSongs(ids.map((id) => byId.get(id)).filter((song): song is CatalogSong => Boolean(song)));
    } catch {
      setSongs([]);
    } finally { setLoading(false); }
  }, [authLoading, userId]);

  useEffect(() => {
    void refresh();
    window.addEventListener(FAVORITES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const visibleSongs = songs;

  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <h1 className="mb-6 text-3xl font-bold">{t("favorites.title")}</h1>
    {loading ? <p className="text-muted-foreground">{t("favorites.loading")}</p> : visibleSongs.length ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSongs.map((song) => <SongCard key={song.id} song={song} labels={labels} />)}
      </div>
    ) : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      <Heart className="size-8" aria-hidden="true" />
      <p>{t("favorites.empty")}</p>
      <Link href="/" className="text-primary underline">{t("favorites.browse")}</Link>
    </div>}
  </main>;
}

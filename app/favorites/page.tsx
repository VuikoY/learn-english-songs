"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import SongCard from "@/components/SongCard";
import CollectionFavoriteButton from "@/components/CollectionFavoriteButton";
import CollectionPhrasePreview from "@/components/CollectionPhrasePreview";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatalogSong } from "@/components/SongCatalog";
import { songMetadataLabels } from "@/lib/songMetadata";
import { fetchMediaCompletion } from "@/lib/mediaProgress";
import { fetchSongTranscriptStats } from "@/lib/songTranscriptStats";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const GUEST_COLLECTION_FAVORITES_KEY = "lingo-clips:collection-favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

type FavoriteCollection = { id: string; title: string; wordCount: number; previewVideoIds: string[]; previewPhrases: string[] };
type FavoritesTab = "all" | "media" | "collections";

function readGuestIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

export default function FavoritesPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, sourceLanguage, t } = useLanguage();
  const labels = songMetadataLabels(uiLanguage);
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [tab, setTab] = useState<FavoritesTab>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshIdRef.current;
    if (authLoading) return;
    setLoading(true);
    setLoadError(false);
    try {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("SERVICE_UNAVAILABLE");
      let mediaIds: string[];
      let collectionIds: string[];
      if (userId) {
        const [mediaResult, collectionResult] = await Promise.all([
          db.from("user_favorites").select("song_id,songs!inner(language)")
            .eq("user_id", userId).eq("songs.language", sourceLanguage),
          db.from("user_favorite_collections")
            .select("collection_id,word_collections!inner(id,title,is_public,source_language)")
            .eq("user_id", userId)
            .eq("word_collections.is_public", true)
            .eq("word_collections.source_language", sourceLanguage),
        ]);
        if (mediaResult.error) throw mediaResult.error;
        if (collectionResult.error) throw collectionResult.error;
        mediaIds = (mediaResult.data ?? []).map((row) => row.song_id);
        collectionIds = (collectionResult.data ?? []).map((row) => row.collection_id);
      } else {
        mediaIds = readGuestIds(GUEST_FAVORITES_KEY);
        collectionIds = readGuestIds(GUEST_COLLECTION_FAVORITES_KEY);
      }
      const { data: songRows, error: songError } = mediaIds.length > 0
        ? await db.from("songs").select("id,youtube_id,title,thumbnail_url,language,genre,difficulty,content_type")
          .in("id", mediaIds).eq("language", sourceLanguage)
        : { data: [], error: null };
      if (songError) throw songError;
      const songsById = new Map(((songRows ?? []) as unknown as CatalogSong[]).map((song) => [song.id, song]));
      const favoriteSongs = mediaIds.map((id) => songsById.get(id)).filter((song): song is CatalogSong => Boolean(song));
      if (requestId !== refreshIdRef.current) return;
      let songsWithStats = favoriteSongs;
      try {
        const transcriptStats = await fetchSongTranscriptStats(db, favoriteSongs.map((song) => song.id));
        songsWithStats = favoriteSongs.map((song) => ({ ...song, ...transcriptStats[song.id] }));
      } catch (statsError) {
        console.error("[favorites] Could not load transcript counts.", statsError);
      }
      if (requestId !== refreshIdRef.current) return;
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

      const { data: collectionRows, error: collectionError } = collectionIds.length > 0
        ? await db.from("word_collections").select("id,title")
          .in("id", collectionIds).eq("is_public", true).eq("source_language", sourceLanguage)
        : { data: [], error: null };
      if (collectionError) throw collectionError;
      const visibleCollectionIds = (collectionRows ?? []).map((collection) => collection.id);
      const { data: itemRows, error: itemError } = visibleCollectionIds.length > 0
        ? await db.from("collection_items").select("collection_id,video_id,line_text")
          .in("collection_id", visibleCollectionIds).order("created_at", { ascending: true })
        : { data: [], error: null };
      if (itemError) throw itemError;
      const wordCounts = new Map<string, number>();
      const previewVideoIds = new Map<string, string[]>();
      const previewPhrases = new Map<string, string[]>();
      for (const item of itemRows ?? []) {
        const phrases = previewPhrases.get(item.collection_id) ?? [];
        if (phrases.length < 3 && item.line_text.trim()) {
          phrases.push(item.line_text.trim());
          previewPhrases.set(item.collection_id, phrases);
        }
        const wordCount = item.line_text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
        wordCounts.set(item.collection_id, (wordCounts.get(item.collection_id) ?? 0) + wordCount);
        const videos = previewVideoIds.get(item.collection_id) ?? [];
        if (videos.length < 1 && item.video_id && !videos.includes(item.video_id)) {
          videos.push(item.video_id);
          previewVideoIds.set(item.collection_id, videos);
        }
      }
      if (requestId !== refreshIdRef.current) return;
      setCollections((collectionRows ?? []).map((collection) => ({
        id: collection.id,
        title: collection.title,
        wordCount: wordCounts.get(collection.id) ?? 0,
        previewVideoIds: previewVideoIds.get(collection.id) ?? [],
        previewPhrases: previewPhrases.get(collection.id) ?? [],
      })));
    } catch (error) {
      console.error("[favorites] Could not load language-filtered favorites.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      if (requestId === refreshIdRef.current) {
        setSongs([]);
        setCollections([]);
        setLoadError(true);
      }
    } finally {
      if (requestId === refreshIdRef.current) setLoading(false);
    }
  }, [authLoading, sourceLanguage, userId]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    window.addEventListener(FAVORITES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(FAVORITES_CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, [refresh]);

  const visibleSongs = tab === "collections" ? [] : songs;
  const visibleCollections = tab === "media" ? [] : collections;
  const hasVisibleFavorites = visibleSongs.length > 0 || visibleCollections.length > 0;

  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-bold">{t("favorites.title")}</h1>
    <div role="tablist" aria-label={t("favorites.title")} className="flex gap-2 border-b">
      {(["all", "media", "collections"] as const).map((filter) => (
        <button
          key={filter}
          type="button"
          role="tab"
          aria-selected={tab === filter}
          onClick={() => setTab(filter)}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === filter ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t(filter === "all" ? "favorites.tabAll" : filter === "media" ? "favorites.tabMedia" : "favorites.tabCollections")}
        </button>
      ))}
    </div>
    {loading ? <p role="status" className="text-muted-foreground">{t("favorites.loading")}</p> : loadError ? (
      <p role="alert" className="text-destructive">{t("favorites.loadError")}</p>
    ) : hasVisibleFavorites ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSongs.map((song) => (
          <article key={song.id} className="space-y-2">
            <span className="inline-flex rounded-full border px-2 py-1 text-xs text-muted-foreground">{t("favorites.mediaBadge")}</span>
            <SongCard song={song} labels={labels} />
          </article>
        ))}
        {visibleCollections.map((collection) => (
          <article key={collection.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <Link href={`/collections/${collection.id}`} className="block">
              <div className="relative flex aspect-[2/1] overflow-hidden bg-muted">
                {collection.previewVideoIds.length > 0 ? (
                  <Image src={`https://i.ytimg.com/vi/${collection.previewVideoIds[0]}/mqdefault.jpg`} alt="" width={320} height={180} unoptimized className="h-full w-full object-cover" />
                ) : <div className="w-full" />}
                <div className="absolute bottom-2.5 right-2.5 flex flex-col items-end gap-1">
                  <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-white drop-shadow-md backdrop-blur-sm">
                    {t("catalog.transcriptStats", { words: collection.wordCount })}
                  </span>
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-3 px-4 pt-3">
              <Link href={`/collections/${collection.id}`} className="min-w-0 flex-1 truncate font-semibold" title={collection.title}>
                <h2 className="truncate">{collection.title}</h2>
              </Link>
              <CollectionFavoriteButton collectionId={collection.id} compact />
            </div>
            <CollectionPhrasePreview title={collection.title} phrases={collection.previewPhrases} />
          </article>
        ))}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <Heart className="size-8" aria-hidden="true" />
        <p>{t("favorites.empty")}</p>
        <Link href="/media" className="text-primary underline">{t("favorites.browse")}</Link>
      </div>
    )}
  </main>;
}

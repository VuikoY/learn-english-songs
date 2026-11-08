"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import CollectionLearningSession, { type CollectionLearningItem } from "@/components/CollectionLearningSession";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Collection = { id: string; title: string; isPublic: boolean; isOwner: boolean };

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  return typeof value === "object" && value !== null &&
    "collections" in value && Array.isArray(value.collections) &&
    value.collections.every((item) =>
      typeof item === "object" && item !== null &&
      "id" in item && typeof item.id === "string" &&
      "title" in item && typeof item.title === "string" &&
      "isPublic" in item && typeof item.isPublic === "boolean" &&
      "isOwner" in item && typeof item.isOwner === "boolean",
    );
}

export default function WordCollectionPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-8" aria-busy="true" />}>
      <WordCollectionContent />
    </Suspense>
  );
}

function WordCollectionContent() {
  const params = useParams<{ collectionId: string }>();
  const collectionId = params.collectionId;
  const { loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionLearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadCollection = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/word-collections");
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
      const selected = payload.collections.find((item) => item.id === collectionId);
      if (!selected) throw new Error("COLLECTION_NOT_FOUND");
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("SERVICE_UNAVAILABLE");
      const { data: itemRows, error: itemError } = await db
        .from("collection_items")
        .select("id,song_id,line_text,start_time,end_time")
        .eq("collection_id", collectionId)
        .order("created_at", { ascending: true });
      if (itemError) throw itemError;

      const songIds = [...new Set((itemRows ?? []).map((item) => item.song_id))];
      const { data: songRows, error: songError } = songIds.length > 0
        ? await db.from("songs").select("id,youtube_id,title").in("id", songIds)
        : { data: [], error: null };
      if (songError) throw songError;
      const songsById = new Map((songRows ?? []).map((song) => [song.id, song]));
      const loadedItems = (itemRows ?? []).flatMap((item): CollectionLearningItem[] => {
        const song = songsById.get(item.song_id);
        if (!song) return [];
        return [{
          id: item.id,
          youtubeId: song.youtube_id,
          songTitle: song.title,
          lineText: item.line_text,
          startTime: Number(item.start_time),
          endTime: Number(item.end_time),
        }];
      });
      setCollection(selected);
      setItems(loadedItems);
    } catch (loadError) {
      console.error("[collections] Could not load collection.", {
        errorType: loadError instanceof Error ? loadError.name : "UnknownError",
      });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void Promise.resolve().then(() => active ? loadCollection() : undefined);
    return () => { active = false; };
  }, [authLoading, loadCollection]);

  const collectionListHref = collection?.isOwner ? "/my-collections" : "/collections";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link href={collectionListHref} className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("nav.collections")}
      </Link>

      {authLoading || loading ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("collections.loading")}</p>
      ) : error ? (
        <p role="alert" className="text-destructive">{t("collections.loadError")}</p>
      ) : collection ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl font-bold">{collection.title}</h1>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("collections.noItems")}</p>
          ) : (
            <CollectionLearningSession
              key={items.map((item) => item.id).join(":")}
              items={items}
            />
          )}
        </>
      ) : null}
    </main>
  );
}

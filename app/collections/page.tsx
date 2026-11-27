"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import CollectionFavoriteButton from "@/components/CollectionFavoriteButton";
import CollectionPhrasePreview from "@/components/CollectionPhrasePreview";
import CollectionProgressBadge from "@/components/CollectionProgressBadge";

type Collection = {
  id: string;
  title: string;
  isPublic: boolean;
  isOwner: boolean;
  sourceLanguage: string;
  favoriteCount: number;
  previewVideoIds: string[];
  previewPhrases: string[];
  wordCount: number;
};

function readCollection(value: unknown): Collection | null {
  if (
    typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" ||
    !("title" in value) || typeof value.title !== "string" ||
    !("isPublic" in value) || typeof value.isPublic !== "boolean" ||
    !("isOwner" in value) || typeof value.isOwner !== "boolean" ||
    !("sourceLanguage" in value) || typeof value.sourceLanguage !== "string" ||
    !("favoriteCount" in value) || typeof value.favoriteCount !== "number" ||
    !("previewVideoIds" in value) || !Array.isArray(value.previewVideoIds) ||
    !value.previewVideoIds.every((videoId) => typeof videoId === "string") ||
    !("previewPhrases" in value) || !Array.isArray(value.previewPhrases) ||
    !value.previewPhrases.every((phrase) => typeof phrase === "string") ||
    !("wordCount" in value) || typeof value.wordCount !== "number"
  ) return null;
  return {
    id: value.id,
    title: value.title,
    isPublic: value.isPublic,
    isOwner: value.isOwner,
    sourceLanguage: value.sourceLanguage,
    favoriteCount: value.favoriteCount,
    previewVideoIds: value.previewVideoIds,
    previewPhrases: value.previewPhrases,
    wordCount: value.wordCount,
  };
}

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  if (typeof value !== "object" || value === null || !("collections" in value) || !Array.isArray(value.collections)) return false;
  return value.collections.every((item) => readCollection(item) !== null);
}

export default function CollectionsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { t, sourceLanguage } = useLanguage();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void fetch(`/api/word-collections?scope=public&language=${encodeURIComponent(sourceLanguage)}`)
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
        if (active) setCollections(payload.collections.filter((collection) => collection.isPublic));
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, sourceLanguage, userId]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">{t("collections.title")}</h1>
      <p className="-mt-4 text-muted-foreground">
        {t("collections.subtitle")}
      </p>
      {authLoading ? (
        <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
      ) : (
        <>
          {loadError && <p role="alert" className="text-sm text-destructive">{t("collections.loadError")}</p>}
          {loading ? (
            <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
          ) : collections.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection) => (
                <li key={collection.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <Link href={`/collections/${collection.id}`} className="block">
                    <div className="relative flex aspect-[2/1] overflow-hidden bg-muted">
                      {collection.previewVideoIds.length > 0 ? (
                        <Image src={`https://i.ytimg.com/vi/${collection.previewVideoIds[0]}/mqdefault.jpg`} alt="" width={320} height={180} unoptimized className="h-full w-full object-cover" />
                      ) : <div className="w-full" />}
                      <div className="absolute right-2.5 top-2.5 z-10 flex flex-col items-end gap-1.5">
                        <CollectionProgressBadge collectionId={collection.id} />
                      </div>
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
                </li>
              ))}
            </ul>
          ) : !loadError ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              {t("collections.publicEmpty")}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

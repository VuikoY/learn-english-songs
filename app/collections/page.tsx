"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

type Collection = { id: string; title: string; isPublic: boolean; isOwner: boolean };

function readCollection(value: unknown): Collection | null {
  if (
    typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" ||
    !("title" in value) || typeof value.title !== "string" ||
    !("isPublic" in value) || typeof value.isPublic !== "boolean" ||
    !("isOwner" in value) || typeof value.isOwner !== "boolean"
  ) return null;
  return { id: value.id, title: value.title, isPublic: value.isPublic, isOwner: value.isOwner };
}

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  if (typeof value !== "object" || value === null || !("collections" in value) || !Array.isArray(value.collections)) return false;
  return value.collections.every((item) => readCollection(item) !== null);
}

export default function CollectionsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void fetch("/api/word-collections?scope=public")
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
        if (active) setCollections(payload.collections.filter((collection) => collection.isPublic));
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, userId]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">{t("collections.title")}</h1>
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
                    <div className="flex aspect-video items-center justify-center bg-muted text-4xl text-muted-foreground" aria-hidden="true">▶</div>
                    <div className="space-y-2 p-4">
                      <h2 className="break-words font-semibold">{collection.title}</h2>
                      <span className="inline-flex rounded-full border px-2 py-1 text-xs text-muted-foreground">
                        {t("collections.publicBadge")}
                      </span>
                    </div>
                  </Link>
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

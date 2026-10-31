"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void fetch("/api/word-collections")
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
        if (active) setCollections(payload.collections);
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, userId]);

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || saving) return;
    setSaving(true);
    setCreateError(false);
    try {
      const response = await fetch("/api/word-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: normalizedTitle }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const collection = typeof payload === "object" && payload !== null && "collection" in payload
        ? readCollection(payload.collection)
        : null;
      if (
        !response.ok || !collection
      ) throw new Error("COLLECTION_CREATE_FAILED");
      setCollections((previous) => [collection, ...previous]);
      setTitle("");
    } catch {
      setCreateError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">{t("collections.title")}</h1>
      {authLoading ? (
        <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
      ) : (
        <>
          {userId && <form onSubmit={(event) => void createCollection(event)} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
            <label className="sr-only" htmlFor="word-collection-title">{t("collections.newName")}</label>
            <input
              id="word-collection-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              placeholder={t("collections.newName")}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
            />
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving ? t("globalSearch.saving") : t("collections.create")}
            </button>
          </form>}

          {loadError && <p role="alert" className="text-sm text-destructive">{t("collections.loadError")}</p>}
          {createError && <p role="alert" className="text-sm text-destructive">{t("collections.createError")}</p>}
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
                        {collection.isPublic ? t("collections.publicBadge") : t("collections.privateBadge")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : !loadError ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              {t(userId ? "collections.empty" : "collections.publicEmpty")}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

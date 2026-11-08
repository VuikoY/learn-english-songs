"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Collection = { id: string; title: string; isPublic: boolean; isOwner: boolean };
type CollectionSnippet = {
  id: string;
  collectionId: string;
  songTitle: string;
  lineText: string;
};

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
  return typeof value === "object" && value !== null &&
    "collections" in value && Array.isArray(value.collections) &&
    value.collections.every((item) => readCollection(item) !== null);
}

export default function MyCollectionsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const [collections, setCollections] = useState<Collection[]>([]);
  const [snippets, setSnippets] = useState<Record<string, CollectionSnippet[]>>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [visibilitySavingId, setVisibilitySavingId] = useState<string | null>(null);
  const [visibilityErrorId, setVisibilityErrorId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeErrorId, setRemoveErrorId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;

    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/word-collections?scope=mine");
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
        const ownCollections = payload.collections.filter((collection) => collection.isOwner);
        const db = getSupabaseBrowserClient();
        if (!db && ownCollections.length > 0) throw new Error("SERVICE_UNAVAILABLE");

        const loadedSnippets: Record<string, CollectionSnippet[]> = {};
        for (const collection of ownCollections) loadedSnippets[collection.id] = [];
        if (db && ownCollections.length > 0) {
          const { data: itemRows, error: itemError } = await db
            .from("collection_items")
            .select("id,collection_id,song_id,line_text")
            .in("collection_id", ownCollections.map((collection) => collection.id))
            .order("created_at", { ascending: true });
          if (itemError) throw itemError;

          const songIds = [...new Set((itemRows ?? []).map((item) => item.song_id))];
          const { data: songRows, error: songError } = songIds.length > 0
            ? await db.from("songs").select("id,title").in("id", songIds)
            : { data: [], error: null };
          if (songError) throw songError;
          const titlesBySongId = new Map((songRows ?? []).map((song) => [song.id, song.title]));
          for (const item of itemRows ?? []) {
            const songTitle = titlesBySongId.get(item.song_id);
            if (!songTitle) continue;
            loadedSnippets[item.collection_id]?.push({
              id: item.id,
              collectionId: item.collection_id,
              songTitle,
              lineText: item.line_text,
            });
          }
        }

        if (active) {
          setCollections(ownCollections);
          setSnippets(loadedSnippets);
        }
      } catch (error: unknown) {
        console.error("[my-collections] Could not load word collections.", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
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
      if (!response.ok || !collection || !collection.isOwner) throw new Error("COLLECTION_CREATE_FAILED");
      setCollections((previous) => [collection, ...previous]);
      setTitle("");
    } catch (error) {
      console.error("[my-collections] Could not create word collection.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setCreateError(true);
    } finally {
      setSaving(false);
    }
  }

  async function changeVisibility(collection: Collection) {
    if (visibilitySavingId) return;
    setVisibilitySavingId(collection.id);
    setVisibilityErrorId(null);
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(collection.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !collection.isPublic }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("isPublic" in payload) ||
        typeof payload.isPublic !== "boolean"
      ) throw new Error("VISIBILITY_UPDATE_FAILED");
      const isPublic = payload.isPublic;
      setCollections((previous) => previous.map((item) =>
        item.id === collection.id ? { ...item, isPublic } : item,
      ));
    } catch (error) {
      console.error("[my-collections] Could not change collection visibility.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setVisibilityErrorId(collection.id);
    } finally {
      setVisibilitySavingId(null);
    }
  }

  async function removeSnippet(snippet: CollectionSnippet) {
    if (removingId) return;
    setRemovingId(snippet.id);
    setRemoveErrorId(null);
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(snippet.collectionId)}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: snippet.id }),
      });
      if (!response.ok) throw new Error("ITEM_DELETE_FAILED");
      setSnippets((previous) => ({
        ...previous,
        [snippet.collectionId]: (previous[snippet.collectionId] ?? []).filter((item) => item.id !== snippet.id),
      }));
    } catch (error) {
      console.error("[my-collections] Could not remove collection snippet.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setRemoveErrorId(snippet.id);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">{t("collections.myCollections")}</h1>
      {authLoading ? (
        <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
      ) : !userId ? (
        <section className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{text.loginPrompt}</p>
          <Link className="inline-block text-primary underline" href="/auth">{text.login}</Link>
        </section>
      ) : (
        <>
          <form onSubmit={(event) => void createCollection(event)} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
            <label className="sr-only" htmlFor="my-collection-title">{t("collections.newName")}</label>
            <input
              id="my-collection-title"
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
          </form>

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
                    </div>
                  </Link>
                  <div className="space-y-3 px-4 pb-4">
                    <button
                      type="button"
                      disabled={visibilitySavingId !== null}
                      onClick={() => void changeVisibility(collection)}
                      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {visibilitySavingId === collection.id ? (
                        <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      {t(collection.isPublic ? "collections.makePrivate" : "collections.makePublic")}
                    </button>
                    {visibilityErrorId === collection.id && (
                      <p role="alert" className="text-sm text-destructive">{t("collections.visibilityError")}</p>
                    )}
                    <details className="rounded-md border p-3">
                      <summary className="cursor-pointer font-medium">{t("collections.manageItems")}</summary>
                      {(snippets[collection.id] ?? []).length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {(snippets[collection.id] ?? []).map((snippet) => (
                            <li key={snippet.id} className="rounded-md py-1 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 break-words">{snippet.songTitle}: {snippet.lineText}</span>
                                <button
                                  type="button"
                                  disabled={removingId !== null}
                                  onClick={() => void removeSnippet(snippet)}
                                  aria-label={t("collections.removeItem")}
                                  title={t("collections.removeItem")}
                                  className="shrink-0 rounded p-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
                                >
                                  {removingId === snippet.id ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Trash2 className="size-4" aria-hidden="true" />
                                  )}
                                </button>
                              </div>
                              {removeErrorId === snippet.id && (
                                <p role="alert" className="mt-1 text-sm text-destructive">{t("collections.removeError")}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">{t("collections.noItems")}</p>
                      )}
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          ) : !loadError ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("collections.empty")}</p>
          ) : null}
        </>
      )}
    </main>
  );
}

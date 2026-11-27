"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import SnippetPlayer from "@/components/SnippetPlayer";
import CollectionSnippetRow, { type EditableCollectionSnippet } from "@/components/CollectionSnippetRow";
import CollectionFavoriteButton from "@/components/CollectionFavoriteButton";
import CollectionProgressBadge from "@/components/CollectionProgressBadge";

type Collection = {
  id: string;
  title: string;
  isPublic: boolean;
  isOwner: boolean;
  sourceLanguage: string;
  itemCount: number;
  favoriteCount: number;
};
type CollectionSnippet = {
  id: string;
  collectionId: string;
  videoId: string;
  songTitle: string;
  lineText: string;
  start: number;
  duration: number;
};
type DraftSnippet = {
  id: string;
  video_id: string;
  title: string;
  start: number;
  duration: number;
  text: string;
  source: "collection" | "db" | "youtube";
};

const SNIPPET_BATCH_SIZE = 5;

function roundToTenth(value: number): number {
  return Number(value.toFixed(1));
}

function roundDurationToTenth(value: number): number {
  return Math.max(0.1, roundToTenth(value));
}

function readCollection(value: unknown): Collection | null {
  if (
    typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" ||
    !("title" in value) || typeof value.title !== "string" ||
    !("isPublic" in value) || typeof value.isPublic !== "boolean" ||
    !("isOwner" in value) || typeof value.isOwner !== "boolean" ||
    !("sourceLanguage" in value) || typeof value.sourceLanguage !== "string" ||
    !("itemCount" in value) || typeof value.itemCount !== "number" ||
    !("favoriteCount" in value) || typeof value.favoriteCount !== "number"
  ) return null;
  return {
    id: value.id,
    title: value.title,
    isPublic: value.isPublic,
    isOwner: value.isOwner,
    sourceLanguage: value.sourceLanguage,
    itemCount: value.itemCount,
    favoriteCount: value.favoriteCount,
  };
}

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  return typeof value === "object" && value !== null &&
    "collections" in value && Array.isArray(value.collections) &&
    value.collections.every((item) => readCollection(item) !== null);
}

function isDraftSnippet(value: unknown): value is Omit<DraftSnippet, "id"> {
  return typeof value === "object" && value !== null &&
    "video_id" in value && typeof value.video_id === "string" &&
    "title" in value && typeof value.title === "string" &&
    "start" in value && typeof value.start === "number" &&
    "duration" in value && typeof value.duration === "number" &&
    "text" in value && typeof value.text === "string" &&
    "source" in value && (value.source === "collection" || value.source === "db" || value.source === "youtube");
}

export default function MyCollectionsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, sourceLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionTitles, setCollectionTitles] = useState<Record<string, string>>({});
  const [snippets, setSnippets] = useState<Record<string, CollectionSnippet[]>>({});
  const [persistedSnippets, setPersistedSnippets] = useState<Record<string, CollectionSnippet[]>>({});
  const [collectionSearchPhrase, setCollectionSearchPhrase] = useState<Record<string, string>>({});
  const [excludeExistingCollectionVideos, setExcludeExistingCollectionVideos] = useState<Record<string, boolean>>({});
  const [addingSnippetsCollectionId, setAddingSnippetsCollectionId] = useState<string | null>(null);
  const [collectionAddErrorId, setCollectionAddErrorId] = useState<string | null>(null);
  const [collectionAddNoResultsId, setCollectionAddNoResultsId] = useState<string | null>(null);
  const [collectionAddWarningId, setCollectionAddWarningId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [title, setTitle] = useState("");
  const [draftPhrase, setDraftPhrase] = useState("");
  const [draft, setDraft] = useState<DraftSnippet[]>([]);
  const [hasMoreSnippets, setHasMoreSnippets] = useState(false);
  const [draftLanguage, setDraftLanguage] = useState(sourceLanguage);
  const [playingSnippetId, setPlayingSnippetId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [playingCollectionSnippet, setPlayingCollectionSnippet] = useState<CollectionSnippet | null>(null);
  const [collectionPreviewVersion, setCollectionPreviewVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCollectionId, setSavingCollectionId] = useState<string | null>(null);
  const [collectionSaveErrorId, setCollectionSaveErrorId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchWarning, setSearchWarning] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [visibilitySavingId, setVisibilitySavingId] = useState<string | null>(null);
  const [visibilityErrorId, setVisibilityErrorId] = useState<string | null>(null);
  const [visibilityMinimumId, setVisibilityMinimumId] = useState<string | null>(null);
  const [removeMinimumId, setRemoveMinimumId] = useState<string | null>(null);
  const [markingAllCompleted, setMarkingAllCompleted] = useState(false);
  const [markAllCompletedError, setMarkAllCompletedError] = useState(false);
  const [markAllCompletedSuccess, setMarkAllCompletedSuccess] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;

    let active = true;
    // Reset the loading state when the account or learning language changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/word-collections?scope=mine&language=${encodeURIComponent(sourceLanguage)}`);
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
            .select("id,collection_id,song_id,video_id,video_title,line_text,start_time,end_time")
            .in("collection_id", ownCollections.map((collection) => collection.id))
            .order("created_at", { ascending: true });
          if (itemError) throw itemError;

          const songIds = [...new Set((itemRows ?? []).flatMap((item) => item.song_id ? [item.song_id] : []))];
          const { data: songRows, error: songError } = songIds.length > 0
            ? await db.from("songs").select("id,title,youtube_id").in("id", songIds)
            : { data: [], error: null };
          if (songError) throw songError;
          const titlesBySongId = new Map((songRows ?? []).map((song) => [song.id, song.title]));
          for (const item of itemRows ?? []) {
            const songTitle = (item.song_id ? titlesBySongId.get(item.song_id) : null) ?? item.video_title;
            const song = item.song_id ? (songRows ?? []).find((candidate) => candidate.id === item.song_id) : null;
            const videoId = item.video_id ?? song?.youtube_id;
            const start = Number(item.start_time);
            const end = Number(item.end_time);
            if (!songTitle || !videoId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
            loadedSnippets[item.collection_id]?.push({
              id: item.id,
              collectionId: item.collection_id,
              videoId,
              songTitle,
              lineText: item.line_text,
              start: roundToTenth(start),
              duration: roundDurationToTenth(end - start),
            });
          }
        }

        if (active) {
          setCollections(ownCollections);
          setCollectionTitles(Object.fromEntries(ownCollections.map((collection) => [collection.id, collection.title])));
          setSnippets(loadedSnippets);
          setPersistedSnippets(loadedSnippets);
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
  }, [authLoading, sourceLanguage, userId]);

  async function searchSnippets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhrase = phrase.trim();
    if (!normalizedPhrase || searching || saving) return;
    setSearching(true);
    setSearchError(false);
    setSearchWarning(false);
    setSaveError(false);
    try {
      const response = await fetch(`/api/snippet-search?phrase=${encodeURIComponent(normalizedPhrase)}&language=${encodeURIComponent(sourceLanguage)}&limit=10`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      const result = typeof payload === "object" && payload !== null
        ? payload as { snippets?: unknown; warning?: unknown }
        : null;
      if (!response.ok || !Array.isArray(result?.snippets) || !result.snippets.every(isDraftSnippet)) {
        throw new Error("SNIPPET_SEARCH_FAILED");
      }
      const foundSnippets = result.snippets.map((snippet, index) => ({ ...snippet, id: `${snippet.video_id}:${snippet.start}:${index}` }));
      setDraft(foundSnippets.slice(0, 10));
      setHasMoreSnippets(foundSnippets.length > 0);
      setDraftLanguage(sourceLanguage);
      setDraftPhrase(normalizedPhrase);
      setTitle(normalizedPhrase);
      setPlayingSnippetId(null);
      setPlayingCollectionSnippet(null);
      setPreviewVersion(0);
      setPlayerError(false);
      setSearchWarning(result.warning === "YOUTUBE_SEARCH_FAILED");
    } catch (error) {
      console.error("[my-collections] Could not search for collection snippets.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  }

  async function markAllOwnedCollectionsCompleted() {
    if (markingAllCompleted || !userId || collections.length === 0) return;
    setMarkingAllCompleted(true);
    setMarkAllCompletedError(false);
    setMarkAllCompletedSuccess(false);
    try {
      const response = await fetch("/api/word-collections/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allOwned: true, completed: true }),
      });
      const result = await response.json().catch(() => null) as { collectionIds?: unknown } | null;
      if (!response.ok || !Array.isArray(result?.collectionIds)) throw new Error("COMPLETION_SAVE_FAILED");
      for (const collectionId of result.collectionIds) {
        if (typeof collectionId === "string") {
          window.dispatchEvent(new CustomEvent("collection-completion-changed", { detail: { collectionId } }));
        }
      }
      setMarkAllCompletedSuccess(true);
    } catch (error) {
      console.error("[my-collections] Could not mark all owned collections complete.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setMarkAllCompletedError(true);
    } finally {
      setMarkingAllCompleted(false);
    }
  }

  async function loadMoreSnippets() {
    if (loadingMore || searching || saving || !draftPhrase) return;
    setLoadingMore(true);
    setSearchError(false);
    try {
      const params = new URLSearchParams({
        phrase: draftPhrase,
        language: draftLanguage,
        limit: String(SNIPPET_BATCH_SIZE),
        excludeVideoIds: [...new Set(draft.map((snippet) => snippet.video_id))].join(","),
      });
      const response = await fetch(`/api/snippet-search?${params.toString()}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      const result = typeof payload === "object" && payload !== null
        ? payload as { snippets?: unknown; warning?: unknown }
        : null;
      if (!response.ok || !Array.isArray(result?.snippets) || !result.snippets.every(isDraftSnippet)) {
        throw new Error("SNIPPET_SEARCH_FAILED");
      }
      const alreadyIncluded = new Set(draft.map((snippet) => snippet.video_id));
      const additions = result.snippets
        .filter((snippet) => !alreadyIncluded.has(snippet.video_id))
        .slice(0, SNIPPET_BATCH_SIZE)
        .map((snippet, index) => ({ ...snippet, id: `${snippet.video_id}:${snippet.start}:${draft.length + index}` }));
      setDraft((current) => [...current, ...additions]);
      setHasMoreSnippets(additions.length > 0);
      setSearchWarning(result.warning === "YOUTUBE_SEARCH_FAILED");
    } catch (error) {
      console.error("[my-collections] Could not load more collection snippets.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setSearchError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || saving || draft.length === 0) return;
    if (draft.some((snippet) => !snippet.text.trim() || snippet.start < 0 || snippet.duration <= 0 ||
      !Number.isFinite(snippet.start) || !Number.isFinite(snippet.duration))) return;
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch("/api/word-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          sourceLanguage: draftLanguage,
          snippets: draft.map(({ video_id, title: videoTitle, start, duration, text }) => ({
            videoId: video_id,
            videoTitle,
            start: roundToTenth(start),
            duration: roundDurationToTenth(duration),
            text,
          })),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const result = typeof payload === "object" && payload !== null
        ? payload as { collection?: unknown; items?: unknown }
        : null;
      const collection = result
        ? readCollection(result.collection)
        : null;
      const savedItems = Array.isArray(result?.items)
        ? result.items.flatMap((item): Omit<CollectionSnippet, "collectionId">[] =>
          typeof item === "object" && item !== null ? (() => {
            const value = item as Record<string, unknown>;
            const start = Number(value.start_time);
            const end = Number(value.end_time);
            return typeof value.id === "string" &&
              typeof value.video_id === "string" &&
              typeof value.video_title === "string" &&
              typeof value.line_text === "string" &&
              Number.isFinite(start) && Number.isFinite(end) && end > start
              ? [{
                id: value.id,
                videoId: value.video_id,
                songTitle: value.video_title,
                lineText: value.line_text,
                start: roundToTenth(start),
                duration: roundDurationToTenth(end - start),
              }]
              : [];
          })() : [],
        )
        : [];
      if (!response.ok || !collection || !collection.isOwner || savedItems.length !== draft.length) {
        throw new Error("COLLECTION_SAVE_FAILED");
      }
      setCollections((previous) => [collection, ...previous]);
      setCollectionTitles((previous) => ({ ...previous, [collection.id]: collection.title }));
      setSnippets((previous) => ({
        ...previous,
        [collection.id]: savedItems.map((item) => ({ ...item, collectionId: collection.id })),
      }));
      setPersistedSnippets((previous) => ({
        ...previous,
        [collection.id]: savedItems.map((item) => ({ ...item, collectionId: collection.id })),
      }));
      setDraft([]);
      setHasMoreSnippets(false);
      setDraftPhrase("");
      setPhrase("");
      setTitle("");
      setPlayingSnippetId(null);
      setPlayingCollectionSnippet(null);
    } catch (error) {
      console.error("[my-collections] Could not save collection draft.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  async function changeVisibility(collection: Collection) {
    if (visibilitySavingId) return;
    if (!collection.isPublic && (snippets[collection.id] ?? []).length < 3) {
      setVisibilityMinimumId(collection.id);
      return;
    }
    setVisibilitySavingId(collection.id);
    setVisibilityErrorId(null);
    setVisibilityMinimumId(null);
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(collection.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !collection.isPublic }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const errorCode = typeof payload === "object" && payload !== null && "code" in payload
        ? payload.code
        : null;
      if (errorCode === "PUBLIC_COLLECTION_REQUIRES_THREE_ITEMS") {
        setVisibilityMinimumId(collection.id);
        return;
      }
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

  function updateDraftSnippet(updated: EditableCollectionSnippet) {
    setDraft((current) => current.map((item) => item.id === updated.id
      ? { ...item, start: updated.start, duration: updated.duration, text: updated.text }
      : item));
  }

  function updateSavedSnippet(updated: EditableCollectionSnippet, collectionId: string) {
    setCollectionSaveErrorId(null);
    setSnippets((current) => ({
      ...current,
      [collectionId]: (current[collectionId] ?? []).map((item) => item.id === updated.id
        ? { ...item, start: updated.start, duration: updated.duration, lineText: updated.text }
        : item),
    }));
  }

  function collectionHasUnsavedChanges(collectionId: string): boolean {
    const collection = collections.find((item) => item.id === collectionId);
    if (collection && (collectionTitles[collectionId] ?? collection.title).trim() !== collection.title) return true;
    const current = snippets[collectionId] ?? [];
    const persisted = persistedSnippets[collectionId] ?? [];
    if (current.length !== persisted.length) return true;
    const originalById = new Map(persisted.map((item) => [item.id, item]));
    return current.some((item) => {
      const original = originalById.get(item.id);
      return !original || item.lineText !== original.lineText || item.start !== original.start || item.duration !== original.duration;
    });
  }

  async function saveCollectionChanges(collection: Collection) {
    if (savingCollectionId || addingSnippetsCollectionId) return;
    const collectionId = collection.id;
    const current = snippets[collectionId] ?? [];
    const persisted = persistedSnippets[collectionId] ?? [];
    if (!collectionHasUnsavedChanges(collectionId)) return;
    const updatedTitle = (collectionTitles[collectionId] ?? collection.title).trim();
    if (!updatedTitle) {
      setCollectionSaveErrorId(collectionId);
      return;
    }
    if (collection.isPublic && current.length < 3) {
      setCollectionSaveErrorId(collectionId);
      setRemoveMinimumId(collectionId);
      return;
    }
    if (current.some((item) => !item.lineText.trim() || !Number.isFinite(item.start) || item.start < 0 ||
      !Number.isFinite(item.duration) || item.duration <= 0)) {
      setCollectionSaveErrorId(collectionId);
      return;
    }

    setSavingCollectionId(collectionId);
    setCollectionSaveErrorId(null);
    const currentById = new Map(current.map((item) => [item.id, item]));
    const originalById = new Map(persisted.map((item) => [item.id, item]));
    const updates = current.filter((item) => {
      const original = originalById.get(item.id);
      return original && (item.lineText !== original.lineText || item.start !== original.start || item.duration !== original.duration);
    });
    const deleted = persisted.filter((item) => !currentById.has(item.id));
    const additions = current.filter((item) => !originalById.has(item.id));
    const savedIds = new Map<string, string>();
    try {
      if (updatedTitle !== collection.title) {
        const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: updatedTitle }),
        });
        if (!response.ok) throw new Error("COLLECTION_TITLE_UPDATE_FAILED");
      }
      const requests = [
        ...updates.map(async (item) => {
          const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, lineText: item.lineText, startTime: item.start, endTime: item.start + item.duration }),
          });
          const result: unknown = await response.json().catch(() => null);
          if (!response.ok || typeof result !== "object" || result === null || !("updated" in result) || result.updated !== true) {
            throw new Error("ITEM_UPDATE_FAILED");
          }
        }),
        ...deleted.map(async (item) => {
          const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}/items`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id }),
          });
          if (response.status === 404) return;
          if (!response.ok) throw new Error("ITEM_DELETE_FAILED");
        }),
        ...additions.map(async (item) => {
          const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: item.videoId,
              videoTitle: item.songTitle,
              lineText: item.lineText,
              startTime: item.start,
              endTime: item.start + item.duration,
            }),
          });
          const result: unknown = await response.json().catch(() => null);
          if (!response.ok || typeof result !== "object" || result === null || !("id" in result) || typeof result.id !== "string") {
            throw new Error("ITEM_ADD_FAILED");
          }
          savedIds.set(item.id, result.id);
        }),
      ];
      const results = await Promise.allSettled(requests);
      if (results.some((result) => result.status === "rejected")) throw new Error("COLLECTION_ITEMS_SAVE_FAILED");
      const savedCollectionItems = current.map((item) => ({ ...item, id: savedIds.get(item.id) ?? item.id }));
      setSnippets((previous) => ({ ...previous, [collectionId]: savedCollectionItems }));
      setPersistedSnippets((previous) => ({ ...previous, [collectionId]: savedCollectionItems }));
      setCollections((previous) => previous.map((item) => item.id === collectionId ? { ...item, title: updatedTitle, itemCount: current.length } : item));
    } catch (error) {
      console.error("[my-collections] Could not save collection changes.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setCollectionSaveErrorId(collectionId);
    } finally {
      setSavingCollectionId(null);
    }
  }

  async function removeSnippet(snippet: CollectionSnippet) {
    if (savingCollectionId || addingSnippetsCollectionId) return;
    setRemoveMinimumId(null);
    const collection = collections.find((item) => item.id === snippet.collectionId);
    const current = snippets[snippet.collectionId] ?? [];
    if (collection?.isPublic && current.length <= 3) {
      setRemoveMinimumId(snippet.id);
      return;
    }
    if (playingCollectionSnippet?.id === snippet.id) setPlayingCollectionSnippet(null);
    setCollectionSaveErrorId(null);
    setSnippets((previous) => ({
      ...previous,
      [snippet.collectionId]: (previous[snippet.collectionId] ?? []).filter((item) => item.id !== snippet.id),
    }));
  }

  async function addFiveSnippetsToCollection(collection: Collection) {
    const collectionId = collection.id;
    const normalizedPhrase = (collectionSearchPhrase[collectionId] ?? "").trim();
    const current = snippets[collectionId] ?? [];
    const persisted = persistedSnippets[collectionId] ?? [];
    const excludeExistingVideos = excludeExistingCollectionVideos[collectionId] !== false;
    if (!normalizedPhrase || addingSnippetsCollectionId || savingCollectionId) return;

    setAddingSnippetsCollectionId(collectionId);
    setCollectionAddErrorId(null);
    setCollectionAddNoResultsId(null);
    setCollectionAddWarningId(null);
    try {
      const params = new URLSearchParams({
        phrase: normalizedPhrase,
        language: collection.sourceLanguage,
        limit: String(SNIPPET_BATCH_SIZE),
      });
      if (excludeExistingVideos) {
        params.set("excludeVideoIds", [...new Set([...current, ...persisted].map((item) => item.videoId))]
          .filter((videoId) => /^[\w-]{11}$/u.test(videoId))
          .join(","));
      }
      const response = await fetch(`/api/snippet-search?${params.toString()}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      const result = typeof payload === "object" && payload !== null
        ? payload as { snippets?: unknown; warning?: unknown }
        : null;
      if (!response.ok || !Array.isArray(result?.snippets) || !result.snippets.every(isDraftSnippet)) {
        throw new Error("SNIPPET_SEARCH_FAILED");
      }
      const existingVideos = excludeExistingVideos
        ? new Set([...current, ...persisted].map((item) => item.videoId))
        : new Set<string>();
      const seenVideos = new Set(existingVideos);
      const additions = result.snippets
        .filter((item) => {
          if (seenVideos.has(item.video_id)) return false;
          seenVideos.add(item.video_id);
          return true;
        })
        .slice(0, SNIPPET_BATCH_SIZE)
        .map((item, index): CollectionSnippet => ({
          id: `new:${Date.now()}:${index}:${item.video_id}`,
          collectionId,
          videoId: item.video_id,
          songTitle: item.title,
          lineText: item.text,
          start: roundToTenth(item.start),
          duration: roundDurationToTenth(item.duration),
        }));
      setSnippets((previous) => ({ ...previous, [collectionId]: [...(previous[collectionId] ?? []), ...additions] }));
      setCollectionAddWarningId(result.warning === "YOUTUBE_SEARCH_FAILED" ? collectionId : null);
      if (additions.length === 0) setCollectionAddNoResultsId(collectionId);
    } catch (error) {
      console.error("[my-collections] Could not find snippets to add to collection.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setCollectionAddErrorId(collectionId);
    } finally {
      setAddingSnippetsCollectionId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t("collections.myCollections")}</h1>
        {!authLoading && userId && (
          <Button type="button" size="sm" variant="outline" className="gap-2" disabled={markingAllCompleted || loading || collections.length === 0} onClick={() => void markAllOwnedCollectionsCompleted()}>
            {markingAllCompleted ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {t("collections.markAllCompleted")}
          </Button>
        )}
      </div>
      {markAllCompletedError && <p role="alert" className="text-sm text-destructive">{t("collections.completionUpdateError")}</p>}
      {markAllCompletedSuccess && <p role="status" className="text-sm text-emerald-600">{t("collections.markAllCompletedSuccess")}</p>}
      {authLoading ? (
        <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
      ) : !userId ? (
        <section className="space-y-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{text.loginPrompt}</p>
          <Link className="inline-block text-primary underline" href="/auth">{text.login}</Link>
        </section>
      ) : (
        <>
          <form onSubmit={(event) => void searchSnippets(event)} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
            <label className="sr-only" htmlFor="my-collection-phrase">{t("collections.searchPhrasePlaceholder")}</label>
            <input
              id="my-collection-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              maxLength={100}
              required
              placeholder={t("collections.searchPhrasePlaceholder")}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
            />
            <button type="submit" disabled={searching || loadingMore || saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {searching ? <><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />{t("collections.searchingSnippets")}</> : t("collections.findSnippets")}
            </button>
          </form>
          {loadError && <p role="alert" className="text-sm text-destructive">{t("collections.loadError")}</p>}
          {searchError && <p role="alert" className="text-sm text-destructive">{t("collections.searchError")}</p>}
          {searchWarning && <p role="status" className="text-sm text-muted-foreground">{t("collections.youtubeWarning")}</p>}
          {draft.length > 0 ? (
            <section className="space-y-4 rounded-xl border bg-card p-4">
              <h2 className="text-xl font-semibold">{t("collections.preview")}</h2>
              <form onSubmit={(event) => void saveCollection(event)} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="draft-collection-title">{t("collections.newName")}</label>
                  <input
                    id="draft-collection-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={80}
                    required
                    className="h-10 w-full rounded-md border bg-background px-3"
                  />
                </div>
                <ul className="space-y-2 overflow-x-auto">
                  {draft.map((snippet) => (
                    <li key={snippet.id}>
                      <CollectionSnippetRow
                        snippet={{
                          id: snippet.id,
                          videoId: snippet.video_id,
                          title: snippet.title,
                          start: snippet.start,
                          duration: snippet.duration,
                          text: snippet.text,
                        }}
                        onChange={updateDraftSnippet}
                        onPlay={(playing) => {
                          setPlayingCollectionSnippet(null);
                          setPlayingSnippetId(playing.id);
                          setPreviewVersion((version) => version + 1);
                          setPlayerError(false);
                        }}
                        onRemove={() => {
                          setDraft((items) => items.filter((item) => item.id !== snippet.id));
                          if (playingSnippetId === snippet.id) setPlayingSnippetId(null);
                        }}
                      />
                    </li>
                  ))}
                </ul>
                {hasMoreSnippets && (
                  <button
                    type="button"
                    onClick={() => void loadMoreSnippets()}
                    disabled={saving || searching || loadingMore}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {loadingMore
                      ? <><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />{t("collections.searchingSnippets")}</>
                      : t("collections.addFiveMore", { count: SNIPPET_BATCH_SIZE })}
                  </button>
                )}
                {draft.length > 0 && playingSnippetId && (() => {
                  const playingSnippet = draft.find((snippet) => snippet.id === playingSnippetId);
                  return playingSnippet ? (
                    <div className="mx-auto w-full max-w-2xl">
                      <SnippetPlayer
                        key={`${playingSnippet.id}:${playingSnippet.start}:${playingSnippet.duration}:${previewVersion}`}
                        itemId={`${playingSnippet.id}:${previewVersion}`}
                        videoId={playingSnippet.video_id}
                        startTime={playingSnippet.start}
                        endTime={playingSnippet.start + playingSnippet.duration}
                        onTimeUpdate={() => undefined}
                        onPlayingChange={() => undefined}
                        onEnded={() => undefined}
                        onError={() => setPlayerError(true)}
                      />
                      {playerError && <p role="alert" className="mt-2 text-sm text-destructive">{t("collections.playerError")}</p>}
                    </div>
                  ) : null;
                })()}
                {saveError && <p role="alert" className="text-sm text-destructive">{t("collections.saveError")}</p>}
                <button
                  type="submit"
                  disabled={saving || draft.length === 0 || !title.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />{t("collections.savingCollection")}</> : t("collections.saveCollection")}
                </button>
              </form>
            </section>
          ) : !searching ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {phrase ? t("collections.noSnippetsFound") : t("collections.searchFirst")}
            </p>
          ) : null}
          {loading ? (
            <p role="status" className="text-muted-foreground">{t("collections.loading")}</p>
          ) : collections.length > 0 ? (
            <ul className="space-y-2">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <details className="group rounded-md border bg-card">
                    <summary className="flex min-h-[50px] cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="size-0 border-y-[4px] border-l-[5px] border-y-transparent border-l-current text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-words font-medium">{collection.title}</span>
                      <CollectionProgressBadge collectionId={collection.id} compact />
                      <span className="shrink-0 text-xs text-muted-foreground">{t("collections.phraseCount", { count: collection.itemCount })}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">({t(collection.isPublic ? "collections.publicBadge" : "collections.privateBadge")})</span>
                    </summary>
                    <div className="space-y-3 border-t px-3 py-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium" htmlFor={`collection-title-${collection.id}`}>{t("collections.newName")}</label>
                        <input
                          id={`collection-title-${collection.id}`}
                          value={collectionTitles[collection.id] ?? collection.title}
                          onChange={(event) => setCollectionTitles((previous) => ({ ...previous, [collection.id]: event.target.value }))}
                          maxLength={80}
                          required
                          disabled={savingCollectionId === collection.id || addingSnippetsCollectionId === collection.id}
                          className="h-10 w-full rounded-md border bg-background px-3"
                        />
                      </div>
                      <Link href={`/collections/${collection.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {t("collections.open")}
                      </Link>
                      {collection.isPublic && <CollectionFavoriteButton collectionId={collection.id} compact />}
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
                    {visibilityMinimumId === collection.id && (
                      <p role="alert" className="text-sm text-destructive">{t("collections.minimumPublic")}</p>
                    )}
                    <details className="rounded-md border p-3">
                      <summary className="cursor-pointer font-medium">{t("collections.manageItems")}</summary>
                      <form
                        onSubmit={(event) => { event.preventDefault(); void addFiveSnippetsToCollection(collection); }}
                        className="mt-3 flex flex-wrap gap-2"
                      >
                        <input
                          type="search"
                          value={collectionSearchPhrase[collection.id] ?? ""}
                          onChange={(event) => setCollectionSearchPhrase((previous) => ({ ...previous, [collection.id]: event.target.value }))}
                          placeholder={t("collections.searchPhrasePlaceholder")}
                          aria-label={t("collections.searchPhrasePlaceholder")}
                          className="h-10 min-w-[220px] flex-1 rounded-md border bg-background px-3"
                          disabled={savingCollectionId === collection.id || addingSnippetsCollectionId === collection.id}
                        />
                        <label className="flex basis-full items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={excludeExistingCollectionVideos[collection.id] !== false}
                            onChange={(event) => setExcludeExistingCollectionVideos((previous) => ({ ...previous, [collection.id]: event.target.checked }))}
                            disabled={savingCollectionId === collection.id || addingSnippetsCollectionId === collection.id}
                            className="size-4 accent-primary"
                          />
                          {t("collections.excludeExistingVideos")}
                        </label>
                        <button
                          type="submit"
                          disabled={!collectionSearchPhrase[collection.id]?.trim() || savingCollectionId !== null || addingSnippetsCollectionId !== null}
                          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {addingSnippetsCollectionId === collection.id ? (
                            <><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />{t("collections.searchingSnippets")}</>
                          ) : t("collections.addFiveMore", { count: SNIPPET_BATCH_SIZE })}
                        </button>
                      </form>
                      {collectionAddErrorId === collection.id && <p role="alert" className="mt-2 text-sm text-destructive">{t("collections.searchError")}</p>}
                      {collectionAddNoResultsId === collection.id && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("collections.noSnippetsFound")}</p>}
                      {collectionAddWarningId === collection.id && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("collections.youtubeWarning")}</p>}
                      {(snippets[collection.id] ?? []).length > 0 ? (
                        <ul className="mt-3 space-y-2 overflow-x-auto">
                          {(snippets[collection.id] ?? []).map((snippet) => (
                            <li key={snippet.id}>
                              <CollectionSnippetRow
                                snippet={{
                                  id: snippet.id,
                                  videoId: snippet.videoId,
                                  title: snippet.songTitle,
                                  start: snippet.start,
                                  duration: snippet.duration,
                                  text: snippet.lineText,
                                }}
                                onChange={(updated) => updateSavedSnippet(updated, collection.id)}
                                onPlay={(playing) => {
                                  setPlayingSnippetId(null);
                                  setPlayingCollectionSnippet({
                                    ...snippet,
                                    songTitle: playing.title,
                                    lineText: playing.text,
                                    start: playing.start,
                                    duration: playing.duration,
                                  });
                                  setCollectionPreviewVersion((version) => version + 1);
                                  setPlayerError(false);
                                }}
                                onRemove={() => void removeSnippet(snippet)}
                                disabled={savingCollectionId === collection.id || addingSnippetsCollectionId === collection.id}
                              />
                              {removeMinimumId === snippet.id && (
                                <p role="alert" className="mt-1 text-sm text-destructive">{t("collections.minimumPublic")}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">{t("collections.noItems")}</p>
                      )}
                      {playingCollectionSnippet?.collectionId === collection.id && (
                        <div className="mx-auto mt-3 w-full max-w-2xl">
                          <SnippetPlayer
                            key={`${playingCollectionSnippet.id}:${playingCollectionSnippet.start}:${playingCollectionSnippet.duration}:${collectionPreviewVersion}`}
                            itemId={`${playingCollectionSnippet.id}:${collectionPreviewVersion}`}
                            videoId={playingCollectionSnippet.videoId}
                            startTime={playingCollectionSnippet.start}
                            endTime={playingCollectionSnippet.start + playingCollectionSnippet.duration}
                            onTimeUpdate={() => undefined}
                            onPlayingChange={() => undefined}
                            onEnded={() => undefined}
                            onError={() => setPlayerError(true)}
                          />
                          {playerError && <p role="alert" className="mt-2 text-sm text-destructive">{t("collections.playerError")}</p>}
                        </div>
                      )}
                    </details>
                    <div className="space-y-2">
                      {collectionSaveErrorId === collection.id && (
                        <p role="alert" className="text-sm text-destructive">
                          {collection.isPublic && (snippets[collection.id] ?? []).length < 3
                            ? t("collections.minimumPublic")
                            : t("collections.saveChangesError")}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={savingCollectionId !== null || addingSnippetsCollectionId !== null || !collectionHasUnsavedChanges(collection.id)}
                        onClick={() => void saveCollectionChanges(collection)}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {savingCollectionId === collection.id ? (
                          <><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />{t("collections.savingCollection")}</>
                        ) : t("collections.saveChanges")}
                      </button>
                    </div>
                    </div>
                  </details>
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

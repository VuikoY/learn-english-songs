"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const GUEST_COLLECTION_FAVORITES_KEY = "lingo-clips:collection-favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

function readGuestFavorites(): string[] {
  try {
    const stored = localStorage.getItem(GUEST_COLLECTION_FAVORITES_KEY);
    const value: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

export default function CollectionFavoriteButton({
  collectionId,
  compact = false,
}: {
  collectionId: string;
  compact?: boolean;
}) {
  const { userId, loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!userId) {
      setFavorite(readGuestFavorites().includes(collectionId));
      return;
    }
    const db = getSupabaseBrowserClient();
    if (!db) {
      setError(true);
      return;
    }
    const { data, error: queryError } = await db
      .from("user_favorite_collections")
      .select("collection_id")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .maybeSingle();
    if (queryError) {
      setError(true);
      return;
    }
    setFavorite(Boolean(data));
  }, [authLoading, collectionId, userId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    window.addEventListener(FAVORITES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  async function toggle() {
    if (busy || authLoading) return;
    setBusy(true);
    setError(false);
    try {
      if (!userId) {
        const ids = readGuestFavorites();
        const next = favorite ? ids.filter((id) => id !== collectionId) : [...ids, collectionId];
        localStorage.setItem(GUEST_COLLECTION_FAVORITES_KEY, JSON.stringify(next));
        setFavorite(!favorite);
        window.dispatchEvent(new Event(FAVORITES_CHANGED));
        return;
      }
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("SERVICE_UNAVAILABLE");
      const result = favorite
        ? await db.from("user_favorite_collections").delete()
          .eq("user_id", userId).eq("collection_id", collectionId)
        : await db.from("user_favorite_collections").upsert(
          { user_id: userId, collection_id: collectionId },
          { onConflict: "user_id,collection_id", ignoreDuplicates: true },
        );
      if (result.error) throw result.error;
      setFavorite(!favorite);
      window.dispatchEvent(new Event(FAVORITES_CHANGED));
    } catch (reason) {
      console.error("[collection-favorites] Could not update favorite.", {
        errorType: reason instanceof Error ? reason.name : "UnknownError",
      });
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const label = favorite ? t("favorites.remove") : t("favorites.add");
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={busy || authLoading}
        onClick={() => void toggle()}
        aria-pressed={favorite}
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center whitespace-nowrap disabled:opacity-50 ${compact ? "size-9 justify-center rounded-full hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" : "gap-2 rounded-md border px-3 py-2 text-sm"}`}
      >
        {busy
          ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          : <Heart className={`size-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden="true" />}
        {!compact && <span>{label}</span>}
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{t("favorites.updateError")}</span>}
    </span>
  );
}

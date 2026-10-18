"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";
function readGuestFavorites(): string[] {
  try {
    const stored = localStorage.getItem(GUEST_FAVORITES_KEY);
    const value: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function writeGuestFavorites(ids: string[]) {
  localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([...new Set(ids)]));
  window.dispatchEvent(new Event(FAVORITES_CHANGED));
}

export default function FavoriteButton({ songId, compact = false }: { songId: string; compact?: boolean }) {
  const { userId, loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!userId) {
      setFavorite(readGuestFavorites().includes(songId));
      return;
    }
    const db = getSupabaseBrowserClient();
    if (!db) { setFavorite(false); return; }
    const { data, error } = await db.from("user_favorites").select("song_id")
      .eq("user_id", userId).eq("song_id", songId).maybeSingle();
    if (!error) setFavorite(Boolean(data));
  }, [authLoading, songId, userId]);

  useEffect(() => {
    void refresh();
    if (userId) return;
    const sync = () => setFavorite(readGuestFavorites().includes(songId));
    window.addEventListener(FAVORITES_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [refresh, songId, userId]);

  async function toggle() {
    if (busy || authLoading) return;
    setBusy(true);
    try {
      if (!userId) {
        const ids = readGuestFavorites();
        writeGuestFavorites(favorite ? ids.filter((id) => id !== songId) : [...ids, songId]);
        setFavorite(!favorite);
        return;
      }
      const db = getSupabaseBrowserClient();
      if (!db) return;
      const result = favorite
        ? await db.from("user_favorites").delete().eq("user_id", userId).eq("song_id", songId)
        : await db.from("user_favorites").upsert({ user_id: userId, song_id: songId }, { onConflict: "user_id,song_id", ignoreDuplicates: true });
      if (!result.error) {
        setFavorite(!favorite);
        window.dispatchEvent(new Event(FAVORITES_CHANGED));
      }
    } finally { setBusy(false); }
  }

  const label = favorite ? t("favorites.remove") : t("favorites.add");
  const visibleLabel = busy ? t("common.saving") : label;
  return <button type="button" disabled={busy || authLoading} onClick={toggle} aria-pressed={favorite}
    aria-label={visibleLabel} title={visibleLabel}
    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border disabled:opacity-50 ${compact ? "gap-1 px-2 py-1 text-xs" : "gap-2 px-3 py-2 text-sm"}`}>
    {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Heart className={`size-4 shrink-0 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden="true" />}
    <span className={compact ? "hidden xl:inline" : undefined}>{visibleLabel}</span>
  </button>;
}

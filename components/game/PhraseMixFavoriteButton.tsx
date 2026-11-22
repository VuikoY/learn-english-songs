"use client";

import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

export default function PhraseMixFavoriteButton({
  sourceType,
  sourceId,
  initialFavorite,
}: {
  sourceType: "media" | "collection";
  sourceId: string;
  initialFavorite: boolean;
}) {
  const { userId, loading: authLoading } = useAuthState();
  const { t, uiLanguage } = useLanguage();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const [loginHint, setLoginHint] = useState(false);
  const [error, setError] = useState(false);

  async function toggleFavorite() {
    if (authLoading || busy) return;
    if (!userId) {
      setLoginHint(true);
      return;
    }

    const previous = favorite;
    const next = !previous;
    setFavorite(next);
    setBusy(true);
    setLoginHint(false);
    setError(false);
    try {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("SERVICE_UNAVAILABLE");
      const result = sourceType === "media"
        ? previous
          ? await db.from("user_favorites").delete().eq("user_id", userId).eq("song_id", sourceId)
          : await db.from("user_favorites").upsert({ user_id: userId, song_id: sourceId }, { onConflict: "user_id,song_id", ignoreDuplicates: true })
        : previous
          ? await db.from("user_favorite_collections").delete().eq("user_id", userId).eq("collection_id", sourceId)
          : await db.from("user_favorite_collections").upsert({ user_id: userId, collection_id: sourceId }, { onConflict: "user_id,collection_id", ignoreDuplicates: true });
      if (result.error) throw result.error;
      window.dispatchEvent(new Event(FAVORITES_CHANGED));
    } catch (reason) {
      setFavorite(previous);
      setError(true);
      console.error("[phrase-mix] Could not update favorite.", {
        errorType: reason instanceof Error ? reason.name : "UnknownError",
      });
    } finally {
      setBusy(false);
    }
  }

  const label = favorite ? t("favorites.remove") : t("favorites.add");
  const loginText = uiLanguage === "uk" ? "Увійдіть, щоб зберігати обране" : uiLanguage === "ru" ? "Войдите, чтобы сохранять избранное" : uiLanguage === "pl" ? "Zaloguj się, aby zapisywać ulubione" : uiLanguage === "es" ? "Inicia sesión para guardar favoritos" : "Sign in to save favorites";

  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        disabled={authLoading || busy}
        onClick={() => void toggleFavorite()}
        aria-pressed={favorite}
        aria-label={userId ? label : loginText}
        title={userId ? label : loginText}
        className="inline-flex size-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
      >
        {busy
          ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          : <Heart className={`size-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden="true" />}
      </button>
      {loginHint && <span role="status" className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-xs text-white shadow">{loginText}</span>}
      {error && <span role="alert" className="sr-only">{t("favorites.updateError")}</span>}
    </div>
  );
}

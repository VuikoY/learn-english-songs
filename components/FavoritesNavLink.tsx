"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const GUEST_COLLECTION_FAVORITES_KEY = "lingo-clips:collection-favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

function readGuestIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

export default function FavoritesNavLink() {
  const { userId, loading } = useAuthState();
  const { t, sourceLanguage } = useLanguage();
  const [count, setCount] = useState(0);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshIdRef.current;
    if (loading) return;
    setCount(0);
    const db = getSupabaseBrowserClient();
    if (!db) return;
    if (userId) {
      const [mediaResult, collectionResult] = await Promise.all([
        db.from("user_favorites").select("song_id,songs!inner(language)")
          .eq("user_id", userId).eq("songs.language", sourceLanguage),
        db.from("user_favorite_collections")
          .select("collection_id,word_collections!inner(source_language,is_public)")
          .eq("user_id", userId)
          .eq("word_collections.is_public", true)
          .eq("word_collections.source_language", sourceLanguage),
      ]);
      if (mediaResult.error || collectionResult.error) {
        console.error("[favorites-nav] Could not count language-filtered favorites.", {
          code: mediaResult.error?.code ?? collectionResult.error?.code,
        });
        return;
      }
      if (requestId === refreshIdRef.current) {
        setCount((mediaResult.data?.length ?? 0) + (collectionResult.data?.length ?? 0));
      }
      return;
    }

    const mediaIds = readGuestIds(GUEST_FAVORITES_KEY);
    const collectionIds = readGuestIds(GUEST_COLLECTION_FAVORITES_KEY);
    const [mediaResult, collectionResult] = await Promise.all([
      mediaIds.length > 0
        ? db.from("songs").select("id").in("id", mediaIds).eq("language", sourceLanguage)
        : Promise.resolve({ data: [], error: null }),
      collectionIds.length > 0
        ? db.from("word_collections").select("id").in("id", collectionIds)
          .eq("is_public", true).eq("source_language", sourceLanguage)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (mediaResult.error || collectionResult.error) {
      console.error("[favorites-nav] Could not count guest favorites.", {
        code: mediaResult.error?.code ?? collectionResult.error?.code,
      });
      return;
    }
    if (requestId === refreshIdRef.current) {
      setCount((mediaResult.data?.length ?? 0) + (collectionResult.data?.length ?? 0));
    }
  }, [loading, sourceLanguage, userId]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    window.addEventListener(FAVORITES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return <Link href="/favorites" className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}>
    <span className="inline-flex items-center" style={{ columnGap: 3 }}>
      <Heart className="size-4" aria-hidden="true" /><span>{t("nav.favorites")}</span>
    </span>
    {count > 0 && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>}
  </Link>;
}

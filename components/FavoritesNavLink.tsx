"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const FAVORITES_CHANGED = "lingo-clips:favorites-changed";

export default function FavoritesNavLink() {
  const { userId, loading } = useAuthState();
  const { t } = useLanguage();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (loading) return;
    if (!userId) {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY) ?? "[]");
        setCount(Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")).size : 0);
      } catch { setCount(0); }
      return;
    }
    const db = getSupabaseBrowserClient();
    if (!db) return;
    const { count: favoriteCount, error } = await db.from("user_favorites").select("song_id", { count: "exact", head: true }).eq("user_id", userId);
    if (!error) setCount(favoriteCount ?? 0);
  }, [loading, userId]);

  useEffect(() => {
    void refresh();
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

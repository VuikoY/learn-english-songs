"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

type Props = { songId?: string | null; lineIndex: number; lineText: string; startTime: number; endTime: number };
const favoriteLineCache = new Map<string, Promise<Set<number>>>();
function loadFavoriteLines(userId: string, songId: string) {
  const key = `${userId}:${songId}`;
  const cached = favoriteLineCache.get(key);
  if (cached) return cached;
  const request = (async () => {
    const db = getSupabaseBrowserClient();
    if (!db) return new Set<number>();
    const { data, error } = await db.from("favorite_lines").select("line_index").eq("user_id", userId).eq("song_id", songId);
    if (error) throw error;
    return new Set((data ?? []).map(row => row.line_index));
  })();
  favoriteLineCache.set(key, request);
  return request;
}
export default function FavoriteLineButton({ songId, lineIndex, lineText, startTime, endTime }: Props) {
  const { userId } = useAuthState();
  const { t } = useLanguage();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!userId || !songId) { setSaved(false); return; }
      try {
        const favorites = await loadFavoriteLines(userId, songId);
        if (active) setSaved(favorites.has(lineIndex));
      } catch { if (active) setSaved(false); }
    }
    void load();
    return () => { active = false; };
  }, [lineIndex, songId, userId]);
  async function toggle() {
    const db = getSupabaseBrowserClient();
    if (!db || !userId || !songId || busy) return;
    const previous = saved;
    setSaved(!previous); setBusy(true);
    const result = previous
      ? await db.from("favorite_lines").delete().eq("user_id", userId).eq("song_id", songId).eq("line_index", lineIndex)
      : await db.from("favorite_lines").insert({ user_id: userId, song_id: songId, line_index: lineIndex, line_text: lineText, start_time: startTime, end_time: Math.max(startTime + 0.1, endTime) });
    if (result.error) setSaved(previous);
    else {
      const key = `${userId}:${songId}`;
      const cache = await loadFavoriteLines(userId, songId);
      if (previous) cache.delete(lineIndex); else cache.add(lineIndex);
      favoriteLineCache.set(key, Promise.resolve(cache));
      window.dispatchEvent(new Event("lingo-clips:favorites-changed"));
    }
    setBusy(false);
  }
  return <button type="button" disabled={!userId || !songId || busy} onClick={() => void toggle()} aria-label={saved ? t("favorites.removeLine") : t("favorites.saveLine")} title={!userId ? t("favorites.signInToSaveLine") : t("favorites.saveLine")} className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-40"><Heart className={`size-4 ${saved ? "fill-rose-500 text-rose-500" : ""}`} /></button>;
}

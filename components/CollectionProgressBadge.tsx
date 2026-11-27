"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = { collectionId: string; compact?: boolean };
type Progress = { isCompleted: boolean; difficulty: string | null; averageAccuracy: number } | null;
const DIFFICULTY_ORDER: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

export default function CollectionProgressBadge({ collectionId, compact = false }: Props) {
  const { userId } = useAuthState();
  const { t } = useLanguage();
  const [progress, setProgress] = useState<Progress>(null);

  useEffect(() => {
    if (!userId) {
      setProgress(null);
      return;
    }
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let active = true;
    const load = async () => {
      const { data, error } = await db.from("user_collection_progress")
        .select("difficulty,accuracy,is_completed")
        .eq("user_id", userId)
        .eq("collection_id", collectionId);
      if (!active) return;
      if (error) {
        console.error("[collection-progress] Could not load collection completion.", error.code);
        return;
      }
      const rows = data ?? [];
      const best = [...rows].filter((row) => row.is_completed).sort((a, b) =>
        (DIFFICULTY_ORDER[b.difficulty] ?? 0) - (DIFFICULTY_ORDER[a.difficulty] ?? 0),
      )[0];
      setProgress(rows.length ? {
        isCompleted: Boolean(best),
        difficulty: best?.difficulty ?? null,
        averageAccuracy: Math.round(rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length),
      } : null);
    };
    void load();
    const onSaved = (event: Event) => {
      if ((event as CustomEvent<{ collectionId?: string }>).detail?.collectionId === collectionId) void load();
    };
    window.addEventListener("collection-progress-saved", onSaved);
    return () => {
      active = false;
      window.removeEventListener("collection-progress-saved", onSaved);
    };
  }, [collectionId, userId]);

  if (!progress) return null;
  const difficultyLabel = progress.difficulty
    ? t(`game.difficulty.${progress.difficulty.toLowerCase() as "easy" | "medium" | "hard"}`)
    : null;
  const highAccuracy = progress.averageAccuracy > 80;
  return (
    <div className={`flex flex-col items-end ${compact ? "gap-0.5" : "gap-1.5"}`}>
      {progress.isCompleted && (
        <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 drop-shadow-md backdrop-blur-sm">
          <span className="text-xs font-bold text-emerald-400" aria-label={t("catalog.completedBadge")}>✓</span>
          {progress.difficulty === "Hard" && (
            <span className={`flex items-center gap-1 text-xs font-bold ${highAccuracy ? "text-emerald-400" : "text-amber-400"}`}>
              <Crown className="size-3.5" aria-hidden="true" /> {difficultyLabel}
            </span>
          )}
          {progress.difficulty === "Medium" && <span className={`text-xs font-semibold ${highAccuracy ? "text-emerald-400" : "text-blue-400"}`}>⚡ {difficultyLabel}</span>}
          {progress.difficulty === "Easy" && <span className="text-xs font-semibold text-emerald-400">{difficultyLabel}</span>}
        </div>
      )}
      {progress.averageAccuracy >= 0 && (
        <span
          aria-label={t("catalog.averageAccuracy", { percent: progress.averageAccuracy })}
          className={`rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold drop-shadow-md backdrop-blur-sm ${progress.averageAccuracy >= 80 ? "text-emerald-400" : "text-amber-300"}`}
        >
          🎯 {progress.averageAccuracy}%
        </span>
      )}
    </div>
  );
}

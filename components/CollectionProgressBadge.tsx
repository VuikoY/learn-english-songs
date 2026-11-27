"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = { collectionId: string; compact?: boolean };
type Progress = { isCompleted: boolean; difficulty: string | null; averageAccuracy: number | null } | null;
const DIFFICULTY_ORDER: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

export default function CollectionProgressBadge({ collectionId, compact = false }: Props) {
  const { userId } = useAuthState();
  const { t } = useLanguage();
  const [progress, setProgress] = useState<Progress>(null);

  useEffect(() => {
    if (!userId) return;
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let active = true;
    const load = async () => {
      const [progressResult, completionResult] = await Promise.all([
        db.from("user_collection_progress")
          .select("difficulty,accuracy,is_completed")
          .eq("user_id", userId)
          .eq("collection_id", collectionId),
        db.from("user_collection_completion")
          .select("is_completed")
          .eq("user_id", userId)
          .eq("collection_id", collectionId)
          .maybeSingle(),
      ]);
      if (!active) return;
      if (progressResult.error || completionResult.error) {
        console.error("[collection-progress] Could not load collection completion.", progressResult.error?.code ?? completionResult.error?.code);
        return;
      }
      const rows = progressResult.data ?? [];
      const best = [...rows].filter((row) => row.is_completed).sort((a, b) =>
        (DIFFICULTY_ORDER[b.difficulty] ?? 0) - (DIFFICULTY_ORDER[a.difficulty] ?? 0),
      )[0];
      const isCompleted = completionResult.data?.is_completed ?? Boolean(best);
      setProgress(rows.length || isCompleted ? {
        isCompleted,
        difficulty: isCompleted ? best?.difficulty ?? null : null,
        averageAccuracy: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length) : null,
      } : null);
    };
    void load();
    const onSaved = (event: Event) => {
      if ((event as CustomEvent<{ collectionId?: string }>).detail?.collectionId === collectionId) void load();
    };
    window.addEventListener("collection-progress-saved", onSaved);
    window.addEventListener("collection-completion-changed", onSaved);
    return () => {
      active = false;
      window.removeEventListener("collection-progress-saved", onSaved);
      window.removeEventListener("collection-completion-changed", onSaved);
    };
  }, [collectionId, userId]);

  if (!progress || !userId) return null;
  const difficultyLabel = progress.difficulty
    ? t(`game.difficulty.${progress.difficulty.toLowerCase() as "easy" | "medium" | "hard"}`)
    : null;
  const highAccuracy = (progress.averageAccuracy ?? 0) > 80;
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
      {progress.averageAccuracy !== null && (
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

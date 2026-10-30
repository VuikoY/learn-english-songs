import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type CompletedDifficulty = "Easy" | "Medium" | "Hard";
export type MediaCompletion = {
  isCompleted: boolean;
  completedDifficulty: CompletedDifficulty | null;
  averageAccuracy: number | null;
};

const DIFFICULTY_RANK: Record<CompletedDifficulty, number> = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
};

export async function fetchMediaCompletion(
  db: SupabaseClient<Database>,
  userId: string | null,
  mediaIds: string[],
): Promise<Record<string, MediaCompletion>> {
  const completionById: Record<string, MediaCompletion> = {};
  if (!userId || mediaIds.length === 0) return completionById;

  const { data, error } = await db
    .from("user_media_progress")
    .select("media_id,difficulty,accuracy,is_completed")
    .eq("user_id", userId)
    .in("media_id", mediaIds);
  if (error) throw error;

  const accuracyTotals: Record<string, { sum: number; count: number }> = {};
  for (const row of data ?? []) {
    const accuracy = accuracyTotals[row.media_id] ?? { sum: 0, count: 0 };
    accuracy.sum += row.accuracy;
    accuracy.count += 1;
    accuracyTotals[row.media_id] = accuracy;

    if (!row.is_completed) continue;
    const difficulty = row.difficulty as CompletedDifficulty;
    if (!(difficulty in DIFFICULTY_RANK)) continue;
    const current = completionById[row.media_id];
    if (!current || DIFFICULTY_RANK[difficulty] > DIFFICULTY_RANK[current.completedDifficulty ?? "Easy"]) {
      completionById[row.media_id] = {
        isCompleted: true,
        completedDifficulty: difficulty,
        averageAccuracy: Math.round(accuracy.sum / accuracy.count),
      };
    }
  }

  for (const [mediaId, accuracy] of Object.entries(accuracyTotals)) {
    const current = completionById[mediaId];
    completionById[mediaId] = {
      isCompleted: current?.isCompleted ?? false,
      completedDifficulty: current?.completedDifficulty ?? null,
      averageAccuracy: Math.round(accuracy.sum / accuracy.count),
    };
  }

  return completionById;
}

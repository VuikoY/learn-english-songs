"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { Crown } from "lucide-react";

type LearningStats = { completedMedia: number; hardCompleted: number; wordsCompleted: number; averageAccuracy: number };
type LeaderboardEntry = { pseudonym: string; words_covered: number; average_accuracy: number; completed_media: number };

export default function LearningStatsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [learningStatsError, setLearningStatsError] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);

  const refresh = useCallback(async () => {
    const db = getSupabaseBrowserClient();
    if (!db) {
      setLearningStatsError(true);
      setLeaderboardError(true);
      setLeaderboardLoading(false);
      return;
    }
    if (!userId) return;

    const [progress, leaderboardResult, wordTotals] = await Promise.all([
      db.from("user_media_progress")
        .select("media_id,difficulty,accuracy,words_completed,is_completed")
        .eq("user_id", userId),
      db.rpc("get_learning_leaderboard"),
      db.rpc("get_learning_word_totals"),
    ]);

    if (progress.error || wordTotals.error) {
      console.error("[learning-stats] Could not load learning statistics.", progress.error?.code ?? wordTotals.error?.code);
      setLearningStats(null);
      setLearningStatsError(true);
    } else {
      const progressRows = progress.data ?? [];
      const completedRows = progressRows.filter((row) => row.is_completed);
      setLearningStats({
        completedMedia: new Set(completedRows.map((row) => row.media_id)).size,
        hardCompleted: new Set(completedRows.filter((row) => row.difficulty === "Hard").map((row) => row.media_id)).size,
        wordsCompleted: wordTotals.data?.[0]?.words_covered ?? 0,
        averageAccuracy: progressRows.length
          ? Math.round(progressRows.reduce((sum, row) => sum + row.accuracy, 0) / progressRows.length)
          : 0,
      });
      setLearningStatsError(false);
    }

    if (leaderboardResult.error) {
      console.error("[learning-stats] Could not load the learning leaderboard.", leaderboardResult.error.code);
      setLeaderboard([]);
      setLeaderboardError(true);
    } else {
      setLeaderboard(leaderboardResult.data);
      setLeaderboardError(false);
    }
    setLeaderboardLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!authLoading && userId) void Promise.resolve().then(refresh);
  }, [authLoading, refresh, userId]);

  if (authLoading) return <main className="mx-auto max-w-5xl p-8">{text.loading}</main>;
  if (!userId) return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
      <h1 className="text-3xl font-bold">{t("dashboard.learningStats")}</h1>
      <p>{text.loginPrompt}</p>
      <Link className="inline-block text-primary underline" href="/auth">{text.login}</Link>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
      <section>
        <h1 className="mb-4 text-3xl font-bold">{t("dashboard.learningStats")}</h1>
        {learningStatsError ? (
          <p role="alert" className="text-sm text-destructive">{t("dashboard.learningStatsError")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-base font-medium text-muted-foreground">{t("dashboard.wordsCompleted")}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-primary">{learningStats?.wordsCompleted ?? "—"}</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-base font-medium text-muted-foreground">{t("dashboard.averageAccuracy")}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{learningStats ? `${learningStats.averageAccuracy}%` : "—"}</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-semibold tabular-nums">{learningStats?.completedMedia ?? "—"}</span>
                <span className="text-base font-medium text-muted-foreground">{t("dashboard.completedMedia")}</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-base font-medium text-amber-500">
                <Crown className="size-4" aria-hidden="true" />
                <span className="tabular-nums">{learningStats?.hardCompleted ?? "—"}</span>
                <span>{t("dashboard.onHard")}</span>
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">{t("dashboard.leaderboard")}</h2>
        {leaderboardLoading ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.leaderboardLoading")}</p>
        ) : leaderboardError ? (
          <p role="alert" className="text-sm text-destructive">{t("dashboard.leaderboardError")}</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.leaderboardEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("dashboard.leaderboardRank")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("dashboard.leaderboardLearner")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("dashboard.wordsCompleted")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("dashboard.averageAccuracy")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("dashboard.completedMedia")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leaderboard.map((entry, index) => (
                  <tr key={entry.pseudonym}>
                    <td className="px-4 py-3 tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3">{t("dashboard.leaderboardLearner")} {entry.pseudonym}</td>
                    <td className="px-4 py-3 tabular-nums">{entry.words_covered}</td>
                    <td className="px-4 py-3 tabular-nums">{entry.average_accuracy}%</td>
                    <td className="px-4 py-3 tabular-nums">{entry.completed_media}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

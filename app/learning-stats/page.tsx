"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import { Crown } from "lucide-react";
import type { Language } from "@/types/game";

type LearningStats = { completedMedia: number; hardCompleted: number; wordsCompleted: number; averageAccuracy: number };
type LeaderboardEntry = { pseudonym: string; words_covered: number; average_accuracy: number; completed_media: number };
type ActivityPeriod = "7d" | "30d" | "all";
type DailyActivity = { date: string; wordsCount: number };

const LOCALE_TAGS: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  en: "en-US",
  pl: "pl-PL",
  es: "es-ES",
};

function activityDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function activityTick(date: string, period: ActivityPeriod, locale: string): string {
  const value = activityDate(date);
  if (period === "all") {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(value);
  }
  const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${day}.${month}`;
}

function activityTooltipDate(date: string, period: ActivityPeriod, locale: string): string {
  return new Intl.DateTimeFormat(
    locale,
    period === "all"
      ? { month: "long", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" },
  ).format(activityDate(date));
}

function isDailyActivity(value: unknown): value is DailyActivity {
  return value !== null &&
    typeof value === "object" &&
    "date" in value &&
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    "wordsCount" in value &&
    typeof value.wordsCount === "number" &&
    Number.isInteger(value.wordsCount) &&
    value.wordsCount >= 0;
}

export default function LearningStatsPage() {
  const { userId, loading: authLoading } = useAuthState();
  const { uiLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>("7d");
  const [activityData, setActivityData] = useState<DailyActivity[]>([]);
  const [activityLoadedKey, setActivityLoadedKey] = useState<string | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [hoveredActivityIndex, setHoveredActivityIndex] = useState<number | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!userId) return () => { active = false; controller.abort(); };
    const requestKey = `${userId}:${activityPeriod}`;
    void (async () => {
      try {
        const response = await fetch(`/api/stats/daily?period=${activityPeriod}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null) as { data?: unknown } | null;
        const rows = result?.data;
        if (!response.ok || !Array.isArray(rows)) {
          throw new Error("Daily activity lookup failed");
        }
        const validRows = rows.filter(isDailyActivity);
        if (validRows.length !== rows.length) throw new Error("Daily activity response was invalid");
        if (active) {
          setActivityData(validRows);
          setActivityError(false);
          setActivityLoadedKey(requestKey);
        }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[learning-stats] Could not load daily activity.", error);
          setActivityData([]);
          setActivityError(true);
          setActivityLoadedKey(requestKey);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activityPeriod, userId]);
  const activityLoading = activityLoadedKey !== `${userId ?? ""}:${activityPeriod}`;

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
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold">{t("dashboard.activityTitle")}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("dashboard.activityTitle")}>
            {([
              ["7d", "dashboard.activityPeriod7d"],
              ["30d", "dashboard.activityPeriod30d"],
              ["all", "dashboard.activityPeriodAll"],
            ] as const).map(([period, label]) => (
              <button
                key={period}
                type="button"
                aria-pressed={activityPeriod === period}
                onClick={() => setActivityPeriod(period)}
                className="rounded-full border px-3 py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        {activityLoading ? (
          <p className="text-sm text-muted-foreground" role="status">{t("dashboard.activityLoading")}</p>
        ) : activityError ? (
          <p className="text-sm text-destructive" role="alert">{t("dashboard.activityError")}</p>
        ) : (
          <>
            <div className="relative">
              {hoveredActivityIndex !== null && activityData[hoveredActivityIndex] && (
                <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                  <p className="font-medium">
                    {activityTooltipDate(activityData[hoveredActivityIndex].date, activityPeriod, LOCALE_TAGS[uiLanguage])}
                  </p>
                  <p className="text-muted-foreground">
                    {t("dashboard.activityWords", {
                      count: new Intl.NumberFormat(LOCALE_TAGS[uiLanguage]).format(
                        activityData[hoveredActivityIndex].wordsCount,
                      ),
                    })}
                  </p>
                </div>
              )}
              <div className="overflow-x-auto pt-12">
                {activityData.length > 0 && (() => {
                  const chartWidth = Math.max(640, activityData.length * 44);
                  const chartHeight = 240;
                  const left = 44;
                  const right = 12;
                  const top = 8;
                  const bottom = 38;
                  const plotHeight = chartHeight - top - bottom;
                  const plotWidth = chartWidth - left - right;
                  const slotWidth = plotWidth / activityData.length;
                  const maxWords = Math.max(1, ...activityData.map((item) => item.wordsCount));
                  const ticks = [...new Set([0, Math.ceil(maxWords / 2), maxWords])];
                  const numberFormat = new Intl.NumberFormat(LOCALE_TAGS[uiLanguage]);

                  return (
                    <svg
                      className="block h-60"
                      width={chartWidth}
                      height={chartHeight}
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      role="group"
                      aria-label={t("dashboard.activityTitle")}
                    >
                      {ticks.map((tick) => {
                        const y = top + plotHeight - (tick / maxWords) * plotHeight;
                        return (
                          <g key={tick}>
                            <line x1={left} x2={chartWidth - right} y1={y} y2={y} className="stroke-border" />
                            <text x={left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                              {numberFormat.format(tick)}
                            </text>
                          </g>
                        );
                      })}
                      <text
                        x={12}
                        y={top + plotHeight / 2}
                        textAnchor="middle"
                        transform={`rotate(-90 12 ${top + plotHeight / 2})`}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {t("dashboard.activityYAxis")}
                      </text>
                      {activityData.map((item, index) => {
                        const barHeight = (item.wordsCount / maxWords) * plotHeight;
                        const x = left + index * slotWidth + slotWidth * 0.22;
                        const width = slotWidth * 0.56;
                        const dateLabel = activityTick(item.date, activityPeriod, LOCALE_TAGS[uiLanguage]);
                        const label = `${activityTooltipDate(item.date, activityPeriod, LOCALE_TAGS[uiLanguage])}. ${t(
                          "dashboard.activityWords",
                          { count: numberFormat.format(item.wordsCount) },
                        )}`;
                        return (
                          <g key={item.date}>
                            <rect
                              x={left + index * slotWidth}
                              y={top}
                              width={slotWidth}
                              height={plotHeight}
                              fill="transparent"
                              tabIndex={0}
                              role="graphics-symbol"
                              aria-label={label}
                              onMouseEnter={() => setHoveredActivityIndex(index)}
                              onMouseLeave={() => setHoveredActivityIndex(null)}
                              onFocus={() => setHoveredActivityIndex(index)}
                              onBlur={() => setHoveredActivityIndex(null)}
                            />
                            <rect
                              x={x}
                              y={top + plotHeight - barHeight}
                              width={width}
                              height={Math.max(item.wordsCount > 0 ? 2 : 0, barHeight)}
                              rx={4}
                              className="fill-primary pointer-events-none"
                            />
                            <text
                              x={left + index * slotWidth + slotWidth / 2}
                              y={chartHeight - 10}
                              textAnchor="middle"
                              className="fill-muted-foreground text-[10px]"
                            >
                              {dateLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>
            {(activityData.length === 0 || activityData.every((item) => item.wordsCount === 0)) && (
              <p className="text-center text-sm text-muted-foreground">{t("dashboard.activityEmpty")}</p>
            )}
          </>
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

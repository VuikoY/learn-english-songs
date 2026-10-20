// components/InteractiveLyrics.tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Loader2, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExplanationCard, { ExplanationSkeleton } from "@/components/ExplanationCard";
import { useLanguage } from "@/context/LanguageContext";
import { isExplanation, type Explanation, type LyricLine } from "@/lib/types";
import { readExplanationCache } from "@/lib/explanations/cache";
import FavoriteLineButton from "@/components/FavoriteLineButton";

type Props = {
  lines: LyricLine[];
  /** Current player time in seconds. */
  currentTime: number;
  /** Clicking a lyric line seeks to its start. */
  onSeek: (seconds: number) => void;
  /** Called when AI Explain is clicked, so playback can be paused. */
  onExplainStart?: () => void;
  /** The current song ID lets the server use its Supabase explanation cache. */
  youtubeId?: string;
  songId?: string | null;
};

// Explanation panel state for one lyric line.
type LineState =
  | { kind: "loading" } // Waiting for a response; show the skeleton.
  | { kind: "error"; message: string }
  | { kind: "open"; explanation?: Explanation }; // The card is expanded.

// Cache key includes normalized line text and language pair, so language variants stay separate.
// Include the line index and text in the state key so old video states cannot be reused.
const lineId = (line: LyricLine, index: number, langKey: string) =>
  `${langKey}:${index}:${line.start}:${line.text}`;

export default function InteractiveLyrics({
  lines,
  currentTime,
  onSeek,
  onExplainStart,
  youtubeId,
  songId,
}: Props) {
  // Explanation panel state for each line (loading, error, or open).
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});
  const [showAllLines, setShowAllLines] = useState(false);

  // The target language controls AI explanations and their client cache.
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const langKey = targetLanguage;

  // Active line is the one whose [start, start + duration) interval contains currentTime.
  const activeIndex = useMemo(
    () =>
      lines.findIndex((line) => currentTime >= line.start && currentTime < line.start + line.duration),
    [lines, currentTime],
  );

  // When playback is between captions, keep the most recently started line active.
  const currentLineIndex = useMemo(() => {
    if (activeIndex >= 0) return activeIndex;
    const lastStartedIndex = lines.findLastIndex((line) => line.start <= currentTime);
    return lastStartedIndex >= 0 ? lastStartedIndex : 0;
  }, [activeIndex, currentTime, lines]);
  const visibleStart = Math.max(0, Math.min(currentLineIndex - 1, lines.length - 3));
  const visibleLines = showAllLines ? lines : lines.slice(visibleStart, visibleStart + 3);
  const lineListStart = showAllLines ? 0 : visibleStart;

  // Update one line's state; undefined closes the panel.
  function setLineState(id: string, state: LineState | undefined) {
    setLineStates((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }

  async function handleExplain(index: number) {
    const line = lines[index];
    const id = lineId(line, index, langKey);

    // A second click closes an already open card.
    if (lineStates[id]?.kind === "open") {
      setLineState(id, undefined);
      return;
    }

    onExplainStart?.();

    // Show the loading skeleton while requesting a new explanation.
    setLineState(id, { kind: "loading" });

    try {
      let databaseExplanation: Explanation | null = null;
      try {
        databaseExplanation = await readExplanationCache({
          youtubeId,
          lineIndex: index,
          text: line.text,
          sourceLanguage,
          targetLanguage,
          context: lines.slice(Math.max(0, index - 1), index + 2).filter((_, i) => i !== index - Math.max(0, index - 1)).map((item) => item.text).join(" "),
        });
      } catch {
        // If the cache is unreachable, the explain endpoint can still try its own lookup and generate a response.
      }
      if (databaseExplanation) {
        setLineState(id, { kind: "open", explanation: databaseExplanation });
        return;
      }
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
          youtubeId,
          lineIndex: index,
          context: lines.slice(Math.max(0, index - 1), index + 2).filter((_, i) => i !== index - Math.max(0, index - 1)).map((item) => item.text).join(" "),
          sourceLanguage,
          targetLanguage,
        }),
      });

      // Read the response as text so HTML or empty responses produce a useful error.
      const raw = await response.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(t("explain.serverNonJson", { status: response.status }));
      }
      if (!response.ok) {
        throw new Error(t("explain.requestError"));
      }
      if (!isExplanation(json)) throw new Error(t("explain.requestError"));

      // The API route stores successful explanations in Supabase before returning.
      setLineState(id, { kind: "open", explanation: json as unknown as Explanation });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("explain.unknownError");
      setLineState(id, { kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end px-2">
        <button type="button" aria-pressed={showAllLines} aria-label={t(showAllLines ? "favorites.lyricsThree" : "favorites.lyricsAll")} title={t(showAllLines ? "favorites.lyricsThree" : "favorites.lyricsAll")} onClick={() => setShowAllLines(value => !value)} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{showAllLines ? <Minimize2 className="size-4" aria-hidden="true"/> : <Maximize2 className="size-4" aria-hidden="true"/>}<span className="sr-only">{t(showAllLines ? "favorites.lyricsThree" : "favorites.lyricsAll")}</span></button>
      </div>
      <div className={`space-y-1 ${showAllLines ? "max-h-[65vh] overflow-y-auto overscroll-contain pr-2" : ""}`}>
        {visibleLines.map((line, visibleIndex) => {
          const index = lineListStart + visibleIndex;
          const id = lineId(line, index, langKey);
          const isActive = index === currentLineIndex;
          const isCurrent = index === activeIndex || (
            activeIndex < 0 &&
            index === currentLineIndex &&
            currentTime >= line.start + line.duration &&
            currentTime < line.start + line.duration + 1
          );
          const state = lineStates[id];
          const explanation = state?.kind === "open" ? state.explanation : undefined;
          const elapsed = Math.max(0, Math.min(currentTime - line.start, line.duration));
          const progress = isCurrent && line.duration > 0
            ? Math.round((elapsed / line.duration) * 100)
            : 0;

          return (
            <div key={id} className="rounded px-1 py-1">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <div className="w-6 shrink-0">{(showAllLines || isActive) && <FavoriteLineButton songId={songId} lineIndex={index} lineText={line.text} startTime={line.start} endTime={line.start + line.duration}/>}</div>
                <button type="button" onClick={() => onSeek(line.start)} className={`min-w-0 flex-1 overflow-hidden px-1 text-center text-base font-medium leading-snug md:px-2 md:text-lg md:whitespace-nowrap ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className="relative inline-block max-w-full">
                    {isCurrent && (
                      <>
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 rounded-sm bg-sky-100/50 dark:bg-sky-300/10"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-0 rounded-sm bg-sky-200/80 transition-[width] duration-300 dark:bg-sky-300/25"
                          style={{ width: `${progress}%` }}
                        />
                      </>
                    )}
                    <span className="relative z-10 whitespace-normal break-words md:whitespace-nowrap">{line.text}</span>
                  </span>
                </button>
                {showAllLines ? (
                  <Button type="button" variant="ghost" size="sm" aria-label={t("explain.button")} title={t("explain.button")} className="h-8 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground" disabled={state?.kind === "loading"} onClick={() => void handleExplain(index)}>
                    {state?.kind === "loading" ? <Loader2 className="size-4 animate-spin"/> : state?.kind === "open" ? <ChevronUp className="size-4"/> : <Sparkles className="size-4"/>}
                  </Button>
                ) : isActive && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 px-2 text-xs sm:text-sm"
                    disabled={state?.kind === "loading"}
                    onClick={() => handleExplain(index)}
                  >
                    {state?.kind === "loading" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : state?.kind === "open" ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {state?.kind === "open" ? t("explain.hide") : t("explain.button")}
                  </Button>
                )}
              </div>

              {/* Render content below the line based on its state. */}
              {state?.kind === "loading" && <ExplanationSkeleton />}

              {state?.kind === "error" && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {state.message}
                </p>
              )}

              {state?.kind === "open" && explanation && (
                <ExplanationCard
                  data={explanation}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

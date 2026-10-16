// components/InteractiveLyrics.tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExplanationCard, { ExplanationSkeleton } from "@/components/ExplanationCard";
import SaveToVocabularyButton from "@/components/SaveToVocabularyButton";
import { useLanguage } from "@/context/LanguageContext";
import { capEntries, usePersistentState } from "@/lib/storage/usePersistentState";
import { isExplanation, type Explanation, type LyricLine } from "@/lib/types";

type Props = {
  lines: LyricLine[];
  /** Current player time in seconds. */
  currentTime: number;
  /** Clicking a lyric line seeks to its start. */
  onSeek: (seconds: number) => void;
  /** Called when AI Explain is clicked, so playback can be paused. */
  onExplainStart?: () => void;
  /** Optional video title saved with a vocabulary item. */
  songTitle?: string | null;
};

// Explanation panel state for one lyric line.
// The explanation itself is stored in explanationCache.
type LineState =
  | { kind: "loading" } // Waiting for a response; show the skeleton.
  | { kind: "error"; message: string }
  | { kind: "open" }; // The card is expanded.

// Cache key includes normalized line text and language pair, so language variants stay separate.
// Maximum number of explanations stored in localStorage.
const MAX_CACHED_EXPLANATIONS = 500;

// Validate values read from localStorage.
function isExplanationRecord(value: unknown): value is Record<string, Explanation> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isExplanation)
  );
}

const cacheKey = (text: string, langKey: string) => `${langKey}::${text.trim().toLowerCase()}`;

// Include the line index and text in the state key so old video states cannot be reused.
const lineId = (line: LyricLine, index: number, langKey: string) =>
  `${langKey}:${index}:${line.start}:${line.text}`;

export default function InteractiveLyrics({
  lines,
  currentTime,
  onSeek,
  onExplainStart,
  songTitle = null,
}: Props) {
  // 1. Cache maps lyric text to its explanation and persists across videos and page reloads.
  const [explanationCache, setExplanationCache] = usePersistentState<Record<string, Explanation>>(
    "lingo-clips:explanations",
    {},
    isExplanationRecord,
  );

  // 2. Explanation panel state for each line (loading, error, or open).
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});

  // Use the selected languages in AI requests and cache keys.
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const langKey = `${sourceLanguage}>${targetLanguage}`;

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
  const visibleLines = lines.slice(visibleStart, visibleStart + 3);

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
    const key = cacheKey(line.text, langKey);

    // A second click closes an already open card.
    if (lineStates[id]?.kind === "open") {
      setLineState(id, undefined);
      return;
    }

    onExplainStart?.();

    // Reuse a cached explanation without making another request.
    if (explanationCache[key]) {
      setLineState(id, { kind: "open" });
      return;
    }

    // Show the loading skeleton while requesting a new explanation.
    setLineState(id, { kind: "loading" });

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
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

      // Cache the response and expand the card.
      setExplanationCache((prev) =>
        capEntries({ ...prev, [key]: json as unknown as Explanation }, MAX_CACHED_EXPLANATIONS),
      );
      setLineState(id, { kind: "open" });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("explain.unknownError");
      setLineState(id, { kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-1">
        {visibleLines.map((line, visibleIndex) => {
          const index = visibleStart + visibleIndex;
          const id = lineId(line, index, langKey);
          const isActive = index === currentLineIndex;
          const isCurrent = index === activeIndex || (
            activeIndex < 0 &&
            index === currentLineIndex &&
            currentTime >= line.start + line.duration &&
            currentTime < line.start + line.duration + 1
          );
          const state = lineStates[id];
          const cached = explanationCache[cacheKey(line.text, langKey)];
          const elapsed = Math.max(0, Math.min(currentTime - line.start, line.duration));
          const progress = isCurrent && line.duration > 0
            ? Math.round((elapsed / line.duration) * 100)
            : 0;

          return (
            <div
              key={id}
              className="relative rounded px-1 py-2"
            >
              <div className="relative z-10 flex items-start justify-center">
                <button
                  type="button"
                  onClick={() => onSeek(line.start)}
                  className={`w-full px-24 text-center text-lg leading-snug ${
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span className="relative inline-block max-w-full px-3">
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
                    <span className="relative z-10">{line.text}</span>
                  </span>
                </button>

                {isActive && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="absolute right-0 top-0 shrink-0"
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

              {state?.kind === "open" && cached && (
                <ExplanationCard
                  data={cached}
                  // Show the save-to-vocabulary action inside the explanation card.
                  actions={
                    <SaveToVocabularyButton
                      original={line.text}
                      explanation={cached}
                      songTitle={songTitle}
                    />
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

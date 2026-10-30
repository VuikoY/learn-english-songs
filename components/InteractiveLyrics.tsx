// components/InteractiveLyrics.tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Globe, Loader2, Maximize2, Minimize2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExplanationCard, { ExplanationSkeleton, StreamingExplanation } from "@/components/ExplanationCard";
import { useLanguage } from "@/context/LanguageContext";
import type { Explanation, LyricLine } from "@/lib/types";
import { readExplanationCache } from "@/lib/explanations/cache";
import FavoriteLineButton from "@/components/FavoriteLineButton";
import { useStreamingExplanation } from "@/hooks/useStreamingExplanation";

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
  | { kind: "loading"; partial?: Partial<Explanation> }
  | { kind: "error"; message: string }
  | { kind: "open"; explanation?: Explanation }; // The card is expanded.

type TranslationState =
  | { kind: "loading" }
  | { kind: "error"; message: string };

type WordLookupState =
  | { kind: "loading"; key: string; lineIndex: number; targetLanguage: string }
  | { kind: "error"; key: string; lineIndex: number; targetLanguage: string; message: string }
  | { kind: "open"; key: string; lineIndex: number; targetLanguage: string; translation: string };

async function requestTranslation(input: {
  text: string;
  sourceLang: string;
  targetLang: string;
  videoId?: string;
  lineIndex?: number;
}): Promise<string> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  const payload = typeof result === "object" && result !== null
    ? result as { translation?: unknown; error?: unknown }
    : null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "translation_unavailable");
  }
  if (typeof payload?.translation !== "string" || !payload.translation.trim()) {
    throw new Error("translation_unavailable");
  }
  return payload.translation;
}

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
  const [lineTranslations, setLineTranslations] = useState<Record<string, string>>({});
  const [lineTranslationStates, setLineTranslationStates] = useState<Record<string, TranslationState>>({});
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  const [wordTranslations, setWordTranslations] = useState<Map<string, string>>(() => new Map());
  const [wordLookup, setWordLookup] = useState<WordLookupState | null>(null);
  const [showAllLines, setShowAllLines] = useState(false);
  const streamExplanation = useStreamingExplanation();

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

  function translationError(error: unknown): string {
    const code = error instanceof Error ? error.message : "translation_unavailable";
    if (code === "invalid_request") return t("lyrics.translationInvalid");
    if (code === "unsupported_language") return t("lyrics.translationUnsupported");
    return t("lyrics.translationError");
  }

  async function handleWordClick(word: string, index: number) {
    const key = `${sourceLanguage}:${targetLanguage}:${word.toLowerCase()}`;
    if (wordLookup?.key === key && wordLookup.lineIndex === index) {
      if (wordLookup.kind === "open") {
        setWordLookup(null);
        return;
      }
      if (wordLookup.kind === "loading") return;
    }

    const cached = wordTranslations.get(key);
    if (cached) {
      setWordLookup({ kind: "open", key, lineIndex: index, targetLanguage, translation: cached });
      return;
    }

    setWordLookup({ kind: "loading", key, lineIndex: index, targetLanguage });
    try {
      const translation = await requestTranslation({ text: word, sourceLang: sourceLanguage, targetLang: targetLanguage });
      setWordTranslations((previous) => new Map(previous).set(key, translation));
      setWordLookup({ kind: "open", key, lineIndex: index, targetLanguage, translation });
    } catch (error) {
      setWordLookup({ kind: "error", key, lineIndex: index, targetLanguage, message: translationError(error) });
    }
  }

  async function handleLineTranslation(index: number) {
    const line = lines[index];
    const id = lineId(line, index, langKey);
    if (expandedTranslations[id]) {
      setExpandedTranslations((previous) => ({ ...previous, [id]: false }));
      return;
    }

    setExpandedTranslations((previous) => ({ ...previous, [id]: true }));
    if (line.translations?.[targetLanguage] || lineTranslations[id]) return;
    if (lineTranslationStates[id]?.kind === "loading") return;

    setLineTranslationStates((previous) => ({ ...previous, [id]: { kind: "loading" } }));
    try {
      const translation = await requestTranslation({
        text: line.text,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        ...(youtubeId ? { videoId: youtubeId, lineIndex: index } : {}),
      });
      setLineTranslations((previous) => ({ ...previous, [id]: translation }));
      setLineTranslationStates((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    } catch (error) {
      setLineTranslationStates((previous) => ({
        ...previous,
        [id]: { kind: "error", message: translationError(error) },
      }));
    }
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
      const explanation = await streamExplanation({
          text: line.text,
          youtubeId,
          lineIndex: index,
          context: lines.slice(Math.max(0, index - 1), index + 2).filter((_, i) => i !== index - Math.max(0, index - 1)).map((item) => item.text).join(" "),
          sourceLanguage,
          targetLanguage,
        }, (partial) => setLineState(id, { kind: "loading", partial }));

      // The API route stores successful explanations in Supabase before returning.
      setLineState(id, { kind: "open", explanation });
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
          const translationState = lineTranslationStates[id];
          const lineTranslation = line.translations?.[targetLanguage] ?? lineTranslations[id];
          const showWordLookup = wordLookup?.lineIndex === index && wordLookup.targetLanguage === targetLanguage;
          const explanation = state?.kind === "open" ? state.explanation : undefined;
          const elapsed = Math.max(0, Math.min(currentTime - line.start, line.duration));
          const progress = isCurrent && line.duration > 0
            ? Math.round((elapsed / line.duration) * 100)
            : 0;

          return (
            <div key={id} className="rounded px-1 py-1">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={t("lyrics.playLine")}
                    aria-label={t("lyrics.playLine")}
                    className="size-8 min-w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => onSeek(line.start)}
                  >
                    <Play className="size-4 fill-current" aria-hidden="true"/>
                  </Button>
                  {(showAllLines || isActive) && (
                    <FavoriteLineButton songId={songId} lineIndex={index} lineText={line.text} startTime={line.start} endTime={line.start + line.duration}/>
                  )}
                </div>
                <div
                  className={`min-w-0 flex-1 overflow-hidden px-1 text-center text-base font-medium leading-snug md:px-2 md:text-lg md:whitespace-nowrap ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                >
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
                    <span className="relative z-10 whitespace-normal break-words md:whitespace-nowrap">
                      {line.text.split(/(\s+)/).map((part, partIndex) => {
                        if (/^\s+$/.test(part)) return part;
                        const word = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’\-]*)([^\p{L}\p{N}]*)$/u);
                        if (!word) return part;
                        return (
                          <span key={`${partIndex}:${part}`}>
                            {word[1]}
                            <button
                              type="button"
                              title={t("lyrics.translateWord", { word: word[2] })}
                              aria-label={t("lyrics.translateWord", { word: word[2] })}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleWordClick(word[2], index);
                              }}
                              className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {word[2]}
                            </button>
                            {word[3]}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={translationState?.kind === "loading"
                    ? t("lyrics.translationLoading")
                    : expandedTranslations[id] ? t("lyrics.translationHide") : t("lyrics.translateLine")}
                  aria-label={translationState?.kind === "loading"
                    ? t("lyrics.translationLoading")
                    : expandedTranslations[id] ? t("lyrics.translationHide") : t("lyrics.translateLine")}
                  aria-expanded={Boolean(expandedTranslations[id])}
                  className="h-8 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void handleLineTranslation(index)}
                >
                  {translationState?.kind === "loading"
                    ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/>
                    : <Globe className="size-4" aria-hidden="true"/>}
                </Button>
                {showAllLines ? (
                  <Button type="button" variant="ghost" size="sm" aria-label={state?.kind === "loading" ? t("explain.loading") : state?.kind === "open" ? t("explain.hide") : t("explain.button")} title={state?.kind === "loading" ? t("explain.loading") : state?.kind === "open" ? t("explain.hide") : t("explain.button")} className="h-8 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground" disabled={state?.kind === "loading"} onClick={() => void handleExplain(index)}>
                    {state?.kind === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : state?.kind === "open" ? <ChevronUp className="size-4" aria-hidden="true"/> : <Sparkles className="size-4" aria-hidden="true"/>}
                  </Button>
                ) : isActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={state?.kind === "loading" ? t("explain.loading") : state?.kind === "open" ? t("explain.hide") : t("explain.button")}
                    aria-label={state?.kind === "loading" ? t("explain.loading") : state?.kind === "open" ? t("explain.hide") : t("explain.button")}
                    className="h-8 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    disabled={state?.kind === "loading"}
                    onClick={() => void handleExplain(index)}
                  >
                    {state?.kind === "loading" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true"/>
                    ) : state?.kind === "open" ? (
                      <ChevronUp className="size-4" aria-hidden="true"/>
                    ) : (
                      <Sparkles className="size-4" aria-hidden="true"/>
                    )}
                  </Button>
                )}
              </div>

              {expandedTranslations[id] && (
                <div className="mx-10 mt-1 rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
                  {translationState?.kind === "loading" && t("lyrics.translationLoading")}
                  {translationState?.kind === "error" && (
                    <p role="alert" className="text-destructive">{translationState.message}</p>
                  )}
                  {lineTranslation && <p>{lineTranslation}</p>}
                </div>
              )}

              {showWordLookup && wordLookup?.kind === "loading" && (
                <p className="mx-10 mt-1 text-sm text-muted-foreground" role="status">{t("lyrics.translationLoading")}</p>
              )}
              {showWordLookup && wordLookup?.kind === "open" && (
                <p className="mx-10 mt-1 rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" role="status">
                  {wordLookup.translation}
                </p>
              )}
              {showWordLookup && wordLookup?.kind === "error" && (
                <p className="mx-10 mt-1 text-sm text-destructive" role="alert">{wordLookup.message}</p>
              )}

              {/* Render content below the line based on its state. */}
              {state?.kind === "loading" && (
                state.partial
                  ? <StreamingExplanation data={state.partial} />
                  : <ExplanationSkeleton />
              )}

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

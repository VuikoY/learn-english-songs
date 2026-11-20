"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Combine, Edit, Globe, Loader2, Plus, RefreshCw, Split, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { LyricLine } from "@/lib/types";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS, LINE_GAP_SECONDS } from "@/lib/lyricTiming";
import { mergeShortLines } from "@/lib/lyricLines";
import { Button } from "@/components/ui/button";

export type TranscriptEditContext = {
  songId: string;
  lineIndex: number;
  line: LyricLine;
  previousLineIndex?: number;
  previousLine?: LyricLine;
  nextLineIndex?: number;
  nextLine?: LyricLine;
  canEdit: boolean;
  lines?: LyricLine[];
  collectionId?: string;
  collectionItemId?: string;
};
export type TranscriptEditSave = {
  songId: string;
  collectionItemId?: string;
  currentLineIndex: number;
  editedLineIndex?: number;
  updates: { lineIndex: number; line: LyricLine }[];
  lines?: LyricLine[];
  insert?: { afterIndex: number; line: LyricLine };
  deleteLineIndex?: number;
};
type TranscriptModalProps = {
  context?: TranscriptEditContext;
  onPause: () => void;
  onPlayLine: (seconds: number, lineIndex: number, duration: number) => void;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (save: TranscriptEditSave) => void;
};

export function TranscriptTimingEditor({ videoId, lines, onLinesChange, compact = false, onPlayLine, activeLineIndex, onActiveLineIndexChange }: {
  videoId: string;
  lines: LyricLine[];
  onLinesChange: (lines: LyricLine[]) => void;
  compact?: boolean;
  onPlayLine?: (seconds: number, lineIndex: number, duration: number) => void;
  activeLineIndex?: number;
  onActiveLineIndexChange?: (index: number) => void;
}) {
  const playerRef = useRef<PlayerHandle>(null);
  const isPlayingRef = useRef(false);
  const previousTimeRef = useRef(0);
  const latestTimeRef = useRef(0);
  const autoPausedLineRef = useRef<number | null>(null);
  const selectedPauseTargetRef = useRef<{ lineIndex: number; endTime: number } | null>(null);
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const [currentTime, setCurrentTime] = useState(0);
  const [lineTranslations, setLineTranslations] = useState<Record<string, { loading: boolean; expanded: boolean; translation?: string; error?: string }>>({});
  const [emptyLineInputs, setEmptyLineInputs] = useState<Record<number, { start?: boolean; duration?: boolean }>>({});
  const handleTimeUpdate = useCallback((seconds: number) => {
    const previousTime = previousTimeRef.current;
    latestTimeRef.current = seconds;
    previousTimeRef.current = seconds;
    setCurrentTime(seconds);
    if (!isPlayingRef.current) return;

    const selectedTarget = selectedPauseTargetRef.current;
    const endedLineIndex = selectedTarget
      ? previousTime < selectedTarget.endTime && seconds >= selectedTarget.endTime
        ? selectedTarget.lineIndex
        : -1
      : lines.findIndex((line) => {
          const end = line.start + line.duration + AUDIO_END_BUFFER_SECONDS;
          return previousTime < end && seconds >= end;
        });
    if (endedLineIndex >= 0 && autoPausedLineRef.current !== endedLineIndex) {
      autoPausedLineRef.current = endedLineIndex;
      selectedPauseTargetRef.current = null;
      playerRef.current?.pause();
    }
  }, [lines]);
  const handlePlaybackChange = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    if (playing) {
      previousTimeRef.current = latestTimeRef.current;
      autoPausedLineRef.current = null;
    }
  }, []);

  async function translateLine(index: number) {
    const line = lines[index];
    const key = `${index}:${line.start}:${targetLanguage}:${line.text}`;
    if (lineTranslations[key]?.expanded) {
      setLineTranslations((current) => ({ ...current, [key]: { ...current[key], expanded: false } }));
      return;
    }
    if (lineTranslations[key]?.translation) {
      setLineTranslations((current) => ({ ...current, [key]: { ...current[key], expanded: true } }));
      return;
    }
    playerRef.current?.pause();
    setLineTranslations((current) => ({ ...current, [key]: { loading: true, expanded: true } }));
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.text, sourceLang: sourceLanguage, targetLang: targetLanguage }),
      });
      const result: unknown = await response.json().catch(() => null);
      const payload = typeof result === "object" && result !== null
        ? result as { translation?: unknown; error?: unknown }
        : null;
      if (!response.ok || typeof payload?.translation !== "string" || !payload.translation.trim()) {
        const code = typeof payload?.error === "string" ? payload.error : "";
        const errorMessage = code === "unsupported_language"
          ? t("lyrics.translationUnsupported")
          : code === "invalid_request"
            ? t("lyrics.translationInvalid")
            : t("lyrics.translationError");
        setLineTranslations((current) => ({ ...current, [key]: { loading: false, expanded: true, error: errorMessage } }));
        return;
      }
      setLineTranslations((current) => ({ ...current, [key]: { loading: false, expanded: true, translation: payload.translation as string } }));
    } catch (error) {
      console.error("[dashboard] Could not translate an edited subtitle line.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setLineTranslations((current) => ({ ...current, [key]: { loading: false, expanded: true, error: t("lyrics.translationError") } }));
    }
  }

  return <div className="grid gap-4">
    {!compact && <section className="space-y-2"><h3 className="font-medium">{t("dashboard.player")}</h3><YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={handleTimeUpdate} onPlayingChange={handlePlaybackChange}/><p className="text-sm text-muted-foreground">{t("dashboard.reviewTiming")}</p><p className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(currentTime)}</p></section>}
    <section className="space-y-2">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_8rem] items-center gap-2">
        <span />
        <span />
        <div className="flex items-center justify-center gap-1">
          <button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.mergeShortLines")} title={t("dashboard.mergeShortLines")} onClick={() => {
            setEmptyLineInputs({});
            const selected = activeLineIndex === undefined ? undefined : lines[activeLineIndex];
            const mergedLines = mergeShortLines(lines);
            onLinesChange(mergedLines);
            if (selected && activeLineIndex !== undefined) {
              const nextIndex = mergedLines.findIndex((line) => line.start <= selected.start && line.start + line.duration >= selected.start);
              if (nextIndex >= 0) onActiveLineIndexChange?.(nextIndex);
            }
          }}><Combine aria-hidden="true" size={16} /></button>
          <button type="button" disabled={!lines.some((line) => countWords(line.text) > 7)} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.splitLongLines")} title={t("dashboard.splitLongLines")} onClick={() => {
            setEmptyLineInputs({});
            if (activeLineIndex !== undefined) {
              const before = splitLongLines(lines.slice(0, activeLineIndex)).length;
              onActiveLineIndexChange?.(before);
            }
            onLinesChange(splitLongLines(lines));
          }}><Split aria-hidden="true" size={16} /></button>
          <button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.recalculateDurations")} title={t("dashboard.recalculateDurations")} onClick={() => {
            setEmptyLineInputs({});
            onLinesChange(recalculateLineTimings(lines));
          }}><RefreshCw aria-hidden="true" size={16} /></button>
        </div>
      </div>
      {lines.length ? (
        <div className={compact ? "space-y-2" : "max-h-[26rem] space-y-2 overflow-auto"}>
          {lines.map((line, index) => {
            const key = `${index}:${line.start}:${targetLanguage}:${line.text}`;
            const translation = lineTranslations[key];
            return (
              <div key={index} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-1">
                  <div className="flex w-fit shrink-0 items-center gap-1">
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 text-xs hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={`${t("dashboard.seekToLine")} ${index + 1}`} onClick={() => { if (compact && onPlayLine) { onPlayLine(line.start, index, line.duration); return; } autoPausedLineRef.current = null; selectedPauseTargetRef.current = { lineIndex: index, endTime: line.start + line.duration + AUDIO_END_BUFFER_SECONDS }; playerRef.current?.seekTo(Math.max(0, line.start - AUDIO_START_BUFFER_SECONDS)); playerRef.current?.play(); }}>▶</button>
                    <input aria-label={t("dashboard.start")} className="h-8 shrink-0 rounded border bg-background px-1 text-xs" style={{ width: "4rem", minWidth: "4rem", maxWidth: "4rem" }} type="number" min="0" step="0.1" value={emptyLineInputs[index]?.start ? "" : line.start} onChange={event => {
                      setEmptyLineInputs((current) => ({ ...current, [index]: { ...current[index], start: false } }));
                      onLinesChange(updateLineStart(lines, index, Number(event.target.value)));
                    }} />
                  </div>
                  <input autoFocus={compact && index === activeLineIndex} aria-label={`${t("dashboard.lyrics")} ${index + 1}`} className="h-8 min-w-0 flex-1 rounded border bg-background px-2" value={line.text} onChange={event => onLinesChange(lines.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} />
                  <div className="flex w-fit shrink-0 flex-nowrap gap-1">
                    <input aria-label={t("dashboard.duration")} className="h-8 shrink-0 rounded border bg-background px-1 text-xs" style={{ width: "4rem", minWidth: "4rem", maxWidth: "4rem" }} type="number" min="0" step="0.1" value={emptyLineInputs[index]?.duration ? "" : line.duration} onChange={event => {
                      setEmptyLineInputs((current) => ({ ...current, [index]: { ...current[index], duration: false } }));
                      onLinesChange(lines.map((item, i) => i === index ? { ...item, duration: Number(event.target.value) } : item));
                    }} />
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={t("dashboard.addLine")} title={t("dashboard.addLine")} onClick={() => {
                      setEmptyLineInputs((current) => ({
                        ...Object.fromEntries(Object.entries(current).map(([lineIndex, fields]) => {
                          const numericIndex = Number(lineIndex);
                          return [numericIndex > index ? numericIndex + 1 : numericIndex, fields];
                        })),
                        [index + 1]: { start: true, duration: true },
                      }));
                      onLinesChange([
                        ...lines.slice(0, index + 1),
                        { text: "", start: 0, duration: 0 },
                        ...lines.slice(index + 1),
                      ]);
                      if (activeLineIndex !== undefined && activeLineIndex > index) onActiveLineIndexChange?.(activeLineIndex + 1);
                    }}><Plus aria-hidden="true" size={16} /></button>
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 text-destructive hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={`${t("vocab.delete")} ${index + 1}`} title={t("vocab.delete")} onClick={() => {
                      setEmptyLineInputs((current) => Object.fromEntries(Object.entries(current).flatMap(([lineIndex, fields]) => {
                        const numericIndex = Number(lineIndex);
                        if (numericIndex === index) return [];
                        return [[numericIndex > index ? numericIndex - 1 : numericIndex, fields]];
                      })));
                      onLinesChange(lines.filter((_, i) => i !== index));
                      if (activeLineIndex !== undefined) onActiveLineIndexChange?.(activeLineIndex === index ? Math.max(0, index - 1) : activeLineIndex > index ? activeLineIndex - 1 : activeLineIndex);
                    }}><Trash2 aria-hidden="true" size={16} /></button>
                    <button type="button" disabled={translation?.loading} className="flex h-8 shrink-0 items-center justify-center rounded border p-1.5 hover:bg-muted disabled:opacity-50" title={translation?.loading ? t("lyrics.translationLoading") : translation?.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-label={translation?.loading ? t("lyrics.translationLoading") : translation?.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-expanded={Boolean(translation?.expanded)} onClick={() => void translateLine(index)}>{translation?.loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}</button>
                  </div>
                </div>
                {translation?.expanded && (
                  <div className="ml-[5.5rem] rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
                    {translation.loading && t("lyrics.translationLoading")}
                    {translation.error && <p role="alert" className="text-destructive">{translation.error}</p>}
                    {translation.translation && <p>{translation.translation}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("dashboard.loadTranscriptHint")}</p>}
    </section>
  </div>;
}


type SaveStatus = "idle" | "saving" | "invalid" | "error" | "sign-in" | "not-found";

export default function TranscriptTimingModal({ context, onPause, onPlayLine, onOpenChange, onSaved }: TranscriptModalProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activeContext, setActiveContext] = useState<TranscriptEditContext>();
  const [draftLines, setDraftLines] = useState<LyricLine[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = oldOverflow; };
  }, [open]);

  if (!context?.canEdit) return null;

  function close() {
    setOpen(false);
    setActiveContext(undefined);
    onOpenChange?.(false);
  }

  function openEditor() {
    onPause();
    const initial = context?.collectionId ? [context.line] : context?.lines?.length ? context.lines : [
      ...(context?.previousLine ? [context.previousLine] : []),
      ...(context?.line ? [context.line] : []),
      ...(context?.nextLine ? [context.nextLine] : []),
    ];
    const currentIndex = context?.lines?.length
      ? context.lineIndex
      : context?.previousLine ? 1 : 0;
    setActiveContext(context);
    setDraftLines(initial.map((line) => ({ ...line })));
    setActiveLineIndex(currentIndex);
    setStatus("idle");
    setOpen(true);
    onOpenChange?.(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeContext || status === "saving") return;
    if (activeContext.collectionId && activeContext.collectionItemId) {
      const line = draftLines[activeLineIndex];
      if (!line || !line.text.trim() || !Number.isFinite(line.start) || line.start < 0 || !Number.isFinite(line.duration) || line.duration <= 0) {
        setStatus("invalid");
        return;
      }
      setStatus("saving");
      try {
        const response = await fetch(`/api/word-collections/${encodeURIComponent(activeContext.collectionId)}/items`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: activeContext.collectionItemId, lineText: line.text, startTime: line.start, endTime: line.start + line.duration }),
        });
        if (!response.ok) { setStatus("error"); return; }
        const savedLine = { ...line, text: line.text.trim() };
        onSaved?.({ songId: activeContext.songId, collectionItemId: activeContext.collectionItemId, currentLineIndex: activeContext.lineIndex, editedLineIndex: activeLineIndex, updates: [{ lineIndex: activeContext.lineIndex, line: savedLine }], lines: [savedLine] });
        close();
      } catch { setStatus("error"); }
      return;
    }
    if (!activeContext.lines?.length) {
      setStatus("error");
      return;
    }
    if (!draftLines.length || draftLines.some((line) => !line.text.trim() || !Number.isFinite(line.start) || line.start < 0 || !Number.isFinite(line.duration) || line.duration < 0)) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    try {
      const lines = draftLines.map((line) => {
        const updated = { ...line, text: line.text.trim() };
        return updated;
      });
      const response = await fetch("/api/songs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "transcript", id: activeContext.songId, lines }),
      });
      const result: unknown = await response.json().catch(() => null);
      const payload = typeof result === "object" && result !== null ? result as { code?: unknown; lines?: unknown } : null;
      if (!response.ok) {
        setStatus(payload?.code === "SIGN_IN_REQUIRED" ? "sign-in" : payload?.code === "SONG_NOT_FOUND" ? "not-found" : payload?.code === "INVALID_LINE" ? "invalid" : "error");
        return;
      }
      const savedLines = Array.isArray(payload?.lines) ? payload.lines as LyricLine[] : lines;
      onSaved?.({
        songId: activeContext.songId,
        currentLineIndex: activeContext.lineIndex,
        editedLineIndex: activeLineIndex,
        updates: savedLines.map((line, lineIndex) => ({ lineIndex, line })),
        lines: savedLines,
      });
      close();
    } catch {
      setStatus("error");
    }
  }

  const messages: Partial<Record<SaveStatus, string>> = {
    invalid: t("lineEdit.invalid"),
    error: t("lineEdit.error"),
    "sign-in": t("lineEdit.signIn"),
    "not-found": t("lineEdit.notFound"),
  };

  return <div className="min-w-0">
    <Button type="button" variant="ghost" size="sm" title={t("lineEdit.edit")} aria-label={t("lineEdit.edit")} aria-expanded={open} className="size-8 min-w-8 p-0 text-muted-foreground hover:text-foreground" onClick={openEditor}><Edit className="size-4" aria-hidden="true" /></Button>
    {open && activeContext && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && status !== "saving") close(); }} onKeyDown={(event) => { if (event.key === "Escape" && status !== "saving") close(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("lineEdit.edit")} className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-xl sm:p-5">
        <form className="flex min-h-0 flex-col gap-3 text-left" onSubmit={(event) => void save(event)}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <TranscriptTimingEditor videoId="" lines={draftLines} onLinesChange={(nextLines) => setDraftLines((current) => nextLines.map((line, index) => {
              const previous = current[index];
              if (previous && previous.text !== line.text) {
                const updated = { ...line };
                delete updated.translations;
                return updated;
              }
              return line;
            }))} compact onPlayLine={onPlayLine} activeLineIndex={activeLineIndex} onActiveLineIndexChange={setActiveLineIndex} />
          </div>
          {status !== "idle" && status !== "saving" && <p role="alert" className="text-sm text-destructive">{messages[status]}</p>}
          <div className="flex shrink-0 justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close}>{t("lineEdit.cancel")}</Button>
            <Button type="submit" size="sm" disabled={status === "saving"}>{status === "saving" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{status === "saving" ? t("lineEdit.saving") : t("lineEdit.save")}</Button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

function recalculateLineTimings(lines: LyricLine[]): LyricLine[] {
  const roundedLines = lines.map((line) => ({
    ...line,
    start: Number(line.start.toFixed(1)),
    duration: Number(line.duration.toFixed(1)),
  }));

  return roundedLines.map((line, index) => index < roundedLines.length - 1
    ? {
      ...line,
      duration: Math.max(0, Number((roundedLines[index + 1].start - line.start - LINE_GAP_SECONDS).toFixed(1))),
    }
    : line);
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function splitLongLines(lines: LyricLine[]): LyricLine[] {
  return lines.flatMap((line) => {
    const words = line.text.trim().split(/\s+/u).filter(Boolean);
    if (words.length <= 7) return [line];

    const chunks: string[] = [];
    let remainingWords = words;
    let remainingChunks = Math.ceil(words.length / 7);

    while (remainingChunks > 1) {
      const minimumWords = Math.max(1, remainingWords.length - (remainingChunks - 1) * 7);
      const maximumWords = Math.min(7, remainingWords.length - (remainingChunks - 1));
      const targetWords = Math.min(maximumWords, Math.max(minimumWords, Math.round(remainingWords.length / remainingChunks)));
      const punctuationCandidates = Array.from(
        { length: maximumWords - minimumWords + 1 },
        (_, index) => minimumWords + index,
      )
        .filter((wordCount) => Math.abs(wordCount - targetWords) <= 2)
        .map((wordCount) => {
          const ending = remainingWords[wordCount - 1].replace(/["'’”»)\]}]+$/u, "");
          const punctuationRank = /[.!?…]+$/u.test(ending) ? 2 : /\p{P}$/u.test(ending) ? 1 : 0;
          return { wordCount, punctuationRank };
        })
        .filter((candidate) => candidate.punctuationRank > 0)
        .sort((a, b) => b.punctuationRank - a.punctuationRank || Math.abs(a.wordCount - targetWords) - Math.abs(b.wordCount - targetWords));
      const splitAt = punctuationCandidates[0]?.wordCount ?? targetWords;

      chunks.push(remainingWords.slice(0, splitAt).join(" "));
      remainingWords = remainingWords.slice(splitAt);
      remainingChunks -= 1;
    }
    chunks.push(remainingWords.join(" "));

    const totalCharacters = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const lineEnd = line.start + line.duration;
    const lineWithoutTranslations = { ...line };
    delete lineWithoutTranslations.translations;
    let elapsedCharacters = 0;
    let previousBoundary = line.start;

    return chunks.map((text, index) => {
      const start = index === 0 ? line.start : previousBoundary;
      elapsedCharacters += text.length;
      const end = index === chunks.length - 1
        ? lineEnd
        : Number((line.start + line.duration * elapsedCharacters / totalCharacters).toFixed(2));
      previousBoundary = end;

      return {
        ...lineWithoutTranslations,
        text,
        start,
        duration: Number(Math.max(0, end - start).toFixed(2)),
      };
    });
  });
}

function updateLineStart(lines: LyricLine[], index: number, start: number): LyricLine[] {
  const updated = lines.map((line, lineIndex) => lineIndex === index ? { ...line, start } : line);
  const durationBefore = index - 1;
  const durationAfter = index;

  for (const lineIndex of [durationBefore, durationAfter]) {
    if (lineIndex < 0 || lineIndex >= updated.length - 1) continue;
    updated[lineIndex] = {
      ...updated[lineIndex],
      duration: Math.max(0, Number((updated[lineIndex + 1].start - updated[lineIndex].start - LINE_GAP_SECONDS).toFixed(2))),
    };
  }

  return updated;
}

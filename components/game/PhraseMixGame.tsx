"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, ChevronUp, Globe, Loader2, LogOut, Shuffle, SkipForward, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import ExplanationCard, { ExplanationSkeleton, StreamingExplanation } from "@/components/ExplanationCard";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useStreamingExplanation } from "@/hooks/useStreamingExplanation";
import QuickEditLine, { type QuickEditContext, type QuickEditLineSave } from "@/components/QuickEditLine";
import { buildRound, countHideableWords, firstLetterOf, normalizeLetter } from "@/lib/game/buildRound";
import { readExplanationCache } from "@/lib/explanations/cache";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";
import type { Explanation } from "@/lib/types";
import type { Round } from "@/types/game";

type Phrase = {
  songId: string;
  canEdit: boolean;
  youtubeId: string;
  text: string;
  lineIndex: number;
  start: number;
  duration: number;
  previousLine?: { text: string; start: number; duration: number };
  nextLine?: { text: string; start: number; duration: number };
};

type Records = { dailyBest: number; allTimeBest: number; date: string };

const GUEST_RECORDS_KEY = "lingo-clips:phrase-mix-records:v1";

function readGuestRecords(): Records {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_RECORDS_KEY) ?? "null");
    if (typeof parsed === "object" && parsed !== null) {
      const value = parsed as Partial<Records>;
      return {
        date,
        dailyBest: value.date === date && Number.isInteger(value.dailyBest) ? value.dailyBest! : 0,
        allTimeBest: Number.isInteger(value.allTimeBest) ? value.allTimeBest! : 0,
      };
    }
  } catch {
    // Browser storage may be unavailable.
  }
  return { date, dailyBest: 0, allTimeBest: 0 };
}

function maskWord(word: string): string {
  return Array.from(word, (character) => /['’]/u.test(character) ? character : "\u2022").join("");
}

export default function PhraseMixGame() {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const streamExplanation = useStreamingExplanation();
  const { userId, loading: authLoading } = useAuthState();
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [consecutiveMistakes, setConsecutiveMistakes] = useState(0);
  const [records, setRecords] = useState<Records>({ date: "", dailyBest: 0, allTimeBest: 0 });
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [loadingPhrase, setLoadingPhrase] = useState(false);
  const [error, setError] = useState<"none" | "empty" | "load" | "save">("none");
  const [shakeKey, setShakeKey] = useState(0);
  const [recordFlash, setRecordFlash] = useState(false);
  const [explanationStatus, setExplanationStatus] = useState<"closed" | "loading" | "open" | "error">("closed");
  const [explanationError, setExplanationError] = useState("");
  const [remoteExplanation, setRemoteExplanation] = useState<Explanation | null>(null);
  const [partialExplanation, setPartialExplanation] = useState<Partial<Explanation> | null>(null);
  const [lineTranslation, setLineTranslation] = useState<string | null>(null);
  const [lineTranslationStatus, setLineTranslationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [lineTranslationError, setLineTranslationError] = useState("");
  const [translationExpanded, setTranslationExpanded] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);
  const pausedAtBoundaryRef = useRef(false);
  const phraseRequestIdRef = useRef(0);
  const phraseRef = useRef<HTMLDivElement>(null);
  const nextBlank = round?.tokens.find((token) => token.hidden && !round.filledIds.includes(token.id));

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void (async () => {
      if (!userId) {
        const guestRecords = readGuestRecords();
        queueMicrotask(() => {
          if (!active) return;
          setRecords(guestRecords);
          setRecordsLoading(false);
        });
        return;
      }
      try {
        const response = await fetch("/api/phrase-mix?action=records", { cache: "no-store" });
        const result = await response.json() as { records?: Records };
        if (!response.ok || !result.records) throw new Error("Record lookup failed");
        if (active) setRecords(result.records);
      } catch {
        if (active) setError("save");
      } finally {
        if (active) setRecordsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authLoading, userId]);

  const loadNextPhrase = useCallback(async (excludedVideoId?: string): Promise<Phrase | null> => {
    const requestId = ++phraseRequestIdRef.current;
    setLoadingPhrase(true);
    setConsecutiveMistakes(0);
    playerRef.current?.pause();
    pausedAtBoundaryRef.current = false;
    setExplanationStatus("closed");
    setExplanationError("");
    setRemoteExplanation(null);
    setPartialExplanation(null);
    setLineTranslation(null);
    setLineTranslationStatus("idle");
    setLineTranslationError("");
    setTranslationExpanded(false);
    setError("none");
    const params = new URLSearchParams({ action: "next", language: sourceLanguage, onlyFavorites: String(onlyFavorites) });
    if (excludedVideoId) params.set("excludeVideoId", excludedVideoId);
    try {
      let response = await fetch(`/api/phrase-mix?${params.toString()}`, { cache: "no-store" });
      let result = await response.json() as { phrase?: Phrase; error?: string };
      if (response.ok && !result.phrase && excludedVideoId) {
        params.delete("excludeVideoId");
        response = await fetch(`/api/phrase-mix?${params.toString()}`, { cache: "no-store" });
        result = await response.json() as { phrase?: Phrase; error?: string };
      }
      if (requestId !== phraseRequestIdRef.current) return null;
      if (!response.ok || !result.phrase) {
        setError(result.error === "NO_PHRASES" ? "empty" : "load");
        return null;
      }
      if (countHideableWords(result.phrase.text) < 3) {
        setError("load");
        return null;
      }
      setPlayerReady(false);
      setPhrase(result.phrase);
      setRound(buildRound(0, result.phrase.text, { mode: "first-letter", difficulty: "hard" }, []));
      return result.phrase;
    } catch {
      if (requestId === phraseRequestIdRef.current) setError("load");
      return null;
    } finally {
      if (requestId === phraseRequestIdRef.current) setLoadingPhrase(false);
    }
  }, [onlyFavorites, sourceLanguage]);

  async function saveRecord(score: number) {
    const date = new Date().toISOString().slice(0, 10);
    if (!userId) {
      const updated = {
        date,
        dailyBest: Math.max(records.date === date ? records.dailyBest : 0, score),
        allTimeBest: Math.max(records.allTimeBest, score),
      };
      const brokeRecord = updated.dailyBest > (records.date === date ? records.dailyBest : 0) || updated.allTimeBest > records.allTimeBest;
      setRecords(updated);
      try {
        localStorage.setItem(GUEST_RECORDS_KEY, JSON.stringify(updated));
      } catch {
        setError("save");
      }
      if (brokeRecord) setRecordFlash(true);
      return;
    }

    try {
      const response = await fetch("/api/phrase-mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streak: score }),
      });
      const result = await response.json() as { records?: Records; error?: string };
      if (!response.ok || !result.records) throw new Error("Record save failed");
      const brokeRecord = result.records.dailyBest > (records.date === date ? records.dailyBest : 0) || result.records.allTimeBest > records.allTimeBest;
      setRecords(result.records);
      if (brokeRecord) setRecordFlash(true);
    } catch {
      setError("save");
    }
  }

  async function startGame() {
    setCurrentStreak(0);
    if (!phrase) {
      const loadedPhrase = await loadNextPhrase();
      if (!loadedPhrase) return;
    }
    setPhase("playing");
  }

  function skipPhrase() {
    setCurrentStreak(0);
    void loadNextPhrase(phrase?.youtubeId);
  }

  function registerWrongLetter() {
    setShakeKey((value) => value + 1);
    setCurrentStreak(0);
    if (!nextBlank || !round) return;

    const mistakeCount = consecutiveMistakes + 1;
    if (mistakeCount < 3) {
      setConsecutiveMistakes(mistakeCount);
      return;
    }

    setConsecutiveMistakes(0);
    const filledIds = [...round.filledIds, nextBlank.id];
    setRound({
      ...round,
      filledIds,
      revealedIds: [...round.revealedIds, nextBlank.id],
    });
    if (!round.tokens.some((token) => token.hidden && !filledIds.includes(token.id))) {
      void loadNextPhrase(phrase?.youtubeId);
    }
  }

  const replayPhrase = useCallback(() => {
    if (!phrase || !playerReady) return;
    pausedAtBoundaryRef.current = false;
    playerRef.current?.seekTo(Math.max(0, phrase.start - AUDIO_START_BUFFER_SECONDS));
    playerRef.current?.play();
  }, [phrase, playerReady]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    if (
      phase === "playing" && phrase && !loadingPhrase && !quickEditOpen &&
      seconds >= phrase.start + phrase.duration + AUDIO_END_BUFFER_SECONDS &&
      !pausedAtBoundaryRef.current
    ) {
      pausedAtBoundaryRef.current = true;
      playerRef.current?.pause();
    }
  }, [loadingPhrase, phase, phrase, quickEditOpen]);

  async function toggleExplanation() {
    if (!phrase) return;
    if (explanationStatus === "open") {
      setExplanationStatus("closed");
      return;
    }
    if (explanationStatus === "loading") return;
    playerRef.current?.pause();
    setExplanationStatus("loading");
    setExplanationError("");
    setPartialExplanation(null);
    try {
      const cached = await readExplanationCache({
        youtubeId: phrase.youtubeId,
        lineIndex: phrase.lineIndex,
        text: phrase.text,
        sourceLanguage,
        targetLanguage,
        context: "",
      });
      const result = cached ?? await streamExplanation({
        text: phrase.text,
        youtubeId: phrase.youtubeId,
        lineIndex: phrase.lineIndex,
        sourceLanguage,
        targetLanguage,
      }, setPartialExplanation);
      setRemoteExplanation(result);
      setExplanationStatus("open");
    } catch (reason) {
      setExplanationError(reason instanceof Error ? reason.message : t("explain.requestError"));
      setExplanationStatus("error");
    }
  }

  async function toggleTranslation() {
    if (!phrase) return;
    if (translationExpanded) {
      setTranslationExpanded(false);
      return;
    }
    setTranslationExpanded(true);
    if (lineTranslation || lineTranslationStatus === "loading") return;

    setLineTranslationStatus("loading");
    setLineTranslationError("");
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: phrase.text,
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          videoId: phrase.youtubeId,
          lineIndex: phrase.lineIndex,
        }),
      });
      const result = await response.json().catch(() => null) as { translation?: unknown } | null;
      if (!response.ok || typeof result?.translation !== "string" || !result.translation.trim()) {
        throw new Error(t("lyrics.translationError"));
      }
      setLineTranslation(result.translation);
      setLineTranslationStatus("idle");
    } catch (reason) {
      setLineTranslationError(reason instanceof Error ? reason.message : t("lyrics.translationError"));
      setLineTranslationStatus("error");
    }
  }

  function handleLetter(letter: string) {
    if (!nextBlank || !round || loadingPhrase) return;
    if (normalizeLetter(letter) !== normalizeLetter(firstLetterOf(nextBlank))) {
      registerWrongLetter();
      return;
    }

    setConsecutiveMistakes(0);
    const nextStreak = currentStreak + 1;
    setCurrentStreak(nextStreak);
    void saveRecord(nextStreak);
    const filledIds = [...round.filledIds, nextBlank.id];
    setRound({ ...round, filledIds });
    if (!round.tokens.some((token) => token.hidden && !filledIds.includes(token.id))) {
      void loadNextPhrase(phrase?.youtubeId);
    }
  }

  const letterHandlerRef = useRef(handleLetter);
  useEffect(() => {
    letterHandlerRef.current = handleLetter;
  });

  useEffect(() => {
    if (phase !== "playing" || loadingPhrase || !round || quickEditOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (!phrase || !playerReady) return;
        event.preventDefault();
        replayPhrase();
        return;
      }
      if (event.key.length !== 1 || !/\p{L}/u.test(event.key)) return;
      event.preventDefault();
      letterHandlerRef.current(event.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadingPhrase, nextBlank, phase, phrase, playerReady, quickEditOpen, replayPhrase, round]);

  useEffect(() => {
    if (recordFlash) {
      const timer = window.setTimeout(() => setRecordFlash(false), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [recordFlash]);

  useEffect(() => {
    if (shakeKey === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    phraseRef.current?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
      { duration: 250, easing: "ease-in-out" },
    );
  }, [shakeKey]);

  const videoPlayer = phrase ? (
    <YouTubePlayer
      key={phrase.youtubeId}
      ref={playerRef}
      videoId={phrase.youtubeId}
      onReady={() => setPlayerReady(true)}
      onTimeUpdate={handleTimeUpdate}
    />
  ) : (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black" aria-busy={loadingPhrase}>
      {loadingPhrase && <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-300" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("game.phraseMix.next")}</span>}
    </div>
  );
  const lineEditContext: QuickEditContext | undefined = phrase ? {
    songId: phrase.songId,
    canEdit: phrase.canEdit,
    lineIndex: phrase.lineIndex,
    line: { text: phrase.text, start: phrase.start, duration: phrase.duration },
    previousLineIndex: phrase.previousLine ? phrase.lineIndex - 1 : undefined,
    previousLine: phrase.previousLine,
    nextLineIndex: phrase.nextLine ? phrase.lineIndex + 1 : undefined,
    nextLine: phrase.nextLine,
  } : undefined;

  if (phase === "setup") {
    return (
      <div>
        <section className="space-y-5 rounded-xl border bg-card p-5">
          <header className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Shuffle className="size-5" aria-hidden="true" />{t("game.phraseMix.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("game.phraseMix.description")}</p>
          </header>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyFavorites} onChange={(event) => setOnlyFavorites(event.target.checked)} disabled={authLoading || !userId} className="size-4 accent-primary" />
              {t("game.phraseMix.onlyFavorites")}
            </label>
            {!authLoading && !userId && <p className="text-xs text-muted-foreground">{t("game.phraseMix.signInFavorites")}</p>}
          </div>
          {error === "empty" && <p role="status" className="text-sm text-muted-foreground">{t("game.phraseMix.noPhrases")}</p>}
          {error === "load" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.loadError")}</p>}
          {error === "save" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.saveError")}</p>}
          <Button type="button" className="w-full" disabled={recordsLoading || loadingPhrase} onClick={() => void startGame()}>
            {loadingPhrase || recordsLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Shuffle className="size-4" aria-hidden="true" />}
            {t("game.phraseMix.start")}
          </Button>
        </section>
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-busy={loadingPhrase}>
      {videoPlayer}

      <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5 text-center text-xs text-neutral-100 sm:gap-3 sm:px-4 sm:text-sm">
        <div className="min-w-0"><p className="truncate text-neutral-300">{t("game.phraseMix.currentStreak")}</p><p className="font-semibold tabular-nums" aria-live="polite">{currentStreak}</p></div>
        <div className={`min-w-0 ${recordFlash ? "animate-pulse text-amber-300" : ""}`}><p className="truncate text-neutral-300">{t("game.phraseMix.dailyBest")}</p><p className="font-semibold tabular-nums">{records.dailyBest}</p></div>
        <div className={`min-w-0 ${recordFlash ? "animate-pulse text-amber-300" : ""}`}><p className="truncate text-neutral-300">{t("game.phraseMix.allTimeBest")}</p><p className="font-semibold tabular-nums">{records.allTimeBest}</p></div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="outline" size="sm" disabled={loadingPhrase} onClick={skipPhrase}>
          <SkipForward className="size-4" />{t("game.phraseMix.skip")}
        </Button>
        <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="outline" size="sm" disabled={!phrase || !playerReady || loadingPhrase} onClick={replayPhrase}>
          <ArrowUpDown className="size-4" />{t("game.replay")}
        </Button>
        <div className="flex items-center justify-center gap-1">
          <QuickEditLine
            context={lineEditContext}
            onPause={() => playerRef.current?.pause()}
            onOpenChange={setQuickEditOpen}
            onPlayLine={(seconds, _lineIndex, duration) => {
              if (!phrase) return;
              playerRef.current?.playRange(seconds, seconds + duration);
            }}
            onSaved={(save: QuickEditLineSave) => {
              if (!phrase) return;
              const currentLineIndex = save.insert && save.insert.afterIndex < phrase.lineIndex
                ? phrase.lineIndex + 1
                : save.deleteLineIndex !== undefined && save.deleteLineIndex < phrase.lineIndex
                  ? phrase.lineIndex - 1
                  : phrase.lineIndex;
              const updatedLine = save.lines?.[currentLineIndex]
                ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex)?.line;
              const previousLine = save.lines?.[currentLineIndex - 1]
                ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex - 1)?.line;
              const nextLine = save.lines?.[currentLineIndex + 1]
                ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex + 1)?.line;
              if (!updatedLine) return;
              setPhrase({ ...phrase, lineIndex: currentLineIndex, text: updatedLine.text, start: updatedLine.start, duration: updatedLine.duration });
              setRound(buildRound(0, updatedLine.text, { mode: "first-letter", difficulty: "hard" }, []));
              if (updatedLine.text !== phrase.text) {
                setLineTranslation(null);
                setTranslationExpanded(false);
                setExplanationStatus("closed");
                setRemoteExplanation(null);
              }
              if (previousLine || nextLine) {
                setPhrase((current) => current ? {
                  ...current,
                  ...(previousLine ? { previousLine } : {}),
                  ...(nextLine ? { nextLine } : {}),
                } : current);
              }
            }}
          />
          <Button className="size-8 min-w-8 p-0 text-muted-foreground hover:text-foreground" type="button" size="sm" variant="ghost" title={explanationStatus === "loading" ? t("explain.loading") : explanationStatus === "open" ? t("explain.hide") : t("explain.button")} aria-label={explanationStatus === "loading" ? t("explain.loading") : explanationStatus === "open" ? t("explain.hide") : t("explain.button")} aria-expanded={explanationStatus === "open"} disabled={!phrase || explanationStatus === "loading"} onClick={() => void toggleExplanation()}>
            {explanationStatus === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : explanationStatus === "open" ? <ChevronUp className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          </Button>
          <Button className="size-8 min-w-8 p-0 text-muted-foreground hover:text-foreground" type="button" size="sm" variant="ghost" title={lineTranslationStatus === "loading" ? t("lyrics.translationLoading") : translationExpanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-label={lineTranslationStatus === "loading" ? t("lyrics.translationLoading") : translationExpanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-expanded={translationExpanded} disabled={!phrase} onClick={() => void toggleTranslation()}>
            {lineTranslationStatus === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}
          </Button>
        </div>
        <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="ghost" size="sm" onClick={() => setPhase("setup")}>
          <span className="flex w-full items-center justify-end gap-2"><LogOut className="size-4" />{t("game.quit")}</span>
        </Button>
      </div>

      {phrase && (
        <div ref={phraseRef} className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-3 text-xl leading-snug">
              {round && round.tokens.map((token) => {
                if (!token.hidden) return <span key={token.id}>{token.raw}</span>;
                if (round.revealedIds.includes(token.id)) return <span key={token.id} className="font-semibold text-amber-700 dark:text-amber-300">{token.raw}</span>;
                if (round.filledIds.includes(token.id)) return <span key={token.id} className="font-semibold text-emerald-700 dark:text-emerald-300">{token.raw}</span>;
                return <span key={token.id}>{token.leading}<span role="img" aria-label={t("game.hiddenWord")} className="inline-flex min-w-8 items-center justify-center px-1 text-center leading-none text-foreground" style={{ width: `${Math.min(Math.max(token.core.length, 2), 14)}ch` }}>{maskWord(token.core)}</span>{token.trailing}</span>;
              })}
            </p>
          </div>
          {translationExpanded && (
            <div className="mt-3 rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
              {lineTranslationStatus === "loading" && t("lyrics.translationLoading")}
              {lineTranslationStatus === "error" && <p role="alert" className="text-destructive">{lineTranslationError}</p>}
              {lineTranslation && <p>{lineTranslation}</p>}
            </div>
          )}
        </div>
      )}

      {!phrase && loadingPhrase && <p className="flex items-center justify-center gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("game.phraseMix.next")}</p>}
      {phrase && loadingPhrase && <span className="sr-only" role="status">{t("game.phraseMix.next")}</span>}
      {error === "empty" && <p role="status" className="text-sm text-muted-foreground">{t("game.phraseMix.noPhrases")}</p>}
      {error === "load" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.loadError")}</p>}
      {error === "save" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.saveError")}</p>}
      <div className="sticky bottom-3 z-10 space-y-2">
        {explanationStatus === "loading" && (partialExplanation ? <StreamingExplanation data={partialExplanation} /> : <ExplanationSkeleton />)}
        {explanationStatus === "error" && <p role="alert" className="text-sm text-destructive">{explanationError}</p>}
        {explanationStatus === "open" && remoteExplanation && <ExplanationCard data={remoteExplanation} />}
      </div>
    </section>
  );
}
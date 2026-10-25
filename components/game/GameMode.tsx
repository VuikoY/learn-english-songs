// components/game/GameMode.tsx
// Main game flow: mode and difficulty selection, song-line rounds, and results.
"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  LogOut,
  Loader2,
  Sparkles,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import GameCompletionModal from "@/components/game/GameCompletionModal";
import WordBank from "@/components/game/WordBank";
import ExplanationCard, { ExplanationSkeleton, StreamingExplanation } from "@/components/ExplanationCard";
import { useStreamingExplanation } from "@/hooks/useStreamingExplanation";
import { useLanguage } from "@/context/LanguageContext";
import FavoriteLineButton from "@/components/FavoriteLineButton";
import {
  buildRound,
  buildWordPool,
  countHideableWords,
  firstLetterOf,
  normalizeLetter,
  sameWord,
} from "@/lib/game/buildRound";
import { gameReducer, initialGameState } from "@/lib/game/gameState";
import type { Explanation, LyricLine } from "@/lib/types";
import { readExplanationCache } from "@/lib/explanations/cache";
import {
  DIFFICULTIES,
  HIDE_RATIO,
  type Difficulty,
  type BankItem,
  type GamePhase,
  type GameSettings,
  type Round,
  type WordToken,
} from "@/types/game";

type Props = {
  lines: LyricLine[];
  currentTime: number;
  youtubeId?: string;
  songId?: string | null;
  /** Seeks to a song line and starts playback. */
  onPlayLine?: (startSeconds: number) => void;
  /** Starts a one-second fade out and pauses playback. */
  onPauseAfterFade?: () => void;
  onPause?: () => void;
  settings: GameSettings;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onProgressChange: (current: number, total: number) => void;
  startRequest: number;
  hasPlaybackStarted: boolean;
  onQuit: () => void;
  active: boolean;
};

// Minimum number of words required for a line to be playable.
const MIN_WORDS_PER_LINE = 3;
export default function GameMode({ lines, currentTime, youtubeId, songId, onPlayLine, onPauseAfterFade, onPause, settings, onDifficultyChange, onProgressChange, startRequest, hasPlaybackStarted, onQuit, active }: Props) {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const streamExplanation = useStreamingExplanation();
  const [explanationStatus, setExplanationStatus] = useState<"closed" | "loading" | "open" | "error">("closed");
  const [explanationError, setExplanationError] = useState("");
  const [remoteExplanation, setRemoteExplanation] = useState<Explanation | null>(null);
  const [partialExplanation, setPartialExplanation] = useState<Partial<Explanation> | null>(null);

  // ---------- State ----------
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [game, dispatch] = useReducer(gameReducer, initialGameState);
  const [round, setRound] = useState<Round | null>(null); // Current line round.
  const [position, setPosition] = useState(0); // Position among playable lines.
  const [consecutiveMistakes, setConsecutiveMistakes] = useState(0);
  const [progressStatus, setProgressStatus] = useState<"idle" | "saving" | "saved" | "error" | "sign-in">("idle");
  const fadeStartedRoundRef = useRef<Round | null>(null);
  const progressSavedRef = useRef(false);
  const [shakeKey, setShakeKey] = useState(0); // Increment to trigger the error shake animation.

  const lineRef = useRef<HTMLDivElement>(null);
  const handledStartRequestRef = useRef(startRequest);
  // Keep the original index for each line with enough words to play.
  const playable = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => countHideableWords(line.text) >= MIN_WORDS_PER_LINE),
    [lines],
  );
  const totalHiddenWords = useMemo(
    () => playable.reduce(
      (total, { line }) => total + Math.max(1, Math.round(countHideableWords(line.text) * HIDE_RATIO[settings.difficulty])),
      0,
    ),
    [playable, settings.difficulty],
  );
  const completedWords = Math.min(game.wordsCompleted, totalHiddenWords);
  const progressPercent = totalHiddenWords > 0 ? (completedWords / totalHiddenWords) * 100 : 0;
  const answers = game.correct + game.mistakes;
  const accuracy = answers === 0 ? 0 : Math.round((game.correct / answers) * 100);

  useEffect(() => {
    const current = phase === "setup" ? 0 : Math.min(position + 1, Math.max(playable.length, 1));
    onProgressChange(current, playable.length);
  }, [onProgressChange, phase, playable.length, position]);

  // Words from the full song are used as distractors.
  const wordPool = useMemo(() => buildWordPool(lines.map((l) => l.text)), [lines]);

  // Derived values are calculated during render rather than stored in state.
  const nextBlank = round?.tokens.find((tok) => tok.hidden && !round.filledIds.includes(tok.id));
  const activeWordMistakes = consecutiveMistakes;
  const isRoundComplete = round !== null && nextBlank === undefined;
  const currentLine = round ? lines[round.lineIndex] : null;

  const startRound = useCallback((nextPosition: number, activeSettings: GameSettings = settings) => {
    const entry = playable[nextPosition];
    if (!entry) return;
    fadeStartedRoundRef.current = null;
    setConsecutiveMistakes(0);
    setPosition(nextPosition);
    setRound(buildRound(entry.index, entry.line.text, activeSettings, wordPool));
  }, [playable, settings, wordPool]);

  // Apply a changed mode to the same active lyric line without advancing or seeking.
  useEffect(() => {
    if (phase !== "playing") return;
    queueMicrotask(() => {
      setRound((previous) => {
        if (!previous) return previous;
        const line = lines[previous.lineIndex];
        return line ? buildRound(previous.lineIndex, line.text, settings, wordPool) : previous;
      });
    });
  }, [phase, settings, lines, wordPool]);
  const explainKey = currentLine ? `${sourceLanguage}>${targetLanguage}::${currentLine.text.trim().toLowerCase()}` : "";
  const explanationLineKey = `${youtubeId ?? ""}:${round?.lineIndex ?? ""}:${explainKey}`;
  const explanationLineRef = useRef(explanationLineKey);
  useEffect(() => {
    if (explanationLineRef.current === explanationLineKey) return;
    explanationLineRef.current = explanationLineKey;
    setExplanationStatus("closed");
    setExplanationError("");
    setRemoteExplanation(null);
    setPartialExplanation(null);
  }, [explanationLineKey]);

  async function toggleExplanation() {
    if (!currentLine || !explainKey) return;
    if (explanationStatus === "open") {
      setExplanationStatus("closed");
      return;
    }
    onPause?.();
    const context = lines.slice(Math.max(0, round!.lineIndex - 1), round!.lineIndex + 2)
      .filter((_, index) => index !== round!.lineIndex - Math.max(0, round!.lineIndex - 1))
      .map((line) => line.text)
      .join(" ");
    setExplanationStatus("loading");
    setExplanationError("");
    setPartialExplanation(null);
    try {
      let databaseExplanation: Explanation | null = null;
      try {
        databaseExplanation = await readExplanationCache({
          youtubeId,
          lineIndex: round!.lineIndex,
          text: currentLine.text,
          sourceLanguage,
          targetLanguage,
          context,
        });
      } catch {
        // The API route will make its own cache lookup if the browser cannot reach Supabase.
      }
      if (databaseExplanation) {
        setRemoteExplanation(databaseExplanation);
        setExplanationStatus("open");
        return;
      }
      const result = await streamExplanation({
          text: currentLine.text,
          youtubeId,
          lineIndex: round!.lineIndex,
          context,
          sourceLanguage,
          targetLanguage,
        }, setPartialExplanation);
      setRemoteExplanation(result);
      setExplanationStatus("open");
    } catch (error) {
      setExplanationError(error instanceof Error ? error.message : "Unknown error");
      setExplanationStatus("error");
    }
  }

  useEffect(() => {
    if (!active || phase !== "playing" || !currentLine) {
      return;
    }

    const nextLineStart = playable[position + 1]?.line.start;
    const lineEnd = currentLine.start + currentLine.duration;

    // Keep the line tied to the song timeline, but pause at its boundary if
    // the learner has not filled every blank yet.
    const lineBoundary = nextLineStart === undefined ? lineEnd : Math.min(lineEnd, nextLineStart);
    if (!isRoundComplete && currentTime >= lineBoundary) {
      if (fadeStartedRoundRef.current !== round) {
        fadeStartedRoundRef.current = round;
        onPauseAfterFade?.();
      }
      return;
    }

    // Keep an incomplete round active until its timeout pauses playback.
    if (!isRoundComplete && nextLineStart !== undefined && currentTime >= nextLineStart) return;

    // A completed round follows the song timeline without seeking or interrupting playback.
    if (nextLineStart !== undefined && currentTime >= nextLineStart) {
      let timePosition = position + 1;
      while (timePosition + 1 < playable.length && currentTime >= playable[timePosition + 1].line.start) {
        timePosition += 1;
      }
      queueMicrotask(() => startRound(timePosition));
      return;
    }

    if (position === playable.length - 1 && currentTime >= lineEnd) {
      onPause?.();
      queueMicrotask(() => setPhase("finished"));
    }
  }, [active, currentTime, currentLine, isRoundComplete, onPauseAfterFade, onPause, phase, playable, position, round, startRound]);

  useEffect(() => {
    if (phase !== "finished" || !songId || progressSavedRef.current) return;
    progressSavedRef.current = true;
    void (async () => {
      await Promise.resolve();
      setProgressStatus("saving");
      try {
        const response = await fetch("/api/media-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaId: songId,
            difficulty: `${settings.difficulty[0].toUpperCase()}${settings.difficulty.slice(1)}`,
            accuracy,
            wordsCompleted: completedWords,
            totalWords: totalHiddenWords,
            mistakesCount: game.mistakes,
          }),
        });
        const result = await response.json().catch(() => null) as { error?: unknown } | null;
        if (!response.ok) {
          setProgressStatus(result?.error === "AUTH_REQUIRED" ? "sign-in" : "error");
          return;
        }
        setProgressStatus("saved");
      } catch {
        setProgressStatus("error");
      }
    })();
  }, [accuracy, completedWords, game.mistakes, phase, settings.difficulty, songId, totalHiddenWords]);

  // ---------- Round controls ----------

  function startGame() {
    if (playable.length === 0) return;
    dispatch({ type: "reset" });
    progressSavedRef.current = false;
    setProgressStatus("idle");
    startRound(0);
    setPhase("playing");
    onPause?.();
  }

  useEffect(() => {
    if (handledStartRequestRef.current === startRequest) return;
    if (!active || playable.length === 0) return;

    if (phase === "playing" && round) {
      handledStartRequestRef.current = startRequest;
      onPlayLine?.(currentLine?.start ?? playable[position].line.start);
      return;
    }
    if (!hasPlaybackStarted) return;

    let startPosition = -1;
    for (let index = 0; index < playable.length; index += 1) {
      const line = playable[index].line;
      if (currentTime >= line.start && currentTime < line.start + line.duration) {
        startPosition = index;
        break;
      }
    }
    if (startPosition < 0) return;

    handledStartRequestRef.current = startRequest;
    queueMicrotask(() => {
      dispatch({ type: "reset" });
      progressSavedRef.current = false;
      setProgressStatus("idle");
      startRound(startPosition);
      setPhase("playing");
      onPlayLine?.(playable[startPosition].line.start);
    });
  }, [active, currentLine, currentTime, hasPlaybackStarted, onPlayLine, phase, playable, position, round, startRequest, startRound]);

  const goPrevious = useCallback(() => {
    if (position <= 0) return;
    const previousPosition = position - 1;
    const previousLine = playable[previousPosition]?.line;
    if (!previousLine) return;
    startRound(previousPosition);
    onPlayLine?.(previousLine.start);
  }, [onPlayLine, playable, position, startRound]);
  const replayCurrentLine = useCallback(() => {
    if (!currentLine || !onPlayLine) return;
    onPlayLine(currentLine.start);
  }, [currentLine, onPlayLine]);

  function quitToSetup() {
    setRound(null);
    setPosition(0);
    setPhase("setup");
    onQuit();
  }

  // ---------- Answer handling ----------

  function registerCorrect(tokenId: number, bankItemId?: string) {
    const wordKey = `${round?.lineIndex ?? ""}:${tokenId}`;
    dispatch({ type: "correct", wordKey });
    setConsecutiveMistakes(0);
    const hiddenCount = round?.tokens.filter((token) => token.hidden).length ?? 0;
    if (round && round.filledIds.length + 1 >= hiddenCount && phase === "playing" && fadeStartedRoundRef.current === round) {
      const nextEntry = playable[position + 1];
      if (nextEntry) onPlayLine?.(nextEntry.line.start);
    }
    setRound((prev) =>
      prev
        ? {
            ...prev,
            filledIds: [...prev.filledIds, tokenId],
            bank: bankItemId
              ? prev.bank.map((item) => (item.id === bankItemId ? { ...item, used: true } : item))
              : prev.bank,
          }
        : prev,
    );
  }

  function registerWrong(token: WordToken) {
    dispatch({ type: "wrong" });
    setShakeKey((key) => key + 1); // Trigger the shake animation.
    const wordKey = `${round?.lineIndex ?? ""}:${token.id}`;
    const count = consecutiveMistakes + 1;
    setConsecutiveMistakes(count);
    if (count < 3 || !round) return;

    dispatch({ type: "revealed", wordKey });
    setRound((previous) => previous && previous.lineIndex === round.lineIndex
      ? {
          ...previous,
          filledIds: [...previous.filledIds, token.id],
          revealedIds: [...previous.revealedIds, token.id],
        }
      : previous);
    setConsecutiveMistakes(0);

    const hiddenCount = round.tokens.filter((item) => item.hidden).length;
    if (round.filledIds.length + 1 >= hiddenCount && phase === "playing" && fadeStartedRoundRef.current === round) {
      const nextEntry = playable[position + 1];
      if (nextEntry) onPlayLine?.(nextEntry.line.start);
    }
  }

  /** Fill-in mode: the selected word must match the next blank. */
  function handlePickWord(item: BankItem) {
    if (!nextBlank || item.used) return;
    if (sameWord(item.text, nextBlank.core)) {
      registerCorrect(nextBlank.id, item.id);
    } else {
      registerWrong(nextBlank);
    }
  }

  /** First-letter mode: the key must match the next hidden word's first letter. */
  function handleLetter(letter: string) {
    if (!nextBlank) return;
    if (normalizeLetter(letter) === normalizeLetter(firstLetterOf(nextBlank))) {
      registerCorrect(nextBlank.id);
    } else {
      registerWrong(nextBlank);
    }
  }

  // ---------- Physical keyboard support for first-letter mode ----------

  // Subscribe once; the ref always points to the latest handleLetter callback.
  const letterHandlerRef = useRef(handleLetter);
  useEffect(() => {
    letterHandlerRef.current = handleLetter;
  });

  const isGamePlaying = phase === "playing" && active;
  useEffect(() => {
    if (!isGamePlaying) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return; // Leave browser shortcuts available.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return; // Typing into a field does not count as a game answer.
      }
      if (event.key === "ArrowLeft") {
        if (!currentLine || !onPlayLine || position === 0) return;
        event.preventDefault();
        goPrevious();
        return;
      }
      if (event.key === "ArrowDown") {
        if (!currentLine || !onPlayLine) return;
        event.preventDefault();
        replayCurrentLine();
        return;
      }
      if (settings.mode !== "first-letter") return;
      if (event.key.length !== 1 || !/\p{L}/u.test(event.key)) return;

      event.preventDefault();
      letterHandlerRef.current(event.key);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentLine, goPrevious, isGamePlaying, onPlayLine, position, replayCurrentLine, settings.mode]);

  // ---------- Shake animation for incorrect answers ----------
  // Use the Web Animations API instead of CSS keyframes.
  useEffect(() => {
    if (shakeKey === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    lineRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-8px)" },
        { transform: "translateX(8px)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 400, easing: "ease-in-out" },
    );
  }, [shakeKey]);

  // =====================================================================
  // SCREEN 1: setup.
  // =====================================================================
  if (phase === "setup") {
    return (
      <section className="space-y-6 rounded-xl border bg-card p-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("game.difficulty.label")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DIFFICULTIES.map((difficulty) => {
              const selected = settings.difficulty === difficulty;
              return (
                <button
                  key={difficulty}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onDifficultyChange(difficulty)}
                  className={`flex min-h-20 flex-col items-start justify-center gap-1 rounded border p-3 text-left transition-all duration-200 ${
                    selected ? "scale-[1.02] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{t(`game.difficulty.${difficulty}`)}</span>
                  <span className={`text-sm ${selected ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                    {t(`game.difficulty.${difficulty}.desc`)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {playable.length === 0 && (
          <p role="alert" className="text-sm text-destructive">
            {t("game.noLines")}
          </p>
        )}

        <Button type="button" className="w-full" disabled={playable.length === 0} onClick={startGame}>
          {t("game.start")}
        </Button>

      </section>
    );
  }

  // =====================================================================
  // SCREEN 3: results.
  // =====================================================================
  if (phase === "finished") {
    return (
      <GameCompletionModal
        accuracy={accuracy}
        wordsCompleted={completedWords}
        totalWords={totalHiddenWords}
        mistakesCount={game.mistakes}
        isCompleted={accuracy >= 80}
        progressStatus={progressStatus}
        onPlayAgain={startGame}
        onExit={quitToSetup}
      />
    );
  }

  // =====================================================================
  // SCREEN 2: game.
  // =====================================================================
  if (!round || !currentLine) return null;

  return (
    <section className="space-y-4">
      <div className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5 px-4 text-sm text-neutral-100">
        <span className="shrink-0">🎯 {t("game.accuracy")}: <strong className="tabular-nums">{accuracy}%</strong></span>
        <div
          role="progressbar"
          aria-label={t("game.wordProgress")}
          aria-valuemin={0}
          aria-valuemax={totalHiddenWords}
          aria-valuenow={completedWords}
          className="mx-1 min-w-20 flex-1 overflow-hidden rounded-full"
          style={{ flex: "1 1 8rem", height: "8px", backgroundColor: "#262626" }}
        >
          <div
            className="block rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: "#10b981" }}
          />
        </div>
        <span className="shrink-0">✍️ {t("game.words")}: <strong className="tabular-nums">{completedWords} / {totalHiddenWords}</strong></span>
      </div>
      {nextBlank && (
        <div role="img" className="flex justify-end" aria-label={t("game.mistakesRemaining", { count: 3 - activeWordMistakes })}>
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className={`size-2 rounded-full ${index < activeWordMistakes ? "bg-red-500" : "bg-neutral-400/40"}`} />
            ))}
          </span>
        </div>
      )}

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {onPlayLine && (
          <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="outline" size="sm" disabled={position === 0} onClick={goPrevious}>
            <ArrowLeft className="size-4" />
            {t("game.previous")}
          </Button>
        )}
        {onPlayLine && (
          <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="outline" size="sm" onClick={replayCurrentLine}>
            <ArrowDown className="size-4" />
            {t("game.replay")}
          </Button>
        )}
        <Button className="w-full min-w-0 whitespace-normal px-2" type="button" size="sm" variant="outline" disabled={!currentLine || explanationStatus === "loading"} onClick={toggleExplanation}>
          {explanationStatus === "loading" ? <Loader2 className="size-4 animate-spin" /> : explanationStatus === "open" ? <ChevronUp className="size-4" /> : <Sparkles className="size-4" />}
          {explanationStatus === "open" ? t("explain.hide") : t("explain.button")}
        </Button>
        <Button className="w-full min-w-0 whitespace-normal px-2" type="button" variant="ghost" size="sm" onClick={quitToSetup}>
          <span className="flex w-full items-center justify-end gap-2">
            <LogOut className="size-4" />
            {t("game.quit")}
          </span>
        </Button>
      </div>

      {/* Song line. The ref is used for the shake animation. */}
      <div ref={lineRef} className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-3 text-xl leading-snug">
          {round.tokens.map((token) => {
            // 1) This word is not hidden; show it as-is.
            if (!token.hidden) {
              return <span key={token.id}>{token.raw}</span>;
            }

            // 2) This word was guessed; show it with its punctuation.
            if (round.filledIds.includes(token.id)) {
              const revealed = round.revealedIds.includes(token.id);
              return (
                <span
                  key={token.id}
                  className={`font-semibold duration-200 animate-in zoom-in-90 ${revealed ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}
                >
                  {token.raw}
                </span>
              );
            }

            // 3) This word is hidden; size the blank based on its length.
            return (
              <span key={token.id}>
                {token.leading}
                <span
                  role="img"
                  aria-label={t("game.hiddenWord")}
                  style={{ width: `${Math.min(Math.max(token.core.length, 2), 14)}ch` }}
                  className="inline-flex min-w-8 items-center justify-center px-1 text-center leading-none text-foreground"
                >
                  {settings.mode === "first-letter" ? "\u2022".repeat(token.core.length) : "___"}
                </span>
                {token.trailing}
              </span>
            );
          })}
        </p>
        <div className="w-6 shrink-0"><FavoriteLineButton songId={songId} lineIndex={round.lineIndex} lineText={currentLine.text} startTime={currentLine.start} endTime={currentLine.start + currentLine.duration}/></div>
        </div>
      </div>

      {/* Bottom floating panel for AI actions or the word bank. */}
      <div className="sticky bottom-3 z-10 space-y-2">
        {explanationStatus === "loading" && (
          partialExplanation
            ? <StreamingExplanation data={partialExplanation} />
            : <ExplanationSkeleton />
        )}
        {explanationStatus === "error" && <p role="alert" className="text-sm text-destructive">{explanationError}</p>}
        {explanationStatus === "open" && remoteExplanation && currentLine && (
          <ExplanationCard
            data={remoteExplanation}
          />
        )}
        {settings.mode === "fill-blanks" && (
          <WordBank items={round.bank} onPick={handlePickWord} disabled={isRoundComplete} />
        )}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import LearningModeControls from "@/components/LearningModeControls";
import GameMode from "@/components/game/GameMode";
import SnippetPlayer, { type SnippetPlayerHandle } from "@/components/SnippetPlayer";
import { useLanguage } from "@/context/LanguageContext";
import { countHideableWords } from "@/lib/game/buildRound";
import { usePersistentState } from "@/lib/storage/usePersistentState";
import { AUDIO_END_BUFFER_SECONDS } from "@/lib/lyricTiming";
import { DIFFICULTIES, type Difficulty, type GameSettings } from "@/types/game";
import type { LyricLine } from "@/lib/types";
import type { QuickEditContext, QuickEditLineSave } from "@/components/QuickEditLine";
import { useAuthState } from "@/context/AuthContext";

export type CollectionLearningItem = {
  id: string;
  youtubeId: string;
  songTitle: string;
  lineText: string;
  startTime: number;
  endTime: number;
  songId: string;
  authorId: string | null;
  sourceLineIndex: number | null;
  sourceLines: LyricLine[];
};

type Props = { items: CollectionLearningItem[] };
type View = "read" | "play";
type TimelineEntry = {
  line: LyricLine;
  item: CollectionLearningItem;
};

function createTimeline(items: CollectionLearningItem[]): TimelineEntry[] {
  let nextStart = 0;
  return items.map((item): TimelineEntry => {
    const duration = Math.max(0, item.endTime - item.startTime);
    const line: LyricLine = {
      text: item.lineText,
      start: nextStart,
      duration,
    };
    nextStart += duration + AUDIO_END_BUFFER_SECONDS;
    return { line, item };
  });
}

export default function CollectionLearningSession({ items }: Props) {
  const { t } = useLanguage();
  const { userId } = useAuthState();
  const [sessionItems, setSessionItems] = useState(items);
  const [view, setView] = usePersistentState<View>(
    "lingo-clips:active-view",
    "read",
    (value): value is View => value === "read" || value === "play",
  );
  const [gameSettings, setGameSettings] = usePersistentState<GameSettings>(
    "lingo-clips:game-settings",
    { mode: "fill-blanks", difficulty: "easy" },
    (value): value is GameSettings =>
      typeof value === "object" && value !== null &&
      ["fill-blanks", "first-letter"].includes((value as GameSettings).mode) &&
      DIFFICULTIES.includes((value as GameSettings).difficulty),
  );
  const [position, setPosition] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [clipEnded, setClipEnded] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [gameProgress, setGameProgress] = useState({ current: 0, total: 0 });
  const [gameStartRequest, setGameStartRequest] = useState(0);
  const playerRef = useRef<SnippetPlayerHandle>(null);

  const timeline = useMemo(() => createTimeline(sessionItems), [sessionItems]);
  const lines = useMemo(() => timeline.map(({ line }) => line), [timeline]);
  const currentEntry = timeline[position] ?? timeline[0] ?? null;
  const playableLines = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => countHideableWords(line.text) >= 3),
    [lines],
  );
  const readLinePosition = useMemo(() => {
    if (!hasPlaybackStarted) return 0;
    let linePosition = 0;
    for (const { line } of playableLines) {
      if (line.start > currentTime) break;
      linePosition += 1;
    }
    return linePosition;
  }, [currentTime, hasPlaybackStarted, playableLines]);

  const pausePlayer = useCallback(() => playerRef.current?.pause(), []);
  const playEditedLine = useCallback((seconds: number, _sourceLineIndex: number, duration: number) => {
    playerRef.current?.playRange(seconds, seconds + duration);
  }, []);
  const getLineEditContext = useCallback((lineIndex: number): QuickEditContext | undefined => {
    const item = timeline[lineIndex]?.item;
    if (!item || item.sourceLineIndex === null) return undefined;
    const sourceLine = item.sourceLines[item.sourceLineIndex];
    if (!sourceLine) return undefined;
    return {
      songId: item.songId,
      lineIndex: item.sourceLineIndex,
      line: sourceLine,
      previousLineIndex: item.sourceLineIndex > 0 ? item.sourceLineIndex - 1 : undefined,
      previousLine: item.sourceLines[item.sourceLineIndex - 1],
      nextLineIndex: item.sourceLineIndex + 1 < item.sourceLines.length ? item.sourceLineIndex + 1 : undefined,
      nextLine: item.sourceLines[item.sourceLineIndex + 1],
      canEdit: Boolean(userId && userId === item.authorId),
    };
  }, [timeline, userId]);

  const saveCollectionLines = useCallback((save: QuickEditLineSave) => {
    const { songId, updates } = save;
    const byIndex = new Map(updates.map(({ lineIndex, line }) => [lineIndex, line]));
    setSessionItems((current) => current.map((entry) => {
      if (entry.songId !== songId) return entry;
      let sourceLines = save.lines ?? entry.sourceLines.map((line, index) => byIndex.get(index) ?? line);
      let sourceLineIndex = entry.sourceLineIndex;
      if (save.deleteLineIndex !== undefined && sourceLineIndex !== null) {
        if (!save.lines) sourceLines = sourceLines.filter((_, index) => index !== save.deleteLineIndex);
        if (sourceLineIndex === save.deleteLineIndex) sourceLineIndex = null;
        else if (sourceLineIndex > save.deleteLineIndex) sourceLineIndex -= 1;
      }
      if (save.insert && sourceLineIndex !== null) {
        if (!save.lines) {
          sourceLines = [
            ...sourceLines.slice(0, save.insert.afterIndex + 1),
            save.insert.line,
            ...sourceLines.slice(save.insert.afterIndex + 1),
          ];
        }
        if (save.insert.afterIndex < sourceLineIndex) sourceLineIndex += 1;
      }
      if (sourceLineIndex === null) return { ...entry, sourceLines, sourceLineIndex };
      const updatedLine = sourceLines[sourceLineIndex];
      return updatedLine ? {
        ...entry,
        lineText: updatedLine.text,
        startTime: updatedLine.start,
        endTime: updatedLine.start + updatedLine.duration,
        sourceLines,
        sourceLineIndex,
      } : { ...entry, sourceLines };
    }));
  }, []);

  const playLine = useCallback((startSeconds: number, lineIndex?: number) => {
    const nextPosition = lineIndex ?? lines.findIndex((line) => line.start === startSeconds);
    if (nextPosition < 0 || nextPosition >= timeline.length) return;
    const line = timeline[nextPosition].line;
    setAutoPlay(true);
    setClipEnded(false);
    setPlayerError(false);
    setCurrentTime(line.start);
    if (nextPosition === position) {
      playerRef.current?.replay();
    } else {
      setPosition(nextPosition);
    }
  }, [lines, position, timeline]);

  const handleGameMode = useCallback((mode: GameSettings["mode"]) => {
    setGameSettings((previous) => ({ ...previous, mode }));
    setView("play");
    setGameStartRequest((request) => request + 1);
  }, [setGameSettings, setView]);

  const handleTimeUpdate = useCallback((itemPosition: number, playerTime: number) => {
    const entry = timeline[itemPosition];
    if (!entry) return;
    setCurrentTime(entry.line.start + playerTime - entry.item.startTime);
  }, [timeline]);

  const handleClipEnded = useCallback((itemPosition: number) => {
    const entry = timeline[itemPosition];
    if (!entry) return;
    setClipEnded(true);
    setCurrentTime(entry.line.start + entry.line.duration + AUDIO_END_BUFFER_SECONDS);
  }, [timeline]);

  useEffect(() => {
    if (view !== "read" || !clipEnded || position >= timeline.length - 1) return;
    const timeoutId = window.setTimeout(
      () => playLine(timeline[position + 1].line.start, position + 1),
      700,
    );
    return () => window.clearTimeout(timeoutId);
  }, [clipEnded, playLine, position, timeline, view]);

  const onQuitGame = useCallback(() => {
    setAutoPlay(false);
    setClipEnded(false);
    setCurrentTime(0);
    setHasPlaybackStarted(false);
    if (position === 0) {
      playerRef.current?.restart();
    } else {
      setPosition(0);
    }
  }, [position]);

  const onPlayingChange = useCallback((isPlaying: boolean) => {
    if (isPlaying) {
      setHasPlaybackStarted(true);
      setAutoPlay(true);
    }
  }, []);

  const updateGameProgress = useCallback((current: number, total: number) => {
    setGameProgress((previous) =>
      previous.current === current && previous.total === total ? previous : { current, total },
    );
  }, []);

  if (!currentEntry) return null;

  return (
    <div className="mx-auto mt-3 flex w-full flex-col gap-3 lg:w-[65%]">
      <LearningModeControls
        view={view}
        gameMode={gameSettings.mode}
        progress={gameProgress}
        readProgress={readLinePosition}
        onRead={() => {
          pausePlayer();
          setView("read");
        }}
        onGameMode={handleGameMode}
      />

      <SnippetPlayer
        ref={playerRef}
        itemId={currentEntry.item.id}
        videoId={currentEntry.item.youtubeId}
        startTime={currentEntry.item.startTime}
        endTime={currentEntry.item.endTime}
        autoPlay={autoPlay}
        onTimeUpdate={(seconds) => handleTimeUpdate(position, seconds)}
        onPlayingChange={onPlayingChange}
        onEnded={() => handleClipEnded(position)}
        onError={() => setPlayerError(true)}
      />
      {playerError && <p role="alert" className="text-sm text-destructive">{t("collections.playerError")}</p>}

      <div className={view === "read" ? "mx-auto w-full lg:w-[85%]" : "hidden"}>
        <InteractiveLyrics
          lines={lines}
          currentTime={currentTime}
          getLineYoutubeId={(lineIndex) => timeline[lineIndex]?.item.youtubeId}
          getLineEditContext={getLineEditContext}
          onPause={pausePlayer}
          onLineSaved={saveCollectionLines}
          onEditPlayLine={playEditedLine}
          onSeek={(seconds) => {
            const lineIndex = lines.findIndex((line) => line.start === seconds);
            playLine(seconds, lineIndex);
          }}
          onExplainStart={pausePlayer}
        />
      </div>
      <div className={view === "play" ? "" : "hidden"}>
        <GameMode
          active={view === "play"}
          hasPlaybackStarted={hasPlaybackStarted}
          onQuit={onQuitGame}
          startRequest={gameStartRequest}
          lines={lines}
          currentTime={currentTime}
          getLineYoutubeId={(lineIndex) => timeline[lineIndex]?.item.youtubeId}
          getLineEditContext={getLineEditContext}
          onLineSaved={saveCollectionLines}
          onEditPlayLine={playEditedLine}
          settings={gameSettings}
          learningActivitySource="collection"
          onDifficultyChange={(difficulty: Difficulty) =>
            setGameSettings((previous) => ({ ...previous, difficulty }))
          }
          onProgressChange={updateGameProgress}
          onPlayLine={playLine}
          onAutoAdvance={(lineIndex, startSeconds) => playLine(startSeconds, lineIndex)}
          onPauseAtBoundary={pausePlayer}
          onPause={pausePlayer}
        />
      </div>
    </div>
  );
}

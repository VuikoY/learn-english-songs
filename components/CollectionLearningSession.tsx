"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import LearningModeControls from "@/components/LearningModeControls";
import GameMode from "@/components/game/GameMode";
import SnippetPlayer, { type SnippetPlayerHandle } from "@/components/SnippetPlayer";
import { useLanguage } from "@/context/LanguageContext";
import { countHideableWords } from "@/lib/game/buildRound";
import { usePersistentState } from "@/lib/storage/usePersistentState";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";
import { DIFFICULTIES, type Difficulty, type GameSettings } from "@/types/game";
import type { LyricLine } from "@/lib/types";

export type CollectionLearningItem = {
  id: string;
  youtubeId: string;
  songTitle: string;
  lineText: string;
  startTime: number;
  endTime: number;
};

type Props = { items: CollectionLearningItem[] };
type View = "read" | "play";
type TimelineEntry = {
  line: LyricLine;
  item: CollectionLearningItem;
  playerStart: number;
};

function createTimeline(items: CollectionLearningItem[]): TimelineEntry[] {
  let nextStart = 0;
  return items.map((item): TimelineEntry => {
    const playerStart = Math.max(0, item.startTime - AUDIO_START_BUFFER_SECONDS);
    const playerEnd = item.endTime + AUDIO_END_BUFFER_SECONDS;
    const duration = Math.max(0.1, playerEnd - playerStart);
    const line: LyricLine = {
      text: item.lineText,
      start: nextStart,
      duration,
    };
    nextStart += duration + AUDIO_END_BUFFER_SECONDS;
    return { line, item, playerStart };
  });
}

export default function CollectionLearningSession({ items }: Props) {
  const { t } = useLanguage();
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

  const timeline = useMemo(() => createTimeline(items), [items]);
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
    setCurrentTime(entry.line.start + Math.max(0, playerTime - entry.playerStart));
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
          settings={gameSettings}
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

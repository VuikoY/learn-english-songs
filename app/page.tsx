"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Puzzle, ScrollText } from "lucide-react";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import GameMode from "@/components/game/GameMode";
import VideoUrlForm from "@/components/VideoUrlForm";
import { useLanguage } from "@/context/LanguageContext";
import { DEMO_VIDEO_ID } from "@/lib/mock-lyrics";
import { countHideableWords } from "@/lib/game/buildRound";
import { cacheTranscript, getCachedTranscript } from "@/lib/storage/transcriptCache";
import type { LyricLine } from "@/lib/types";
import { usePersistentState } from "@/lib/storage/usePersistentState";
import { DIFFICULTIES, type GameSettings } from "@/types/game";

type View = "read" | "play";

export default function HomePage() {
  const { t, sourceLanguage } = useLanguage();
  const [videoId, setVideoId] = useState(DEMO_VIDEO_ID);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [gameProgress, setGameProgress] = useState({ current: 0, total: 0 });
  const [gameStartRequest, setGameStartRequest] = useState(0);
  const [songTitle, setSongTitle] = useState<string | null>(null);
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
  const playableLines = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => countHideableWords(line.text) >= 3),
    [lines],
  );
  const readLinePosition = useMemo(() => {
    if (!hasPlaybackStarted) return 0;
    let position = 0;
    for (let index = 0; index < playableLines.length; index += 1) {
      if (playableLines[index].line.start > currentTime) break;
      position = index + 1;
    }
    return position;
  }, [currentTime, hasPlaybackStarted, playableLines]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle>(null);
  const volumeFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const normalVolumeRef = useRef<number | null>(null);
  const updateGameProgress = useCallback((current: number, total: number) => {
    setGameProgress((previous) =>
      previous.current === current && previous.total === total ? previous : { current, total },
    );
  }, []);
  const chooseGameMode = useCallback((mode: GameSettings["mode"]) => {
    setGameSettings((previous) => ({ ...previous, mode }));
    setView("play");
    setGameStartRequest((request) => request + 1);
  }, [setGameSettings, setView]);

  const clearVolumeFade = useCallback(() => {
    if (volumeFadeRef.current !== null) {
      clearInterval(volumeFadeRef.current);
      volumeFadeRef.current = null;
    }
  }, []);

  useEffect(() => clearVolumeFade, [clearVolumeFade]);

  const pausePlayer = useCallback(() => {
    clearVolumeFade();
    if (normalVolumeRef.current !== null) playerRef.current?.setVolume(normalVolumeRef.current);
    playerRef.current?.pause();
  }, [clearVolumeFade]);
  const handlePlayingChange = useCallback((isPlaying: boolean) => {
    if (isPlaying) setHasPlaybackStarted(true);
  }, []);
  const resetVideoToStart = useCallback(() => {
    pausePlayer();
    playerRef.current?.seekTo(0);
    setCurrentTime(0);
    setHasPlaybackStarted(false);
  }, [pausePlayer]);
  function playFrom(seconds: number) {
    playerRef.current?.seekTo(seconds);
    playerRef.current?.play();
  }

  const playGameLine = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;

    clearVolumeFade();
    if (normalVolumeRef.current === null) normalVolumeRef.current = player.getVolume();
    const normalVolume = normalVolumeRef.current;

    player.setVolume(0);
    player.seekTo(Math.max(0, seconds - 1));
    player.play();

    const fadeStartedAt = performance.now();
    volumeFadeRef.current = setInterval(() => {
      const progress = Math.min((performance.now() - fadeStartedAt) / 1000, 1);
      player.setVolume(Math.round(normalVolume * progress));
      if (progress >= 1) clearVolumeFade();
    }, 50);
  }, [clearVolumeFade]);

  const fadeOutGameLine = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    clearVolumeFade();
    const startVolume = player.getVolume();
    const fadeStartedAt = performance.now();
    volumeFadeRef.current = setInterval(() => {
      const progress = Math.min((performance.now() - fadeStartedAt) / 1000, 1);
      player.setVolume(Math.round(startVolume * (1 - progress)));
      if (progress >= 1) clearVolumeFade();
    }, 50);
  }, [clearVolumeFade]);

  const cancelGameLineFadeOut = useCallback(() => {
    clearVolumeFade();
    if (normalVolumeRef.current !== null) playerRef.current?.setVolume(normalVolumeRef.current);
  }, [clearVolumeFade]);

  function showVideo(id: string, newLines: LyricLine[]) {
    setVideoId(id);
    setLines(newLines);
    setCurrentTime(0);
    setHasPlaybackStarted(false);
    setSongTitle(null);
    fetch(`/api/video-title?videoId=${id}`)
      .then((res) => res.json())
      .then((data: { title: string | null }) => setSongTitle(data.title ?? null))
      .catch(() => {});
  }

  async function handleLoad(id: string) {
    setError(null);
    const cached = getCachedTranscript(id, sourceLanguage);
    if (cached) {
      showVideo(id, cached);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/transcript?videoId=${id}&lang=${sourceLanguage}`);
      const raw = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          `Сервер вернул не JSON (статус ${response.status}). Проверь ошибку в терминале, где запущен npm run dev.`,
        );
      }

      if (!response.ok) {
        const message = (json as { error?: string }).error;
        throw new Error(message ?? "Не удалось загрузить субтитры.");
      }

      const newLines = json as LyricLine[];
      cacheTranscript(id, sourceLanguage, newLines);
      showVideo(id, newLines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void handleLoad(DEMO_VIDEO_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLanguage]);

  return (
    <main className="mx-auto w-full max-w-6xl py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("app.title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("app.subtitle")}</p>

      <VideoUrlForm onSubmit={handleLoad} isLoading={isLoading} error={error} />

      <div className="mx-auto mt-3 flex w-full flex-col gap-3 lg:w-[65%]">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={view === "read"}
                onClick={() => {
                  pausePlayer();
                  setView("read");
                }}
                className={`flex h-8 items-center gap-2 rounded border px-3 text-xs font-medium text-left transition ${view === "read" ? "bg-primary/10 font-semibold shadow-sm" : "hover:bg-muted/60"}`}
              >
                <ScrollText className="size-4" />
                {t("nav.read")}
              </button>
              <div className="flex flex-wrap gap-1" role="group" aria-label={t("game.mode.label")}>
                <button
                  type="button"
                  aria-pressed={view === "play" && gameSettings.mode === "fill-blanks"}
                  onClick={() => chooseGameMode("fill-blanks")}
                  className={`flex h-8 items-center gap-2 rounded border px-3 text-xs font-medium text-left transition ${view === "play" && gameSettings.mode === "fill-blanks" ? "bg-primary/10 font-semibold shadow-sm" : "hover:bg-muted/60"}`}
                >
                  <Puzzle className="size-4" />
                  {t("game.mode.fillBlanks")}
                </button>
                <button
                  type="button"
                  aria-pressed={view === "play" && gameSettings.mode === "first-letter"}
                  onClick={() => chooseGameMode("first-letter")}
                  className={`flex h-8 items-center gap-2 rounded border px-3 text-xs font-medium text-left transition ${view === "play" && gameSettings.mode === "first-letter" ? "bg-primary/10 font-semibold shadow-sm" : "hover:bg-muted/60"}`}
                >
                  <Keyboard className="size-4" />
                  {t("game.mode.firstLetter")}
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("game.line", { ...gameProgress, current: view === "read" ? readLinePosition : gameProgress.current })}
            </p>
          </div>
        </div>

        <YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={setCurrentTime} onPlayingChange={handlePlayingChange} />

        <div className={view === "read" ? "mx-auto w-full lg:w-[85%]" : "hidden"}>
          <InteractiveLyrics
            lines={lines}
            currentTime={currentTime}
            songTitle={songTitle}
            onSeek={playFrom}
            onExplainStart={pausePlayer}
          />
        </div>
        <div className={view === "play" ? "" : "hidden"}>
          <GameMode active={view === "play"} hasPlaybackStarted={hasPlaybackStarted} onQuit={resetVideoToStart} startRequest={gameStartRequest} key={videoId} lines={lines} currentTime={currentTime} songTitle={songTitle} settings={gameSettings} onDifficultyChange={(difficulty) => setGameSettings((previous) => ({ ...previous, difficulty }))} onProgressChange={updateGameProgress} onPlayLine={playGameLine} onPause={pausePlayer} onFadeOut={fadeOutGameLine} onCancelFadeOut={cancelGameLineFadeOut} />
        </div>
      </div>
    </main>
  );
}

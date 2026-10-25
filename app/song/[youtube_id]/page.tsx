"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Keyboard, Puzzle, ScrollText } from "lucide-react";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import GameMode from "@/components/game/GameMode";
import { useLanguage } from "@/context/LanguageContext";
import { DEMO_VIDEO_ID } from "@/lib/mock-lyrics";
import { countHideableWords } from "@/lib/game/buildRound";
import type { LyricLine } from "@/lib/types";
import { usePersistentState } from "@/lib/storage/usePersistentState";
import { DIFFICULTIES, type GameSettings } from "@/types/game";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type View = "read" | "play";

export default function HomePage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl py-8" aria-busy="true" />}>
      <SongPageContent />
    </Suspense>
  );
}

function SongPageContent() {
  const params = useParams<{ youtube_id: string }>();
  const routeVideoId = params.youtube_id;
  const { userId, loading: authLoading } = useAuthState();
  const { t, sourceLanguage } = useLanguage();
  const [videoId, setVideoId] = useState(DEMO_VIDEO_ID);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [gameProgress, setGameProgress] = useState({ current: 0, total: 0 });
  const [gameStartRequest, setGameStartRequest] = useState(0);
  const [songDbId, setSongDbId] = useState<string | null>(null);
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
  const fadeOutAndPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    clearVolumeFade();
    if (normalVolumeRef.current === null) normalVolumeRef.current = player.getVolume();
    const startVolume = player.getVolume();
    const fadeStartedAt = performance.now();
    volumeFadeRef.current = setInterval(() => {
      const progress = Math.min((performance.now() - fadeStartedAt) / 1000, 1);
      player.setVolume(Math.round(startVolume * (1 - progress)));
      if (progress >= 1) {
        clearVolumeFade();
        player.pause();
      }
    }, 50);
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

  function showVideo(id: string, newLines: LyricLine[]) {
    setSongDbId(null);
    setVideoId(id);
    setLines(newLines);
    setCurrentTime(0);
    setHasPlaybackStarted(false);
  }

  async function handleLoad(id: string) {
    setError(null);
    try {
      const db = getSupabaseBrowserClient();
      if (db) {
        const { data: song, error: songError } = await db
          .from("songs")
          .select("id,title,transcripts(lines_json)")
          .eq("youtube_id", id)
          .maybeSingle();
        if (songError) throw new Error(t("home.loadError"));

        if (song) {
          const related = song.transcripts;
          const transcript = Array.isArray(related) ? related[0] : related;
          if (!transcript || !Array.isArray(transcript.lines_json)) {
            throw new Error(t("home.loadError"));
          }
          showVideo(id, transcript.lines_json as unknown as LyricLine[]);
          setSongDbId(song.id);
          return;
        }
      }

      const response = await fetch(`/api/transcript?videoId=${id}&lang=${sourceLanguage}`);
      const raw = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          t("home.serverNonJson", { status: response.status }),
        );
      }

      if (!response.ok) {
        throw new Error(t("home.loadError"));
      }

      const newLines = json as LyricLine[];
      showVideo(id, newLines);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.unknownError"));
    }
  }

  const initialLoadKeyRef = useRef("");
  useEffect(() => {
    if (authLoading) return;
    const id = routeVideoId || DEMO_VIDEO_ID;
    const requestKey = `${id}:${sourceLanguage}:${userId ?? "guest"}`;
    if (initialLoadKeyRef.current === requestKey) return;
    initialLoadKeyRef.current = requestKey;
    void handleLoad(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, sourceLanguage, routeVideoId, userId]);

  return (
    <main className="mx-auto w-full max-w-6xl py-8">
      {error && <p role="alert" className="mx-auto mb-3 w-full text-sm text-destructive lg:w-[65%]">{error}</p>}

      <div className="mx-auto mt-3 flex w-full flex-col gap-3 lg:w-[65%]">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("game.mode.label")}>
              <button
                type="button"
                aria-pressed={view === "read"}
                onClick={() => {
                  pausePlayer();
                  setView("read");
                }}
                className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "read" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
              >
                <ScrollText className="size-4" />
                {t("nav.read")}
              </button>
                <button
                  type="button"
                  aria-pressed={view === "play" && gameSettings.mode === "fill-blanks"}
                  onClick={() => chooseGameMode("fill-blanks")}
                  className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "play" && gameSettings.mode === "fill-blanks" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
                >
                  <Puzzle className="size-4" />
                  {t("game.mode.fillBlanks")}
                </button>
                <button
                  type="button"
                  aria-pressed={view === "play" && gameSettings.mode === "first-letter"}
                  onClick={() => chooseGameMode("first-letter")}
                  className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "play" && gameSettings.mode === "first-letter" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
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
          youtubeId={videoId}
            songId={songDbId}
            onSeek={playFrom}
            onExplainStart={pausePlayer}
          />
        </div>
        <div className={view === "play" ? "" : "hidden"}>
          <GameMode active={view === "play"} hasPlaybackStarted={hasPlaybackStarted} onQuit={resetVideoToStart} startRequest={gameStartRequest} key={videoId} lines={lines} currentTime={currentTime} youtubeId={videoId} songId={songDbId} settings={gameSettings} onDifficultyChange={(difficulty) => setGameSettings((previous) => ({ ...previous, difficulty }))} onProgressChange={updateGameProgress} onPlayLine={playGameLine} onPauseAfterFade={fadeOutAndPause} onPause={pausePlayer} />
        </div>
      </div>
    </main>
  );
}

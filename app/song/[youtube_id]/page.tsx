"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import GameMode from "@/components/game/GameMode";
import LearningModeControls from "@/components/LearningModeControls";
import { useLanguage } from "@/context/LanguageContext";
import { DEMO_VIDEO_ID } from "@/lib/mock-lyrics";
import { countHideableWords } from "@/lib/game/buildRound";
import type { LyricLine } from "@/lib/types";
import { usePersistentState } from "@/lib/storage/usePersistentState";
import { DIFFICULTIES, type GameSettings } from "@/types/game";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";
import type { QuickEditLineSave } from "@/components/QuickEditLine";

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
  const searchParams = useSearchParams();
  const routeVideoId = params.youtube_id;
  const lyricsTitle = searchParams.get("title")?.trim() ?? "";
  const lyricsArtist = searchParams.get("artist")?.trim() ?? "";
  const { userId, loading: authLoading } = useAuthState();
  const { t, sourceLanguage } = useLanguage();
  const videoId = routeVideoId || DEMO_VIDEO_ID;
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [gameProgress, setGameProgress] = useState({ current: 0, total: 0 });
  const [gameStartRequest, setGameStartRequest] = useState(0);
  const [songDbId, setSongDbId] = useState<string | null>(null);
  const [songOwnerId, setSongOwnerId] = useState<string | null>(null);
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

  const pausePlayer = useCallback(() => {
    playerRef.current?.pause();
  }, []);
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

    player.seekTo(Math.max(0, seconds - AUDIO_START_BUFFER_SECONDS));
    player.play();
  }, []);
  const playEditedLine = useCallback((seconds: number, _lineIndex: number, duration: number) => {
    playerRef.current?.playRange(seconds, seconds + duration);
  }, []);

  function showVideo(newLines: LyricLine[]) {
    setSongDbId(null);
    setSongOwnerId(null);
    setLines(newLines);
    setCurrentTime(0);
    setHasPlaybackStarted(false);
  }

  async function handleLoad(id: string, title: string, artist: string) {
    setError(null);
    try {
      const db = getSupabaseBrowserClient();
      if (db) {
        const { data: song, error: songError } = await db
          .from("songs")
          .select("id,title,created_by,transcripts(lines_json)")
          .eq("youtube_id", id)
          .maybeSingle();
        if (songError) throw new Error(t("home.loadError"));

        if (song) {
          const related = song.transcripts;
          const transcript = Array.isArray(related) ? related[0] : related;
          if (!transcript || !Array.isArray(transcript.lines_json)) {
            throw new Error(t("home.loadError"));
          }
          showVideo(transcript.lines_json as unknown as LyricLine[]);
          setSongDbId(song.id);
          setSongOwnerId(song.created_by);
          return;
        }
      }

      const transcriptParams = new URLSearchParams({ videoId: id, lang: sourceLanguage });
      if (title) transcriptParams.set("title", title);
      if (artist) transcriptParams.set("artist", artist);
      const response = await fetch(`/api/transcript?${transcriptParams.toString()}`);
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
      showVideo(newLines);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.unknownError"));
    }
  }

  const initialLoadKeyRef = useRef("");
  useEffect(() => {
    if (authLoading) return;
    const id = routeVideoId || DEMO_VIDEO_ID;
    const requestKey = `${id}:${sourceLanguage}:${userId ?? "guest"}:${lyricsTitle}:${lyricsArtist}`;
    if (initialLoadKeyRef.current === requestKey) return;
    initialLoadKeyRef.current = requestKey;
    void handleLoad(id, lyricsTitle, lyricsArtist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, sourceLanguage, routeVideoId, userId, lyricsTitle, lyricsArtist]);
  const canEditSong = Boolean(songDbId && userId && songOwnerId === userId);

  return (
    <main className="mx-auto w-full max-w-6xl py-8">
      {error && <p role="alert" className="mx-auto mb-3 w-full text-sm text-destructive lg:w-[65%]">{error}</p>}

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
          onGameMode={chooseGameMode}
        />

        <YouTubePlayer key={videoId} ref={playerRef} videoId={videoId} onTimeUpdate={setCurrentTime} onPlayingChange={handlePlayingChange} />

        <div className={view === "read" ? "mx-auto w-full lg:w-[85%]" : "hidden"}>
          <InteractiveLyrics
            lines={lines}
            currentTime={currentTime}
            youtubeId={videoId}
            songId={songDbId}
            canEdit={canEditSong}
            onSeek={playFrom}
            onExplainStart={pausePlayer}
            onPause={pausePlayer}
            onEditPlayLine={playEditedLine}
            onLineSaved={(save) => {
              if (save.lines) {
                setLines(save.lines);
                return;
              }
              const byIndex = new Map(save.updates.map(({ lineIndex, line }) => [lineIndex, line]));
              setLines((current) => current.map((line, index) => byIndex.get(index) ?? line));
            }}
          />
        </div>
        <div className={view === "play" ? "" : "hidden"}>
          <GameMode active={view === "play"} hasPlaybackStarted={hasPlaybackStarted} onQuit={resetVideoToStart} startRequest={gameStartRequest} key={videoId} lines={lines} currentTime={currentTime} youtubeId={videoId} songId={songDbId} canEdit={canEditSong} onLineSaved={(save: QuickEditLineSave) => {
            if (save.lines) {
              setLines(save.lines);
              return;
            }
            const byIndex = new Map(save.updates.map(({ lineIndex, line }) => [lineIndex, line]));
            setLines((current) => current.map((line, index) => byIndex.get(index) ?? line));
          }} settings={gameSettings} onDifficultyChange={(difficulty) => setGameSettings((previous) => ({ ...previous, difficulty }))} onProgressChange={updateGameProgress} onPlayLine={playGameLine} onEditPlayLine={playEditedLine} onPauseAtBoundary={pausePlayer} onPause={pausePlayer} />
        </div>
      </div>
    </main>
  );
}

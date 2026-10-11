"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import GameMode from "@/components/game/GameMode";
import VideoUrlForm from "@/components/VideoUrlForm";
import { useLanguage } from "@/context/LanguageContext";
import { DEMO_VIDEO_ID } from "@/lib/mock-lyrics";
import { cacheTranscript, getCachedTranscript } from "@/lib/storage/transcriptCache";
import type { LyricLine } from "@/lib/types";
import { usePersistentState } from "@/lib/storage/usePersistentState";

type View = "read" | "play";

export default function HomePage() {
  const { t, sourceLanguage } = useLanguage();
  const [videoId, setVideoId] = useState(DEMO_VIDEO_ID);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [view, setView] = usePersistentState<View>(
    "lingo-clips:active-view",
    "read",
    (value): value is View => value === "read" || value === "play",
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle>(null);
  const volumeFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const normalVolumeRef = useRef<number | null>(null);

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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("app.title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("app.subtitle")}</p>

      <VideoUrlForm onSubmit={handleLoad} isLoading={isLoading} error={error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={setCurrentTime} />

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={view === "read" ? "secondary" : "outline"}
              aria-pressed={view === "read"}
              onClick={() => setView("read")}
            >
              <ScrollText className="size-4" />
              {t("nav.read")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "play" ? "secondary" : "outline"}
              aria-pressed={view === "play"}
              onClick={() => setView("play")}
            >
              <Gamepad2 className="size-4" />
              {t("nav.play")}
            </Button>
          </div>
          <div className={view === "read" ? "" : "hidden"}>
            <InteractiveLyrics
              lines={lines}
              currentTime={currentTime}
              songTitle={songTitle}
              onSeek={playFrom}
              onExplainStart={pausePlayer}
            />
          </div>
          {view === "play" && <GameMode key={videoId} lines={lines} currentTime={currentTime} songTitle={songTitle} onPlayLine={playGameLine} onPause={pausePlayer} onFadeOut={fadeOutGameLine} onCancelFadeOut={cancelGameLineFadeOut} />}
        </div>
      </div>
    </main>
  );
}

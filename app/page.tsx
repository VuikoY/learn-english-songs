// app/page.tsx
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

  // Спочатку показуємо демо (MOCK_LYRICS); після завантаження свого відео все замінюється
  const [videoId, setVideoId] = useState(DEMO_VIDEO_ID);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [view, setView] = usePersistentState<View>(
    "lingo-clips:active-view",
    "read",
    (value): value is View => value === "read" || value === "play",
  ); // Запам’ятовує, чи користувач обрав текст або гру.

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle>(null);
  const pausePlayer = useCallback(() => playerRef.current?.pause(), []);
  const volumeRampRef = useRef<{ target: number; normalVolume: number; startedAt?: number; startVolume?: number } | null>(null);
  useEffect(() => {
    const ramp = volumeRampRef.current;
    const player = playerRef.current;
    if (!ramp || !player || currentTime < ramp.target) return;

    if (ramp.startedAt === undefined) {
      ramp.startedAt = performance.now();
      ramp.startVolume = player.getVolume();
    }

    const intervalId = window.setInterval(() => {
      const activeRamp = volumeRampRef.current;
      if (!activeRamp || activeRamp.startedAt === undefined) {
        window.clearInterval(intervalId);
        return;
      }

      const progress = Math.min((performance.now() - activeRamp.startedAt) / 1000, 1);
      const startVolume = activeRamp.startVolume ?? activeRamp.normalVolume * 0.5;
      player.setVolume(startVolume + (activeRamp.normalVolume - startVolume) * progress);

      if (progress >= 1) {
        window.clearInterval(intervalId);
        volumeRampRef.current = null;
      }
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [currentTime]);

  function playFrom(seconds: number) {
    playerRef.current?.seekTo(seconds);
    playerRef.current?.play();
  }

  const playGameLine = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const normalVolume = volumeRampRef.current?.normalVolume ?? player.getVolume();
    volumeRampRef.current = { target: seconds, normalVolume };
    player.setVolume(normalVolume * 0.5);
    player.seekTo(Math.max(0, seconds - 1));
    player.play();
  }, []);

  function showVideo(id: string, newLines: LyricLine[]) {
    setVideoId(id);
    setLines(newLines);
    setCurrentTime(0);

    // Назву беремо "у фоні": якщо не вийде — просто лишаємо null
    setSongTitle(null);
    fetch(`/api/video-title?videoId=${id}`)
      .then((res) => res.json())
      .then((data: { title: string | null }) => setSongTitle(data.title ?? null))
      .catch(() => {});
  }

  async function handleLoad(id: string) {
    setError(null);

    // 1. Уже завантажували це відео цією мовою пісні? Беремо з кешу браузера.
    const cached = getCachedTranscript(id, sourceLanguage);
    if (cached) {
      showVideo(id, cached);
      return;
    }

    // 2. Інакше просимо сервер (lang = мова пісні: від неї залежить, які субтитри віддасть YouTube)
    setIsLoading(true);
    try {
      const response = await fetch(`/api/transcript?videoId=${id}&lang=${sourceLanguage}`);

      // Читаємо як текст, щоб не впасти з "Unexpected token <", якщо прийшов HTML
      const raw = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          `Сервер повернув не JSON (статус ${response.status}). Дивись помилку в терміналі, де запущений npm run dev.`,
        );
      }

      if (!response.ok) {
        const message = (json as { error?: string }).error;
        throw new Error(message ?? "Помилка завантаження субтитрів");
      }

      const newLines = json as LyricLine[];
      cacheTranscript(id, sourceLanguage, newLines);
      showVideo(id, newLines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невідома помилка");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void handleLoad(DEMO_VIDEO_ID);
    // Reload the default video when the selected song language changes.
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
          {/* Перемикач "Текст / Гра" */}
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

          {/* Текст лишаємо в DOM, лише ховаємо: так не губиться стан відкритих пояснень */}
          <div className={view === "read" ? "" : "hidden"}>
            <InteractiveLyrics
              lines={lines}
              currentTime={currentTime}
              songTitle={songTitle}
              onSeek={playFrom}
              onExplainStart={pausePlayer}
            />
          </div>

          {/* Гру показуємо лише коли вона активна (вона слухає клавіатуру). key скидає її для нового відео */}
          {view === "play" && <GameMode key={videoId} lines={lines} currentTime={currentTime} songTitle={songTitle} onPlayLine={playGameLine} onPause={pausePlayer} />}
        </div>
      </div>
    </main>
  );
}

// app/page.tsx
"use client";

import { useRef, useState } from "react";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import InteractiveLyrics from "@/components/InteractiveLyrics";
import VideoUrlForm from "@/components/VideoUrlForm";
import { DEMO_VIDEO_ID, MOCK_LYRICS } from "@/lib/mock-lyrics";
import type { LyricLine } from "@/lib/types";

export default function HomePage() {
  // Спочатку показуємо демо; після завантаження свого відео все замінюється
  const [videoId, setVideoId] = useState(DEMO_VIDEO_ID);
  const [lines, setLines] = useState<LyricLine[]>(MOCK_LYRICS);
  const [currentTime, setCurrentTime] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle>(null);

  // Форма вже розпізнала videoId, нам лишається завантажити субтитри
  async function handleLoad(id: string) {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/transcript?videoId=${id}`);

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

      setVideoId(id);
      setLines(json as LyricLine[]);
      setCurrentTime(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невідома помилка");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Англійська за кліпами</h1>
      <p className="mb-6 text-muted-foreground">
        Встав посилання на кліп із англійськими субтитрами, клікай на рядок для перемотки і питай AI
        про граматику та сленг.
      </p>

      <VideoUrlForm onSubmit={handleLoad} isLoading={isLoading} error={error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={setCurrentTime} />

        <InteractiveLyrics
          lines={lines}
          currentTime={currentTime}
          onSeek={(seconds) => {
            playerRef.current?.seekTo(seconds);
            playerRef.current?.play();
          }}
          // Ставимо відео на паузу, поки студент читає пояснення
          onExplainStart={() => playerRef.current?.pause()}
        />
      </div>
    </main>
  );
}

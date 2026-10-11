// components/YouTubePlayer.tsx
"use client"; // react-youtube працює з браузером (iframe), тому це клієнтський компонент

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import YouTube, { type YouTubeEvent, type YouTubePlayer as YTPlayer } from "react-youtube";

/**
 * Методи, які батьківський компонент зможе викликати через ref:
 *   playerRef.current?.pause()
 */
export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getVolume: () => number;
  setVolume: (volume: number) => void;
};

type Props = {
  videoId: string;
  /** Викликається ~4 рази на секунду, поки відео грає. */
  onTimeUpdate?: (seconds: number) => void;
  /** Викликається, коли відео почало грати (true) або стало на паузу (false). */
  onPlayingChange?: (isPlaying: boolean) => void;
};

// Коди станів плеєра з документації YouTube IFrame API
const STATE_PLAYING = 1;

// Як часто опитуємо поточний час, мс. 250 мс — достатньо плавно для субтитрів.
const POLL_INTERVAL_MS = 250;

const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(
  { videoId, onTimeUpdate, onPlayingChange },
  ref,
) {
  // Тут зберігаємо екземпляр YouTube-плеєра, коли він готовий
  const playerRef = useRef<YTPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Відкриваємо батьківському компоненту play / pause / seekTo
  useImperativeHandle(
    ref,
    () => ({
      play: () => void playerRef.current?.playVideo(),
      pause: () => void playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => {
        void playerRef.current?.seekTo(seconds, true);
        onTimeUpdate?.(seconds); // одразу оновлюємо UI, не чекаючи наступного опитування
      },
      getVolume: () => playerRef.current?.getVolume() ?? 100,
      setVolume: (volume: number) => playerRef.current?.setVolume(volume),
    }),
    [onTimeUpdate],
  );

  // YouTube IFrame API не має події "час змінився",
  // тому поки відео грає — самі раз на 250 мс питаємо getCurrentTime().
  useEffect(() => {
    if (!isPlaying) return;

    const intervalId = setInterval(async () => {
      const player = playerRef.current;
      if (!player) return;
      const time = await player.getCurrentTime();
      onTimeUpdate?.(time);
    }, POLL_INTERVAL_MS);

    // Cleanup: зупиняємо таймер при паузі або розмонтуванні компонента
    return () => clearInterval(intervalId);
  }, [isPlaying, onTimeUpdate]);

  // Плеєр завантажився — запам'ятовуємо його
  const handleReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
  };

  // Стан змінився (play, pause, буферизація, кінець...)
  const handleStateChange = async (event: YouTubeEvent<number>) => {
    const playing = event.data === STATE_PLAYING;
    setIsPlaying(playing);
    onPlayingChange?.(playing);

    // Якщо не граємо (пауза, перемотка) — один раз синхронізуємо час,
    // щоб підсвічений рядок відповідав позиції на таймлайні.
    if (!playing && playerRef.current) {
      onTimeUpdate?.(await playerRef.current.getCurrentTime());
    }
  };

  return (
    // aspect-video тримає пропорції 16:9 на будь-якій ширині
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <YouTube
        videoId={videoId}
        className="h-full w-full"
        iframeClassName="h-full w-full"
        opts={{
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0, // не показувати "схожі відео" інших каналів
            playsinline: 1, // не відкривати на весь екран на iOS
          },
        }}
        onReady={handleReady}
        onStateChange={handleStateChange}
      />
    </div>
  );
});

export default YouTubePlayer;

// components/YouTubePlayer.tsx
"use client"; // react-youtube uses a browser iframe, so this must be a client component.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import YouTube, { type YouTubeEvent, type YouTubePlayer as YTPlayer } from "react-youtube";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";

/**
 * Methods exposed to the parent component through a ref:
 *   playerRef.current?.pause()
 */
export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  playRange: (startSeconds: number, endSeconds: number) => void;
  playTimedRange: (startSeconds: number, endSeconds: number, onFinished?: () => void) => void;
  getVolume: () => number;
  setVolume: (volume: number) => void;
};

type Props = {
  videoId: string;
  onReady?: () => void;
  /** Called about four times per second while the video is playing. */
  onTimeUpdate?: (seconds: number) => void;
  /** Called when playback starts (true) or pauses (false). */
  onPlayingChange?: (isPlaying: boolean) => void;
};

// Player state codes from the YouTube IFrame API.
const STATE_PLAYING = 1;
const STATE_ENDED = 0;

// Poll the current time every 250 ms, which is sufficient for subtitle updates.
const POLL_INTERVAL_MS = 250;

const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(
  { videoId, onReady, onTimeUpdate, onPlayingChange },
  ref,
) {
  // Store the YouTube player instance when it becomes ready.
  const playerRef = useRef<YTPlayer | null>(null);
  const rangeEndRef = useRef<number | null>(null);
  const rangeFinishedRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<number | null>(null);

  // Expose play, pause, seekTo, and volume controls to the parent component.
  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        rangeEndRef.current = null;
        rangeFinishedRef.current = null;
        void playerRef.current?.playVideo();
      },
      pause: () => {
        rangeEndRef.current = null;
        rangeFinishedRef.current = null;
        void playerRef.current?.pauseVideo();
      },
      seekTo: (seconds: number) => {
        rangeEndRef.current = null;
        rangeFinishedRef.current = null;
        void playerRef.current?.seekTo(seconds, true);
        onTimeUpdate?.(seconds); // Update the UI immediately rather than waiting for the next poll.
      },
      playRange: (startSeconds: number, endSeconds: number) => {
        const player = playerRef.current;
        if (!player || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return;
        rangeEndRef.current = endSeconds + AUDIO_END_BUFFER_SECONDS;
        rangeFinishedRef.current = null;
        void player.seekTo(Math.max(0, startSeconds - AUDIO_START_BUFFER_SECONDS), true);
        void player.playVideo();
      },
      playTimedRange: (startSeconds: number, endSeconds: number, onFinished) => {
        const player = playerRef.current;
        if (!player || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return;
        rangeEndRef.current = endSeconds;
        rangeFinishedRef.current = onFinished ?? null;
        void player.seekTo(startSeconds, true);
        void player.playVideo();
      },
      getVolume: () => playerRef.current?.getVolume() ?? 100,
      setVolume: (volume: number) => playerRef.current?.setVolume(volume),
    }),
    [onTimeUpdate],
  );

  // The YouTube IFrame API has no time-changed event, so poll getCurrentTime while playing.
  useEffect(() => {
    if (!isPlaying) return;
    const intervalId = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      // The YouTube IFrame API returns getCurrentTime synchronously. Avoid
      // yielding between reading the clock and checking the line boundary.
      const time = player.getCurrentTime();
      const rangeEnd = rangeEndRef.current;
      if (rangeEnd !== null && time >= rangeEnd) {
        rangeEndRef.current = null;
        const onFinished = rangeFinishedRef.current;
        rangeFinishedRef.current = null;
        void player.pauseVideo();
        void player.seekTo(rangeEnd, true);
        onTimeUpdate?.(rangeEnd);
        onFinished?.();
        return;
      }
      onTimeUpdate?.(time);
    }, POLL_INTERVAL_MS);

    // Stop polling when playback pauses or the component unmounts.
    return () => clearInterval(intervalId);
  }, [isPlaying, onTimeUpdate]);

  // Save the player instance after it loads.
  const handleReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    setPlayerError(null);
    onReady?.();
  };

  const handleError = (event: YouTubeEvent<number>) => {
    console.error("[YouTubePlayer] YouTube player error", { videoId, code: event.data });
    setPlayerError(event.data);
  };

  // Handle player state changes such as play, pause, buffering, and end.
  const handleStateChange = async (event: YouTubeEvent<number>) => {
    const playing = event.data === STATE_PLAYING;
    setIsPlaying(playing);
    onPlayingChange?.(playing);

    if (event.data === STATE_ENDED && rangeEndRef.current !== null) {
      const endTime = rangeEndRef.current;
      const onFinished = rangeFinishedRef.current;
      rangeEndRef.current = null;
      rangeFinishedRef.current = null;
      void playerRef.current?.seekTo(endTime, true);
      onTimeUpdate?.(endTime);
      onFinished?.();
    }

    // On pause or seek, sync the current time once so the highlighted lyric matches the timeline.
    if (!playing && playerRef.current) {
      onTimeUpdate?.(await playerRef.current.getCurrentTime());
    }
  };

  return (
    // Keep a 16:9 aspect ratio at every width.
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <YouTube
        videoId={videoId}
        className="h-full w-full"
        iframeClassName="h-full w-full"
        opts={{
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0, // Do not show related videos from other channels.
            playsinline: 1, // Keep playback inline on iOS.
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
        }}
        onReady={handleReady}
        onStateChange={handleStateChange}
        onError={handleError}
      />
      {playerError !== null && (
        <p role="alert" className="absolute inset-x-0 bottom-0 bg-black/90 px-4 py-3 text-sm text-white">
          {playerError === 150 || playerError === 101
            ? `YouTube error ${playerError}: this video cannot be embedded. Please replace its video ID.`
            : `YouTube could not play this video (error ${playerError}). Please try another video.`}
        </p>
      )}
    </div>
  );
});

export default YouTubePlayer;

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

// Poll the current time every 250 ms, which is sufficient for subtitle updates.
const POLL_INTERVAL_MS = 250;

const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(
  { videoId, onReady, onTimeUpdate, onPlayingChange },
  ref,
) {
  // Store the YouTube player instance when it becomes ready.
  const playerRef = useRef<YTPlayer | null>(null);
  const rangeEndRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Expose play, pause, seekTo, and volume controls to the parent component.
  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        rangeEndRef.current = null;
        void playerRef.current?.playVideo();
      },
      pause: () => {
        rangeEndRef.current = null;
        void playerRef.current?.pauseVideo();
      },
      seekTo: (seconds: number) => {
        rangeEndRef.current = null;
        void playerRef.current?.seekTo(seconds, true);
        onTimeUpdate?.(seconds); // Update the UI immediately rather than waiting for the next poll.
      },
      playRange: (startSeconds: number, endSeconds: number) => {
        const player = playerRef.current;
        if (!player || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return;
        rangeEndRef.current = endSeconds + AUDIO_END_BUFFER_SECONDS;
        void player.seekTo(Math.max(0, startSeconds - AUDIO_START_BUFFER_SECONDS), true);
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

    const intervalId = setInterval(async () => {
      const player = playerRef.current;
      if (!player) return;
      const time = await player.getCurrentTime();
      const rangeEnd = rangeEndRef.current;
      if (rangeEnd !== null && time >= rangeEnd) {
        rangeEndRef.current = null;
        void player.pauseVideo();
        void player.seekTo(rangeEnd, true);
        onTimeUpdate?.(rangeEnd);
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
    event.target.getIframe().setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    onReady?.();
  };

  // Handle player state changes such as play, pause, buffering, and end.
  const handleStateChange = async (event: YouTubeEvent<number>) => {
    const playing = event.data === STATE_PLAYING;
    setIsPlaying(playing);
    onPlayingChange?.(playing);

    // On pause or seek, sync the current time once so the highlighted lyric matches the timeline.
    if (!playing && playerRef.current) {
      onTimeUpdate?.(await playerRef.current.getCurrentTime());
    }
  };

  return (
    // Keep a 16:9 aspect ratio at every width.
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
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
          },
        }}
        onReady={handleReady}
        onStateChange={handleStateChange}
      />
    </div>
  );
});

export default YouTubePlayer;

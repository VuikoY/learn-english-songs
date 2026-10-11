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

/**
 * Methods exposed to the parent component through a ref:
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
  { videoId, onTimeUpdate, onPlayingChange },
  ref,
) {
  // Store the YouTube player instance when it becomes ready.
  const playerRef = useRef<YTPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Expose play, pause, seekTo, and volume controls to the parent component.
  useImperativeHandle(
    ref,
    () => ({
      play: () => void playerRef.current?.playVideo(),
      pause: () => void playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => {
        void playerRef.current?.seekTo(seconds, true);
        onTimeUpdate?.(seconds); // Update the UI immediately rather than waiting for the next poll.
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
      onTimeUpdate?.(time);
    }, POLL_INTERVAL_MS);

    // Stop polling when playback pauses or the component unmounts.
    return () => clearInterval(intervalId);
  }, [isPlaying, onTimeUpdate]);

  // Save the player instance after it loads.
  const handleReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
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

"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import YouTube, { type YouTubeEvent, type YouTubeProps, type YouTubePlayer as YTPlayer } from "react-youtube";

export type SnippetPlayerHandle = { replay: () => void };

type Props = {
  videoId: string;
  startTime: number;
  endTime: number;
  onEnded: () => void;
  onError: () => void;
};

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const POLL_INTERVAL_MS = 100;

const SnippetPlayer = forwardRef<SnippetPlayerHandle, Props>(function SnippetPlayer(
  { videoId, startTime, endTime, onEnded, onError },
  ref,
) {
  const playerRef = useRef<YTPlayer | null>(null);
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const [isPlaying, setIsPlaying] = useState(false);
  onEndedRef.current = onEnded;

  const finishSnippet = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    playerRef.current?.pauseVideo();
    playerRef.current?.seekTo(endTime, true);
    setIsPlaying(false);
    onEndedRef.current();
  }, [endTime]);

  useImperativeHandle(ref, () => ({
    replay: () => {
      const player = playerRef.current;
      if (!player) return;
      endedRef.current = false;
      player.seekTo(startTime, true);
      player.playVideo();
    },
  }), [startTime]);

  useEffect(() => {
    if (!isPlaying) return;
    const timerId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || endedRef.current) return;
      if (player.getCurrentTime() >= endTime) finishSnippet();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [endTime, finishSnippet, isPlaying]);

  function handleReady(event: YouTubeEvent) {
    playerRef.current = event.target;
    void event.target.getIframe().then((iframe: HTMLIFrameElement) =>
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin"),
    );
    event.target.seekTo(startTime, true);
    event.target.playVideo();
  }

  function handleStateChange(event: YouTubeEvent<number>) {
    setIsPlaying(event.data === STATE_PLAYING);
    if (event.data === STATE_ENDED) finishSnippet();
  }

  const opts: YouTubeProps["opts"] = {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      end: Math.ceil(endTime),
      origin: typeof window === "undefined" ? "" : window.location.origin,
      playsinline: 1,
      rel: 0,
      start: Math.ceil(startTime),
    },
  };

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <YouTube
        videoId={videoId}
        className="h-full w-full"
        iframeClassName="h-full w-full"
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        onError={onError}
      />
    </div>
  );
});

export default SnippetPlayer;

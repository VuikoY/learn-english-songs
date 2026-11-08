"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import YouTube, { type YouTubeEvent, type YouTubeProps, type YouTubePlayer as YTPlayer } from "react-youtube";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";

export type SnippetPlayerHandle = { replay: () => void; pause: () => void; restart: () => void };

type Props = {
  itemId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  autoPlay?: boolean;
  onTimeUpdate: (seconds: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onEnded: () => void;
  onError: () => void;
};

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const POLL_INTERVAL_MS = 100;

const SnippetPlayer = forwardRef<SnippetPlayerHandle, Props>(function SnippetPlayer(
  { itemId, videoId, startTime, endTime, autoPlay = true, onTimeUpdate, onPlayingChange, onEnded, onError },
  ref,
) {
  const bufferedStartTime = Math.max(0, startTime - AUDIO_START_BUFFER_SECONDS);
  const bufferedEndTime = endTime + AUDIO_END_BUFFER_SECONDS;
  const playerRef = useRef<YTPlayer | null>(null);
  const endedRef = useRef(false);
  const loadedItemIdRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onErrorRef = useRef(onError);
  const [isPlaying, setIsPlaying] = useState(false);
  onEndedRef.current = onEnded;
  onTimeUpdateRef.current = onTimeUpdate;
  onErrorRef.current = onError;

  const finishSnippet = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    playerRef.current?.pauseVideo();
    playerRef.current?.seekTo(bufferedEndTime, true);
    setIsPlaying(false);
    onTimeUpdateRef.current(bufferedEndTime);
    onEndedRef.current();
  }, [bufferedEndTime]);

  const loadSnippet = useCallback((player: YTPlayer) => {
    endedRef.current = false;
    loadedItemIdRef.current = itemId;
    onTimeUpdateRef.current(bufferedStartTime);
    setIsPlaying(false);
    const options = { videoId, startSeconds: bufferedStartTime, endSeconds: bufferedEndTime };
    if (autoPlay) player.loadVideoById(options);
    else player.cueVideoById(options);
  }, [autoPlay, bufferedEndTime, bufferedStartTime, itemId, videoId]);

  useImperativeHandle(ref, () => ({
    replay: () => {
      const player = playerRef.current;
      if (!player) return;
      endedRef.current = false;
      player.seekTo(bufferedStartTime, true);
      player.playVideo();
    },
    pause: () => playerRef.current?.pauseVideo(),
    restart: () => {
      const player = playerRef.current;
      if (!player) return;
      endedRef.current = false;
      player.seekTo(bufferedStartTime, true);
      player.pauseVideo();
      onTimeUpdateRef.current(bufferedStartTime);
    },
  }), [bufferedStartTime]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || loadedItemIdRef.current === itemId) return;
    loadSnippet(player);
  }, [itemId, loadSnippet]);

  useEffect(() => {
    if (!isPlaying) return;
    let polling = false;
    const timerId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || endedRef.current || polling) return;
      polling = true;
      try {
        const currentTime = player.getCurrentTime();
        onTimeUpdateRef.current(currentTime);
        if (currentTime >= bufferedEndTime) finishSnippet();
      } catch {
        onErrorRef.current();
      } finally {
        polling = false;
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [bufferedEndTime, finishSnippet, isPlaying]);

  function handleReady(event: YouTubeEvent) {
    playerRef.current = event.target;
    event.target.getIframe().setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    loadSnippet(event.target);
  }

  function handleStateChange(event: YouTubeEvent<number>) {
    setIsPlaying(event.data === STATE_PLAYING);
    onPlayingChange(event.data === STATE_PLAYING);
    if (event.data === STATE_ENDED) finishSnippet();
  }

  const opts: YouTubeProps["opts"] = {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 0,
      controls: 1,
      disablekb: 1,
      playsinline: 1,
      rel: 0,
    },
  };

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <YouTube
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

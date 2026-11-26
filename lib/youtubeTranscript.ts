import "server-only";

import { YoutubeTranscript } from "youtube-transcript";

type FetchTranscriptOptions = {
  lang?: string;
  signal?: AbortSignal;
};

/** Fetch subtitles directly from YouTube. */
export function fetchYoutubeTranscript(videoId: string, options: FetchTranscriptOptions = {}) {
  return YoutubeTranscript.fetchTranscript(videoId, {
    lang: options.lang,
    fetch: (input, init) => fetch(input, { ...init, signal: options.signal ?? init?.signal }),
  });
}

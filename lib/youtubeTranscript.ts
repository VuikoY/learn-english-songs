import "server-only";

import { YoutubeTranscript } from "youtube-transcript";

type FetchTranscriptOptions = {
  lang?: string;
  signal?: AbortSignal;
};

/** Fetch subtitles, optionally routing only youtube.com requests through the configured proxy. */
export function fetchYoutubeTranscript(videoId: string, options: FetchTranscriptOptions = {}) {
  const proxyUrl = process.env.YT_PROXY_URL;

  return YoutubeTranscript.fetchTranscript(videoId, {
    lang: options.lang,
    fetch: (input, init) => {
      const targetUrl = input instanceof Request ? input.url : String(input);
      let requestUrl = targetUrl;

      if (proxyUrl) {
        try {
          const target = new URL(targetUrl);
          if (target.hostname === "youtube.com" || target.hostname.endsWith(".youtube.com")) {
            const proxy = new URL(proxyUrl);
            proxy.searchParams.set("url", targetUrl);
            requestUrl = proxy.toString();
          }
        } catch {
          // Leave invalid or non-YouTube URLs untouched; fetch will report malformed URLs.
        }
      }

      return fetch(requestUrl, { ...init, signal: options.signal ?? init?.signal });
    },
  });
}

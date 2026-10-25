import { NextResponse } from "next/server";
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { isValidVideoId } from "@/lib/youtube";
import { isLearningLanguage } from "@/types/game";

export const maxDuration = 30;

type YouTubeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  transcriptAvailable: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function checkTranscript(videoId: string, language: string): Promise<boolean | null> {
  try {
    const lines = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: language,
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }),
    });
    return Array.isArray(lines) && lines.length > 0;
  } catch (error) {
    if (
      error instanceof YoutubeTranscriptDisabledError ||
      error instanceof YoutubeTranscriptNotAvailableError ||
      error instanceof YoutubeTranscriptNotAvailableLanguageError ||
      error instanceof YoutubeTranscriptVideoUnavailableError
    ) return false;

    if (error instanceof YoutubeTranscriptTooManyRequestError) return null;
    console.error("[youtube-search] Transcript availability check failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 100 ||
    (body.artist !== undefined &&
      (typeof body.artist !== "string" || body.artist.trim().length > 100)) ||
    !isLearningLanguage(body.language)
  ) {
    return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  }
  const language = body.language;
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";

  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ code: "CONFIGURATION_ERROR" }, { status: 503 });
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "5",
    videoEmbeddable: "true",
    order: "relevance",
    q: [body.title.trim(), artist].filter(Boolean).join(" "),
    key: apiKey,
  }).toString();

  let response: Response;
  try {
    response = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[youtube-search] YouTube Data API request failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { code: timedOut ? "SEARCH_TIMEOUT" : "SEARCH_FAILED" },
      { status: timedOut ? 504 : 502 },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.error("[youtube-search] YouTube Data API returned invalid JSON", { status: response.status });
    return NextResponse.json({ code: "SEARCH_FAILED" }, { status: 502 });
  }

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const errors = error && Array.isArray(error.errors) ? error.errors : [];
    const quotaExceeded = errors.some((item) => isRecord(item) && item.reason === "quotaExceeded");
    console.error("[youtube-search] YouTube Data API rejected the request", {
      status: response.status,
      quotaExceeded,
    });
    return NextResponse.json(
      { code: quotaExceeded ? "QUOTA_EXCEEDED" : "SEARCH_FAILED" },
      { status: quotaExceeded ? 429 : 502 },
    );
  }

  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const videos: YouTubeVideo[] = items.flatMap((item): YouTubeVideo[] => {
    if (!isRecord(item) || !isRecord(item.id) || !isRecord(item.snippet)) return [];
    const videoId = item.id.videoId;
    const snippet = item.snippet;
    if (
      typeof videoId !== "string" ||
      !isValidVideoId(videoId) ||
      typeof snippet.title !== "string" ||
      typeof snippet.channelTitle !== "string"
    ) return [];

    const thumbnails = isRecord(snippet.thumbnails) ? snippet.thumbnails : null;
    const thumbnail = thumbnails && (
      (isRecord(thumbnails.medium) && thumbnails.medium.url) ||
      (isRecord(thumbnails.default) && thumbnails.default.url)
    );
    return [{
      videoId,
      title: snippet.title,
      channelTitle: snippet.channelTitle,
      thumbnailUrl: typeof thumbnail === "string" ? thumbnail : null,
      transcriptAvailable: null,
    }];
  });

  for (let index = 0; index < videos.length; index += 2) {
    const batch = videos.slice(index, index + 2);
    const availability = await Promise.all(
      batch.map((video) => checkTranscript(video.videoId, language)),
    );
    batch.forEach((video, batchIndex) => {
      video.transcriptAvailable = availability[batchIndex];
    });
  }

  return NextResponse.json({ videos });
}

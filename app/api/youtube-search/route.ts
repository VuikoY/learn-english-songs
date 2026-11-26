import { NextResponse } from "next/server";
import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { isValidVideoId } from "@/lib/youtube";
import { fetchYoutubeTranscript } from "@/lib/youtubeTranscript";
import { isLearningLanguage } from "@/types/game";

export const maxDuration = 30;

const TRANSCRIPT_CHECK_TIMEOUT_MS = 10_000;

type YouTubeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  transcriptAvailable: boolean | null;
};

type SearchCandidate = YouTubeVideo & { reliableSource: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function checkTranscript(videoId: string, language: string): Promise<boolean | null> {
  try {
    const lines = await fetchYoutubeTranscript(videoId, {
      lang: language,
      signal: AbortSignal.timeout(TRANSCRIPT_CHECK_TIMEOUT_MS),
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
    maxResults: "20",
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
  const candidates: SearchCandidate[] = items.flatMap((item): SearchCandidate[] => {
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
      reliableSource: snippet.channelTitle.endsWith(" - Topic") || /\b(?:Official Audio|Lyrics)\b/i.test(snippet.title),
    }];
  });

  if (candidates.length === 0) return NextResponse.json({ videos: [] });

  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.search = new URLSearchParams({
    part: "status,contentDetails,snippet",
    id: candidates.map((video) => video.videoId).join(","),
    key: apiKey,
  }).toString();

  let detailsResponse: Response;
  try {
    detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[youtube-search] YouTube video details request failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { code: timedOut ? "SEARCH_TIMEOUT" : "SEARCH_FAILED" },
      { status: timedOut ? 504 : 502 },
    );
  }

  let detailsPayload: unknown;
  try {
    detailsPayload = await detailsResponse.json();
  } catch {
    console.error("[youtube-search] YouTube video details returned invalid JSON", { status: detailsResponse.status });
    return NextResponse.json({ code: "SEARCH_FAILED" }, { status: 502 });
  }

  if (!detailsResponse.ok) {
    const error = isRecord(detailsPayload) && isRecord(detailsPayload.error) ? detailsPayload.error : null;
    const errors = error && Array.isArray(error.errors) ? error.errors : [];
    const quotaExceeded = errors.some((item) => isRecord(item) && item.reason === "quotaExceeded");
    console.error("[youtube-search] YouTube video details request rejected", {
      status: detailsResponse.status,
      quotaExceeded,
    });
    return NextResponse.json(
      { code: quotaExceeded ? "QUOTA_EXCEEDED" : "SEARCH_FAILED" },
      { status: quotaExceeded ? 429 : 502 },
    );
  }

  const details = isRecord(detailsPayload) && Array.isArray(detailsPayload.items) ? detailsPayload.items : [];
  const embeddableIds = new Set(details.flatMap((item): string[] => {
    if (!isRecord(item) || typeof item.id !== "string" || !isRecord(item.status)) return [];
    if (item.status.embeddable !== true || item.status.privacyStatus !== "public") return [];
    const contentDetails = isRecord(item.contentDetails) ? item.contentDetails : null;
    const restriction = contentDetails && isRecord(contentDetails.regionRestriction) ? contentDetails.regionRestriction : null;
    const blocked = restriction && Array.isArray(restriction.blocked) ? restriction.blocked : [];
    if (["PL", "UA", "US", "GB"].some((country) => blocked.includes(country))) return [];
    return [item.id];
  }));

  const videos = candidates
    .filter((video) => embeddableIds.has(video.videoId))
    .sort((a, b) => Number(b.reliableSource) - Number(a.reliableSource))
    .map(({ reliableSource: _reliableSource, ...video }) => video);

  const transcriptChecks = await Promise.allSettled(
    videos.map((video) => checkTranscript(video.videoId, language)),
  );
  const checkedVideos = videos.map((video, index): YouTubeVideo => {
    const result = transcriptChecks[index];
    video.transcriptAvailable = result?.status === "fulfilled" ? result.value : null;
    return video;
  });

  return NextResponse.json({ videos: checkedVideos });
}

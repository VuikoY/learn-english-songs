import { NextResponse } from "next/server";
import YouTube from "youtube-sr";
import { YoutubeTranscript } from "youtube-transcript";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";
import { isValidVideoId } from "@/lib/youtube";
import { isLearningLanguage } from "@/types/game";
import type { LyricLine } from "@/lib/types";

export const maxDuration = 30;

const DEFAULT_SNIPPET_LIMIT = 10;
const MAX_SNIPPET_LIMIT = 10;
const VIDEO_SEARCH_LIMIT = 10;
const ADDITIONAL_VIDEO_SEARCH_LIMIT = 50;
const TRANSCRIPT_BATCH_SIZE = 10;
const TRANSCRIPT_TIMEOUT_MS = 3_500;

type Snippet = {
  video_id: string;
  title: string;
  start: number;
  duration: number;
  text: string;
  source: "collection" | "db" | "youtube";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLines(value: unknown): LyricLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line): LyricLine[] => {
    if (!isRecord(line) || typeof line.text !== "string" ||
      typeof line.start !== "number" || !Number.isFinite(line.start) || line.start < 0 ||
      typeof line.duration !== "number" || !Number.isFinite(line.duration) || line.duration <= 0) return [];
    return [{ text: line.text, start: line.start, duration: line.duration }];
  });
}

function makeMatcher(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
}

function getMatchingSnippets(
  videoId: string,
  title: string,
  lines: LyricLine[],
  matcher: RegExp,
  source: Snippet["source"],
): Snippet[] {
  return cleanTranscript(lines)
    .filter((line) => matcher.test(line.text))
    .map((line) => ({
      video_id: videoId,
      title,
      start: Number(line.start.toFixed(1)),
      duration: Math.max(0.1, Number(line.duration.toFixed(1))),
      text: line.text,
      source,
    }));
}

async function searchYouTubeApi(phrase: string, limit: number): Promise<{ videoId: string; title: string }[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(limit),
    q: phrase,
    key: apiKey,
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error("YOUTUBE_DATA_API_FAILED");

  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap((item): { videoId: string; title: string }[] => {
    if (!isRecord(item) || !isRecord(item.id) || !isRecord(item.snippet)) return [];
    const videoId = item.id.videoId;
    const title = item.snippet.title;
    return typeof videoId === "string" && isValidVideoId(videoId) &&
      typeof title === "string" && title.trim()
      ? [{ videoId, title }]
      : [];
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const phrase = params.get("phrase")?.trim() ?? "";
  const language = params.get("language") ?? "";
  const requestedLimit = params.has("limit") ? Number(params.get("limit")) : DEFAULT_SNIPPET_LIMIT;
  const rawExcludedIds = params.get("excludeVideoIds") ?? "";
  const excludedVideoIds = rawExcludedIds ? rawExcludedIds.split(",").filter(isValidVideoId) : [];
  if (
    !phrase || phrase.length > 100 || !isLearningLanguage(language) ||
    !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_SNIPPET_LIMIT
  ) {
    return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  }

  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const matcher = makeMatcher(phrase);
  const existingVideoIds = new Set<string>(excludedVideoIds);
  const { data: collectionItems, error: collectionItemsError } = await db
    .from("collection_items")
    .select("video_id,video_title,line_text,start_time,end_time")
    .eq("source_language", language)
    .ilike("line_text", `%${phrase.replace(/[\\%_]/gu, "\\$&")}%`)
    .not("video_id", "is", null)
    .not("video_title", "is", null)
    .order("created_at", { ascending: true })
    .limit(1_000);
  if (collectionItemsError) {
    console.error("[api/snippet-search] Collection phrase lookup failed", { code: collectionItemsError.code });
    return NextResponse.json({ code: "SNIPPET_SEARCH_FAILED" }, { status: 500 });
  }

  const collectionSnippets: Snippet[] = [];
  for (const item of collectionItems ?? []) {
    if (!item.video_id || !item.video_title || !matcher.test(item.line_text) ||
      !Number.isFinite(item.start_time) || !Number.isFinite(item.end_time) ||
      item.start_time < 0 || item.end_time <= item.start_time || existingVideoIds.has(item.video_id)) continue;
    existingVideoIds.add(item.video_id);
    collectionSnippets.push({
      video_id: item.video_id,
      title: item.video_title,
      start: Number(item.start_time.toFixed(1)),
      duration: Math.max(0.1, Number((item.end_time - item.start_time).toFixed(1))),
      text: item.line_text,
      source: "collection",
    });
    if (collectionSnippets.length >= requestedLimit) break;
  }

  const { data: songRows, error: songError } = await db
    .from("songs")
    .select("id,youtube_id,title,transcripts!inner(lines_json)")
    .eq("language", language)
    .limit(1_000);
  if (songError) {
    console.error("[api/snippet-search] Project transcript lookup failed", { code: songError.code });
    return NextResponse.json({ code: "SNIPPET_SEARCH_FAILED" }, { status: 500 });
  }

  const dbSnippets: Snippet[] = [];
  for (const song of songRows ?? []) {
    if (!song.youtube_id || !song.title) continue;
    const transcripts: unknown = song.transcripts;
    const transcript = Array.isArray(transcripts) ? transcripts[0] : transcripts;
    const lines = isRecord(transcript) ? parseLines(transcript.lines_json) : [];
    const matches = getMatchingSnippets(song.youtube_id, song.title, lines, matcher, "db");
    if (matches.length > 0 && !existingVideoIds.has(song.youtube_id)) {
      existingVideoIds.add(song.youtube_id);
      dbSnippets.push(matches[0]);
    }
    if (collectionSnippets.length + dbSnippets.length >= requestedLimit) break;
  }

  if (collectionSnippets.length + dbSnippets.length >= requestedLimit) {
    return NextResponse.json({ snippets: [...collectionSnippets, ...dbSnippets].slice(0, requestedLimit) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  let candidates: { videoId: string; title: string }[] = [];
  let youtubeSearchFailed = false;
  const isAdditionalSearch = excludedVideoIds.length > 0;
  try {
    const videos = await YouTube.search(phrase, {
      type: "video",
      limit: isAdditionalSearch ? ADDITIONAL_VIDEO_SEARCH_LIMIT : VIDEO_SEARCH_LIMIT,
      safeSearch: true,
      requestOptions: { signal: AbortSignal.timeout(5_000) },
    });
    candidates = videos.flatMap((video) => {
      if (video.type !== "video") return [];
      const videoId = video.id;
      const title = video.title;
      return videoId && title && isValidVideoId(videoId) ? [{ videoId, title }] : [];
    });
  } catch (error) {
    youtubeSearchFailed = true;
    console.error("[api/snippet-search] YouTube video search failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }

  if (candidates.length === 0 && process.env.YOUTUBE_DATA_API_KEY) {
    try {
      candidates = await searchYouTubeApi(phrase, isAdditionalSearch ? ADDITIONAL_VIDEO_SEARCH_LIMIT : VIDEO_SEARCH_LIMIT);
    } catch (error) {
      console.error("[api/snippet-search] YouTube Data API fallback failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({
        snippets: [...collectionSnippets, ...dbSnippets],
        warning: "YOUTUBE_SEARCH_FAILED",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
  }
  if (candidates.length === 0 && youtubeSearchFailed && !process.env.YOUTUBE_DATA_API_KEY) {
    return NextResponse.json({
      snippets: [...collectionSnippets, ...dbSnippets],
      warning: "YOUTUBE_SEARCH_FAILED",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const candidateVideoIds = new Set(existingVideoIds);
  candidates = candidates.filter(({ videoId }) => {
    if (candidateVideoIds.has(videoId)) return false;
    candidateVideoIds.add(videoId);
    return true;
  });

  const candidatesToCheck = candidates.slice(0, isAdditionalSearch ? ADDITIONAL_VIDEO_SEARCH_LIMIT : VIDEO_SEARCH_LIMIT);
  const youtubeSnippets: Snippet[] = [];
  const matchedVideoIds = new Set([...collectionSnippets, ...dbSnippets].map((snippet) => snippet.video_id));
  for (let offset = 0; offset < candidatesToCheck.length && collectionSnippets.length + dbSnippets.length + youtubeSnippets.length < requestedLimit; offset += TRANSCRIPT_BATCH_SIZE) {
    const batch = candidatesToCheck.slice(offset, offset + TRANSCRIPT_BATCH_SIZE);
    const attempts = await Promise.allSettled(batch.map(async ({ videoId, title }) => {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("TRANSCRIPT_TIMEOUT"));
        }, TRANSCRIPT_TIMEOUT_MS);
      });
      try {
        const transcript = await Promise.race([
          YoutubeTranscript.fetchTranscript(videoId, {
            lang: language,
            fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
          }),
          timeout,
        ]);
        const durations = transcript.map((line) => line.duration).sort((a, b) => a - b);
        const medianDuration = durations[Math.floor(durations.length / 2)] ?? 0;
        const timeDivider = medianDuration > 30 ? 1000 : 1;
        const lines = transcript.flatMap((line): LyricLine[] =>
          typeof line.text === "string" &&
          Number.isFinite(line.offset) && line.offset >= 0 &&
          Number.isFinite(line.duration) && line.duration > 0
            ? [{ text: line.text, start: line.offset / timeDivider, duration: line.duration / timeDivider }]
            : [],
        );
        return getMatchingSnippets(videoId, title, lines, matcher, "youtube");
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    }));

    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        console.error("[api/snippet-search] YouTube transcript lookup failed", {
          errorType: attempt.reason instanceof Error ? attempt.reason.name : "UnknownError",
        });
        continue;
      }
      const snippet = attempt.value[0];
      if (snippet && !matchedVideoIds.has(snippet.video_id)) {
        matchedVideoIds.add(snippet.video_id);
        youtubeSnippets.push(snippet);
      }
    }
  }

  const returnedVideoIds = new Set<string>();
  const snippets = [...dbSnippets, ...youtubeSnippets].filter((snippet) => {
    if (returnedVideoIds.has(snippet.video_id)) return false;
    returnedVideoIds.add(snippet.video_id);
    return true;
  });

  return NextResponse.json({
    snippets: [...collectionSnippets, ...snippets].slice(0, requestedLimit),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

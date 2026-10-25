// app/api/transcript/route.ts
// GET /api/transcript?videoId=XXXXXXXXXXX&lang=en -> LyricLine[]
// lang is the song language. Transcript lines are cleaned before being returned.

import { NextResponse } from "next/server";
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";
import { isValidVideoId } from "@/lib/youtube";
import type { LyricLine } from "@/lib/types";
import { isLearningLanguage } from "@/types/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function logTranscriptDatabaseError(operation: string, error: { code?: string; status?: number }) {
  const code = error.code ?? "unknown";
  const reason = code === "PGRST205" || code === "42P01"
    ? "transcripts_table_missing_or_not_exposed"
    : code === "PGRST204" || code === "42703"
      ? "transcripts_column_missing_from_schema"
      : code === "42501"
        ? "insufficient_database_privileges"
        : code === "PGRST116"
          ? "query_returned_multiple_rows_for_single_result"
          : "database_request_failed";
  // Do not log database messages, request data, credentials, or auth state.
  console.error("[transcript] Supabase request failed", { operation, code, status: error.status ?? null, reason });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get("videoId");
  const lang = params.get("lang") ?? "en";

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });
  }
  if (!isLearningLanguage(lang)) {
    return NextResponse.json({ error: "Unsupported song language." }, { status: 400 });
  }

  try {
    let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> = null;
    try { supabase = await createSupabaseServerClient(); } catch (error) {
      console.error("[transcript] Supabase client initialization failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return NextResponse.json({ error: "Could not access the saved transcript database." }, { status: 503 });
      }
    }
    if (supabase) {
      const { data: song, error: songError } = await supabase
        .from("songs")
        .select("id,language")
        .eq("youtube_id", videoId)
        .maybeSingle();
      if (songError) {
        logTranscriptDatabaseError("song_lookup", songError);
        return NextResponse.json({ error: "Could not check the saved song transcript." }, { status: 503 });
      }

      if (song?.language === lang) {
        const { data: saved, error: transcriptError } = await supabase
          .from("transcripts")
          .select("lines_json")
          .eq("song_id", song.id)
          .maybeSingle();
        if (transcriptError) {
          logTranscriptDatabaseError("song_transcript_lookup", transcriptError);
          return NextResponse.json({ error: "Could not load the saved song transcript." }, { status: 503 });
        }
        if (saved && Array.isArray(saved.lines_json)) return NextResponse.json(saved.lines_json);
      }

      // Prefer the shared database cache for both saved and uncatalogued videos.
      const { data: cached, error: cacheError } = await supabase
        .from("transcripts")
        .select("lines_json")
        .eq("video_id", videoId)
        .eq("language", lang)
        .eq("verified", true)
        .maybeSingle();
      if (cacheError) {
        logTranscriptDatabaseError("verified_transcript_lookup", cacheError);
        return NextResponse.json({ error: "Could not load the saved song transcript." }, { status: 503 });
      }
      if (cached && Array.isArray(cached.lines_json)) return NextResponse.json(cached.lines_json);
    }

    let items: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
    try {
      items = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: AbortSignal.timeout(15_000),
        }),
      });
    } catch (error) {
      if (error instanceof YoutubeTranscriptTooManyRequestError) {
        console.error("[transcript] YouTube requested a CAPTCHA for transcript retrieval");
        return NextResponse.json({ error: "Transcript provider quota exceeded. Please try again later." }, { status: 429 });
      }
      if (
        error instanceof YoutubeTranscriptDisabledError ||
        error instanceof YoutubeTranscriptNotAvailableError ||
        error instanceof YoutubeTranscriptNotAvailableLanguageError ||
        error instanceof YoutubeTranscriptVideoUnavailableError
      ) {
        return NextResponse.json({ error: "No subtitles are available for this video and language." }, { status: 404 });
      }
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      console.error("[transcript] YouTube transcript request failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        { error: timedOut ? "The transcript provider timed out." : "Could not reach the transcript provider." },
        { status: timedOut ? 504 : 502 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No subtitles are available for this video and language." }, { status: 404 });
    }

    if (items.some((item) =>
      typeof item.text !== "string" ||
      typeof item.offset !== "number" || !Number.isFinite(item.offset) || item.offset < 0 ||
      typeof item.duration !== "number" || !Number.isFinite(item.duration) || item.duration < 0
    )) {
      console.error("[transcript] YouTube returned invalid subtitle data");
      return NextResponse.json({ error: "The transcript provider returned an invalid response." }, { status: 502 });
    }

    const durations = items.map((item) => item.duration).sort((a, b) => a - b);
    const medianDuration = durations[Math.floor(durations.length / 2)];
    const timeDivider = medianDuration > 30 ? 1000 : 1;
    const rawLines: LyricLine[] = items.map((item) => ({
      text: item.text,
      start: item.offset / timeDivider,
      duration: item.duration / timeDivider,
    }));

    // Decode entities and remove markers such as [Music] and (Laughter).
    const lines = cleanTranscript(rawLines);

    if (lines.length === 0) {
      return NextResponse.json({ error: "No text remained after cleaning the subtitles." }, { status: 404 });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Transcript caching is not configured." }, { status: 503 });
    }

    const { data: existingCache, error: cacheLookupError } = await admin.from("transcripts")
      .select("video_id,language")
      .eq("video_id", videoId)
      .eq("language", lang)
      .maybeSingle();
    if (cacheLookupError) {
      logTranscriptDatabaseError("provider_cache_lookup", cacheLookupError);
      return NextResponse.json({ error: "Could not check the transcript cache." }, { status: 503 });
    }

    const { error: cacheWriteError } = existingCache
      ? await admin.from("transcripts").update({ lines_json: lines, verified: true })
        .eq("video_id", videoId).eq("language", lang)
      : await admin.from("transcripts").insert({
        video_id: videoId,
        language: lang,
        lines_json: lines,
        verified: true,
      });
    if (cacheWriteError) {
      logTranscriptDatabaseError("provider_cache_write", cacheWriteError);
      return NextResponse.json({ error: "Could not save the transcript to the cache." }, { status: 503 });
    }

    return NextResponse.json(lines);
  } catch (error) {
    console.error("[transcript] Unexpected request failure", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Could not retrieve subtitles from the transcript provider." },
      { status: 502 },
    );
  }
}

/** Save a transcript to the shared cache only after an authenticated user confirms it. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to confirm subtitles." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Transcript confirmation is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as { videoId?: unknown; language?: unknown; lines?: unknown } | null;
  if (!body || typeof body.videoId !== "string" || !isValidVideoId(body.videoId) || !isLearningLanguage(body.language) || !Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 10000) {
    return NextResponse.json({ error: "Invalid transcript." }, { status: 400 });
  }

  let transcriptSize = 0;
  const lines: LyricLine[] = [];
  for (const value of body.lines) {
    if (typeof value !== "object" || value === null) return NextResponse.json({ error: "Invalid transcript line." }, { status: 400 });
    const line = value as Record<string, unknown>;
    if (typeof line.text !== "string" || !line.text.trim() || line.text.length > 1000 ||
      typeof line.start !== "number" || !Number.isFinite(line.start) || line.start < 0 ||
      typeof line.duration !== "number" || !Number.isFinite(line.duration) || line.duration < 0) {
      return NextResponse.json({ error: "Invalid transcript line." }, { status: 400 });
    }
    transcriptSize += line.text.length;
    if (transcriptSize > 1_000_000) return NextResponse.json({ error: "Transcript is too large." }, { status: 413 });
    lines.push({ text: line.text.trim(), start: line.start, duration: line.duration });
  }

  const { data: existing, error: lookupError } = await admin.from("transcripts")
    .select("submitted_by").eq("video_id", body.videoId).eq("language", body.language).maybeSingle();
  if (lookupError) {
    logTranscriptDatabaseError("confirmation_lookup", lookupError);
    const schemaUnavailable = lookupError.code === "PGRST205" || lookupError.code === "42P01" || lookupError.code === "PGRST204" || lookupError.code === "42703";
    return NextResponse.json({
      error: schemaUnavailable
        ? "Transcript cache is not initialized. Apply the Supabase transcript schema and retry."
        : "Could not check the transcript cache.",
    }, { status: schemaUnavailable ? 503 : 500 });
  }
  // Legacy rows have no submitter and are unverified after the migration; allow
  // an explicit confirmation to claim one, but never replace another user's row.
  if (existing?.submitted_by && existing.submitted_by !== user.id) {
    return NextResponse.json({ error: "This transcript was already confirmed by another user." }, { status: 409 });
  }

  const { error } = existing
    ? await admin.from("transcripts").update({ lines_json: lines, verified: true, submitted_by: user.id })
      .eq("video_id", body.videoId).eq("language", body.language)
    : await admin.from("transcripts").insert({
      video_id: body.videoId, language: body.language, lines_json: lines,
    verified: true, submitted_by: user.id,
    });
  if (error) {
    logTranscriptDatabaseError("confirmation_write", error);
    if (error.code === "23505") return NextResponse.json({ error: "This transcript was just confirmed by another user." }, { status: 409 });
    return NextResponse.json({ error: "Could not save the confirmed transcript." }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

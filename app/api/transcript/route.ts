// app/api/transcript/route.ts
// GET /api/transcript?videoId=XXXXXXXXXXX&lang=en -> LyricLine[]
// lang is the song language. Transcript lines are cleaned before being returned.

import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";
import { isValidVideoId } from "@/lib/youtube";
import type { LyricLine } from "@/lib/types";
import { isLanguage } from "@/types/game";
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
    return NextResponse.json({ error: "Некорректный videoId." }, { status: 400 });
  }
  if (!isLanguage(lang)) {
    return NextResponse.json({ error: "Неподдерживаемый язык песни." }, { status: 400 });
  }

  try {
    let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> = null;
    try { supabase = await createSupabaseServerClient(); } catch { /* Fall through to YouTube. */ }
    if (supabase) {
      try {
        const { data } = await supabase
          .from("transcripts")
          .select("lines_json")
          .eq("video_id", videoId)
          .eq("language", lang)
          .eq("verified", true)
          .maybeSingle();
        if (data && Array.isArray(data.lines_json)) return NextResponse.json(data.lines_json);
      } catch { /* Cache miss or database unavailable: retrieve from YouTube. */ }
    }

    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });

    if (items.length === 0) {
      return NextResponse.json({ error: "В этом видео нет субтитров." }, { status: 404 });
    }

    // Depending on the library version, timestamps may be in seconds or milliseconds.
    // Subtitle lines usually last 1–10 seconds, so a median above 30 indicates milliseconds.
    const durations = items.map((i) => i.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    const divider = median > 30 ? 1000 : 1;

    const rawLines: LyricLine[] = items.map((item) => ({
      text: item.text,
      start: item.offset / divider,
      duration: item.duration / divider,
    }));

    // Decode entities and remove markers such as [Music] and (Laughter).
    const lines = cleanTranscript(rawLines);

    if (lines.length === 0) {
      return NextResponse.json({ error: "После очистки субтитров не осталось текста." }, { status: 404 });
    }

    return NextResponse.json(lines);
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json(
      {
        error:
          "Не удалось получить субтитры. Возможно, в видео нет субтитров на выбранном языке или они отключены.",
      },
      { status: 404 },
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
  if (!body || typeof body.videoId !== "string" || !isValidVideoId(body.videoId) || !isLanguage(body.language) || !Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 10000) {
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

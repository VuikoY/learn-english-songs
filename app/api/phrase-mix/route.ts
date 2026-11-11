import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLearningLanguage } from "@/types/game";
import type { LyricLine } from "@/lib/types";

const RECORD_LIMIT = 1_000_000;

function recordsResponse(dailyBest: number, allTimeBest: number, date: string) {
  return { dailyBest, allTimeBest, date };
}

async function phraseResponse(db: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, row: {
  song_id: string;
  youtube_id: string;
  line_index: number;
  line_text: string;
}, userId: string | null) {
  const { data: transcript, error } = await db.from("transcripts").select("lines_json").eq("song_id", row.song_id).maybeSingle();
  if (error || !transcript || !Array.isArray(transcript.lines_json)) {
    console.error("[api/phrase-mix] Transcript timing lookup failed", { code: error?.code });
    return null;
  }
  const line = transcript.lines_json[row.line_index];
  if (typeof line !== "object" || line === null || Array.isArray(line)) return null;
  const timing = line as { text?: unknown; start?: unknown; duration?: unknown };
  if (
    typeof timing.text !== "string" ||
    typeof timing.start !== "number" || !Number.isFinite(timing.start) || timing.start < 0 ||
    typeof timing.duration !== "number" || !Number.isFinite(timing.duration) || timing.duration <= 0
  ) return null;
  const { data: song, error: songError } = await db.from("songs").select("created_by").eq("id", row.song_id).maybeSingle();
  if (songError || !song) {
    console.error("[api/phrase-mix] Song owner lookup failed", { code: songError?.code });
    return null;
  }
  const toLine = (candidate: unknown): LyricLine | undefined => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return undefined;
    const value = candidate as { text?: unknown; start?: unknown; duration?: unknown };
    if (typeof value.text !== "string" || typeof value.start !== "number" || typeof value.duration !== "number") return undefined;
    return { text: value.text, start: value.start, duration: value.duration };
  };
  return {
    songId: row.song_id,
    canEdit: Boolean(userId && song.created_by === userId),
    youtubeId: row.youtube_id,
    lineIndex: row.line_index,
    text: timing.text,
    start: timing.start,
    duration: timing.duration,
    previousLine: toLine(transcript.lines_json[row.line_index - 1]),
    nextLine: toLine(transcript.lines_json[row.line_index + 1]),
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const action = params.get("action");
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data: { user } } = await db.auth.getUser();
  const account = user && !user.is_anonymous ? user : null;
  const today = new Date().toISOString().slice(0, 10);

  if (action === "records") {
    if (!account) return NextResponse.json({ records: null }, { headers: { "Cache-Control": "private, no-store" } });
    const { data, error } = await db.from("user_phrase_mix_records").select("daily_best,all_time_best,daily_date").eq("user_id", account.id).maybeSingle();
    if (error) {
      console.error("[api/phrase-mix] Record lookup failed", { code: error.code });
      return NextResponse.json({ error: "RECORD_LOOKUP_FAILED" }, { status: 500 });
    }
    return NextResponse.json({
      records: recordsResponse(data?.daily_date === today ? data.daily_best : 0, data?.all_time_best ?? 0, today),
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (action !== "next") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const language = params.get("language") ?? "";
  const onlyFavorites = params.get("onlyFavorites") === "true";
  const excludeVideoId = params.get("excludeVideoId");
  if (!isLearningLanguage(language) || (excludeVideoId !== null && !/^[\w-]{11}$/u.test(excludeVideoId))) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (onlyFavorites && !account) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data, error } = await db.rpc("get_random_phrase_mix_line", {
    p_language: language,
    p_only_favorites: onlyFavorites,
    p_excluded_video_id: excludeVideoId,
  });
  if (error) {
    console.error("[api/phrase-mix] Random phrase query failed", { code: error.code });
    return NextResponse.json({ error: "PHRASE_LOOKUP_FAILED" }, { status: 500 });
  }

  let phrase = data?.[0];
  if (!phrase && excludeVideoId) {
    const { data: fallback, error: fallbackError } = await db.rpc("get_random_phrase_mix_line", {
      p_language: language,
      p_only_favorites: onlyFavorites,
      p_excluded_video_id: null,
    });
    if (fallbackError) {
      console.error("[api/phrase-mix] Random phrase fallback failed", { code: fallbackError.code });
      return NextResponse.json({ error: "PHRASE_LOOKUP_FAILED" }, { status: 500 });
    }
    phrase = fallback?.[0];
  }
  if (!phrase) return NextResponse.json({ error: "NO_PHRASES" }, { status: 404 });
  const result = await phraseResponse(db, phrase, account?.id ?? null);
  if (!result) return NextResponse.json({ error: "PHRASE_TIMING_UNAVAILABLE" }, { status: 500 });
  return NextResponse.json({ phrase: result }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const input = await request.json().catch(() => null) as { streak?: unknown } | null;
  if (!input || !Number.isInteger(input.streak) || (input.streak as number) < 1 || (input.streak as number) > RECORD_LIMIT) {
    return NextResponse.json({ error: "INVALID_STREAK" }, { status: 400 });
  }

  const { data, error } = await db.rpc("save_phrase_mix_record", { p_streak: input.streak as number });
  if (error || !data?.[0]) {
    console.error("[api/phrase-mix] Record save failed", { code: error?.code });
    return NextResponse.json({ error: "RECORD_SAVE_FAILED" }, { status: 500 });
  }
  const saved = data[0];
  return NextResponse.json({ records: recordsResponse(saved.daily_best, saved.all_time_best, saved.daily_date) }, { headers: { "Cache-Control": "private, no-store" } });
}
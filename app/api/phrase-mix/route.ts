import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLearningLanguage } from "@/types/game";
import type { LyricLine } from "@/lib/types";

const RECORD_LIMIT = 1_000_000;

function recordsResponse(dailyBest: number, allTimeBest: number, date: string) {
  return { dailyBest, allTimeBest, date };
}

async function phraseResponse(db: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, row: {
  song_id: string | null;
  collection_item_id: string | null;
  youtube_id: string;
  title: string;
  line_index: number | null;
  line_text: string;
  start_time: number;
  duration: number;
  source_type: string;
  source_title: string;
  source_slug: string;
  is_public: boolean | null;
}, userId: string | null) {
  if (row.source_type !== "media" && row.source_type !== "collection") return null;
  let isFavorite = false;
  if (userId && row.source_type === "media" && row.song_id) {
    const { data } = await db.from("user_favorites").select("song_id").eq("user_id", userId).eq("song_id", row.song_id).maybeSingle();
    isFavorite = Boolean(data);
  } else if (userId && row.source_type === "collection" && row.source_slug) {
    const { data } = await db.from("user_favorite_collections").select("collection_id").eq("user_id", userId).eq("collection_id", row.source_slug).maybeSingle();
    isFavorite = Boolean(data);
  }
  const source = {
    sourceType: row.source_type,
    sourceTitle: row.source_title,
    sourceSlug: row.source_slug,
    isPublic: row.is_public,
    isFavorite,
  };
  if (row.collection_item_id !== null) {
    if (
      typeof row.start_time !== "number" || !Number.isFinite(row.start_time) || row.start_time < 0 ||
      typeof row.duration !== "number" || !Number.isFinite(row.duration) || row.duration <= 0
    ) return null;
    const { data: collection } = await db.from("word_collections").select("user_id").eq("id", row.source_slug).maybeSingle();
    let isCollectionCompleted = false;
    if (userId) {
      const { data: manual, error: manualError } = await db.from("user_collection_completion")
        .select("is_completed")
        .eq("user_id", userId)
        .eq("collection_id", row.source_slug)
        .maybeSingle();
      if (manualError) {
        console.error("[api/phrase-mix] Collection completion lookup failed", { code: manualError.code });
        return null;
      }
      if (manual) {
        isCollectionCompleted = manual.is_completed;
      } else {
        const { data: progress } = await db.from("user_collection_progress")
          .select("collection_id")
          .eq("user_id", userId)
          .eq("collection_id", row.source_slug)
          .eq("is_completed", true)
          .limit(1);
        isCollectionCompleted = Boolean(progress?.length);
      }
    }
    return {
      songId: row.song_id ?? "",
      canEdit: Boolean(userId && collection?.user_id === userId),
      collectionItemId: row.collection_item_id,
      youtubeId: row.youtube_id,
      lineIndex: 0,
      text: row.line_text,
      start: row.start_time,
      duration: row.duration,
      isCollectionCompleted,
      ...source,
    };
  }
  if (row.song_id === null || row.line_index === null) return null;
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
    ...source,
    previousLine: toLine(transcript.lines_json[row.line_index - 1]),
    nextLine: toLine(transcript.lines_json[row.line_index + 1]),
    ...(userId && song.created_by === userId ? { lines: transcript.lines_json.flatMap((candidate) => {
      const value = toLine(candidate);
      return value ? [value] : [];
    }) } : {}),
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
  const legacyOnlyFavorites = params.get("onlyFavorites") === "true";
  const favoriteMedia = params.has("favoriteMedia")
    ? params.get("favoriteMedia") === "true"
    : legacyOnlyFavorites;
  const favoriteCollections = params.has("favoriteCollections")
    ? params.get("favoriteCollections") === "true"
    : legacyOnlyFavorites;
  const excludeVideoId = params.get("excludeVideoId");
  const sourceType = params.get("sourceType");
  if (!isLearningLanguage(language) || (sourceType !== null && sourceType !== "media" && sourceType !== "collection") || (excludeVideoId !== null && !/^[\w-]{11}$/u.test(excludeVideoId))) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if ((favoriteMedia || favoriteCollections) && !account) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data, error } = await db.rpc("get_random_phrase_mix_line", {
    p_language: language,
    p_favorite_media: favoriteMedia,
    p_favorite_collections: favoriteCollections,
    p_excluded_video_id: excludeVideoId,
    p_source_type: sourceType,
  });
  if (error) {
    console.error("[api/phrase-mix] Random phrase query failed", { code: error.code });
    return NextResponse.json({ error: "PHRASE_LOOKUP_FAILED" }, { status: 500 });
  }

  let phrase = data?.[0];
  if (!phrase && excludeVideoId) {
    const { data: fallback, error: fallbackError } = await db.rpc("get_random_phrase_mix_line", {
      p_language: language,
      p_favorite_media: favoriteMedia,
      p_favorite_collections: favoriteCollections,
      p_excluded_video_id: null,
      p_source_type: sourceType,
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

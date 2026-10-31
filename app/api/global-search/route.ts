import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLearningLanguage } from "@/types/game";

type SearchRow = {
  result_kind: "song" | "line";
  song_id: string;
  youtube_id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  line_text: string | null;
  context: string | null;
  line_index: number | null;
  start_time: number | null;
  end_time: number | null;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const language = params.get("language") ?? "";
  if (query.length < 2 || query.length > 100 || !isLearningLanguage(language)) {
    return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  }

  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data, error } = await db.rpc("search_song_content", {
    search_query: query,
    source_language: language,
    result_limit: 6,
  });
  if (error || !data) {
    console.error("[api/global-search] Database search failed", { code: error?.code });
    return NextResponse.json({ code: "SEARCH_FAILED" }, { status: 500 });
  }

  const rows = data as SearchRow[];
  const songs = rows
    .filter((row) => row.result_kind === "song")
    .map((row) => ({
      id: row.song_id,
      youtubeId: row.youtube_id,
      title: row.title,
      artist: row.artist,
      thumbnailUrl: row.thumbnail_url,
    }));
  const lines = rows
    .filter((row): row is SearchRow & {
      line_text: string;
      context: string;
      line_index: number;
      start_time: number;
      end_time: number;
    } => row.result_kind === "line" &&
      typeof row.line_text === "string" &&
      typeof row.context === "string" &&
      typeof row.line_index === "number" &&
      typeof row.start_time === "number" &&
      typeof row.end_time === "number")
    .map((row) => ({
      id: row.song_id,
      youtubeId: row.youtube_id,
      title: row.title,
      artist: row.artist,
      thumbnailUrl: row.thumbnail_url,
      lineText: row.line_text,
      context: row.context,
      lineIndex: row.line_index,
      startTime: row.start_time,
      endTime: row.end_time,
    }));

  return NextResponse.json({ songs, lines }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

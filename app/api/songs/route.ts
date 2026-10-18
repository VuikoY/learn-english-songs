import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractVideoId } from "@/lib/youtube";
import { isLanguage } from "@/types/game";
import type { LyricLine } from "@/lib/types";

function logDatabaseError(operation: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(`[api/songs] ${operation} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to save songs." }, { status: 401 });
  const body = await request.json().catch(() => null) as { youtubeUrl?: unknown; title?: unknown; artist?: unknown; language?: unknown; lines?: unknown; isPublic?: unknown } | null;
  if (!body || typeof body.youtubeUrl !== "string" || !isLanguage(body.language) || !Array.isArray(body.lines) || !body.lines.length || body.lines.some((x) => !x || typeof x.text !== "string" || typeof x.start !== "number" || typeof x.duration !== "number")) return NextResponse.json({ error: "Check the YouTube URL, language, and subtitles." }, { status: 400 });
  const youtubeId = extractVideoId(body.youtubeUrl);
  if (!youtubeId) return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  // youtube_id is unique: an existing entry is replaced and transferred to this account.
  const { data: song, error } = await db.from("songs").upsert({ youtube_id: youtubeId, title: typeof body.title === "string" ? body.title.slice(0, 200) : youtubeId, artist: typeof body.artist === "string" ? body.artist.slice(0, 200) : null, thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`, language: body.language, created_by: user.id, is_public: body.isPublic !== false }, { onConflict: "youtube_id" }).select("id").single();
  if (error || !song) {
    if (error) logDatabaseError("song upsert", error);
    return NextResponse.json({ error: "Could not save the song. Check the server log for the Supabase error." }, { status: 500 });
  }
  const { error: transcriptError } = await db.from("transcripts").upsert({ song_id: song.id, video_id: youtubeId, language: body.language, lines_json: body.lines as LyricLine[], is_verified: false, verified: false }, { onConflict: "song_id" });
  if (transcriptError) {
    logDatabaseError("transcript upsert", transcriptError);
    return NextResponse.json({ error: "The song was saved, but its subtitles could not be saved." }, { status: 500 });
  }
  const { error: cacheError } = await db.from("line_explanations").delete().eq("song_id", song.id);
  if (cacheError) {
    logDatabaseError("explanation cache invalidation", cacheError);
    return NextResponse.json({ error: "The song and subtitles were saved, but cached explanations could not be cleared." }, { status: 500 });
  }
  return NextResponse.json({ id: song.id, youtubeId });
}

export async function PATCH(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to edit songs." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown; lines?: unknown; isPublic?: unknown } | null;
  if (!body || typeof body.id !== "string" || !Array.isArray(body.lines) || body.lines.some((x) => !x || typeof x.text !== "string" || typeof x.start !== "number" || typeof x.duration !== "number")) return NextResponse.json({ error: "Invalid subtitle data." }, { status: 400 });
  const { data: song, error } = await db.from("songs").update({ is_public: body.isPublic !== false }).eq("id", body.id).eq("created_by", user.id).select("id,youtube_id,language").maybeSingle();
  if (error || !song) {
    if (error) logDatabaseError("song update", error);
    return NextResponse.json({ error: "Song not found or access denied." }, { status: 404 });
  }
  const { error: transcriptError } = await db.from("transcripts").upsert({ song_id: song.id, video_id: song.youtube_id, language: song.language, lines_json: body.lines, is_verified: false, verified: false }, { onConflict: "song_id" });
  if (transcriptError) {
    logDatabaseError("transcript update", transcriptError);
    return NextResponse.json({ error: "Could not save subtitles." }, { status: 500 });
  }
  const { error: cacheError } = await db.from("line_explanations").delete().eq("song_id", song.id);
  if (cacheError) {
    logDatabaseError("explanation cache invalidation", cacheError);
    return NextResponse.json({ error: "Subtitles were saved, but cached explanations could not be cleared." }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to delete songs." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Invalid song ID." }, { status: 400 });
  const { data, error } = await db.from("songs").delete().eq("id", body.id).eq("created_by", user.id).select("id").maybeSingle();
  if (error || !data) {
    if (error) logDatabaseError("song delete", error);
    return NextResponse.json({ error: "Song not found or access denied." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}

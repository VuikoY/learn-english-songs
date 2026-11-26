import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractVideoId } from "@/lib/youtube";
import { isLearningLanguage } from "@/types/game";
import { isSongDifficulty, isSongGenre } from "@/lib/songMetadata";
import { cleanYouTubeTitle } from "@/lib/cleanYouTubeTitle";
import type { LyricLine } from "@/lib/types";

const CONTENT_TYPES = ["music_video", "movie_clip", "interview", "podcast", "shorts", "other"] as const;
const isContentType = (value: unknown): value is typeof CONTENT_TYPES[number] => typeof value === "string" && CONTENT_TYPES.includes(value as typeof CONTENT_TYPES[number]);
function isTranscriptLine(value: unknown): value is { text: string; start: number; duration: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return typeof line.text === "string" && Boolean(line.text.trim()) && line.text.length <= 10_000 &&
    typeof line.start === "number" && Number.isFinite(line.start) && line.start >= 0 &&
    typeof line.duration === "number" && Number.isFinite(line.duration) && line.duration >= 0;
}
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
  const body = await request.json().catch(() => null) as { youtubeUrl?: unknown; title?: unknown; artist?: unknown; language?: unknown; genre?: unknown; difficulty?: unknown; contentType?: unknown; lines?: unknown; isPublic?: unknown } | null;
  if (!body || typeof body.youtubeUrl !== "string" || !isLearningLanguage(body.language) || !Array.isArray(body.lines) || !body.lines.length || body.lines.some((x) => !x || typeof x.text !== "string" || typeof x.start !== "number" || typeof x.duration !== "number")) return NextResponse.json({ error: "Check the YouTube URL, language, and subtitles." }, { status: 400 });
  if (body.artist !== undefined && (typeof body.artist !== "string" || body.artist.trim().length > 200)) return NextResponse.json({ code: "INVALID_ARTIST" }, { status: 400 });
  const youtubeId = extractVideoId(body.youtubeUrl);
  if (!youtubeId) return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  const { data: existing, error: lookupError } = await db.from("songs").select("id").eq("youtube_id", youtubeId).maybeSingle();
  if (lookupError) {
    logDatabaseError("duplicate song lookup", lookupError);
    return NextResponse.json({ error: "Could not check whether this YouTube video is already saved." }, { status: 500 });
  }
  if (existing) return NextResponse.json({ error: "A song with this YouTube video ID is already in the catalog." }, { status: 409 });
  const genre = isSongGenre(body.genre) ? body.genre : "other";
  const difficulty = isSongDifficulty(body.difficulty) ? body.difficulty : "intermediate";
  const contentType = body.contentType === undefined || body.contentType === null || body.contentType === "" ? "music_video" : isContentType(body.contentType) ? body.contentType : null;
  if (!contentType) return NextResponse.json({ error: "Invalid content category." }, { status: 400 });
  const rawTitle = typeof body.title === "string" ? body.title.trim().slice(0, 200) : youtubeId;
  const title = cleanYouTubeTitle(rawTitle).slice(0, 200) || rawTitle;
  const { data: song, error } = await db.from("songs").insert({ youtube_id: youtubeId, title, raw_title: rawTitle, artist: typeof body.artist === "string" && body.artist.trim() ? body.artist.trim() : null, thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`, language: body.language, genre, difficulty, content_type: contentType, created_by: user.id, is_public: body.isPublic !== false }).select("id").single();
  if (error || !song) {
    if (error?.code === "23505") return NextResponse.json({ error: "A song with this YouTube video ID is already in the catalog." }, { status: 409 });
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
  if (!user || user.is_anonymous) return NextResponse.json({ code: "SIGN_IN_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => null) as { intent?: unknown; id?: unknown; lines?: unknown; isPublic?: unknown; genre?: unknown; difficulty?: unknown; contentType?: unknown; artist?: unknown; videoId?: unknown } | null;
  if (body?.intent === "transcript") {
    if (typeof body.id !== "string" || !Array.isArray(body.lines) || !body.lines.length || body.lines.length > 5000 || body.lines.some((line) => !isTranscriptLine(line))) {
      return NextResponse.json({ code: "INVALID_LINE" }, { status: 400 });
    }
    const { data: song, error } = await db.from("songs").select("id,youtube_id,language").eq("id", body.id).eq("created_by", user.id).maybeSingle();
    if (error || !song) {
      if (error) logDatabaseError("transcript edit song lookup", error);
      return NextResponse.json({ code: "SONG_NOT_FOUND" }, { status: 404 });
    }
    const { error: transcriptError } = await db.from("transcripts").upsert({ song_id: song.id, video_id: song.youtube_id, language: song.language, lines_json: body.lines, is_verified: false, verified: false }, { onConflict: "song_id" });
    if (transcriptError) {
      logDatabaseError("full transcript update", transcriptError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    const { error: cacheError } = await db.from("line_explanations").delete().eq("song_id", song.id);
    if (cacheError) {
      logDatabaseError("transcript explanation cache invalidation", cacheError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ saved: true, lines: body.lines });
  }
  if (!body || typeof body.id !== "string" || !Array.isArray(body.lines) || body.lines.some((x) => !x || typeof x.text !== "string" || typeof x.start !== "number" || typeof x.duration !== "number")) return NextResponse.json({ error: "Invalid subtitle data." }, { status: 400 });
  let newVideoId: string | undefined;
  if (body.videoId !== undefined) {
    const parsedVideoId = typeof body.videoId === "string" ? extractVideoId(body.videoId) : null;
    if (!parsedVideoId) {
      return NextResponse.json({ error: "Invalid YouTube video ID or URL." }, { status: 400 });
    }
    newVideoId = parsedVideoId;
  }
  const metadataUpdate: { genre?: string; difficulty?: string; content_type?: string; artist?: string | null; youtube_id?: string; thumbnail_url?: string } = {};
  if (body.artist !== undefined) {
    if (typeof body.artist !== "string" || body.artist.trim().length > 200) return NextResponse.json({ code: "INVALID_ARTIST" }, { status: 400 });
    metadataUpdate.artist = body.artist.trim() || null;
  }
  if (body.genre !== undefined) {
    if (!isSongGenre(body.genre)) return NextResponse.json({ error: "Invalid song genre." }, { status: 400 });
    metadataUpdate.genre = body.genre;
  }
  if (body.difficulty !== undefined) {
    if (!isSongDifficulty(body.difficulty)) return NextResponse.json({ error: "Invalid song difficulty." }, { status: 400 });
    metadataUpdate.difficulty = body.difficulty;
  }
  if (body.contentType !== undefined) {
    if (!isContentType(body.contentType)) return NextResponse.json({ error: "Invalid content category." }, { status: 400 });
    metadataUpdate.content_type = body.contentType;
  }
  if (newVideoId) {
    metadataUpdate.youtube_id = newVideoId;
    metadataUpdate.thumbnail_url = `https://i.ytimg.com/vi/${newVideoId}/hqdefault.jpg`;
  }
  const { data: previousSong, error: previousSongError } = await db.from("songs").select("youtube_id").eq("id", body.id).eq("created_by", user.id).maybeSingle();
  if (previousSongError || !previousSong) {
    if (previousSongError) logDatabaseError("song update lookup", previousSongError);
    return NextResponse.json({ error: "Song not found or access denied." }, { status: 404 });
  }
  const { data: song, error } = await db.from("songs").update({ is_public: body.isPublic !== false, ...metadataUpdate }).eq("id", body.id).eq("created_by", user.id).select("id,youtube_id,language").maybeSingle();
  if (error || !song) {
    if (error) logDatabaseError("song update", error);
    if (error?.code === "23505") return NextResponse.json({ error: "A song with this YouTube video ID already exists." }, { status: 409 });
    return NextResponse.json({ error: "Song not found or access denied." }, { status: 404 });
  }
  const videoChanged = newVideoId !== undefined && previousSong.youtube_id !== newVideoId;
  if (videoChanged) {
    // Keep the existing subtitle text and timing intact; only associate it with the selected video.
    const { error: transcriptLinkError } = await db.from("transcripts").update({ video_id: song.youtube_id }).eq("song_id", song.id);
    if (transcriptLinkError) {
      logDatabaseError("transcript video link update", transcriptLinkError);
      return NextResponse.json({ error: "The video was changed, but its subtitle link could not be updated." }, { status: 500 });
    }
    return NextResponse.json({ saved: true, youtubeId: song.youtube_id });
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

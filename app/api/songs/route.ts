import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractVideoId } from "@/lib/youtube";
import { isLearningLanguage } from "@/types/game";
import { isSongDifficulty, isSongGenre } from "@/lib/songMetadata";
import type { LyricLine } from "@/lib/types";

const CONTENT_TYPES = ["music_video", "movie_clip", "interview", "podcast", "shorts", "other"] as const;
const isContentType = (value: unknown): value is typeof CONTENT_TYPES[number] => typeof value === "string" && CONTENT_TYPES.includes(value as typeof CONTENT_TYPES[number]);
function isQuickEditLine(value: unknown): value is { text: string; start: number; duration: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return typeof line.text === "string" && Boolean(line.text.trim()) && line.text.length <= 10_000 &&
    typeof line.start === "number" && Number.isFinite(line.start) && line.start >= 0 &&
    typeof line.duration === "number" && Number.isFinite(line.duration) && line.duration >= 0;
}
function isQuickEditInsert(value: unknown): value is { afterIndex: number; line: { text: string; start: number; duration: number } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const insert = value as Record<string, unknown>;
  return Number.isInteger(insert.afterIndex) && (insert.afterIndex as number) >= 0 && isQuickEditLine(insert.line);
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
  const { data: song, error } = await db.from("songs").insert({ youtube_id: youtubeId, title: typeof body.title === "string" ? body.title.slice(0, 200) : youtubeId, artist: typeof body.artist === "string" && body.artist.trim() ? body.artist.trim() : null, thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`, language: body.language, genre, difficulty, content_type: contentType, created_by: user.id, is_public: body.isPublic !== false }).select("id").single();
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
  const body = await request.json().catch(() => null) as { intent?: unknown; id?: unknown; lineIndex?: unknown; line?: unknown; lineUpdates?: unknown; currentLineIndex?: unknown; insertLine?: unknown; deleteLineIndex?: unknown; lines?: unknown; isPublic?: unknown; genre?: unknown; difficulty?: unknown; contentType?: unknown; artist?: unknown } | null;
  if (body?.intent === "line") {
    const insertCandidate = body.insertLine;
    if (
      typeof body.id !== "string" ||
      !Number.isInteger(body.currentLineIndex) || (body.currentLineIndex as number) < 0 ||
      !Array.isArray(body.lineUpdates) ||
      body.lineUpdates.length < 1 ||
      body.lineUpdates.length > 3 ||
      body.lineUpdates.some((update) =>
        !update || typeof update !== "object" || Array.isArray(update) ||
        !Number.isInteger(update.lineIndex) || update.lineIndex < 0 ||
        !isQuickEditLine(update.line),
      )
    ) {
      return NextResponse.json({ code: "INVALID_LINE" }, { status: 400 });
    }
    const currentLineIndex = body.currentLineIndex as number;
    const lineUpdates = body.lineUpdates as { lineIndex: number; line: { text: string; start: number; duration: number } }[];
    const indexes = lineUpdates.map(({ lineIndex }) => lineIndex);
    if (
      new Set(indexes).size !== indexes.length ||
      !indexes.includes(currentLineIndex) ||
      indexes.some((index) => Math.abs(index - currentLineIndex) > 1) ||
      (body.insertLine !== undefined && body.deleteLineIndex !== undefined) ||
      (body.deleteLineIndex !== undefined && (
        !Number.isInteger(body.deleteLineIndex) ||
        (body.deleteLineIndex as number) < 0 ||
        Math.abs((body.deleteLineIndex as number) - currentLineIndex) !== 1
      )) ||
      (body.insertLine !== undefined && (
        !isQuickEditInsert(insertCandidate) ||
        Math.abs(insertCandidate.afterIndex - currentLineIndex) > 1
      ))
    ) {
      return NextResponse.json({ code: "INVALID_LINE" }, { status: 400 });
    }
    const insertLine = isQuickEditInsert(insertCandidate) ? insertCandidate : undefined;
    const deleteLineIndex = body.deleteLineIndex as number | undefined;

    const { data: song, error: songError } = await db
      .from("songs")
      .select("id,youtube_id,language")
      .eq("id", body.id)
      .eq("created_by", user.id)
      .maybeSingle();
    if (songError) {
      logDatabaseError("quick edit song lookup", songError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    if (!song) return NextResponse.json({ code: "SONG_NOT_FOUND" }, { status: 404 });

    const { data: transcript, error: transcriptLookupError } = await db
      .from("transcripts")
      .select("lines_json")
      .eq("song_id", song.id)
      .maybeSingle();
    if (transcriptLookupError) {
      logDatabaseError("quick edit transcript lookup", transcriptLookupError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    const transcriptLines = transcript?.lines_json;
    if (!Array.isArray(transcriptLines) || indexes.some((index) => index >= transcriptLines.length)) {
      return NextResponse.json({ code: "LINE_NOT_FOUND" }, { status: 404 });
    }
    if (
      (insertLine && insertLine.afterIndex >= transcriptLines.length) ||
      (deleteLineIndex !== undefined && (deleteLineIndex >= transcriptLines.length || transcriptLines.length <= 1))
    ) {
      return NextResponse.json({ code: "LINE_NOT_FOUND" }, { status: 404 });
    }

    const lines = [...transcriptLines];
    const changedStartIndexes: number[] = [];
    for (const { lineIndex, line } of lineUpdates) {
      const previousLine = lines[lineIndex];
      if (!previousLine || typeof previousLine !== "object" || Array.isArray(previousLine)) {
        return NextResponse.json({ code: "LINE_NOT_FOUND" }, { status: 404 });
      }
      const updatedLine = {
        ...previousLine,
        text: line.text.trim(),
        start: line.start,
        duration: line.duration,
      };
      if (updatedLine.text !== previousLine.text && "translations" in updatedLine) {
        delete updatedLine.translations;
      }
      if (updatedLine.start !== previousLine.start) changedStartIndexes.push(lineIndex);
      lines[lineIndex] = updatedLine;
    }

    if (deleteLineIndex !== undefined) lines.splice(deleteLineIndex, 1);
    if (insertLine) lines.splice(insertLine.afterIndex + 1, 0, insertLine.line);

    const adjustedStartIndexes = changedStartIndexes.map((index) =>
      deleteLineIndex !== undefined
        ? index > deleteLineIndex ? index - 1 : index
        : insertLine && index > insertLine.afterIndex ? index + 1 : index,
    );
    const durationIndexes = new Set(adjustedStartIndexes.flatMap((index) => [index - 1, index]));
    if (insertLine) {
      durationIndexes.add(insertLine.afterIndex);
      durationIndexes.add(insertLine.afterIndex + 1);
    }
    if (deleteLineIndex !== undefined) durationIndexes.add(deleteLineIndex - 1);
    for (const index of durationIndexes) {
      if (index < 0 || index >= lines.length - 1) continue;
      const currentLine = lines[index];
      const nextLine = lines[index + 1];
      if (
        typeof currentLine !== "object" || currentLine === null || Array.isArray(currentLine) ||
        typeof nextLine !== "object" || nextLine === null || Array.isArray(nextLine) ||
        typeof currentLine.start !== "number" || typeof nextLine.start !== "number"
      ) continue;
      lines[index] = {
        ...currentLine,
        duration: Math.max(0, Number((nextLine.start - currentLine.start - 0.1).toFixed(2))),
      };
    }
    const { error: transcriptError } = await db
      .from("transcripts")
      .update({ lines_json: lines, is_verified: false, verified: false })
      .eq("song_id", song.id);
    if (transcriptError) {
      logDatabaseError("quick edit transcript update", transcriptError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    const { error: cacheError } = await db.from("line_explanations").delete().eq("song_id", song.id);
    if (cacheError) {
      logDatabaseError("quick edit explanation cache invalidation", cacheError);
      return NextResponse.json({ code: "LINE_SAVE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ saved: true, lines });
  }
  if (!body || typeof body.id !== "string" || !Array.isArray(body.lines) || body.lines.some((x) => !x || typeof x.text !== "string" || typeof x.start !== "number" || typeof x.duration !== "number")) return NextResponse.json({ error: "Invalid subtitle data." }, { status: 400 });
  const metadataUpdate: { genre?: string; difficulty?: string; content_type?: string; artist?: string | null } = {};
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
  const { data: song, error } = await db.from("songs").update({ is_public: body.isPublic !== false, ...metadataUpdate }).eq("id", body.id).eq("created_by", user.id).select("id,youtube_id,language").maybeSingle();
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

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLearningLanguage } from "@/types/game";

type Context = { params: Promise<{ collectionId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function getAccountClient() {
  const db = await createSupabaseServerClient();
  if (!db) return { error: NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }) };
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) {
    return { error: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) };
  }
  return { db, user };
}

function roundToTenth(value: number): number {
  return Number(value.toFixed(1));
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;
  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });

  const body: unknown = await request.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
  const itemId = typeof record?.itemId === "string" ? record.itemId : "";
  const lineText = typeof record?.lineText === "string" ? record.lineText.trim() : "";
  const startTime = record?.startTime;
  const endTime = record?.endTime;
  if (
    !UUID_PATTERN.test(itemId) || !lineText || lineText.length > 2000 ||
    typeof startTime !== "number" || !Number.isFinite(startTime) || startTime < 0 ||
    typeof endTime !== "number" || !Number.isFinite(endTime) || endTime <= startTime
  ) {
    return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });
  }

  const { data: collection, error: collectionError } = await auth.db
    .from("word_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (collectionError || !collection) {
    if (collectionError) console.error("[api/word-collections] Could not verify collection before editing snippet", { code: collectionError.code });
    return NextResponse.json({ code: collectionError ? "ITEM_UPDATE_FAILED" : "COLLECTION_NOT_FOUND" }, { status: collectionError ? 500 : 404 });
  }

  const roundedStart = roundToTenth(startTime);
  const roundedEnd = roundToTenth(endTime);
  if (roundedEnd <= roundedStart) return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });

  const { data, error } = await auth.db
    .from("collection_items")
    .update({ line_text: lineText, start_time: roundedStart, end_time: roundedEnd })
    .eq("id", itemId)
    .eq("collection_id", collectionId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[api/word-collections] Could not update collection snippet", { code: error.code });
    return NextResponse.json({ code: "ITEM_UPDATE_FAILED" }, { status: error ? 500 : 404 });
  }
  return NextResponse.json({ updated: true, start: roundedStart, end: roundedEnd });
}

export async function POST(request: Request, { params }: Context) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;
  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });

  const body: unknown = await request.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
  const songId = typeof record?.songId === "string" && UUID_PATTERN.test(record.songId) ? record.songId : null;
  const videoId = typeof record?.videoId === "string" && /^[\w-]{11}$/u.test(record.videoId) ? record.videoId : null;
  const videoTitle = typeof record?.videoTitle === "string" ? record.videoTitle.trim() : "";
  if (
    !record ||
    (!songId && (!videoId || !videoTitle || videoTitle.length > 200)) ||
    typeof record.lineText !== "string" ||
    !record.lineText.trim() ||
    record.lineText.length > 2000 ||
    typeof record.startTime !== "number" ||
    !Number.isFinite(record.startTime) ||
    record.startTime < 0 ||
    typeof record.endTime !== "number" ||
    !Number.isFinite(record.endTime) ||
    record.endTime <= record.startTime
  ) {
    return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });
  }

  const { data: collection, error: collectionError } = await auth.db
    .from("word_collections")
    .select("source_language")
    .eq("id", collectionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (collectionError || !collection) {
    if (collectionError) console.error("[api/word-collections] Could not verify collection language", { code: collectionError.code });
    return NextResponse.json({ code: collectionError ? "ITEM_SAVE_FAILED" : "COLLECTION_NOT_FOUND" }, { status: collectionError ? 500 : 404 });
  }

  const { data: song, error: songError } = songId
    ? await auth.db.from("songs").select("youtube_id,title,language").eq("id", songId).maybeSingle()
    : { data: null, error: null };
  if (songError || (songId && (!song || !isLearningLanguage(song.language) || song.language !== collection.source_language))) {
    if (songError) console.error("[api/word-collections] Could not load snippet media", { code: songError.code });
    return NextResponse.json({ code: songError ? "ITEM_SAVE_FAILED" : "INVALID_ITEM" }, { status: songError ? 500 : 400 });
  }
  const resolvedVideoId = song?.youtube_id ?? videoId;
  const resolvedTitle = song?.title ?? videoTitle;
  if (!resolvedVideoId || !resolvedTitle || !isLearningLanguage(collection.source_language)) {
    return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });
  }

  const { data: existingItem, error: existingError } = await auth.db
    .from("collection_items")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("video_id", resolvedVideoId)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    console.error("[api/word-collections] Could not check for duplicate collection snippet", { code: existingError.code });
    return NextResponse.json({ code: "ITEM_SAVE_FAILED" }, { status: 500 });
  }
  if (existingItem) return NextResponse.json({ id: existingItem.id }, { status: 200 });

  const { data, error } = await auth.db
    .from("collection_items")
    .insert({
      collection_id: collectionId,
      user_id: auth.user.id,
      song_id: songId,
      video_id: resolvedVideoId,
      video_title: resolvedTitle,
      source_language: collection.source_language,
      line_text: record.lineText.trim(),
      start_time: record.startTime,
      end_time: record.endTime,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[api/word-collections] Could not save collection item", { code: error?.code });
    return NextResponse.json({ code: "ITEM_SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Context) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;
  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  const itemId = typeof body === "object" && body !== null && "itemId" in body && typeof body.itemId === "string"
    ? body.itemId
    : "";
  if (!UUID_PATTERN.test(itemId)) return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });

  const { data: collection, error: collectionError } = await auth.db
    .from("word_collections")
    .select("is_public")
    .eq("id", collectionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (collectionError || !collection) {
    if (collectionError) console.error("[api/word-collections] Could not verify collection before deleting snippet", { code: collectionError.code });
    return NextResponse.json({ code: collectionError ? "ITEM_DELETE_FAILED" : "COLLECTION_NOT_FOUND" }, { status: collectionError ? 500 : 404 });
  }
  if (collection.is_public) {
    const { count, error: countError } = await auth.db
      .from("collection_items")
      .select("id", { count: "exact", head: true })
      .eq("collection_id", collectionId);
    if (countError) {
      console.error("[api/word-collections] Could not verify public collection minimum before deletion", { code: countError.code });
      return NextResponse.json({ code: "ITEM_DELETE_FAILED" }, { status: 500 });
    }
    if ((count ?? 0) <= 3) {
      return NextResponse.json({ code: "PUBLIC_COLLECTION_REQUIRES_THREE_ITEMS" }, { status: 409 });
    }
  }

  const { data, error } = await auth.db
    .from("collection_items")
    .delete()
    .eq("id", itemId)
    .eq("collection_id", collectionId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[api/word-collections] Could not delete collection item", { code: error.code });
    return NextResponse.json({
      code: error?.code === "23514" ? "PUBLIC_COLLECTION_REQUIRES_THREE_ITEMS" : "ITEM_DELETE_FAILED",
    }, { status: error?.code === "23514" ? 409 : error ? 500 : 404 });
  }
  return NextResponse.json({ deleted: true });
}

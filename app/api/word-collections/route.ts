import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLearningLanguage } from "@/types/game";

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

export async function GET(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("[api/word-collections] Could not verify session", { code: authError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }
  const account = user && !user.is_anonymous ? user : null;
  const scope = new URL(request.url).searchParams.get("scope");
  const params = new URL(request.url).searchParams;
  const language = params.get("language");
  if (language !== null && !isLearningLanguage(language)) {
    return NextResponse.json({ code: "INVALID_LANGUAGE" }, { status: 400 });
  }
  if (scope !== null && scope !== "public" && scope !== "mine") {
    return NextResponse.json({ code: "INVALID_SCOPE" }, { status: 400 });
  }

  if (scope === "public") {
    const { data, error: publicError } = await db.rpc("get_public_word_collections", {
      p_language: language,
      p_search: null,
      p_limit: 1000,
    });
    if (publicError) {
      console.error("[api/word-collections] Could not list public collections", { code: publicError.code });
      return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
    }
    const publicCollections = data ?? [];
    const publicCollectionIds = publicCollections.map((collection) => collection.id);
    const { data: previewItems, error: previewError } = publicCollectionIds.length > 0
      ? await db.from("collection_items").select("collection_id,video_id,line_text").in("collection_id", publicCollectionIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (previewError) {
      console.error("[api/word-collections] Could not load collection previews", { code: previewError.code });
      return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
    }
    const previewVideoIds = new Map<string, string[]>();
    const previewPhrases = new Map<string, string[]>();
    const wordCountByCollection = new Map<string, number>();
    for (const item of previewItems ?? []) {
      const phrases = previewPhrases.get(item.collection_id) ?? [];
      if (phrases.length < 3 && item.line_text.trim()) {
        phrases.push(item.line_text.trim());
        previewPhrases.set(item.collection_id, phrases);
      }
      const videos = previewVideoIds.get(item.collection_id) ?? [];
      if (videos.length < 1 && item.video_id && !videos.includes(item.video_id)) {
        videos.push(item.video_id);
        previewVideoIds.set(item.collection_id, videos);
      }
      const wordCount = item.line_text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      wordCountByCollection.set(item.collection_id, (wordCountByCollection.get(item.collection_id) ?? 0) + wordCount);
    }
    return NextResponse.json({
      collections: publicCollections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        isPublic: collection.is_public,
        isOwner: false,
        sourceLanguage: collection.source_language,
        itemCount: Number(collection.item_count),
        favoriteCount: Number(collection.favorite_count),
        previewVideoIds: previewVideoIds.get(collection.id) ?? [],
        previewPhrases: previewPhrases.get(collection.id) ?? [],
        wordCount: wordCountByCollection.get(collection.id) ?? 0,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  let query = db
    .from("word_collections")
    .select("id,title,is_public,user_id,source_language,created_at");
  if (scope === "mine") {
    if (!account) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
    query = query.eq("user_id", account.id);
  } else if (account) {
    query = query.or(`is_public.eq.true,user_id.eq.${account.id}`);
  } else {
    query = query.eq("is_public", true);
  }
  if (language) query = query.eq("source_language", language);
  const { data, error: queryError } = await query.order("created_at", { ascending: false });
  if (queryError) {
    console.error("[api/word-collections] Could not list collections", { code: queryError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }

  const collectionIds = (data ?? []).map((collection) => collection.id);
  const { data: itemCounts, error: itemCountError } = collectionIds.length > 0
    ? await db.from("collection_items").select("collection_id").in("collection_id", collectionIds)
    : { data: [], error: null };
  if (itemCountError) {
    console.error("[api/word-collections] Could not count collection snippets", { code: itemCountError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }
  const itemCountByCollection = new Map<string, number>();
  for (const item of itemCounts ?? []) {
    itemCountByCollection.set(item.collection_id, (itemCountByCollection.get(item.collection_id) ?? 0) + 1);
  }

  const { data: publicStats, error: publicStatsError } = collectionIds.length > 0
    ? await db.rpc("get_public_word_collections", { p_language: null, p_search: null, p_limit: 1000 })
    : { data: [], error: null };
  if (publicStatsError) {
    console.error("[api/word-collections] Could not load collection popularity", { code: publicStatsError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }
  const statsById = new Map((publicStats ?? []).map((collection) => [
    collection.id,
    { itemCount: Number(collection.item_count), favoriteCount: Number(collection.favorite_count) },
  ]));
  const collections = (data ?? []).map((collection) => ({
    id: collection.id,
    title: collection.title,
    isPublic: collection.is_public,
    isOwner: account?.id === collection.user_id,
    sourceLanguage: collection.source_language,
    itemCount: statsById.get(collection.id)?.itemCount ?? itemCountByCollection.get(collection.id) ?? 0,
    favoriteCount: statsById.get(collection.id)?.favoriteCount ?? 0,
  }));
  return NextResponse.json({ collections }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
  const title = record && typeof record.title === "string" ? record.title.trim() : "";
  const sourceLanguage = record?.sourceLanguage === undefined ? "en" : record.sourceLanguage;
  if (!isLearningLanguage(sourceLanguage)) {
    return NextResponse.json({ code: "INVALID_LANGUAGE" }, { status: 400 });
  }
  if (!title || title.length > 80) {
    return NextResponse.json({ code: "INVALID_TITLE" }, { status: 400 });
  }
  const snippets = record?.snippets;
  if (
    !Array.isArray(snippets) || snippets.length < 1 ||
    snippets.some((snippet) => {
      if (typeof snippet !== "object" || snippet === null) return true;
      const item = snippet as Record<string, unknown>;
      return typeof item.videoId !== "string" || !/^[\w-]{11}$/u.test(item.videoId) ||
        typeof item.videoTitle !== "string" || !item.videoTitle.trim() || item.videoTitle.length > 200 ||
        typeof item.text !== "string" || !item.text.trim() || item.text.length > 2000 ||
        typeof item.start !== "number" || !Number.isFinite(item.start) || item.start < 0 ||
        typeof item.duration !== "number" || !Number.isFinite(item.duration) || item.duration <= 0 ||
        item.duration > 600;
    })
  ) {
    return NextResponse.json({ code: "INVALID_ITEMS" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("word_collections")
    .insert({ user_id: auth.user.id, title, source_language: sourceLanguage })
    .select("id,title,is_public,source_language")
    .single();
  if (error || !data) {
    console.error("[api/word-collections] Could not create collection", { code: error?.code });
    return NextResponse.json({ code: "COLLECTION_CREATE_FAILED" }, { status: 500 });
  }

  let savedItems: { id: string; video_id: string; video_title: string; line_text: string; start_time: number; end_time: number }[] = [];
  {
    const { data: insertedItems, error: itemsError } = await auth.db.from("collection_items").insert(snippets.map((snippet) => {
      const item = snippet as Record<string, unknown>;
      return {
        collection_id: data.id,
        user_id: auth.user.id,
        song_id: null,
        video_id: item.videoId as string,
        video_title: (item.videoTitle as string).trim(),
        source_language: sourceLanguage,
        line_text: (item.text as string).trim(),
        start_time: roundToTenth(item.start as number),
        end_time: roundToTenth(item.start as number) + Math.max(0.1, roundToTenth(item.duration as number)),
      };
    })).select("id,video_id,video_title,line_text,start_time,end_time");
    const validItems = (insertedItems ?? []).flatMap((item) =>
      typeof item.video_id === "string" && typeof item.video_title === "string" &&
      Number.isFinite(Number(item.start_time)) && Number.isFinite(Number(item.end_time))
        ? [{
          id: item.id,
          video_id: item.video_id,
          video_title: item.video_title,
          line_text: item.line_text,
          start_time: Number(item.start_time),
          end_time: Number(item.end_time),
        }]
        : [],
    );
    if (itemsError || validItems.length !== snippets.length) {
      const { error: rollbackError } = await auth.db.from("word_collections").delete().eq("id", data.id);
      console.error("[api/word-collections] Could not save collection snippets", {
        code: itemsError?.code ?? "INVALID_INSERT_RESULT",
        rollbackCode: rollbackError?.code ?? null,
      });
      return NextResponse.json({ code: "COLLECTION_SAVE_FAILED" }, { status: 500 });
    }
    savedItems = validItems;
  }

  return NextResponse.json({
    collection: {
      id: data.id,
      title: data.title,
      isPublic: data.is_public,
      isOwner: true,
      sourceLanguage: data.source_language,
      itemCount: snippets.length,
      favoriteCount: 0,
    },
    items: savedItems,
  }, { status: 201 });
}

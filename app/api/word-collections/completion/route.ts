import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAccount() {
  const db = await createSupabaseServerClient();
  if (!db) return { error: NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 }) };
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) {
    return { error: NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };
  }
  return { db, user };
}

export async function GET(request: Request) {
  const auth = await getAccount();
  if ("error" in auth) return auth.error;
  const collectionId = new URL(request.url).searchParams.get("collectionId");
  if (!collectionId || !UUID_PATTERN.test(collectionId)) {
    return NextResponse.json({ error: "INVALID_COLLECTION_ID" }, { status: 400 });
  }

  const { data: manual, error: manualError } = await auth.db.from("user_collection_completion")
    .select("is_completed")
    .eq("user_id", auth.user.id)
    .eq("collection_id", collectionId)
    .maybeSingle();
  if (manualError) {
    console.error("[api/word-collections/completion] Could not read manual status", { code: manualError.code });
    return NextResponse.json({ error: "COMPLETION_LOOKUP_FAILED" }, { status: 500 });
  }
  if (manual) {
    return NextResponse.json({ completed: manual.is_completed }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { data: progress, error: progressError } = await auth.db.from("user_collection_progress")
    .select("collection_id")
    .eq("user_id", auth.user.id)
    .eq("collection_id", collectionId)
    .eq("is_completed", true)
    .limit(1);
  if (progressError) {
    console.error("[api/word-collections/completion] Could not read training progress", { code: progressError.code });
    return NextResponse.json({ error: "COMPLETION_LOOKUP_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ completed: Boolean(progress?.length) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAccount();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "INVALID_COMPLETION" }, { status: 400 });
  }

  const now = new Date().toISOString();
  if (body.allOwned === true) {
    if (!body.completed) return NextResponse.json({ error: "INVALID_COMPLETION" }, { status: 400 });
    const { data: collections, error: collectionsError } = await auth.db.from("word_collections")
      .select("id")
      .eq("user_id", auth.user.id);
    if (collectionsError) {
      console.error("[api/word-collections/completion] Could not list owned collections", { code: collectionsError.code });
      return NextResponse.json({ error: "COMPLETION_SAVE_FAILED" }, { status: 500 });
    }
    const collectionIds = (collections ?? []).map(({ id }) => id);
    if (!collectionIds.length) return NextResponse.json({ completed: true, collectionIds: [] });
    const { error: saveError } = await auth.db.from("user_collection_completion").upsert(
      collectionIds.map((collectionId) => ({ user_id: auth.user.id, collection_id: collectionId, is_completed: true, updated_at: now })),
      { onConflict: "user_id,collection_id" },
    );
    if (saveError) {
      console.error("[api/word-collections/completion] Could not mark owned collections complete", { code: saveError.code });
      return NextResponse.json({ error: "COMPLETION_SAVE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ completed: true, collectionIds });
  }

  const collectionId = body.collectionId;
  if (typeof collectionId !== "string" || !UUID_PATTERN.test(collectionId)) {
    return NextResponse.json({ error: "INVALID_COLLECTION_ID" }, { status: 400 });
  }
  const { error: saveError } = await auth.db.from("user_collection_completion").upsert({
    user_id: auth.user.id,
    collection_id: collectionId,
    is_completed: body.completed,
    updated_at: now,
  }, { onConflict: "user_id,collection_id" });
  if (saveError) {
    console.error("[api/word-collections/completion] Could not save collection status", { code: saveError.code });
    return NextResponse.json({ error: "COMPLETION_SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ completed: body.completed, collectionId });
}
